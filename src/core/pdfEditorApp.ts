import * as pdfjsLib from 'pdfjs-dist';
import { PDFRenderer } from './pdfRenderer';
import { TextElement } from '../elements/textElement';
import { SignatureElement } from '../elements/signatureElement';
import { ImageElement } from '../elements/imageElement';
import { HighlightElement } from '../elements/highlightElement';
import { TextSearchHandler } from '../handlers/textSearchHandler';
import type { MatchResult } from '../handlers/textSearchHandler';
import { SignaturePad } from '../utils/signaturePad';
import { InteractionHandler } from '../handlers/interactionHandler';
import { ShapeElement } from '../elements/shapeElement';
import { RedactionElement } from '../elements/redactionElement';
import { PDFElement } from '../elements/pdfElement';
import type { ElementJSON } from '../elements/pdfElement';
import { ElementFactory } from '../utils/elementFactory';
import { UIController } from './uiController';
import type { UIRefs } from './uiController';
import { DrawingHandler } from '../handlers/drawingHandler';
import { EraserHandler } from '../handlers/eraserHandler';
import {
  HistoryManager, AddElementCmd, RemoveElementCmd, ClearAllCmd, TextEditCmd,
  MoveResizeCmd, DeletePageCmd, ReorderPagesCmd, AddPagesCmd, RotatePageCmd,
  MacroCmd, TransformAnnotationsCmd, ClearInkCmd, FillColorCmd,
} from './historyManager';
import type { Command, ElementTransformSnapshot } from './historyManager';
import { InkLayer } from './inkLayer';
import { InkLayerHandler } from '../handlers/inkLayerHandler';
import { DocumentModel, PAGE_SIZES } from './documentModel';
import type { WatermarkSettings } from './documentModel';
import { PageThumbnailPanel } from './pageThumbnailPanel';
import { saveState, loadState, clearState } from './storage';
import { FormFieldOverlay } from '../utils/formFieldOverlay';
import { TextLayerManager } from '../utils/textLayer';
import { CommentElement } from '../elements/commentElement';
import { t } from '../utils/i18n';
import { trapFocus } from '../utils/focusTrap';
import { TextEditHandler } from '../handlers/textEditHandler';
import { CodeElement } from '../elements/codeElement';
import { generateCodeDataUrl, getCodeFormat } from '../utils/codeGenerator';
import type { QRStyleOptions, BwipOptions } from '../utils/codeGenerator';

export type ToolMode = 'select' | 'addText' | 'addSignature' | 'addImage' | 'addCode' | 'drawArrow' | 'drawRect' | 'drawEllipse' | 'drawFreehand' | 'drawHighlight' | 'addComment' | 'drawRedaction' | 'drawErase' | 'editText' | 'fillBucket';

export class PDFEditorApp {
  renderer: PDFRenderer;
  documentModel: DocumentModel;
  elements: PDFElement[] = [];
  interactionHandler: InteractionHandler;
  signaturePad: SignaturePad;
  mode: ToolMode = 'select';
  zoomScale = 1.0;
  selectedElement: PDFElement | null = null;
  historyManager: HistoryManager;
  _textChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingTextBefore: string | null = null;
  private _pendingTextElementId: number | null = null;
  currentFilename: string | null = null;
  currentSignature: string | null = null;
  uiController: UIController;
  drawingHandler: DrawingHandler;
  eraserHandler: EraserHandler;
  private _thumbnailPanel: PageThumbnailPanel | null = null;
  private _pendingImageSrc: string | null = null;
  private _pendingImageNatural: { w: number; h: number } | null = null;
  private _signatureNatural: { w: number; h: number } | null = null;
  private _pendingCodeDataUrl: string | null = null;
  private _pendingCodeOptions: { codeType: string; data: string; qrStyle: QRStyleOptions | null; bwipOpts: BwipOptions | null } | null = null;
  private _pendingCodeNatural: { w: number; h: number } | null = null;
  private _codeModalEditingId: number | null = null;
  private _codeModalGen = 0;
  private _codePreviewDebounce: ReturnType<typeof setTimeout> | null = null;
  private _qrLogoDataUrl: string | null = null;
  private _skipNextClick = false;
  private _autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _textSearch = new TextSearchHandler();
  private _findMatches: MatchResult[] = [];
  private _findMatchIndex = -1;
  private _searchGen = 0;
  private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _findCaseSensitive = false;
  private _findRegex = false;
  private _formFieldOverlay: FormFieldOverlay;
  private _textLayerManager: TextLayerManager;
  private _formValues: Record<string, Record<string, string>> = {};
  private _warnedUnsupportedFields = false;
  private _formFieldGen = 0;
  private _isLoading = false;
  private _pageUpdatePending = false;
  private _pendingPasswordResolve: ((password: string | null) => void) | null = null;
  private _exportPassword: { user: string; owner: string } | null = null;
  inkLayer: InkLayer;
  inkLayerHandler: InkLayerHandler;
  private _inkCanvas: HTMLCanvasElement;
  private _isFitMode = true;
  private _clipboard: ElementJSON | null = null;
  private _exportPreviewOpen = false;
  private _trapCleanup: (() => void) | null = null;
  private _pendingModeAfterBlankPage: string | null = null;
  private _textEditHandler = new TextEditHandler();
  private _placementGhost: HTMLDivElement | null = null;

  get ui(): UIRefs { return this.uiController.refs; }

  constructor() {
    this.documentModel = new DocumentModel();
    this.renderer = new PDFRenderer(document.getElementById('pdfCanvas') as HTMLCanvasElement);
    this.renderer.setModel(this.documentModel);
    this.elements = [];
    this.uiController = new UIController();
    this.interactionHandler = new InteractionHandler(this);
    this.drawingHandler = new DrawingHandler(this);
    this.eraserHandler = new EraserHandler(this);
    this.inkLayer = new InkLayer();
    this.inkLayerHandler = new InkLayerHandler(this);
    this._inkCanvas = document.createElement('canvas');
    this._inkCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    this.uiController.refs.container.appendChild(this._inkCanvas);
    this.signaturePad = new SignaturePad(this.uiController.refs.signatureCanvas);
    this._formFieldOverlay = new FormFieldOverlay(this.uiController.refs.container);
    this._textLayerManager = new TextLayerManager(this.uiController.refs.container);
    this.mode = 'select';
    this.zoomScale = 1.0;
    this.selectedElement = null;
    this.historyManager = new HistoryManager(50, (canUndo, canRedo) => {
      this.uiController.updateUndoRedoBtns(canUndo, canRedo);
    });
    this._textChangeTimer = null;
    this.currentFilename = null;
    this.currentSignature = null;
    this.setupEventListeners();
    this._initThumbnailPanel();
    this._restoreSession();
    this._showPrivacyToastOnce();
  }

  private _initThumbnailPanel(): void {
    this._thumbnailPanel = new PageThumbnailPanel({
      container: this.ui.pageThumbnailContainer,
      renderer: this.renderer,
      model: this.documentModel,
      onNavigate: (index) => this._goToPageIndex(index),
      onDelete: (pageId) => this._deletePage(pageId),
      onReorder: (newOrder) => this._reorderPages(newOrder),
      onRotate: (pageId, delta) => this._rotatePage(pageId, delta),
      onAddPdf: () => this.ui.addPdfInput.click(),
      onDownload: (index) => this.downloadPage(index),
      onDownloadImage: (index) => this.downloadPageAsImage(index),
    });
  }

  private _showPrivacyToastOnce(): void {
    const KEY = 'pdfturbo_privacy_toast_shown';
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
    this.showToast(t('toast.privacyBadge'), 4000);
  }

  setupEventListeners() {
    this.ui.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    this.ui.addPdfInput.addEventListener('change', (e) => this._handleAddPdfUpload(e));
    this.ui.selectBtn.addEventListener('click', () => this.setMode('select'));
    this.ui.addTextBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'addText' ? 'select' : 'addText');
    });
    this.ui.addSignatureBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'addSignature' ? 'select' : 'addSignature');
    });
    this.ui.addImageBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      if (this.mode === 'addImage') { this.setMode('select'); return; }
      this.ui.addImageInput.click();
    });
    this.ui.addImageInput.addEventListener('change', (e) => this._handleImageFileSelect(e));
    this.ui.addCodeBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      if (this.mode === 'addCode') { this.setMode('select'); return; }
      this.openCodeModal();
    });
    this.ui.highlightBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'drawHighlight' ? 'select' : 'drawHighlight');
    });
    this.ui.commentBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'addComment' ? 'select' : 'addComment');
    });
    this.ui.redactBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'drawRedaction' ? 'select' : 'drawRedaction');
    });
    this.ui.previewExportBtn.addEventListener('click', () => {
      if (this._exportPreviewOpen) this._hideExportPreview();
      else if (this.documentModel.currentPage) this._showExportPreview();
    });
    this.ui.exportPreviewClose.addEventListener('click', () => this._hideExportPreview());
    this.ui.exportPreviewConfirm.addEventListener('click', () => {
      this._hideExportPreview();
      this.downloadPDF();
    });
    this.ui.findBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this._openFindBar(); });
    this.ui.findInput.addEventListener('input', () => {
      clearTimeout(this._searchDebounceTimer ?? undefined);
      this._searchDebounceTimer = setTimeout(() => this._search(), 300);
    });
    this.ui.findNext.addEventListener('click', () => this._nextMatch());
    this.ui.findPrev.addEventListener('click', () => this._prevMatch());
    this.ui.findHighlight.addEventListener('click', () => this._highlightCurrentMatch());
    this.ui.findClose.addEventListener('click', () => this._closeFindBar());
    this.ui.findCaseSensitive.addEventListener('click', () => {
      this._findCaseSensitive = !this._findCaseSensitive;
      this.ui.findCaseSensitive.classList.toggle('active', this._findCaseSensitive);
      if (this.ui.findInput.value) this._search();
    });
    this.ui.findRegex.addEventListener('click', () => {
      this._findRegex = !this._findRegex;
      this.ui.findRegex.classList.toggle('active', this._findRegex);
      if (this.ui.findInput.value) this._search();
    });
    this.ui.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this._prevMatch(); else this._nextMatch();
      }
      if (e.key === 'Escape') { e.preventDefault(); this._closeFindBar(); }
    });
    this.ui.downloadBtn.addEventListener('click', () => this.downloadPDF());
    this.ui.editTextBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'editText' ? 'select' : 'editText');
    });
    this.ui.prevPageBtn.addEventListener('click', () => this.prevPage());
    this.ui.nextPageBtn.addEventListener('click', () => this.nextPage());
    this.ui.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

    // Handle element delete via bubbled CustomEvent from PDFElement.createControls()
    this.ui.container.addEventListener('element:delete', (e: Event) => {
      const { id } = (e as CustomEvent<{ id: number }>).detail;
      this.removeElement(id);
      this.selectElement(null);
      this._updateFormattingToolbar();
    });

    // Handle autosave requests bubbled from CommentElement
    this.ui.container.addEventListener('element:autosave', () => {
      this._autosave();
    });

     
    document.getElementById('clearSignature')?.addEventListener('click', () => this.signaturePad.clear());
    document.getElementById('cancelSignature')?.addEventListener('click', () => this.closeSignatureModal());
    document.getElementById('saveSignature')?.addEventListener('click', () => this.saveSignature());

    // Code modal
    this.ui.cancelCodeModal.addEventListener('click', () => this.closeCodeModal());
    this.ui.saveCodeModal.addEventListener('click', () => void this.saveCodeModal());
    this.ui.codeFormatSelect.addEventListener('change', () => { this._syncCodeOptionsVisibility(); this._triggerCodePreview(); });
    this.ui.codeDataInput.addEventListener('input', () => this._triggerCodePreview());
    this.ui.qrStyledChk.addEventListener('change', () => { this._syncCodeOptionsVisibility(); this._triggerCodePreview(); });
    this.ui.qrEclevelSelect.addEventListener('change', () => this._triggerCodePreview());
    this.ui.barcodeShowTextChk.addEventListener('change', () => this._triggerCodePreview());
    this.ui.qrDotStyle.addEventListener('change', () => this._triggerCodePreview());
    this.ui.qrDotColor.addEventListener('input', () => this._triggerCodePreview());
    this.ui.qrBgColor.addEventListener('input', () => this._triggerCodePreview());
    this.ui.qrLogoInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this._qrLogoDataUrl = (ev.target?.result as string) ?? null;
        this.ui.qrLogoName.textContent = file.name;
        this.ui.qrLogoClearBtn.style.display = '';
        this._triggerCodePreview();
      };
      reader.readAsDataURL(file);
    });
    this.ui.qrLogoClearBtn.addEventListener('click', () => {
      this._qrLogoDataUrl = null;
      this.ui.qrLogoInput.value = '';
      this.ui.qrLogoName.textContent = '';
      this.ui.qrLogoClearBtn.style.display = 'none';
      this._triggerCodePreview();
    });
     

    this.ui.sigLineWidthInput.addEventListener('change', (e) => {
      this.signaturePad.setLineWidth(parseInt((e.target as HTMLInputElement).value));
    });
    this.ui.sigColorInput.addEventListener('change', (e) => {
      this.signaturePad.setColor((e.target as HTMLInputElement).value);
    });

    document.addEventListener('pointermove', (e) => {
      this.interactionHandler.handlePointerMove(e);
      this.drawingHandler.handlePointerMove(e);
      this.eraserHandler.handlePointerMove(e);
      this.inkLayerHandler.handlePointerMove(e);
      this._updatePlacementGhost(e);
    });
    document.addEventListener('pointerup', (e) => {
      this.interactionHandler.handlePointerUp(e);
      this.drawingHandler.handlePointerUp(e);
      this.eraserHandler.handlePointerUp(e);
      this.inkLayerHandler.handlePointerUp(e);
    });
    document.addEventListener('pointercancel', (e) => {
      this.interactionHandler.handlePointerCancel(e);
      this.drawingHandler.handlePointerCancel(e);
      this.eraserHandler.cancel();
      this.inkLayerHandler.handlePointerCancel(e);
    });

    this.ui.zoomInBtn.addEventListener('click',  () => { this._isFitMode = false; this.applyZoom(this.zoomScale + 0.1); });
    this.ui.zoomOutBtn.addEventListener('click', () => { this._isFitMode = false; this.applyZoom(this.zoomScale - 0.1); });
    this.ui.fitBtn.addEventListener('click', () => this.fitToWidth());
    this.ui.undoBtn.addEventListener('click', () => this.undo());
    this.ui.redoBtn.addEventListener('click', () => this.redo());
    this.ui.copyBtn.addEventListener('click', () => {
      const sel = window.getSelection()?.toString();
      if (sel) { navigator.clipboard.writeText(sel).catch(() => {}); return; }
      this._copySelectedElement();
    });
    this.ui.pasteBtn.addEventListener('click', () => this._pasteElement());

    this.ui.arrowBtn.addEventListener('click',    () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'drawArrow' ? 'select' : 'drawArrow');
    });
    this.ui.rectBtn.addEventListener('click',     () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'drawRect' ? 'select' : 'drawRect');
    });
    this.ui.circleBtn.addEventListener('click',   () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'drawEllipse' ? 'select' : 'drawEllipse');
    });
    this.ui.freehandBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) {
        // Auto-create blank A4 page then activate freehand
        this._pendingModeAfterBlankPage = 'drawFreehand';
        this._openBlankPageModal();
        return;
      }
      this.setMode(this.mode === 'drawFreehand' ? 'select' : 'drawFreehand');
    });
    this.ui.fillBucketBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'fillBucket' ? 'select' : 'fillBucket');
    });
    this.ui.donePill.addEventListener('click', () => this.setMode('select'));
    this.ui.eraserBtn.addEventListener('click', () => {
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'drawErase' ? 'select' : 'drawErase');
    });
    this.ui.canvas.addEventListener('pointerdown', (e) => this.drawingHandler.handlePointerDown(e));
    this.ui.canvas.addEventListener('pointerdown', (e) => this.eraserHandler.handlePointerDown(e));
    this.ui.canvas.addEventListener('pointerdown', (e) => this.inkLayerHandler.handlePointerDown(e));

    // File menu — use position:fixed so the dropdown escapes toolbar overflow clipping
    this.ui.fileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.ui.fileMenuWrap.classList.toggle('open');
      if (isOpen) {
        const rect = this.ui.fileMenuBtn.getBoundingClientRect();
        const drop = this.ui.fileMenuWrap.querySelector('.file-menu-dropdown') as HTMLElement;
        drop.style.top  = (rect.bottom + 4) + 'px';
        drop.style.left = rect.left + 'px';
      }
    });
    // Draw flyout — same position:fixed pattern; satellite controls keep flyout open
    this.ui.drawBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.ui.drawFlyoutWrap.classList.toggle('open');
      this.ui.drawBtn.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        const rect = this.ui.drawBtn.getBoundingClientRect();
        const flyout = document.getElementById('drawFlyout') as HTMLElement;
        flyout.style.top  = (rect.bottom + 4) + 'px';
        flyout.style.left = rect.left + 'px';
      }
    });
    // Close flyout when a tool button (aria-pressed) is picked; satellite controls don't close it
    document.getElementById('drawFlyout')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).hasAttribute('aria-pressed')) {
        this.ui.drawFlyoutWrap.classList.remove('open');
        this.ui.drawBtn.setAttribute('aria-expanded', 'false');
      }
    });
    // Annotate flyout — same position:fixed pattern; no satellite controls
    this.ui.annotateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.ui.annotateFlyoutWrap.classList.toggle('open');
      this.ui.annotateBtn.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        const rect = this.ui.annotateBtn.getBoundingClientRect();
        const flyout = document.getElementById('annotateFlyout') as HTMLElement;
        flyout.style.top  = (rect.bottom + 4) + 'px';
        flyout.style.left = rect.left + 'px';
      }
    });
    document.getElementById('annotateFlyout')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).hasAttribute('aria-pressed')) {
        this.ui.annotateFlyoutWrap.classList.remove('open');
        this.ui.annotateBtn.setAttribute('aria-expanded', 'false');
      }
    });
    // Text split-button — chevron opens chooser flyout
    this.ui.textChevronBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.ui.textSplitWrap.classList.toggle('open');
      this.ui.textChevronBtn.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        const rect = this.ui.textChevronBtn.getBoundingClientRect();
        const flyout = document.getElementById('textFlyout') as HTMLElement;
        flyout.style.top  = (rect.bottom + 4) + 'px';
        flyout.style.left = rect.left + 'px';
      }
    });
    // Left part activates last-used text mode; also closes flyout if open
    this.ui.textModeBtn.addEventListener('click', () => {
      this.ui.textSplitWrap.classList.remove('open');
      this.ui.textChevronBtn.setAttribute('aria-expanded', 'false');
      if (!this.documentModel.pageCount) return;
      const m = (this.ui.textModeBtn.dataset['mode'] ?? 'addText') as ToolMode;
      this.setMode(this.mode === m ? 'select' : m);
    });
    document.getElementById('textFlyout')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[aria-pressed]')) {
        this.ui.textSplitWrap.classList.remove('open');
        this.ui.textChevronBtn.setAttribute('aria-expanded', 'false');
      }
    });
    // Export ▾ split-button — chevron opens Preview + Watermark flyout
    this.ui.exportChevronBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.ui.exportSplitWrap.classList.toggle('open');
      this.ui.exportChevronBtn.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        const rect = this.ui.exportChevronBtn.getBoundingClientRect();
        const flyout = document.getElementById('exportFlyout') as HTMLElement;
        flyout.style.top  = (rect.bottom + 4) + 'px';
        flyout.style.left = rect.left + 'px';
      }
    });
    document.getElementById('exportFlyout')?.addEventListener('click', () => {
      this.ui.exportSplitWrap.classList.remove('open');
      this.ui.exportChevronBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', (e) => {
      this.ui.fileMenuWrap.classList.remove('open');
      if (!this.ui.drawFlyoutWrap.contains(e.target as Node)) {
        this.ui.drawFlyoutWrap.classList.remove('open');
        this.ui.drawBtn.setAttribute('aria-expanded', 'false');
      }
      if (!this.ui.annotateFlyoutWrap.contains(e.target as Node)) {
        this.ui.annotateFlyoutWrap.classList.remove('open');
        this.ui.annotateBtn.setAttribute('aria-expanded', 'false');
      }
      if (!this.ui.textSplitWrap.contains(e.target as Node)) {
        this.ui.textSplitWrap.classList.remove('open');
        this.ui.textChevronBtn.setAttribute('aria-expanded', 'false');
      }
      if (!this.ui.exportSplitWrap.contains(e.target as Node)) {
        this.ui.exportSplitWrap.classList.remove('open');
        this.ui.exportChevronBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('selectionchange', () => this._updateCopyPasteBtns());
    this.ui.fileMenuOpen.addEventListener('click', () => {
      this.ui.fileMenuWrap.classList.remove('open');
      this.ui.fileInput.click();
    });
    this.ui.fileMenuClose.addEventListener('click', () => {
      this.ui.fileMenuWrap.classList.remove('open');
      this._closeDocument();
    });
    this.ui.fileMenuClearAnnotations.addEventListener('click', () => {
      this.ui.fileMenuWrap.classList.remove('open');
      this.clearAll();
    });
    this.ui.fileMenuResetSession.addEventListener('click', () => {
      this.ui.fileMenuWrap.classList.remove('open');
      this._clearSave();
    });

    document.getElementById('fileMenuBlankPage')?.addEventListener('click', () => {
      this.ui.fileMenuWrap.classList.remove('open');
      this._openBlankPageModal();
    });

    const blankModal = document.getElementById('blankPageModal') as HTMLElement;
    const blankSizeSelect = document.getElementById('blankPageSize') as HTMLSelectElement;
    const blankCustomDiv = document.getElementById('blankPageCustomSize') as HTMLElement;
    blankSizeSelect?.addEventListener('change', () => {
      blankCustomDiv.style.display = blankSizeSelect.value === 'custom' ? 'block' : 'none';
    });
    document.getElementById('blankPageCancelBtn')?.addEventListener('click', () => {
      blankModal.style.display = 'none';
    });
    blankModal?.addEventListener('click', (e) => { if (e.target === blankModal) blankModal.style.display = 'none'; });
    document.getElementById('blankPageInsertBtn')?.addEventListener('click', () => {
      this._insertBlankPage();
      blankModal.style.display = 'none';
    });

    // ── Password entry modal (decrypt on open) ──────────────────────────────
    const pdfPwdModal = document.getElementById('pdfPasswordModal') as HTMLElement;
    const pdfPwdInput = document.getElementById('pdfPasswordInput') as HTMLInputElement;
    const pdfPwdError = document.getElementById('pdfPasswordError') as HTMLElement;
    const pdfPwdToggle = document.getElementById('pdfPasswordToggle') as HTMLButtonElement;
    pdfPwdToggle?.addEventListener('click', () => {
      pdfPwdInput.type = pdfPwdInput.type === 'password' ? 'text' : 'password';
    });
    document.getElementById('pdfPasswordSubmitBtn')?.addEventListener('click', () => {
      const pw = pdfPwdInput.value;
      if (!pw) { pdfPwdError.style.display = 'block'; return; }
      pdfPwdError.style.display = 'none';
      pdfPwdModal.style.display = 'none';
      this._pendingPasswordResolve?.(pw);
      this._pendingPasswordResolve = null;
    });
    pdfPwdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('pdfPasswordSubmitBtn')?.click();
    });
    document.getElementById('pdfPasswordCancelBtn')?.addEventListener('click', () => {
      pdfPwdModal.style.display = 'none';
      this._pendingPasswordResolve?.(null);
      this._pendingPasswordResolve = null;
    });
    pdfPwdModal?.addEventListener('click', (e) => {
      if (e.target === pdfPwdModal) {
        pdfPwdModal.style.display = 'none';
        this._pendingPasswordResolve?.(null);
        this._pendingPasswordResolve = null;
      }
    });

    // ── Lock PDF modal (encrypt on export) ──────────────────────────────────
    const lockModal = document.getElementById('lockPdfModal') as HTMLElement;
    document.getElementById('fileMenuLockPdf')?.addEventListener('click', () => {
      this.ui.fileMenuWrap.classList.remove('open');
      lockModal.style.display = 'flex';
      const status = document.getElementById('lockPdfStatus') as HTMLElement;
      status.style.display = this._exportPassword ? 'block' : 'none';
      (document.getElementById('lockUserPassword') as HTMLInputElement).value = this._exportPassword?.user ?? '';
      (document.getElementById('lockOwnerPassword') as HTMLInputElement).value = this._exportPassword?.owner ?? '';
    });
    document.getElementById('lockPdfApplyBtn')?.addEventListener('click', () => {
      const user = (document.getElementById('lockUserPassword') as HTMLInputElement).value.trim();
      if (!user) { this.showToast('User password is required'); return; }
      const owner = (document.getElementById('lockOwnerPassword') as HTMLInputElement).value.trim() || user;
      this._exportPassword = { user, owner };
      const status = document.getElementById('lockPdfStatus') as HTMLElement;
      status.style.display = 'block';
      lockModal.style.display = 'none';
      this.showToast(t('toast.pdfWillBeLocked'));
    });
    document.getElementById('lockPdfRemoveBtn')?.addEventListener('click', () => {
      this._exportPassword = null;
      (document.getElementById('lockPdfStatus') as HTMLElement).style.display = 'none';
      lockModal.style.display = 'none';
      this.showToast(t('toast.pdfLockRemoved'));
    });
    document.getElementById('lockPdfCancelBtn')?.addEventListener('click', () => { lockModal.style.display = 'none'; });
    lockModal?.addEventListener('click', (e) => { if (e.target === lockModal) lockModal.style.display = 'none'; });

    this.ui.helpBtn.addEventListener('click', () => this._toggleHelp());
     
    document.getElementById('closeHelp')?.addEventListener('click', () => this._toggleHelp(false));
    this.ui.helpModal.addEventListener('click', (e) => { if (e.target === this.ui.helpModal) this._toggleHelp(false); });


    this.ui.firstPage.addEventListener('click', () => this._goToPage(1));
    this.ui.lastPage.addEventListener('click',  () => this._goToPage(this.documentModel.pageCount));

    this.ui.pageInput.addEventListener('change', (e) => {
      this._goToPage(parseInt((e.target as HTMLInputElement).value) || 1);
    });
    this.ui.pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
        this._goToPage(parseInt((e.target as HTMLInputElement).value) || 1);
      }
    });

    this.ui.container.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this._isFitMode = false;
      this.applyZoom(this.zoomScale + (e.deltaY < 0 ? 0.05 : -0.05));
    }, { passive: false });

    this.ui.fontFamily.addEventListener('change', (e) => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const te = this.selectedElement as TextElement;
      const before = { fontFamily: te.fontFamily };
      te.fontFamily = (e.target as HTMLInputElement).value;
      this.historyManager.record(new MoveResizeCmd(this.elements, te, before, { fontFamily: te.fontFamily }));
      this.renderElements(); this._autosave();
    });
    this.ui.boldBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const te = this.selectedElement as TextElement;
      const before = { bold: te.bold };
      te.bold = !te.bold;
      this.historyManager.record(new MoveResizeCmd(this.elements, te, before, { bold: te.bold }));
      this.ui.boldBtn.classList.toggle('btn-active-fmt', te.bold);
      this.renderElements(); this._autosave();
    });
    this.ui.italicBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const te = this.selectedElement as TextElement;
      const before = { italic: te.italic };
      te.italic = !te.italic;
      this.historyManager.record(new MoveResizeCmd(this.elements, te, before, { italic: te.italic }));
      this.ui.italicBtn.classList.toggle('btn-active-fmt', te.italic);
      this.renderElements(); this._autosave();
    });
    this.ui.fontSizeInput.addEventListener('change', (e) => {
      const size = Math.max(8, Math.min(72, parseInt((e.target as HTMLInputElement).value) || 14));
      if (this.selectedElement && this.selectedElement.type === 'text') {
        const te = this.selectedElement as TextElement;
        const before = { fontSize: te.fontSize };
        te.fontSize = size;
        this.historyManager.record(new MoveResizeCmd(this.elements, te, before, { fontSize: size }));
        this.renderElements(); this._autosave();
      }
    });
    this.ui.colorInput.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (this.selectedElement?.type === 'text') {
        const te = this.selectedElement as TextElement;
        const before = { color: te.color };
        te.color = val;
        this.historyManager.record(new MoveResizeCmd(this.elements, te, before, { color: val }));
        this.renderElements(); this._autosave();
      } else if (this.selectedElement?.type === 'shape') {
        (this.selectedElement as ShapeElement).strokeColor = val;
        this.renderElements(); this._autosave();
      } else if (this.selectedElement?.type === 'redaction') {
        const re = this.selectedElement as RedactionElement;
        const before = { color: re.color };
        re.color = val;
        this.ui.redactColorInput.value = val;
        this.historyManager.record(new MoveResizeCmd(this.elements, re, before, { color: val }));
        this.renderElements(); this._autosave();
      }
    });
    this.ui.fillColorInput.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (this.selectedElement?.type === 'shape') {
        const she = this.selectedElement as ShapeElement;
        const before = { fillColor: she.fillColor };
        she.fillColor = val;
        this.historyManager.record(new MoveResizeCmd(this.elements, she, before, { fillColor: val }));
        this.renderElements(); this._autosave();
      }
    });
    this.ui.redactColorInput.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (this.selectedElement?.type === 'redaction') {
        const re = this.selectedElement as RedactionElement;
        const before = { color: re.color };
        re.color = val;
        this.historyManager.record(new MoveResizeCmd(this.elements, re, before, { color: val }));
        this.renderElements(); this._autosave();
      }
    });
    document.getElementById('redactEyedropperBtn')?.addEventListener('click', async () => {
      if (!('EyeDropper' in window)) { this.showToast('Eyedropper not supported in this browser'); return; }
      try {
        const dropper = new (window as { EyeDropper: new() => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper();
        const result = await dropper.open();
        this.ui.redactColorInput.value = result.sRGBHex;
        this.ui.redactColorInput.dispatchEvent(new Event('input', { bubbles: true }));
      } catch { /* user cancelled */ }
    });
    this.ui.colorEyedropperBtn.addEventListener('click', async () => {
      if (!('EyeDropper' in window)) { this.showToast('Eyedropper not supported in this browser'); return; }
      try {
        const dropper = new (window as { EyeDropper: new() => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper();
        const result = await dropper.open();
        this.ui.colorInput.value = result.sRGBHex;
        this.ui.colorInput.dispatchEvent(new Event('input', { bubbles: true }));
      } catch { /* user cancelled */ }
    });
    this.ui.fontSizeDownBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const te = this.selectedElement as TextElement;
      const before = { fontSize: te.fontSize };
      const newSize = Math.max(8, te.fontSize - 2);
      te.fontSize = newSize;
      this.historyManager.record(new MoveResizeCmd(this.elements, te, before, { fontSize: newSize }));
      this.ui.fontSizeInput.value = String(newSize);
      this.renderElements(); this._autosave();
    });
    this.ui.fontSizeUpBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const te = this.selectedElement as TextElement;
      const before = { fontSize: te.fontSize };
      const newSize = Math.min(72, te.fontSize + 2);
      te.fontSize = newSize;
      this.historyManager.record(new MoveResizeCmd(this.elements, te, before, { fontSize: newSize }));
      this.ui.fontSizeInput.value = String(newSize);
      this.renderElements(); this._autosave();
    });
    this.ui.shapeWidth.addEventListener('change', (e) => {
      if (this.selectedElement?.type === 'shape') {
        (this.selectedElement as ShapeElement).strokeWidth = parseInt((e.target as HTMLInputElement).value) || 2;
        this.renderElements(); this._autosave();
      }
    });

    // Watermark modal
    this.ui.watermarkBtn.addEventListener('click', () => this._openWatermarkModal());
    this.ui.wmCancel.addEventListener('click', () => this._closeWatermarkModal());
    let _wmBackdropDown = false;
    this.ui.watermarkModal.addEventListener('mousedown', (e) => { _wmBackdropDown = e.target === this.ui.watermarkModal; });
    this.ui.watermarkModal.addEventListener('mouseup',   (e) => { if (_wmBackdropDown && e.target === this.ui.watermarkModal) this._closeWatermarkModal(); _wmBackdropDown = false; });
    this.ui.wmApply.addEventListener('click', () => this._applyWatermark());
    this._setupWatermarkPreviewListeners();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.ui.helpModal.classList.contains('active')) { this._toggleHelp(false); return; }
        if (this.ui.signatureModal.classList.contains('active')) { this.closeSignatureModal(); return; }
        if (this.ui.watermarkModal.classList.contains('active')) { this._closeWatermarkModal(); return; }
        if (this.ui.codeModal.classList.contains('active')) { this.closeCodeModal(); return; }
        if (this.ui.findBar.style.display !== 'none') { this._closeFindBar(); return; }
        this.setMode('select');
        this.selectElement(null);
        (document.activeElement as HTMLElement)?.blur();
        return;
      }
      if (e.target instanceof Element && e.target.matches('input, textarea, select')) return;
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z': e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); break;
          case 'y': e.preventDefault(); this.redo(); break;
          case 'f': e.preventDefault(); if (this.documentModel.pageCount) this._openFindBar(); break;
          case 'c': if (!window.getSelection()?.toString()) { e.preventDefault(); this._copySelectedElement(); } break;
          case 'v': e.preventDefault(); this._pasteElement(); break;
          case 'arrowright': e.preventDefault(); this.nextPage(); break;
          case 'arrowleft':  e.preventDefault(); this.prevPage(); break;
        }
        return;
      }
      switch (e.key) {
        case 'Delete': case 'Backspace':
          if (this.selectedElement) {
            e.preventDefault();
            this.removeElement(this.selectedElement.id);
            this.selectedElement = null;
            this._updateFormattingToolbar();
          }
          break;
        case 't': case 'T':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'addText' ? 'select' : 'addText');
          break;
        case 's': case 'S':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'addSignature' ? 'select' : 'addSignature');
          break;
        case 'i': case 'I': if (this.documentModel.pageCount) this.ui.addImageInput.click(); break;
        case 'a': case 'A':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'drawArrow' ? 'select' : 'drawArrow');
          break;
        case 'r': case 'R':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'drawRect' ? 'select' : 'drawRect');
          break;
        case 'c': case 'C':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'drawEllipse' ? 'select' : 'drawEllipse');
          break;
        case 'd': case 'D':
        case 'f': case 'F':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'drawFreehand' ? 'select' : 'drawFreehand');
          break;
        case 'h': case 'H':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'drawHighlight' ? 'select' : 'drawHighlight');
          break;
        case 'n': case 'N':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'addComment' ? 'select' : 'addComment');
          break;
        case 'e': case 'E':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'drawErase' ? 'select' : 'drawErase');
          break;
        case 'x': case 'X':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'editText' ? 'select' : 'editText');
          break;
        case 'k': case 'K':
          if (this.documentModel.pageCount) this.setMode(this.mode === 'drawRedaction' ? 'select' : 'drawRedaction');
          break;
        case 'q': case 'Q':
          if (this.documentModel.pageCount) this.openCodeModal();
          break;
        case 'w': case 'W':
          if (this.documentModel.pageCount) this._openWatermarkModal();
          break;
        case '?': this._toggleHelp(); break;
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
          if (this.selectedElement) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
            this.selectedElement.x += dx;
            this.selectedElement.y += dy;
            // Arrow: translate endpoint geometry
            const el = this.selectedElement as ShapeElement;
            if (el.x1 !== undefined) { el.x1 += dx; el.x2 += dx; el.y1 += dy; el.y2 += dy; }
            // Freehand: translate all path points
            if (Array.isArray(el.points) && el.points.length) {
              el.points = el.points.map((p: {x: number, y: number}) => ({ x: p.x + dx, y: p.y + dy }));
            }
            this.renderElements();
          }
          break;
      }
    });
    this.ui.canvas.style.touchAction = 'pan-x pan-y';
  }

  // ── Watermark ────────────────────────────────────────────────
  private _setupWatermarkPreviewListeners(): void {
    const update = () => this._updateWatermarkPreview();
    this.ui.wmText.addEventListener('input', update);
    this.ui.wmColor.addEventListener('input', update);
    this.ui.wmFontSize.addEventListener('input', () => {
      this.ui.wmFontSizeDisplay.textContent = this.ui.wmFontSize.value;
      update();
    });
    this.ui.wmOpacity.addEventListener('input', () => {
      this.ui.wmOpacityDisplay.textContent = this.ui.wmOpacity.value;
      update();
    });
    this.ui.wmAngle.addEventListener('input', () => {
      this.ui.wmAngleDisplay.textContent = this.ui.wmAngle.value;
      update();
    });
    this.ui.wmDensity.addEventListener('input', () => {
      this.ui.wmDensityDisplay.textContent = this.ui.wmDensity.value;
      update();
    });
  }

  private _updateWatermarkPreview(): void {
    const canvas = this.ui.wmPreviewCanvas;
    const w = canvas.offsetWidth || 300;
    const h = canvas.offsetHeight || 80;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const realFontSize = parseInt(this.ui.wmFontSize.value) || 60;
    // Scale as if the canvas represents an A4 page (842pt tall) for WYSIWYG density.
    const previewScale = h / 842;
    const liveWm: WatermarkSettings = {
      enabled: true,
      text: this.ui.wmText.value || 'WATERMARK',
      color: this.ui.wmColor.value,
      fontSize: realFontSize,
      opacity: parseInt(this.ui.wmOpacity.value) / 100,
      angle: parseInt(this.ui.wmAngle.value),
      density: parseInt(this.ui.wmDensity.value) || 3,
    };
    this._drawWatermarkOnCanvas(ctx, w, h, liveWm, previewScale);
  }

  private _openWatermarkModal(): void {
    const wm = this.documentModel.watermark;
    this.ui.wmEnabled.checked = wm.enabled;
    this.ui.wmText.value = wm.text;
    this.ui.wmColor.value = wm.color;
    this.ui.wmFontSize.value = String(wm.fontSize);
    this.ui.wmFontSizeDisplay.textContent = String(wm.fontSize);
    const opPct = Math.round(wm.opacity * 100);
    this.ui.wmOpacity.value = String(opPct);
    this.ui.wmOpacityDisplay.textContent = String(opPct);
    this.ui.wmAngle.value = String(wm.angle);
    this.ui.wmAngleDisplay.textContent = String(wm.angle);
    const density = wm.density ?? 3;
    this.ui.wmDensity.value = String(density);
    this.ui.wmDensityDisplay.textContent = String(density);
    this.ui.watermarkModal.classList.add('active');
    this._updateWatermarkPreview();
    this._trapCleanup?.();
    this._trapCleanup = trapFocus(
      this.ui.watermarkModal.querySelector('.watermark-content') as HTMLElement,
      this.ui.watermarkBtn,
    );
  }

  private _closeWatermarkModal(): void {
    this.ui.watermarkModal.classList.remove('active');
    this._trapCleanup?.();
    this._trapCleanup = null;
  }

  private _applyWatermark(): void {
    this.documentModel.watermark = {
      enabled: this.ui.wmEnabled.checked,
      text: this.ui.wmText.value || 'WATERMARK',
      color: this.ui.wmColor.value,
      fontSize: parseInt(this.ui.wmFontSize.value) || 60,
      opacity: parseInt(this.ui.wmOpacity.value) / 100,
      angle: parseInt(this.ui.wmAngle.value),
      density: parseInt(this.ui.wmDensity.value) || 3,
    };
    this._closeWatermarkModal();
    this._syncWatermarkBtn();
    this._autosave();
    const status = this.documentModel.watermark.enabled ? t('toast.watermarkEnabled') : t('toast.watermarkDisabled');
    this.showToast(status);
    if (this._exportPreviewOpen) this._showExportPreview();
  }

  private _syncWatermarkBtn(): void {
    this.ui.watermarkBtn.classList.toggle('active', this.documentModel.watermark.enabled);
  }

  // ── Find bar ─────────────────────────────────────────────────
  _openFindBar(): void {
    this.ui.findBar.style.display = '';
    this.ui.findInput.focus();
    this.ui.findInput.select();
    if (this.ui.findInput.value) this._search();
  }

  _closeFindBar(): void {
    this.ui.findBar.style.display = 'none';
    this._clearSearchMatches();
    this._findMatches = [];
    this._findMatchIndex = -1;
    this.ui.findCount.textContent = '';
  }

  private async _search(): Promise<void> {
    const myGen = ++this._searchGen;
    this._clearSearchMatches();
    this._findMatches = [];
    this._findMatchIndex = -1;
    const query = this.ui.findInput.value;
    const docPage = this.documentModel.currentPage;
    if (!query.trim() || !docPage) { this._updateFindCount(); return; }

    const src = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
    if (!src) return;
    const page = await src.doc.getPage(docPage.sourcePageNum);
    await this._textSearch.buildIndex(page, docPage.id);

    if (myGen !== this._searchGen) return; // stale — a newer search has started

    const effectiveRotation = ((page.rotate + (docPage.rotation ?? 0)) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale: this.zoomScale, rotation: effectiveRotation });
    this._findMatches = this._textSearch.search(query, docPage.id, viewport, this.zoomScale, { caseSensitive: this._findCaseSensitive, useRegex: this._findRegex });

    if (myGen !== this._searchGen) return; // stale after search

    // Also match user-added text boxes and comments on the current page
    const _matchesQuery = (text: string): boolean => {
      if (this._findRegex) {
        try { return new RegExp(query, this._findCaseSensitive ? '' : 'i').test(text); } catch { return false; }
      }
      const haystack = this._findCaseSensitive ? text : text.toLowerCase();
      return haystack.includes(this._findCaseSensitive ? query : query.toLowerCase());
    };
    for (const el of this.elements) {
      if (el.pageId !== docPage.id) continue;
      if (el.type === 'text') {
        const textEl = el as TextElement;
        if (textEl.text && _matchesQuery(textEl.text))
          this._findMatches.push({ pageId: docPage.id, x: textEl.x, y: textEl.y, width: textEl.width, height: textEl.height });
      } else if (el.type === 'comment') {
        const commentEl = el as CommentElement;
        if (commentEl.text && _matchesQuery(commentEl.text))
          this._findMatches.push({ pageId: docPage.id, x: commentEl.x, y: commentEl.y, width: commentEl.width, height: commentEl.height });
      }
    }

    if (this._findMatches.length > 0) {
      this._findMatchIndex = 0;
      this._showSearchMatches();
    }
    this._updateFindCount();
  }

  private _nextMatch(): void {
    if (!this._findMatches.length) return;
    this._findMatchIndex = (this._findMatchIndex + 1) % this._findMatches.length;
    this._showSearchMatches();
    this._updateFindCount();
  }

  private _prevMatch(): void {
    if (!this._findMatches.length) return;
    this._findMatchIndex = (this._findMatchIndex - 1 + this._findMatches.length) % this._findMatches.length;
    this._showSearchMatches();
    this._updateFindCount();
  }

  private _highlightCurrentMatch(): void {
    if (this._findMatchIndex < 0 || this._findMatchIndex >= this._findMatches.length) return;
    const match = this._findMatches[this._findMatchIndex];
    const pageId = this.documentModel.currentPage?.id;
    if (!pageId) return;
    const hlEl = new HighlightElement(match.x, match.y, match.width, match.height, pageId);
    this.historyManager.execute(new AddElementCmd(this.elements, hlEl));
    this._autosave();
    this.renderElements();
    this._showSearchMatches(); // re-render match overlays after renderElements clears elements
    this.showToast(t('toast.highlightAdded'));
  }

  private _showSearchMatches(): void {
    this._clearSearchMatches();
    const offset = { left: this.ui.canvas.offsetLeft, top: this.ui.canvas.offsetTop };
    let activeDiv: Element | null = null;
    this._findMatches.forEach((match, i) => {
      const isActive = i === this._findMatchIndex;
      const div = document.createElement('div');
      div.className = 'search-match' + (isActive ? ' search-match-active' : '');
      Object.assign(div.style, {
        position: 'absolute',
        left: `${offset.left + match.x * this.zoomScale}px`,
        top: `${offset.top + match.y * this.zoomScale}px`,
        width: `${match.width * this.zoomScale}px`,
        height: `${match.height * this.zoomScale}px`,
        pointerEvents: 'none',
        zIndex: '25',
      });
      this.ui.container.appendChild(div);
      if (isActive) activeDiv = div;
    });
    if (activeDiv) (activeDiv as Element).scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  private _clearSearchMatches(): void {
    this.ui.container.querySelectorAll('.search-match').forEach(el => el.remove());
  }

  private _updateFindCount(): void {
    if (!this._findMatches.length) {
      this.ui.findCount.textContent = this.ui.findInput.value ? '0 / 0' : '';
    } else {
      this.ui.findCount.textContent = `${this._findMatchIndex + 1} / ${this._findMatches.length}`;
    }
  }

  // ── Image handling ───────────────────────────────────────────
  private _handleImageFileSelect(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!file || !this.documentModel.currentPage) return;
    if (!file.type.startsWith('image/')) {
      this.showToast(t('toast.selectImageFile'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        this._pendingImageNatural = { w: img.naturalWidth, h: img.naturalHeight };
        this._pendingImageSrc = src;
        this.setMode('addImage');
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  addImageAtPosition(e: MouseEvent): void {
    const src = this._pendingImageSrc;
    const pageId = this.documentModel.currentPage?.id;
    if (!src || !pageId) return;
    this._pendingImageSrc = null;

    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const imgEl = new ImageElement(x - 100, y - 75, 200, 150, pageId, src);
    this.historyManager.execute(new AddElementCmd(this.elements, imgEl));
    this._autosave();
    this.setMode('select');
    this.renderElements();
    this.selectElement(imgEl);
  }

  onPlacementDragComplete(mode: 'addText' | 'addImage' | 'addComment' | 'addSignature' | 'addCode', x: number, y: number, w: number, h: number): void {
    const pageId = this.documentModel.currentPage?.id;
    if (!pageId) return;
    this._skipNextClick = true;

    if (mode === 'addText') {
      const fw = w < 10 ? 200 : w;
      const fh = h < 10 ? 40 : h;
      const options = {
        fontSize: parseInt(this.ui.fontSizeInput.value),
        color: this.ui.colorInput.value,
        width: fw,
        height: fh,
      };
      const textEl = new TextElement(x, y, pageId, options);
      this.historyManager.execute(new AddElementCmd(this.elements, textEl));
      this._autosave();
      this.renderElements();
      const inputEl = this.ui.container.querySelector(
        `[data-id='${textEl.id}'] input, [data-id='${textEl.id}'] textarea`
      ) as HTMLInputElement | null;
      if (inputEl) {
        (inputEl as HTMLElement).style.pointerEvents = 'auto';
        inputEl.focus();
      }
      this.setMode('select');
      this.selectElement(textEl);
      const freshInput = this.ui.container.querySelector(
        `[data-id='${textEl.id}'] input, [data-id='${textEl.id}'] textarea`
      ) as HTMLInputElement | null;
      freshInput?.focus();

    } else if (mode === 'addImage') {
      const src = this._pendingImageSrc;
      if (!src) return;
      this._pendingImageSrc = null;
      const nat = this._pendingImageNatural;
      this._pendingImageNatural = null;

      const fw = w < 10 ? 200 : w;
      const fh = w < 10
        ? (nat ? Math.round(200 * nat.h / nat.w) : 150)
        : (nat ? Math.round(fw * nat.h / nat.w) : h);

      const imgEl = new ImageElement(x, y, fw, fh, pageId, src);
      this.historyManager.execute(new AddElementCmd(this.elements, imgEl));
      this._autosave();
      this.setMode('select');
      this.renderElements();
      this.selectElement(imgEl);

    } else if (mode === 'addComment') {
      const fw = w < 10 ? 200 : w;
      const fh = h < 10 ? 120 : h;
      const commentEl = new CommentElement(x, y, pageId, { width: fw, height: fh });
      this.historyManager.execute(new AddElementCmd(this.elements, commentEl));
      this._autosave();
      this.setMode('select');
      this.renderElements();
      this.selectElement(commentEl);

    } else if (mode === 'addCode') {
      const dataUrl = this._pendingCodeDataUrl;
      const opts = this._pendingCodeOptions;
      if (!dataUrl || !opts) return;
      this._pendingCodeDataUrl = null;
      this._pendingCodeOptions = null;
      const nat = this._pendingCodeNatural;
      this._pendingCodeNatural = null;

      const fw = w < 10 ? 200 : w;
      const fmt = getCodeFormat(opts.codeType);
      const fh = fmt?.squareOutput
        ? fw
        : nat ? Math.round(fw * nat.h / nat.w) : (h < 10 ? 80 : h);

      const codeEl = new CodeElement(x, y, pageId, { ...opts, bwipOpts: opts.bwipOpts ?? null }, dataUrl, { w: fw, h: fh });
      this.historyManager.execute(new AddElementCmd(this.elements, codeEl));
      this._autosave();
      this.setMode('select');
      this.renderElements();
      this.selectElement(codeEl);

    } else {
      const sig = this.currentSignature;
      if (!sig) return;
      this.currentSignature = null;
      this.ui.addSignatureBtn.classList.remove('active');
      const nat = this._signatureNatural;
      this._signatureNatural = null;

      const fw = w < 10 ? 200 : w;
      const fh = w < 10
        ? (nat ? Math.round(200 * nat.h / nat.w) : 80)
        : (nat ? Math.round(fw * nat.h / nat.w) : h);

      const sigEl = new SignatureElement(x, y, pageId, sig, { width: fw, height: fh });
      this.historyManager.execute(new AddElementCmd(this.elements, sigEl));
      this._autosave();
      this.setMode('select');
      this.renderElements();
      this.selectElement(sigEl);
    }
  }

  // ── PDF page management ───────────────────────────────────────
  private async _handleAddPdfUpload(e: Event): Promise<void> {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    (e.target as HTMLInputElement).value = '';
    this._textSearch.clearCache();
    if (!files.length) return;

    let addedCount = 0;
    for (const file of files) {
      const isPdf   = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');
      if (!isPdf && !isImage) continue;
      try {
        let typedBytes: Uint8Array;
        let fileName: string;
        if (isImage) {
          const { bytes, name } = await this._imagesToPdf([file]);
          typedBytes = bytes;
          fileName = name;
        } else {
          typedBytes = new Uint8Array(await file.arrayBuffer());
          fileName = file.name;
        }
        const bytesToStore = typedBytes.slice(0); // pdf.js transfers the ArrayBuffer; copy first
        const doc = await pdfjsLib.getDocument({ data: typedBytes }).promise;
        const src = this.documentModel.addSourcePdf(doc, bytesToStore, fileName);
        const cmd = new AddPagesCmd(this.documentModel, src.id, undefined, () => this._onPageStructureChange());
        this.historyManager.execute(cmd);
        addedCount++;
      } catch {
        this.showToast(t('toast.fileLoadFailed', { name: file.name }), 4000);
      }
    }
    if (addedCount > 0) {
      this.showToast(t('toast.filesAdded', { count: addedCount }));
    }
  }

  private _deletePage(pageId: string): void {
    if (this.documentModel.pageCount <= 1) {
      this.showToast(t('toast.cannotDeleteOnlyPage'));
      return;
    }
    const src = this.documentModel.sourcePdfs.get(
      this.documentModel.pages.find(p => p.id === pageId)?.sourcePdfId ?? ''
    );
    const cmd = new DeletePageCmd(
      this.documentModel, this.elements, pageId,
      () => this._onPageStructureChange(),
      src,
    );
    this.historyManager.execute(cmd);
  }

  private _reorderPages(newOrder: string[]): void {
    const before = this.documentModel.pages.map(p => p.id);
    const cmd = new ReorderPagesCmd(this.documentModel, before, newOrder, () => this._onPageStructureChange());
    this.historyManager.execute(cmd);
  }

  private async _rotatePage(pageId: string, delta: number): Promise<void> {
    const docPage = this.documentModel.pages.find(p => p.id === pageId);
    if (!docPage) return;
    const src = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
    if (!src) return;

    const pageElements = this.elements.filter(e => e.pageId === pageId);

    // Fetch original page dims + source rotation for transform math
    const pdfPage = await src.doc.getPage(docPage.sourcePageNum);
    const srcRot = (pdfPage.rotate as number) ?? 0;
    const vp0 = pdfPage.getViewport({ scale: 1, rotation: 0 });
    const W = vp0.width, H = vp0.height;

    const oldUserRot = docPage.rotation ?? 0;
    const newUserRot = ((oldUserRot + delta) % 360 + 360) % 360;
    const fromRot = ((srcRot + oldUserRot) % 360 + 360) % 360;
    const toRot   = ((srcRot + newUserRot) % 360 + 360) % 360;

    const rotateCmd = new RotatePageCmd(this.documentModel, pageId, delta, () => {
      this._thumbnailPanel?.invalidateThumb(pageId);
      this._onPageStructureChange();
    });

    // Capture ink stroke state before the early-return so ink-only pages also rotate.
    const inkStrokes = this.inkLayer.getStrokes(pageId);
    const inkBefore  = inkStrokes.map(s => s.points.map(p => ({ ...p })));
    const inkAfter   = inkStrokes.map(s =>
      s.points.map(p => this._transformCanvasPoint(p.x, p.y, W, H, fromRot, toRot))
    );
    const hasInk = inkStrokes.length > 0;

    if (!pageElements.length && !hasInk) {
      this.historyManager.execute(rotateCmd);
      return;
    }

    // Build before/after snapshots for all annotations on this page
    const before = new Map<number, ElementTransformSnapshot>();
    const after  = new Map<number, ElementTransformSnapshot>();
    for (const el of pageElements) {
      before.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height,
        rotation: el.rotation,
        x1: (el as ShapeElement).x1, y1: (el as ShapeElement).y1,
        x2: (el as ShapeElement).x2, y2: (el as ShapeElement).y2,
        points: (el as ShapeElement).points?.map(p => ({ ...p })),
      });
      const snap = this._rotateElementSnapshot(el, W, H, fromRot, toRot);
      // Arrows and freehand encode rotation geometrically (x1/y1/x2/y2 or points).
      // Setting snap.rotation here would double-apply the rotation via CSS.
      const shapType = (el as ShapeElement).shapeType;
      const isGeometric = el.type === 'shape' && (shapType === 'arrow' || shapType === 'freehand');
      if (!isGeometric) snap.rotation = ((el.rotation + delta) % 360 + 360) % 360;
      after.set(el.id, snap);
    }

    // Build command list — TransformAnnotationsCmd and ink cmd run before rotateCmd so
    // elements/strokes are in correct positions when RotatePageCmd's onUpdate re-renders.
    const cmds: Command[] = [];
    if (pageElements.length) {
      cmds.push(new TransformAnnotationsCmd(this.elements, before, after));
    }
    if (hasInk) {
      cmds.push({
        execute: () => { inkStrokes.forEach((s, i) => { s.points = inkAfter[i].map(p => ({ ...p })); }); },
        undo:    () => { inkStrokes.forEach((s, i) => { s.points = inkBefore[i].map(p => ({ ...p })); }); this.renderInkLayer(); },
      });
    }
    cmds.push(rotateCmd);

    this.historyManager.execute(cmds.length === 1 ? cmds[0] : new MacroCmd(cmds));
    this.showToast(t('toast.annotationsAdjusted'));
  }

  /** Transform canvas-space point (top-left origin, scale=1) to PDF content-space point (bottom-left origin).
   *  W_orig / H_orig are the unrotated page content dimensions.
   *  totalRot is the effective CCW rotation (source + user) in degrees. */
  private _transformPoint(px: number, py: number, W: number, H: number, totalRot: number): { x: number; y: number } {
    switch (((totalRot % 360) + 360) % 360) {
      case 90:  return { x: py,     y: px     };
      case 180: return { x: W - px, y: py     };
      case 270: return { x: W - py, y: H - px };
      default:  return { x: px,     y: H - py };
    }
  }

  /** Inverse of _transformPoint: PDF content space → canvas space. */
  private _inverseTransformPoint(pdfX: number, pdfY: number, W: number, H: number, totalRot: number): { x: number; y: number } {
    switch (((totalRot % 360) + 360) % 360) {
      case 90:  return { x: pdfY,     y: pdfX     };
      case 180: return { x: W - pdfX, y: pdfY     };
      case 270: return { x: H - pdfY, y: W - pdfX };
      default:  return { x: pdfX,     y: H - pdfY };
    }
  }

  /** Transform a canvas-space point from one page rotation to another. */
  private _transformCanvasPoint(cx: number, cy: number, W: number, H: number, fromRot: number, toRot: number): { x: number; y: number } {
    const pdf = this._transformPoint(cx, cy, W, H, fromRot);
    return this._inverseTransformPoint(pdf.x, pdf.y, W, H, toRot);
  }

  /** Compute the post-rotation ElementTransformSnapshot for a single element. */
  private _rotateElementSnapshot(el: PDFElement, W: number, H: number, fromRot: number, toRot: number): ElementTransformSnapshot {
    const tp = (cx: number, cy: number) => this._transformCanvasPoint(cx, cy, W, H, fromRot, toRot);
    const shape = el as ShapeElement;

    if (el.type === 'shape' && shape.shapeType === 'arrow') {
      const p1 = tp(shape.x1, shape.y1);
      const p2 = tp(shape.x2, shape.y2);
      return {
        x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
        width:  Math.abs(p2.x - p1.x) || el.width,
        height: Math.abs(p2.y - p1.y) || el.height,
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      };
    }

    if (el.type === 'shape' && shape.shapeType === 'freehand') {
      const pts = shape.points.map(p => tp(p.x, p.y));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      return {
        x: Math.min(...xs), y: Math.min(...ys),
        width:  Math.max(...xs) - Math.min(...xs) || el.width,
        height: Math.max(...ys) - Math.min(...ys) || el.height,
        points: pts,
      };
    }

    // Standard box elements: transform center, keep original dimensions.
    // el.rotation is already incremented by delta (in _rotatePage line 870) so CSS
    // transform: rotate(el.rotation deg) handles the visual reorientation — swapping
    // width/height here would cancel the visual rotation out instead of preserving it.
    const c = tp(el.x + el.width / 2, el.y + el.height / 2);
    return {
      x: c.x - el.width / 2,
      y: c.y - el.height / 2,
      width: el.width,
      height: el.height,
    };
  }

  private async _onPageStructureChange(): Promise<void> {
    if (this._pageUpdatePending) return;
    this._pageUpdatePending = true;
    try {
      await this._renderCurrentPage();
      await this._thumbnailPanel?.render();
      this._thumbnailPanel?.updateActive();
      this.selectElement(null);
      this.updatePageInfo();
      this.renderElements();
      this._autosave();
    } finally {
      this._pageUpdatePending = false;
    }
  }

  // ── Undo / Redo ───────────────────────────────────────────────
  private _cancelPendingTextEdit(): void {
    if (this._textChangeTimer !== null) {
      clearTimeout(this._textChangeTimer);
      this._textChangeTimer = null;
      this._pendingTextBefore = null;
      this._pendingTextElementId = null;
    }
  }

  undo() {
    this._cancelPendingTextEdit();
    if (this.historyManager.undo()) {
      this.selectedElement = null;
      this._renderCurrentPage().then(() => {
        this.renderElements();
        this._thumbnailPanel?.updateActive();
        this.updatePageInfo();
      }).catch((err: unknown) => {
        console.error('[undo render]', err);
        this.showToast(t('toast.renderFailedUndo'), 4000);
      });
      this._updateFormattingToolbar();
      this._autosave();
    }
  }

  redo() {
    this._cancelPendingTextEdit();
    if (this.historyManager.redo()) {
      this.selectedElement = null;
      this._renderCurrentPage().then(() => {
        this.renderElements();
        this._thumbnailPanel?.updateActive();
        this.updatePageInfo();
      }).catch((err: unknown) => {
        console.error('[redo render]', err);
        this.showToast(t('toast.renderFailedRedo'), 4000);
      });
      this._updateFormattingToolbar();
      this._autosave();
    }
  }

  // ── Autosave (IndexedDB) ──────────────────────────────────────
  _autosave() {
    clearTimeout(this._autosaveTimer ?? undefined);
    this._autosaveTimer = setTimeout(() => this._doAutosave(), 800);
  }

  private async _doAutosave(): Promise<void> {
    if (!this.documentModel.pageCount) return;
    const sourcePdfs = Array.from(this.documentModel.sourcePdfs.values()).map(s => ({
      id: s.id, name: s.name, bytes: s.bytes,
    }));
    try {
      await saveState({
        elements: this.elements.map(el => el.toJSON()),
        pages: [...this.documentModel.pages],
        watermark: { ...this.documentModel.watermark },
        currentPageIndex: this.documentModel.currentPageIndex,
        sourcePdfs,
        formValues: { ...this._formValues },
        inkData: this.inkLayer.toJSON(),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        this.showToast(t('toast.storageFull'), 8000);
      }
      // Other errors (IDB unavailable in private browsing etc.) — silently skip
    }
  }

  private _askRestoreSession(): Promise<boolean> {
    return new Promise(resolve => {
      const dialog = this.ui.restoreDialog;
      dialog.style.display = '';
      const onYes = () => { cleanup(); resolve(true); };
      const onNo  = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        dialog.style.display = 'none';
        this.ui.restoreYesBtn.removeEventListener('click', onYes);
        this.ui.restoreNoBtn.removeEventListener('click', onNo);
      };
      this.ui.restoreYesBtn.addEventListener('click', onYes);
      this.ui.restoreNoBtn.addEventListener('click', onNo);
      this.ui.restoreYesBtn.focus();
    });
  }

  private async _restoreSession(): Promise<void> {
    const state = await loadState();
    if (!state?.sourcePdfs?.length) return;
    if (this._isLoading) return;
    const shouldRestore = await this._askRestoreSession();
    if (!shouldRestore) { await clearState(); return; }
    this._isLoading = true;
    try {
      for (const sp of state.sourcePdfs) {
        const spBytes = sp.bytes instanceof Uint8Array ? sp.bytes : new Uint8Array(sp.bytes);
        const bytesToStore = spBytes.slice(0); // pdf.js transfers the ArrayBuffer; copy first
        const doc = await pdfjsLib.getDocument({ data: spBytes }).promise;
        const src = this.documentModel.addSourcePdf(doc, bytesToStore, sp.name);
        // Override auto-generated id with the saved one
        this.documentModel.sourcePdfs.delete(src.id);
        src.id = sp.id;
        this.documentModel.sourcePdfs.set(sp.id, src);
      }
      this.documentModel.pages = state.pages ?? [];
      this.documentModel.watermark = state.watermark ?? this.documentModel.watermark;
      this._syncWatermarkBtn();
      this.documentModel.currentPageIndex = Math.max(0, Math.min(
        state.currentPageIndex ?? 0, this.documentModel.pages.length - 1
      ));
      // Set renderer.pdfDoc to the current page's source (not necessarily the first source)
      const currentSrc = this.documentModel.sourcePdfs.get(
        this.documentModel.currentPage?.sourcePdfId ?? ''
      );
      if (currentSrc) this.renderer.pdfDoc = currentSrc.doc;

      const restored = (state.elements ?? [])
        .map(d => ElementFactory.fromJSON(d as Parameters<typeof ElementFactory.fromJSON>[0]))
        .filter(Boolean) as PDFElement[];
      this.elements.push(...restored);
      ElementFactory.syncIdCounter(this.elements);
      this._formValues = state.formValues ?? {};
      if (state.inkData) this.inkLayer.fromJSON(state.inkData);
      this.currentFilename = state.sourcePdfs[0]?.name ?? null;

      // Compute initial scale
      this._isFitMode = true;
      const fitScale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
      const isMobile = window.innerWidth <= 640;
      this.zoomScale = isMobile ? Math.max(fitScale, 0.65) : fitScale;
      this.renderer.setScale(this.zoomScale);
      this.ui.zoomDisplay.textContent = Math.round(this.zoomScale * 100) + '%';

      // BUG-38: guard against empty pages after restore
      if (!this.documentModel.pages.length || !this.documentModel.currentPage) {
        throw new Error('No valid pages in saved session');
      }

      await this._renderCurrentPage();
      this.enableUI();
      this._enableFileMenuDocItems();
       
      (document.getElementById('emptyState') as HTMLElement).style.display = 'none';
      this.ui.pageThumbnailContainer.style.display = '';
      await this._thumbnailPanel?.render();
      this.updatePageInfo();
      this.renderElements();
      this.showToast(t('toast.sessionRestored'));
    } catch (err) {
      // BUG-19: reset to clean state on partial restore failure
      console.warn('[_restoreSession] failed, resetting to clean state', err);
      this.documentModel = new DocumentModel();
      this.renderer.setModel(this.documentModel);
      this.elements = [];
      this._thumbnailPanel = null;
      this.showToast(t('toast.sessionRestoreFailed'));
    } finally {
      this._isLoading = false;
    }
  }

  _clearSave() {
    this._closeDocument();
    this.showToast(t('toast.sessionCleared'));
  }

  private async _applyExportPassword(pdfDoc: { encrypt(opts: { userPassword: string; ownerPassword: string }): Promise<void> }): Promise<void> {
    if (!this._exportPassword) return;
    await pdfDoc.encrypt({ userPassword: this._exportPassword.user, ownerPassword: this._exportPassword.owner });
  }

  private _promptPassword(isRetry = false): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const modal = document.getElementById('pdfPasswordModal') as HTMLElement;
      const input = document.getElementById('pdfPasswordInput') as HTMLInputElement;
      const error = document.getElementById('pdfPasswordError') as HTMLElement;
      input.value = '';
      error.style.display = isRetry ? 'block' : 'none';
      modal.style.display = 'flex';
      input.focus();
      this._pendingPasswordResolve = resolve;
    });
  }

  _openBlankPageModal(): void {
    const modal = document.getElementById('blankPageModal') as HTMLElement;
    if (!modal) return;
    modal.style.display = 'flex';
  }

  _insertBlankPage(): void {
    const sizeKey = (document.getElementById('blankPageSize') as HTMLSelectElement)?.value ?? 'a4';
    const position = (document.getElementById('blankPagePosition') as HTMLSelectElement)?.value ?? 'end';

    let w = 595, h = 842;
    if (sizeKey === 'custom') {
      const mmW = parseFloat((document.getElementById('blankPageW') as HTMLInputElement)?.value ?? '210');
      const mmH = parseFloat((document.getElementById('blankPageH') as HTMLInputElement)?.value ?? '297');
      w = Math.round(mmW * 2.8346); // mm → pt
      h = Math.round(mmH * 2.8346);
    } else if (sizeKey === 'match') {
      const cur = this.documentModel.currentPage;
      if (cur?.blankWidth) { w = cur.blankWidth; h = cur.blankHeight ?? 842; }
    } else {
      const s = PAGE_SIZES[sizeKey];
      if (s) { w = s.width; h = s.height; }
    }

    const wasEmpty = this.documentModel.pageCount === 0;

    let atIndex: number;
    const total = this.documentModel.pageCount;
    switch (position) {
      case 'beginning': atIndex = 0; break;
      case 'after':     atIndex = this.documentModel.currentPageIndex + 1; break;
      default:          atIndex = total;
    }

    const newPage = this.documentModel.addBlankPage(w, h, atIndex);
    this.documentModel.currentPageIndex = this.documentModel.pages.indexOf(newPage);

    if (wasEmpty) {
      // First page ever — run the full first-document initialization
      void (async () => {
        (document.getElementById('emptyState') as HTMLElement).style.display = 'none';
        this._isFitMode = true;
        const fitScale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
        const isMobile = window.innerWidth <= 640;
        await this.applyZoom(isMobile ? Math.max(fitScale, 0.65) : fitScale);
        this.enableUI();
        this._enableFileMenuDocItems();
        this.ui.pageThumbnailContainer.style.display = '';
        await this._thumbnailPanel!.render();
        this.updatePageInfo();
        this.renderElements();
        this._autosave();
        this.showToast(t('toast.blankPageInserted'));
        const pendingMode = this._pendingModeAfterBlankPage;
        this._pendingModeAfterBlankPage = null;
        if (pendingMode) this.setMode(pendingMode as ToolMode);
      })();
    } else {
      this._autosave();
      void this._thumbnailPanel?.render();
      this._thumbnailPanel?.updateActive();
      this.updatePageInfo();
      void this._renderCurrentPage().then(() => this.renderElements());
      this.showToast(t('toast.blankPageInserted'));
    }
  }

  clearAll() {
    const hasVector = this.elements.length > 0;
    const hasInk    = this.inkLayer.hasAnyContent();
    if (!hasVector && !hasInk) { this.showToast(t('toast.noAnnotationsToClear')); return; }
    const cmds = [];
    if (hasVector) cmds.push(new ClearAllCmd(this.elements));
    if (hasInk)    cmds.push(new ClearInkCmd(this.inkLayer, () => this.renderInkLayer()));
    this.historyManager.execute(cmds.length === 1 ? cmds[0] : new MacroCmd(cmds));
    this.selectedElement = null;
    this._updateFormattingToolbar();
    this._autosave();
    this.renderElements();
    this.showToast(t('toast.annotationsCleared'));
  }

  _toggleHelp(show?: boolean) {
    this.uiController.toggleHelp(show);
    if (this.ui.helpModal.classList.contains('active')) {
      this._trapCleanup?.();
      this._trapCleanup = trapFocus(
        this.ui.helpModal.querySelector('.help-content') as HTMLElement,
        this.ui.helpBtn,
      );
    } else {
      this._trapCleanup?.();
      this._trapCleanup = null;
    }
  }
  showToast(msg: string, duration = 3000) { this.uiController.showToast(msg, duration); }

  private _enableFileMenuDocItems(): void {
    this.ui.fileMenuClose.disabled = false;
    this.ui.fileMenuClearAnnotations.disabled = false;
    this.ui.fileMenuResetSession.disabled = false;
  }

  private _disableFileMenuDocItems(): void {
    this.ui.fileMenuClose.disabled = true;
    this.ui.fileMenuClearAnnotations.disabled = true;
    this.ui.fileMenuResetSession.disabled = true;
  }

  private _closeDocument(): void {
    clearState().catch(() => {});
    this.documentModel = new DocumentModel();
    this.renderer.setModel(this.documentModel);
    this.elements = [];
    this.selectedElement = null;
    this._clipboard = null;
    this._updateCopyPasteBtns();
    this.historyManager.clear();
    this._textSearch.clearCache();
    this._thumbnailPanel = null;
    this._findMatches = [];
    this._findMatchIndex = -1;
    this._closeFindBar();
    this._findCaseSensitive = false;
    this._findRegex = false;
    this.ui.findCaseSensitive.classList.remove('active');
    this.ui.findRegex.classList.remove('active');
    this.currentFilename = null;

    this.inkLayer.clearAll();
    const ctx = this.renderer.canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.renderer.canvas.width, this.renderer.canvas.height);
    const ictx = this._inkCanvas.getContext('2d');
    if (ictx) ictx.clearRect(0, 0, this._inkCanvas.width, this._inkCanvas.height);

    this.ui.pageThumbnailContainer.style.display = 'none';
    this.ui.pageThumbnailContainer.innerHTML = '';
     
    (document.getElementById('emptyState') as HTMLElement).style.display = 'flex';
    this._disableFileMenuDocItems();
    this.renderElements(); // clear annotation DOM nodes after model is reset
    this.showToast(t('toast.documentClosed'));
  }

  // ── File upload ───────────────────────────────────────────────
  private async _imagesToPdf(imageFiles: File[]): Promise<{ bytes: Uint8Array; name: string }> {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const pdfDoc = await PDFDocument.create();
    for (const file of imageFiles) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
      const img = isJpeg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(
        await (async () => {
          // convert non-PNG/JPEG to PNG via canvas
          if (file.type === 'image/png') return bytes;
          return new Promise<Uint8Array>((resolve) => {
            const blob = URL.createObjectURL(file);
            const imgEl = new Image();
            imgEl.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = imgEl.naturalWidth;
              canvas.height = imgEl.naturalHeight;
              canvas.getContext('2d')?.drawImage(imgEl, 0, 0);
              canvas.toBlob((b) => {
                if (b) b.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
              }, 'image/png');
              URL.revokeObjectURL(blob);
            };
            imgEl.src = blob;
          });
        })()
      );
      const page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    const bytes = await pdfDoc.save();
    const baseName = imageFiles.length === 1
      ? imageFiles[0].name.replace(/\.[^.]+$/, '')
      : 'images';
    return { bytes, name: `${baseName}.pdf` };
  }

  async handleFileUpload(e: Event) {
    if (this._isLoading) return;
    this._isLoading = true;
    const inputEl = e.target as HTMLInputElement;
    const files = Array.from(inputEl.files ?? []);
    inputEl.value = '';

    // Route image files through image→PDF conversion
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const pdfFiles  = files.filter(f => f.type === 'application/pdf');
    let file: File;

    if (imageFiles.length > 0 && pdfFiles.length === 0) {
      this.showToast(t('toast.convertingImages', { count: imageFiles.length }), 10000);
      try {
        const { bytes, name } = await this._imagesToPdf(imageFiles);
        file = new File([bytes.buffer as ArrayBuffer], name, { type: 'application/pdf' });
      } catch (err) {
        this.showToast(t('toast.imageConversionFailed', { error: err instanceof Error ? err.message.slice(0, 60) : String(err) }));
        this._isLoading = false;
        return;
      }
    } else if (pdfFiles.length === 1 && imageFiles.length === 0) {
      file = pdfFiles[0];
    } else {
      this.showToast(t('toast.imageMixedError'));
      this._isLoading = false;
      return;
    }

    try {
      const rawBytes = new Uint8Array(await file.arrayBuffer());
      const bytesToStore = rawBytes.slice(0); // pdf.js transfers the ArrayBuffer; copy first

      // Handle password-protected PDFs with retry loop
      let doc;
      let openPassword: string | undefined;
      let isRetry = false;
      for (;;) {
        try {
          const loadOpts: Record<string, unknown> = { data: rawBytes.slice(0) };
          if (openPassword) loadOpts['password'] = openPassword;
          doc = await pdfjsLib.getDocument(loadOpts).promise;
          break;
        } catch (err) {
          // pdfjs throws PasswordException (name: 'PasswordException') for encrypted PDFs
          const isPasswordError = err instanceof Error && (
            err.name === 'PasswordException' ||
            err.message.toLowerCase().includes('password')
          );
          if (!isPasswordError) throw err;
          const pw = await this._promptPassword(isRetry);
          if (!pw) { this._isLoading = false; return; } // user cancelled
          openPassword = pw;
          isRetry = true;
        }
      }

      // Reset state for new document
      this.documentModel = new DocumentModel();
      this.renderer.setModel(this.documentModel);
      this.elements = [];
      this._formValues = {};
      this._warnedUnsupportedFields = false;
      this._formFieldOverlay.clear();
      this._textLayerManager.clear();
      this._textSearch.clearCache();
      this.historyManager.clear();
      this.selectedElement = null;
      this.currentFilename = file.name;

      // Re-init thumbnail panel with new model
      this.ui.pageThumbnailContainer.innerHTML = '';
      this._thumbnailPanel = new PageThumbnailPanel({
        container: this.ui.pageThumbnailContainer,
        renderer: this.renderer,
        model: this.documentModel,
        onNavigate: (index) => this._goToPageIndex(index),
        onDelete: (pageId) => this._deletePage(pageId),
        onReorder: (newOrder) => this._reorderPages(newOrder),
        onRotate: (pageId, delta) => this._rotatePage(pageId, delta),
        onAddPdf: () => this.ui.addPdfInput.click(),
        onDownload: (index) => this.downloadPage(index),
        onDownloadImage: (index) => this.downloadPageAsImage(index),
      });

      const src = this.documentModel.addSourcePdf(doc, bytesToStore, file.name);
      this.documentModel.addPagesFrom(src.id);
      this.renderer.pdfDoc = doc;

       
      (document.getElementById('emptyState') as HTMLElement).style.display = 'none';
      this._isFitMode = true;
      const fitScale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
      const isMobile = window.innerWidth <= 640;
      await this.applyZoom(isMobile ? Math.max(fitScale, 0.65) : fitScale);
      this.enableUI();
      this._enableFileMenuDocItems();
      this.ui.pageThumbnailContainer.style.display = '';
      await this._thumbnailPanel.render();
      this.updatePageInfo();
      this.renderElements();
      this._autosave();
    } catch (err) {
      this.showToast(t('toast.pdfLoadFailed', { error: err instanceof Error ? err.message.slice(0, 80) : 'unknown error' }));
      console.error('[handleFileUpload]', err);
    } finally {
      this._isLoading = false;
    }
  }

  enableUI() { this.uiController.enableUI(); }

  /** Re-render dynamic DOM strings after a language change. */
  onLanguageChanged(): void {
    this.uiController.updateModeButtons(this.mode);
    if (this.documentModel?.pageCount > 0) {
      this._thumbnailPanel?.render();
    }
  }

  _cleanEmptyTextElements() {
    const focused = document.activeElement;
    const before = this.elements.length;
    const keep = this.elements.filter(e => {
      if (!(e.type === 'text' && !(e as TextElement).text)) return true;
      const input = document.querySelector(`[data-id="${e.id}"] input, [data-id="${e.id}"] textarea`);
      return input ? input === focused : true;
    });
    if (keep.length < before) {
      this.elements.splice(0, this.elements.length, ...keep);
      this.renderElements();
    }
  }

  setMode(mode: ToolMode) {
    this.drawingHandler.cancel();
    this.eraserHandler.cancel();
    this.inkLayerHandler.cancel();
    this.mode = mode;
    const pe = mode === 'select' ? 'auto' : 'none';
    this.ui.container.querySelectorAll<HTMLElement>('.pdf-element').forEach(el => { el.style.pointerEvents = pe; });
    this.uiController.updateModeButtons(mode);
    this._updateFormattingToolbar();
    this._formFieldOverlay.setPointerEvents(mode === 'select');
    this._textLayerManager.setPointerEvents(mode === 'select');
    if (mode === 'addSignature') this.openSignatureModal();

    const modeHintKeys: Partial<Record<ToolMode, string>> = {
      addText: 'toast.modeHint.addText', addSignature: 'toast.modeHint.addSignature',
      addImage: 'toast.modeHint.addImage', drawArrow: 'toast.modeHint.drawArrow',
      drawRect: 'toast.modeHint.drawRect', drawEllipse: 'toast.modeHint.drawEllipse',
      drawFreehand: 'toast.modeHint.drawFreehand', drawHighlight: 'toast.modeHint.drawHighlight',
      addComment: 'toast.modeHint.addComment', addCode: 'toast.modeHint.addCode',
      drawRedaction: 'toast.modeHint.drawRedaction',
      drawErase: 'toast.modeHint.drawErase', editText: 'toast.modeHint.editText',
    };
    const placementModes: ToolMode[] = ['addText', 'addComment', 'addImage', 'addSignature', 'addCode'];
    if (!placementModes.includes(mode) && this._placementGhost) {
      this._placementGhost.style.display = 'none';
    }

    const hintKey = modeHintKeys[mode];
    if (hintKey) {
      this.uiController.showToast(t(hintKey), 1500);
    } else {
      this.uiController.clearToast();
    }
  }

  _isShapeMode() { return this.mode.startsWith('draw'); }

  openSignatureModal() {
    this.ui.signatureModal.classList.add('active');
    const w = this.ui.signatureCanvas.offsetWidth || 500;
    this.ui.signatureCanvas.width = w;
    this.ui.signatureCanvas.height = Math.round(w * 0.4);
    this.signaturePad.clear();
    this._trapCleanup?.();
    this._trapCleanup = trapFocus(
      this.ui.signatureModal.querySelector('.signature-content') as HTMLElement,
      this.ui.addSignatureBtn,
    );
  }

  closeSignatureModal() {
    this.ui.signatureModal.classList.remove('active');
    this._trapCleanup?.();
    this._trapCleanup = null;
    this.setMode('select');
    this.ui.addSignatureBtn.classList.remove('active');
  }

  saveSignature() {
    if (this.signaturePad.isEmpty()) {
      this.showToast(t('toast.drawSignatureFirst'));
      return;
    }
    this.currentSignature = this.signaturePad.getDataURL();
    this._signatureNatural = { w: this.ui.signatureCanvas.width, h: this.ui.signatureCanvas.height };
    this.ui.signatureModal.classList.remove('active');
    this._trapCleanup?.();
    this._trapCleanup = null;
    this.mode = 'addSignature';
    this.ui.addSignatureBtn.classList.add('active');
  }

  // ── Code modal ────────────────────────────────────────────────

  openCodeModal(el?: CodeElement): void {
    this._codeModalEditingId = el?.id ?? null;
    this._qrLogoDataUrl = null;
    // Pre-fill or reset form
    this.ui.codeFormatSelect.value = el?.codeType ?? 'qrcode';
    this.ui.codeDataInput.value = el?.data ?? '';
    const qs = el?.qrStyle;
    this.ui.qrStyledChk.checked = qs?.styled ?? false;
    this.ui.qrEclevelSelect.value = qs?.eclevel ?? 'M';
    this.ui.qrDotStyle.value = qs?.dotType ?? 'square';
    this.ui.qrDotColor.value = qs?.dotColor ?? '#000000';
    this.ui.qrBgColor.value = qs?.bgColor ?? '#ffffff';
    this.ui.qrLogoInput.value = '';
    this._qrLogoDataUrl = qs?.logoSrc ?? null;
    this.ui.qrLogoName.textContent = qs?.logoSrc ? t('modal.code.logoExisting') : '';
    this.ui.qrLogoClearBtn.style.display = qs?.logoSrc ? '' : 'none';
    const bo = (el as CodeElement | undefined)?.bwipOpts;
    this.ui.barcodeShowTextChk.checked = bo?.includetext ?? true;
    this._syncCodeOptionsVisibility();
    // Reset preview
    this.ui.codePreviewImg.style.display = 'none';
    this.ui.codePreviewImg.src = '';
    this.ui.codePreviewStatus.textContent = '';
    this.ui.saveCodeModal.disabled = true;
    const title = el ? t('modal.code.titleEdit') : t('modal.code.title');
    const titleEl = this.ui.codeModal.querySelector('h2');
    if (titleEl) titleEl.textContent = title;
    const saveLabel = el ? t('modal.code.update') : t('modal.code.place');
    this.ui.saveCodeModal.textContent = saveLabel;
    this.ui.codeModal.classList.add('active');
    this._trapCleanup?.();
    this._trapCleanup = trapFocus(
      this.ui.codeModal.querySelector('.code-modal-content') as HTMLElement,
      this.ui.addCodeBtn,
    );
    // Trigger preview if data is pre-filled
    if (this.ui.codeDataInput.value.trim()) this._triggerCodePreview(0);
  }

  closeCodeModal(): void {
    this.ui.codeModal.classList.remove('active');
    this._trapCleanup?.();
    this._trapCleanup = null;
    // Only switch to select if we were not editing an existing element
    if (this._codeModalEditingId === null && this.mode !== 'addCode') {
      this.setMode('select');
    }
    this._codeModalEditingId = null;
  }

  async saveCodeModal(): Promise<void> {
    const fmt = this.ui.codeFormatSelect.value;
    const data = this.ui.codeDataInput.value.trim();
    if (!data) return;
    const qrStyle = this._getQrStyleOptions();
    const bwipOpts = this._getCodeBwipOpts();
    this.ui.saveCodeModal.disabled = true;
    this.ui.codePreviewStatus.textContent = t('modal.code.generating');
    try {
      const dataUrl = await generateCodeDataUrl(fmt, data, qrStyle, bwipOpts);
      const nat = await new Promise<{ w: number; h: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = dataUrl;
      });
      const editingId = this._codeModalEditingId;
      this.ui.codeModal.classList.remove('active');
      this._trapCleanup?.();
      this._trapCleanup = null;
      this._codeModalEditingId = null;

      if (editingId !== null) {
        // Edit existing element in-place
        const el = this.elements.find(x => x.id === editingId) as CodeElement | undefined;
        if (el) {
          el.codeType = fmt;
          el.data = data;
          el.qrStyle = qrStyle ?? null;
          el.bwipOpts = bwipOpts;
          el.cachedDataUrl = dataUrl;
          this._autosave();
          this.renderElements();
        }
      } else {
        // New placement — switch to addCode mode and wait for drag
        this._pendingCodeDataUrl = dataUrl;
        this._pendingCodeOptions = { codeType: fmt, data, qrStyle: qrStyle ?? null, bwipOpts };
        this._pendingCodeNatural = nat;
        this.setMode('addCode');
      }
    } catch (e) {
      this.ui.codePreviewStatus.textContent = String(e).replace(/^Error:\s*/, '');
      this.ui.saveCodeModal.disabled = false;
    }
  }

  private _getQrStyleOptions(): QRStyleOptions | null {
    if (this.ui.codeFormatSelect.value !== 'qrcode') return null;
    const eclevel = this.ui.qrEclevelSelect.value;
    if (!this.ui.qrStyledChk.checked) {
      return { styled: false, eclevel };
    }
    return {
      styled: true,
      eclevel,
      dotType: this.ui.qrDotStyle.value,
      dotColor: this.ui.qrDotColor.value,
      bgColor: this.ui.qrBgColor.value,
      ...(this._qrLogoDataUrl ? { logoSrc: this._qrLogoDataUrl } : {}),
    };
  }

  private _getCodeBwipOpts(): BwipOptions | null {
    const is2D = ['qrcode', 'datamatrix', 'pdf417', 'azteccode'].includes(this.ui.codeFormatSelect.value);
    if (is2D) return null;
    return { includetext: this.ui.barcodeShowTextChk.checked };
  }

  private _syncCodeOptionsVisibility(): void {
    const fmt = this.ui.codeFormatSelect.value;
    const isQr = fmt === 'qrcode';
    const is2D = ['qrcode', 'datamatrix', 'pdf417', 'azteccode'].includes(fmt);
    this.ui.qrStyleSection.style.display = isQr ? '' : 'none';
    this.ui.qrStyleControls.style.display = (isQr && this.ui.qrStyledChk.checked) ? '' : 'none';
    this.ui.barcodeShowTextRow.style.display = is2D ? 'none' : '';
  }

  private _triggerCodePreview(delay = 400): void {
    clearTimeout(this._codePreviewDebounce ?? undefined);
    this._codePreviewDebounce = setTimeout(() => void this._runCodePreview(), delay);
  }

  private async _runCodePreview(): Promise<void> {
    const gen = ++this._codeModalGen;
    const fmt = this.ui.codeFormatSelect.value;
    const data = this.ui.codeDataInput.value.trim();
    if (!data) {
      this.ui.codePreviewImg.style.display = 'none';
      this.ui.codePreviewStatus.textContent = '';
      this.ui.saveCodeModal.disabled = true;
      return;
    }
    this.ui.saveCodeModal.disabled = true;
    this.ui.codePreviewStatus.textContent = t('modal.code.generating');
    try {
      const qrStyle = this._getQrStyleOptions();
      const bwipOpts = this._getCodeBwipOpts();
      const dataUrl = await generateCodeDataUrl(fmt, data, qrStyle, bwipOpts);
      if (gen !== this._codeModalGen) return; // stale generation
      this.ui.codePreviewImg.src = dataUrl;
      this.ui.codePreviewImg.style.display = 'block';
      this.ui.codePreviewStatus.textContent = '';
      this.ui.saveCodeModal.disabled = false;
    } catch (e) {
      if (gen !== this._codeModalGen) return;
      this.ui.codePreviewImg.style.display = 'none';
      this.ui.codePreviewStatus.textContent = String(e).replace(/^Error:\s*/, '');
      this.ui.saveCodeModal.disabled = true;
    }
  }

  selectElement(element: PDFElement | null) {
    if (this.selectedElement === element) { this._updateFormattingToolbar(); return; }
    this._cleanEmptyTextElements();
    this.selectedElement = element;
    this.renderElements();
    this._updateFormattingToolbar();
    this._updateCopyPasteBtns();
  }

  _updateFormattingToolbar() {
    this.uiController.updateFormattingToolbar(this.selectedElement, this.mode);
  }

  handleCanvasClick(e: MouseEvent) {
    if (this._skipNextClick) { this._skipNextClick = false; return; }
    if (this._isShapeMode()) return;
    if (this.mode === 'addText' || (this.mode === 'addImage' && this._pendingImageSrc) || this.mode === 'addComment' || (this.mode === 'addSignature' && this.currentSignature) || this.mode === 'addCode') return;
    if (this.mode === 'fillBucket') {
      this._handleFillBucketClick(e);
    } else if (this.mode === 'editText') {
      void this._textEditHandler.handleCanvasClick(e, this);
    } else {
      this.selectElement(null);
    }
  }

  private _handleFillBucketClick(e: MouseEvent): void {
    const pageId = this.documentModel.currentPage?.id;
    if (!pageId) return;
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const target = [...this.elements]
      .reverse()
      .find(el => el.pageId === pageId && el.type === 'shape' &&
        this._hitTestShape(el as ShapeElement, x, y));
    if (!target) return;
    const newFill = this.ui.fillColorInput.value;
    const cmd = new FillColorCmd(this.elements, target.id, (target as ShapeElement).fillColor, newFill);
    this.historyManager.execute(cmd);
    this._autosave();
    this.renderElements();
  }

  private _hitTestShape(shape: ShapeElement, x: number, y: number): boolean {
    if (shape.shapeType === 'freehand') {
      const threshold = shape.strokeWidth / 2 + 4;
      const pts = shape.points;
      for (let i = 0; i < pts.length - 1; i++) {
        if (this._ptSegDist(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= threshold)
          return true;
      }
      return false;
    }
    return x >= shape.x && x <= shape.x + shape.width &&
           y >= shape.y && y <= shape.y + shape.height;
  }

  private _ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }


  addTextAtPosition(e: MouseEvent) {
    const pageId = this.documentModel.currentPage?.id;
    if (!pageId) return;
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const options = { fontSize: parseInt(this.ui.fontSizeInput.value), color: this.ui.colorInput.value };
    const textElement = new TextElement(x, y, pageId, options);
    textElement.x -= textElement.width / 2;
    textElement.y -= textElement.height / 2;
    this.historyManager.execute(new AddElementCmd(this.elements, textElement));
    this._autosave();
    this.renderElements();
    // Focus BEFORE selectElement so _cleanEmptyTextElements sees activeElement === input
    const inputEl = this.ui.container.querySelector(
      `[data-id='${textElement.id}'] input, [data-id='${textElement.id}'] textarea`
    ) as HTMLInputElement | null;
    if (inputEl) {
      (inputEl as HTMLElement).style.pointerEvents = 'auto';
      inputEl.focus();
    }
    this.selectElement(textElement);
    // selectElement calls renderElements() which recreates DOM — re-query and re-focus
    const freshInput = this.ui.container.querySelector(
      `[data-id='${textElement.id}'] input, [data-id='${textElement.id}'] textarea`
    ) as HTMLInputElement | null;
    freshInput?.focus();
  }


  removeElement(id: number) {
    const el = this.elements.find(e => e.id === id);
    if (!el) return;
    this.historyManager.execute(new RemoveElementCmd(this.elements, el));
    if (this.selectedElement && this.selectedElement.id === id) {
      this.selectedElement = null;
      this._updateFormattingToolbar();
    }
    this.renderElements();
    this._autosave();
  }

  renderElements() {
    this.ui.container.querySelectorAll('.pdf-element').forEach(el => el.remove());
    const currentPageId = this.documentModel.currentPage?.id;
    if (!currentPageId) return;
    const canvasOffset = { left: this.ui.canvas.offsetLeft, top: this.ui.canvas.offsetTop };
    const currentPageElements = this.elements.filter(el => el.pageId === currentPageId);
    const interactable = this.mode === 'select';
    currentPageElements.forEach(element => {
      const div = element.render(this.ui.container, canvasOffset, this.zoomScale);
      div.style.pointerEvents = interactable ? 'auto' : 'none';
      if (element.rotation) {
        div.style.transform = `rotate(${element.rotation}deg)`;
        div.style.transformOrigin = 'center center';
      }
      if (this.selectedElement && this.selectedElement.id === element.id) div.classList.add('selected');
      div.addEventListener('click', (e) => { e.stopPropagation(); this.selectElement(element); });
      div.addEventListener('pointerdown', (e) => { this.interactionHandler.handlePointerDown(e, element, div); });
      if (element.type === 'code') {
        div.addEventListener('code-element-edit', (e) => {
          const id = (e as CustomEvent<{ id: number }>).detail.id;
          const el = this.elements.find(x => x.id === id) as CodeElement | undefined;
          if (el) this.openCodeModal(el);
        });
      }
      if (element.type === 'text') {
        const input = div.querySelector('input, textarea');
        if (input) {
          const isSelected = this.selectedElement && this.selectedElement.id === element.id;
          if (!isSelected) (input as HTMLElement).style.pointerEvents = 'none';
          input.addEventListener('input', () => {
            const textEl = element as TextElement;
            if (this._pendingTextElementId !== element.id) {
              this._pendingTextBefore = textEl.text;
              this._pendingTextElementId = element.id;
            }
            textEl.text = (input as HTMLInputElement | HTMLTextAreaElement).value;
            clearTimeout(this._textChangeTimer ?? undefined);
            this._textChangeTimer = setTimeout(() => {
              const before = this._pendingTextBefore;
              const id = this._pendingTextElementId;
              this._pendingTextBefore = null;
              this._pendingTextElementId = null;
              this._textChangeTimer = null;
              if (id !== null && before !== null && before !== textEl.text) {
                this.historyManager.record(new TextEditCmd(this.elements, id, before, textEl.text));
              }
              this._autosave();
            }, 500);
          });
        }
      }
      this.ui.container.appendChild(div);
    });
  }

  // ── Ink layer ─────────────────────────────────────────────────
  renderInkLayer(): void {
    const canvas = this.ui.canvas;
    const ic = this._inkCanvas;
    ic.style.left   = canvas.offsetLeft + 'px';
    ic.style.top    = canvas.offsetTop  + 'px';
    ic.style.width  = canvas.offsetWidth  + 'px';
    ic.style.height = canvas.offsetHeight + 'px';
    if (ic.width !== canvas.width || ic.height !== canvas.height) {
      ic.width  = canvas.width;
      ic.height = canvas.height;
    }
    const pageId = this.documentModel.currentPage?.id ?? '';
    this.inkLayer.renderToCanvas(pageId, ic, this.zoomScale);
  }

  renderInkLayerWithLive(points: Array<{ x: number; y: number }>, type: 'ink' | 'erase'): void {
    this.renderInkLayer(); // composite committed strokes first
    if (points.length < 2) return;
    const ctx = this._inkCanvas.getContext('2d');
    if (!ctx) return;
    const sw = parseInt(this.ui.shapeWidth.value) || 3;
    ctx.save();
    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (type === 'erase' ? Math.max(12, sw * 4) : sw) * this.zoomScale;
    if (type === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.ui.colorInput.value;
    }
    ctx.moveTo(points[0].x * this.zoomScale, points[0].y * this.zoomScale);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * this.zoomScale, points[i].y * this.zoomScale);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Navigation ────────────────────────────────────────────────
  private async _renderCurrentPage(): Promise<void> {
    await this.renderer.renderPageAtIndex(this.documentModel.currentPageIndex);
    await this._renderFormFields();
    await this._renderTextLayer();
    this.renderInkLayer();
  }

  private async _renderTextLayer(): Promise<void> {
    const docPage = this.documentModel.currentPage;
    if (!docPage) { this._textLayerManager.clear(); return; }
    if (docPage.sourcePdfId === 'blank') { this._textLayerManager.clear(); return; }
    const src = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
    if (!src) return;
    const page = await src.doc.getPage(docPage.sourcePageNum);
    const effectiveRotation = ((page.rotate + (docPage.rotation ?? 0)) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale: this.zoomScale, rotation: effectiveRotation });
    const canvasOffset = { left: this.ui.canvas.offsetLeft, top: this.ui.canvas.offsetTop };
    await this._textLayerManager.render(page, viewport, canvasOffset);
    this._textLayerManager.setPointerEvents(this.mode === 'select');
  }

  private async _renderFormFields(): Promise<void> {
    const myGen = ++this._formFieldGen;
    const docPage = this.documentModel.currentPage;
    if (!docPage) { this._formFieldOverlay.clear(); return; }
    if (docPage.sourcePdfId === 'blank') { this._formFieldOverlay.clear(); return; }
    const src = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
    if (!src) return;
    const page = await src.doc.getPage(docPage.sourcePageNum);
    if (myGen !== this._formFieldGen) return;  // stale — newer navigation started
    const effectiveRotation = ((page.rotate + (docPage.rotation ?? 0)) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale: this.zoomScale, rotation: effectiveRotation });
    const canvasOffset = { left: this.ui.canvas.offsetLeft, top: this.ui.canvas.offsetTop };
    const values = this._formValues[docPage.sourcePdfId] ?? {};
    const { unsupportedCount } = await this._formFieldOverlay.render(
      page, viewport, canvasOffset, values,
      (fieldName, value) => {
        if (!this._formValues[docPage.sourcePdfId]) this._formValues[docPage.sourcePdfId] = {};
        this._formValues[docPage.sourcePdfId][fieldName] = value;
        this._autosave();
      }
    );
    if (myGen !== this._formFieldGen) return;  // stale after second await

    if (unsupportedCount > 0 && !this._warnedUnsupportedFields) {
      this._warnedUnsupportedFields = true;
      this.showToast(t('toast.unsupportedFields', { count: unsupportedCount }), 5000);
    }
    this._formFieldOverlay.setPointerEvents(this.mode === 'select');
  }

  async _goToPageIndex(index: number): Promise<void> {
    if (index < 0 || index >= this.documentModel.pageCount) return;
    if (index === this.documentModel.currentPageIndex) return;
    this.documentModel.currentPageIndex = index;
    this.selectElement(null);
    this._clearSearchMatches();
    this._findMatches = [];
    this._findMatchIndex = -1;
    if (this.ui.findBar.style.display !== 'none') this.ui.findCount.textContent = '';
    if (this._isFitMode) {
      const fitScale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
      const isMobile = window.innerWidth <= 640;
      this.zoomScale = isMobile ? Math.max(fitScale, 0.65) : fitScale;
      this.renderer.setScale(this.zoomScale);
      this.ui.zoomDisplay.textContent = Math.round(this.zoomScale * 100) + '%';
    }
    await this._renderCurrentPage();
    this._thumbnailPanel?.updateActive();
    this.updatePageInfo();
    this.renderElements();
    if (this.ui.findBar.style.display !== 'none' && this.ui.findInput.value) this._search();
    if (this._exportPreviewOpen) this._showExportPreview();
  }

  async _goToPage(n: number): Promise<void> {
    await this._goToPageIndex(n - 1);
  }

  async prevPage() { await this._goToPageIndex(this.documentModel.currentPageIndex - 1); }
  async nextPage() { await this._goToPageIndex(this.documentModel.currentPageIndex + 1); }

  updatePageInfo() {
    this.uiController.updatePageInfo(this.documentModel.currentPageIndex + 1, this.documentModel.pageCount);
  }

  async applyZoom(newScale: number): Promise<void> {
    if (!Number.isFinite(newScale) || newScale <= 0) return;
    this.zoomScale = Math.max(0.25, Math.min(3.0, newScale));
    this.renderer.setScale(this.zoomScale);
    this.ui.zoomDisplay.textContent = Math.round(this.zoomScale * 100) + '%';
    await this._renderCurrentPage();
    this._thumbnailPanel?.invalidateAll();
    this.renderElements();
    // Re-run search at new scale so match overlays reposition correctly
    if (this.ui.findBar.style.display !== 'none' && this.ui.findInput.value) this._search();
    if (this._exportPreviewOpen) this._showExportPreview();
  }

  private _showExportPreview(): void {
    const docPage = this.documentModel.currentPage;
    if (!docPage) return;

    const canvas = this.renderer.canvas;
    const ghost = this.ui.exportPreviewGhost;
    ghost.innerHTML = '';
    ghost.style.width  = canvas.width  + 'px';
    ghost.style.height = canvas.height + 'px';
    ghost.style.left   = canvas.offsetLeft + 'px';
    ghost.style.top    = canvas.offsetTop  + 'px';

    if (this.documentModel.watermark.enabled) {
      const wmCanvas = document.createElement('canvas');
      wmCanvas.width  = canvas.width;
      wmCanvas.height = canvas.height;
      wmCanvas.style.position      = 'absolute';
      wmCanvas.style.left          = '0';
      wmCanvas.style.top           = '0';
      wmCanvas.style.pointerEvents = 'none';
      const ctx = wmCanvas.getContext('2d');
      if (ctx) this._drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, this.documentModel.watermark);
      ghost.appendChild(wmCanvas);
    }

    const W = canvas.width / this.zoomScale;
    const H = canvas.height / this.zoomScale;
    const angle = docPage.rotation ?? 0;

    const pageElements = this.elements.filter(el => el.pageId === docPage.id);
    for (const el of pageElements) {
      const pdfPt = this._transformPoint(el.x, el.y, W, H, angle);
      const screenX = pdfPt.x * this.zoomScale;
      const screenY = (H - pdfPt.y) * this.zoomScale;
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.left   = screenX + 'px';
      div.style.top    = screenY + 'px';
      div.style.width  = el.width  * this.zoomScale + 'px';
      div.style.height = el.height * this.zoomScale + 'px';
      div.style.border = '3px dashed #e63946';
      div.style.background = 'rgba(230,57,70,0.15)';
      div.style.boxSizing = 'border-box';
      ghost.appendChild(div);
    }

    this._exportPreviewOpen = true;
    this.ui.previewExportBtn.classList.add('active');
    this.ui.previewExportBtn.setAttribute('aria-pressed', 'true');
    this.ui.exportPreviewOverlay.style.display = '';
  }

  private _drawWatermarkOnCanvas(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, wm: WatermarkSettings, scale?: number): void {
    if (!wm.enabled || !wm.text) return;
    const effectiveScale = scale ?? this.zoomScale;
    const fontSize = wm.fontSize * effectiveScale;
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    const textWidth = ctx.measureText(wm.text).width;
    const count = Math.max(1, Math.min(5, wm.density ?? 3));
    const stepX = Math.max(textWidth * 1.2, screenW / (count + 0.5));
    const stepY = Math.max(fontSize * 2.5, screenH / (count + 0.5));
    const col = this.hexToRgbValues(wm.color);
    ctx.fillStyle = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},${wm.opacity})`;
    ctx.textBaseline = 'alphabetic';
    const angleRad = wm.angle * Math.PI / 180;
    for (let y = -(stepY / 2); y < screenH + stepY; y += stepY) {
      for (let x = -(stepX / 2); x < screenW + stepX; x += stepX) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angleRad);
        ctx.fillText(wm.text, -textWidth / 2, 0);
        ctx.restore();
      }
    }
  }

  private _hideExportPreview(): void {
    this._exportPreviewOpen = false;
    this.ui.previewExportBtn.classList.remove('active');
    this.ui.previewExportBtn.setAttribute('aria-pressed', 'false');
    this.ui.exportPreviewOverlay.style.display = 'none';
    this.ui.exportPreviewGhost.innerHTML = '';
  }

  async fitToWidth() {
    this._isFitMode = true;
    const scale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
    await this.applyZoom(scale);
  }

  _copySelectedElement(): void {
    if (!this.selectedElement) return;
    this._clipboard = this.selectedElement.toJSON() as ElementJSON;
    this._updateCopyPasteBtns();
    this.showToast('Copied');
  }

  _pasteElement(): void {
    if (!this._clipboard || !this.documentModel.currentPage) return;
    const clone = ElementFactory.fromJSON({ ...this._clipboard } as Record<string, unknown>);
    if (!clone) return;
    clone.id = PDFElement._nextId++;
    clone.x += 10;
    clone.y += 10;
    clone.pageId = this.documentModel.currentPage.id;
    this.historyManager.execute(new AddElementCmd(this.elements, clone));
    this.selectElement(clone);
    this._autosave();
    this.showToast('Pasted — Ctrl+Z to undo');
  }

  private _updateCopyPasteBtns(): void {
    const hasPdfText = !!window.getSelection()?.toString();
    this.uiController.updateCopyPasteBtns(!!this.selectedElement || hasPdfText, !!this._clipboard);
  }

  /**
   * Export a page as a rasterized PNG image embedded in a new pdf-lib page.
   * Called when the page has redaction elements — rasterization permanently
   * removes the text layer so redacted content cannot be extracted.
   */
  private async _rasterizePageWithRedactions(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    srcDoc: any,
    docPage: import('./documentModel').DocumentPage,
    elements: PDFElement[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfDoc: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    libs: { rgb: any; StandardFonts: any; degrees: any },
  ): Promise<void> {
    const { PDFDocument, rgb, StandardFonts, degrees } = await import('@cantoo/pdf-lib');
    void rgb; void StandardFonts; // used via libs param below

    // 1. Build a temp single-page PDF with all NON-redaction elements drawn in
    const tempDoc = await PDFDocument.create();
    const [tempPage] = await tempDoc.copyPages(srcDoc, [docPage.sourcePageNum - 1]);
    tempDoc.addPage(tempPage);

    const userRot  = docPage.rotation ?? 0;
    const srcRot   = tempPage.getRotation().angle as number;
    const totalRot = ((srcRot + userRot) % 360 + 360) % 360;
    if (userRot) tempPage.setRotation(degrees(totalRot));

    const cropBoxR = this._getPageCropBox(tempPage);
    const W_orig = cropBoxR.width;
    const H_orig = cropBoxR.height;
    const cropOriginX = cropBoxR.x;
    const cropOriginY = cropBoxR.y;
    const w_eff = (totalRot === 90 || totalRot === 270) ? H_orig : W_orig;
    const h_eff = (totalRot === 90 || totalRot === 270) ? W_orig : H_orig;

    const nonRedactions = elements.filter(e => e.type !== 'redaction');
    const rasterErrors: string[] = [];
    for (const el of nonRedactions) {
      try {
        await this._drawElementOnPage(tempDoc, tempPage, el, h_eff, w_eff, libs, W_orig, H_orig, totalRot, cropOriginX, cropOriginY);
      } catch {
        rasterErrors.push(`${el.type} (id ${el.id})`);
      }
    }
    if (rasterErrors.length > 0) {
      this.showToast(`⚠ ${rasterErrors.length} element(s) skipped in redacted page: ${rasterErrors.join(', ')}`, 6000);
    }

    if (this.documentModel.watermark.enabled) {
      await this._drawWatermark(tempPage, W_orig, H_orig, cropOriginX, cropOriginY, {
        rgb: libs.rgb, degrees, pdfDoc: tempDoc, StandardFonts: libs.StandardFonts,
      });
    }
    const inkDataUrlRast = this._renderInkForExport(docPage.id, W_orig, H_orig, totalRot);
    if (inkDataUrlRast) {
      const inkImg = await tempDoc.embedPng(this._dataUrlToUint8Array(inkDataUrlRast));
      tempPage.drawImage(inkImg, { x: cropOriginX, y: cropOriginY, width: W_orig, height: H_orig });
    }

    // 2. Rasterize via pdf.js at 2× scale
    const tempBytes  = await tempDoc.save({ useObjectStreams: false });
    const renderDoc  = await pdfjsLib.getDocument({ data: tempBytes }).promise;
    const renderPage = await renderDoc.getPage(1);
    const SCALE = 2;
    // Rotation is already baked into the temp PDF via setRotation() above — do not re-apply.
    const vp = renderPage.getViewport({ scale: SCALE });

    const offscreen    = document.createElement('canvas');
    offscreen.width    = Math.round(vp.width);
    offscreen.height   = Math.round(vp.height);
     
    const ctx          = offscreen.getContext('2d') as CanvasRenderingContext2D;
    await renderPage.render({ canvas: offscreen, viewport: vp }).promise;

    // 3. Paint redaction boxes onto the canvas (permanently covers content)
    for (const el of elements.filter(e => e.type === 'redaction')) {
      ctx.fillStyle = (el as { color?: string }).color ?? '#000000';
      ctx.fillRect(
        Math.round(el.x * SCALE),
        Math.round(el.y * SCALE),
        Math.round(el.width  * SCALE),
        Math.round(el.height * SCALE),
      );
    }

    // 4. Embed rasterized PNG into the destination document as a new page
    const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
      offscreen.toBlob((blob) => {
        if (!blob) { reject(new Error('canvas toBlob failed')); return; }
        blob.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
      }, 'image/png');
    });

    const pngImg  = await pdfDoc.embedPng(pngBytes);
    const newPage = pdfDoc.addPage([w_eff, h_eff]);
    newPage.drawImage(pngImg, { x: 0, y: 0, width: w_eff, height: h_eff });
  }

  // ── Export (vector copyPages) ─────────────────────────────────
  async downloadPDF() {
    if (!this.documentModel.pageCount) return;
    this._cleanEmptyTextElements();
    this.showToast('Generating PDF…', 60000);
    const { PDFDocument, rgb, StandardFonts, degrees } = await import('@cantoo/pdf-lib');
    this.ui.container.style.opacity = '0.4';
    try {
      const pdfDoc = await PDFDocument.create();

      // Load each source PDF once
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const srcDocs = new Map<string, any>();
      for (const [id, src] of this.documentModel.sourcePdfs) {
        srcDocs.set(id, await PDFDocument.load(src.bytes));
      }

      // Fill and flatten form fields for sources with user-entered values
      for (const [id, srcDoc] of srcDocs) {
        const vals = this._formValues[id];
        if (!vals || !Object.keys(vals).length) continue;
        try {
          const form = srcDoc.getForm();
          for (const [fieldName, value] of Object.entries(vals)) {
            try { form.getTextField(fieldName).setText(value); } catch { /* field missing */ }
          }
          form.flatten();
        } catch { /* no form fields in this source */ }
      }

      // Pre-copy all needed pages from each source (one copyPages call per source)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const copiedPages = new Map<string, any>();
      for (const [id, srcDoc] of srcDocs) {
        const indices = [...new Set(
          this.documentModel.pages.filter(p => p.sourcePdfId === id).map(p => p.sourcePageNum - 1)
        )].sort((a, b) => a - b);
        const pages = await pdfDoc.copyPages(srcDoc, indices);
        indices.forEach((idx: number, i: number) => copiedPages.set(`${id}:${idx}`, pages[i]));
      }

      // Add pages in document order and draw overlays
      for (const docPage of this.documentModel.pages) {
        const pageElements = this.elements.filter(el => el.pageId === docPage.id);
        const hasRedaction = pageElements.some(el => el.type === 'redaction');

        // Blank page: create fresh page at specified dimensions
        if (docPage.sourcePdfId === 'blank') {
          const W_orig = docPage.blankWidth ?? 595;
          const H_orig = docPage.blankHeight ?? 842;
          const blankPage = pdfDoc.addPage([W_orig, H_orig]);
          blankPage.drawRectangle({ x: 0, y: 0, width: W_orig, height: H_orig, color: rgb(1, 1, 1), borderWidth: 0 });
          const exportErrors: string[] = [];
          for (const element of pageElements) {
            try {
              await this._drawElementOnPage(pdfDoc, blankPage, element, H_orig, W_orig, { rgb, StandardFonts, degrees }, W_orig, H_orig, 0, 0, 0);
            } catch {
              exportErrors.push(`${element.type} (id ${element.id})`);
            }
          }
          if (exportErrors.length > 0) this.showToast(`⚠ ${exportErrors.length} element(s) failed: ${exportErrors.join(', ')}`, 6000);
          const inkDataUrl = this._renderInkForExport(docPage.id, W_orig, H_orig, 0);
          if (inkDataUrl) {
            const inkImg = await pdfDoc.embedPng(this._dataUrlToUint8Array(inkDataUrl));
            blankPage.drawImage(inkImg, { x: 0, y: 0, width: W_orig, height: H_orig });
          }
          continue;
        }

        if (hasRedaction) {
          const srcDoc = srcDocs.get(docPage.sourcePdfId);
          if (srcDoc) {
            await this._rasterizePageWithRedactions(srcDoc, docPage, pageElements, pdfDoc, { rgb, StandardFonts, degrees });
          }
          continue; // skip the normal vector export for this page
        }

        const key = `${docPage.sourcePdfId}:${docPage.sourcePageNum - 1}`;
        const page = copiedPages.get(key);
        if (!page) continue;
        pdfDoc.addPage(page);

        // Apply user rotation on top of source rotation
        const userRot = docPage.rotation ?? 0;
        const sourceRot = page.getRotation().angle as number;
        const totalRot = ((sourceRot + userRot) % 360 + 360) % 360;
        if (userRot) page.setRotation(degrees(totalRot));

        // CropBox dims — pdfjs renders in CropBox space; use CropBox for all element coords
        const cropBox = this._getPageCropBox(page);
        const W_orig = cropBox.width;
        const H_orig = cropBox.height;
        const cropOriginX = cropBox.x;
        const cropOriginY = cropBox.y;
        // Visual (effective) dims after rotation
        const w_eff = (totalRot === 90 || totalRot === 270) ? H_orig : W_orig;
        const h_eff = (totalRot === 90 || totalRot === 270) ? W_orig : H_orig;

        const exportErrors: string[] = [];
        for (const element of pageElements) {
          try {
            await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts, degrees }, W_orig, H_orig, totalRot, cropOriginX, cropOriginY);
          } catch {
            exportErrors.push(`${element.type} (id ${element.id})`);
          }
        }
        if (exportErrors.length > 0) {
          this.showToast(`⚠ ${exportErrors.length} element(s) failed to render: ${exportErrors.join(', ')}`, 6000);
        }

        if (this.documentModel.watermark.enabled) {
          await this._drawWatermark(page, W_orig, H_orig, cropOriginX, cropOriginY, { rgb, degrees, pdfDoc, StandardFonts });
        }

        const inkDataUrl = this._renderInkForExport(docPage.id, W_orig, H_orig, totalRot);
        if (inkDataUrl) {
          const inkPng = this._dataUrlToUint8Array(inkDataUrl);
          const inkImg = await pdfDoc.embedPng(inkPng);
          page.drawImage(inkImg, { x: cropOriginX, y: cropOriginY, width: W_orig, height: H_orig });
        }
      }

      await this._applyExportPassword(pdfDoc);
      const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const baseName = (this.currentFilename || 'document').replace(/\.pdf$/i, '');
      link.download = baseName + '-edited.pdf';
      link.click();
      this.showToast('PDF downloaded!');
      URL.revokeObjectURL(url);
    } catch (err) {
      this.showToast('PDF export failed — ' + (err instanceof Error ? err.message.slice(0, 80) : String(err)));
      console.error('[downloadPDF]', err);
    } finally {
      this.ui.container.style.opacity = '1';
      await this._renderCurrentPage();
      this.renderElements();
    }
  }

  // ── Feature B: Split — export one page as PDF ────────────────
  async downloadPage(pageIdx: number): Promise<void> {
    const docPage = this.documentModel.pages[pageIdx];
    if (!docPage) return;
    this.showToast('Generating page PDF…', 30000);
    const { PDFDocument, rgb, StandardFonts, degrees } = await import('@cantoo/pdf-lib');
    this.ui.container.style.opacity = '0.4';
    try {
      const srcEntry = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
      if (!srcEntry) return;
      const srcDocLib = await PDFDocument.load(srcEntry.bytes);
      const pdfDoc    = await PDFDocument.create();
      const pageElements = this.elements.filter(el => el.pageId === docPage.id);
      const hasRedaction = pageElements.some(el => el.type === 'redaction');

      if (hasRedaction) {
        await this._rasterizePageWithRedactions(srcDocLib, docPage, pageElements, pdfDoc, { rgb, StandardFonts, degrees });
      } else {
        const [page] = await pdfDoc.copyPages(srcDocLib, [docPage.sourcePageNum - 1]);
        pdfDoc.addPage(page);

        const userRot  = docPage.rotation ?? 0;
        const srcRot   = page.getRotation().angle as number;
        const totalRot = ((srcRot + userRot) % 360 + 360) % 360;
        if (userRot) page.setRotation(degrees(totalRot));

        const cropBoxP = this._getPageCropBox(page);
        const W_orig = cropBoxP.width;
        const H_orig = cropBoxP.height;
        const cropOriginX = cropBoxP.x;
        const cropOriginY = cropBoxP.y;
        const w_eff = (totalRot === 90 || totalRot === 270) ? H_orig : W_orig;
        const h_eff = (totalRot === 90 || totalRot === 270) ? W_orig : H_orig;
        const exportErrors: string[] = [];
        for (const element of pageElements) {
          try { await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts, degrees }, W_orig, H_orig, totalRot, cropOriginX, cropOriginY); }
          catch { exportErrors.push(`${element.type} (id ${element.id})`); }
        }
        if (exportErrors.length > 0) {
          this.showToast(`⚠ ${exportErrors.length} element(s) failed to render: ${exportErrors.join(', ')}`, 6000);
        }
        if (this.documentModel.watermark.enabled) {
          await this._drawWatermark(page, W_orig, H_orig, cropOriginX, cropOriginY, { rgb, degrees, pdfDoc, StandardFonts });
        }

        const inkDataUrl = this._renderInkForExport(docPage.id, W_orig, H_orig, totalRot);
        if (inkDataUrl) {
          const inkPng = this._dataUrlToUint8Array(inkDataUrl);
          const inkImg = await pdfDoc.embedPng(inkPng);
          page.drawImage(inkImg, { x: cropOriginX, y: cropOriginY, width: W_orig, height: H_orig });
        }
      }

      await this._applyExportPassword(pdfDoc);
      const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const base = (this.currentFilename || 'document').replace(/\.pdf$/i, '');
      link.download = `${base}-page${pageIdx + 1}.pdf`;
      link.click();
      this.showToast(`Page ${pageIdx + 1} downloaded!`);
      URL.revokeObjectURL(url);
    } catch (err) {
      this.showToast('Page export failed — ' + (err instanceof Error ? err.message.slice(0, 80) : String(err)));
      console.error('[downloadPage]', err);
    } finally {
      this.ui.container.style.opacity = '1';
    }
  }

  // ── Feature D: Export current page as PNG image ───────────────
  async downloadPageAsImage(pageIdx?: number): Promise<void> {
    const idx = pageIdx ?? this.documentModel.currentPageIndex;
    const docPage = this.documentModel.pages[idx];
    if (!docPage) return;
    this.showToast('Rendering page image…', 30000);
    this.ui.container.style.opacity = '0.4';
    try {
      // Build a single-page PDF with all elements drawn in
      const { PDFDocument, rgb, StandardFonts, degrees } = await import('@cantoo/pdf-lib');
      const srcEntry = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
      if (!srcEntry) {
        this.showToast('Export failed — source PDF not found');
        this.ui.container.style.opacity = '1';
        return;
      }
      const srcDoc = await PDFDocument.load(srcEntry.bytes);
      const pdfDoc = await PDFDocument.create();
      const [page] = await pdfDoc.copyPages(srcDoc, [docPage.sourcePageNum - 1]);
      pdfDoc.addPage(page);

      const userRot  = docPage.rotation ?? 0;
      const srcRot   = page.getRotation().angle as number;
      const totalRot = ((srcRot + userRot) % 360 + 360) % 360;
      if (userRot) page.setRotation(degrees(totalRot));
      const cropBoxI = this._getPageCropBox(page);
      const W_orig = cropBoxI.width;
      const H_orig = cropBoxI.height;
      const cropOriginX = cropBoxI.x;
      const cropOriginY = cropBoxI.y;
      const w_eff = (totalRot === 90 || totalRot === 270) ? H_orig : W_orig;
      const h_eff = (totalRot === 90 || totalRot === 270) ? W_orig : H_orig;

      const imgExportErrors: string[] = [];
      for (const element of this.elements.filter(el => el.pageId === docPage.id)) {
        try { await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts }, W_orig, H_orig, totalRot, cropOriginX, cropOriginY); }
        catch { imgExportErrors.push(`${element.type} (id ${element.id})`); }
      }
      if (imgExportErrors.length > 0) {
        this.showToast(`⚠ ${imgExportErrors.length} element(s) failed to render: ${imgExportErrors.join(', ')}`, 6000);
      }
      if (this.documentModel.watermark.enabled) {
        await this._drawWatermark(page, W_orig, H_orig, cropOriginX, cropOriginY, { rgb, degrees, pdfDoc, StandardFonts });
      }
      const inkDataUrlImg = this._renderInkForExport(docPage.id, W_orig, H_orig, totalRot);
      if (inkDataUrlImg) {
        const inkImg = await pdfDoc.embedPng(this._dataUrlToUint8Array(inkDataUrlImg));
        page.drawImage(inkImg, { x: cropOriginX, y: cropOriginY, width: W_orig, height: H_orig });
      }

      // Rasterize via pdf.js at 2× scale
      const pdfBytes  = await pdfDoc.save({ useObjectStreams: false });
      const renderDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
      const renderPage = await renderDoc.getPage(1);
      const SCALE = 2;
      const vp = renderPage.getViewport({ scale: SCALE });
      const offscreen = document.createElement('canvas');
      offscreen.width  = Math.round(vp.width);
      offscreen.height = Math.round(vp.height);
      const ctx = offscreen.getContext('2d');
      if (!ctx) { this.showToast('Canvas unavailable — cannot export image'); return; }
      await renderPage.render({ canvas: offscreen, viewport: vp }).promise;

      offscreen.toBlob((blob) => {
        if (!blob) { this.showToast('Image export failed'); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const base = (this.currentFilename || 'document').replace(/\.pdf$/i, '');
        link.download = `${base}-page${idx + 1}.png`;
        link.click();
        this.showToast(`Page ${idx + 1} exported as PNG!`);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (err) {
      this.showToast('Image export failed — ' + (err instanceof Error ? err.message.slice(0, 80) : String(err)));
      console.error('[downloadPageAsImage]', err);
    } finally {
      this.ui.container.style.opacity = '1';
    }
  }

  private _dataUrlToUint8Array(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /**
   * Render ink strokes into unrotated PDF coordinate space (W_orig × H_orig) at 2× resolution.
   * Points are stored in rotated canvas space; _transformPoint converts them to PDF content space.
   * Returns a PNG data URL, or null if there is no visible ink on this page.
   */
  private _renderInkForExport(pageId: string, W_orig: number, H_orig: number, totalRot: number): string | null {
    const strokes = this.inkLayer.getStrokes(pageId);
    if (!strokes.length) return null;

    const SCALE = 2;
    const c = document.createElement('canvas');
    c.width  = Math.round(W_orig * SCALE);
    c.height = Math.round(H_orig * SCALE);
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.width * SCALE;
      if (stroke.type === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
      }
      // Transform each point: canvas space (rotated view, scale=1) → PDF content space (unrotated, y-up)
      // → export canvas space (unrotated, y-down, ×SCALE)
      const pts = stroke.points.map(p => {
        const pdf = this._transformPoint(p.x, p.y, W_orig, H_orig, totalRot);
        return { x: pdf.x * SCALE, y: (H_orig - pdf.y) * SCALE };
      });
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }

    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return c.toDataURL('image/png');
    }
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getPageCropBox(page: any): { x: number; y: number; width: number; height: number } {
    try {
      const cb = page.getCropBox?.();
      if (cb && typeof cb.width === 'number') return { x: cb.x, y: cb.y, width: cb.width, height: cb.height };
    } catch { /* no CropBox */ }
    const { width, height } = page.getSize();
    return { x: 0, y: 0, width, height };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _drawElementOnPage(pdfDoc: any, page: any, element: PDFElement, h: number, w: number, libs: { rgb: any; StandardFonts: any; degrees?: any }, W_orig = 0, H_orig = 0, totalRot = 0, cropOriginX = 0, cropOriginY = 0): Promise<void> {
    const { rgb, StandardFonts } = libs;
    // W_orig/H_orig are the unrotated content dims; fall back to effective dims when totalRot=0
    const Wo = W_orig || w;
    const Ho = H_orig || h;
    const tp = (px: number, py: number) => { const r = this._transformPoint(px, py, Wo, Ho, totalRot); return { x: r.x + cropOriginX, y: r.y + cropOriginY }; };
    const swapDims = ((totalRot % 360) + 360) % 360 === 90 || ((totalRot % 360) + 360) % 360 === 270;
    // Element's own rotation (degrees, CW). pdf-lib uses CCW so negate.
    const elemRot = element.rotation ?? 0;
    const pdfRotVal = libs.degrees ? libs.degrees(-elemRot) : undefined;

    // Compute anchor adjusted so rotation is around element center, not corner.
    // pdf-lib rotates around (x, y) so we shift the anchor by the inverse rotation offset.
    const _anchorForCenter = (cornerX: number, cornerY: number, ew: number, eh: number) => {
      if (!elemRot || !pdfRotVal) return { x: cornerX, y: cornerY };
      const rad = (-elemRot) * Math.PI / 180;
      const cx = cornerX + ew / 2;
      const cy = cornerY + eh / 2;
      const ox = -ew / 2, oy = -eh / 2;
      return {
        x: cx + ox * Math.cos(rad) - oy * Math.sin(rad),
        y: cy + ox * Math.sin(rad) + oy * Math.cos(rad),
      };
    };

    if (element.type === 'text' && (element as TextElement).text) {
      const te = element as TextElement;
      const col = this.hexToRgbValues(te.color);
      const fontName = this._getStandardFont(te.fontFamily, te.bold, te.italic);
      const font = await pdfDoc.embedFont(StandardFonts[fontName as keyof typeof StandardFonts]);
      // 0.9 = measured Arial fontBoundingBoxAscent/fontSize ratio (avg across 8–72px);
      // aligns PDF baseline with the browser's CSS text baseline. Max residual error < 0.6pt.
      const lineHeight = te.fontSize * 1.2;
      te.text.split('\n').forEach((line, i) => {
        if (!line) return;
        const rawAnchor = tp(te.x, te.y + te.fontSize * 0.9 + i * lineHeight);
        const a = elemRot ? _anchorForCenter(rawAnchor.x, rawAnchor.y, 0, 0) : rawAnchor;
        page.drawText(line, { x: a.x, y: a.y, size: te.fontSize, font, color: rgb(col.r, col.g, col.b), ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
      });
    } else if (element.type === 'signature') {
      const se = element as SignatureElement;
      const img = await pdfDoc.embedPng(this._dataUrlToBytes(se.data));
      const ew = swapDims ? element.height : element.width;
      const eh = swapDims ? element.width : element.height;
      const corner = tp(element.x, element.y + element.height);
      const a = _anchorForCenter(corner.x, corner.y, ew, eh);
      page.drawImage(img, { x: a.x, y: a.y, width: ew, height: eh, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
    } else if (element.type === 'image') {
      const ie = element as ImageElement;
      const pdfImg = await this._embedImage(pdfDoc, ie.src);
      const ew = swapDims ? element.height : element.width;
      const eh = swapDims ? element.width : element.height;
      const corner = tp(element.x, element.y + element.height);
      const a = _anchorForCenter(corner.x, corner.y, ew, eh);
      page.drawImage(pdfImg, { x: a.x, y: a.y, width: ew, height: eh, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
    } else if (element.type === 'code') {
      const ce = element as CodeElement;
      const codePdfImg = await this._embedImage(pdfDoc, ce.cachedDataUrl);
      const ew = swapDims ? element.height : element.width;
      const eh = swapDims ? element.width : element.height;
      const corner = tp(element.x, element.y + element.height);
      const a = _anchorForCenter(corner.x, corner.y, ew, eh);
      page.drawImage(codePdfImg, { x: a.x, y: a.y, width: ew, height: eh, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
    } else if (element.type === 'highlight') {
      const he = element as HighlightElement;
      const col = this.hexToRgbValues(he.color);
      const ew = swapDims ? element.height : element.width;
      const eh = swapDims ? element.width : element.height;
      const corner = tp(element.x, element.y + element.height);
      const a = _anchorForCenter(corner.x, corner.y, ew, eh);
      page.drawRectangle({ x: a.x, y: a.y, width: ew, height: eh, color: rgb(col.r, col.g, col.b), opacity: he.opacity, borderWidth: 0, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
    } else if (element.type === 'shape') {
      const she = element as ShapeElement;
      const col = this.hexToRgbValues(she.strokeColor);
      const shapeColor = rgb(col.r, col.g, col.b);
      const lw = she.strokeWidth;
      switch (she.shapeType) {
        case 'rect': {
          const ew = swapDims ? element.height : element.width;
          const eh = swapDims ? element.width : element.height;
          const corner = tp(element.x, element.y + element.height);
          const a = _anchorForCenter(corner.x, corner.y, ew, eh);
          const fillClr = she.fillColor;
          const fillOpts = fillClr ? { color: (() => { const fc = this.hexToRgbValues(fillClr); return rgb(fc.r, fc.g, fc.b); })() } : {};
          page.drawRectangle({ x: a.x, y: a.y, width: ew, height: eh, ...fillOpts, borderColor: shapeColor, borderWidth: lw, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
          break;
        }
        case 'ellipse': {
          const center = tp(element.x + element.width / 2, element.y + element.height / 2);
          const fillClrE = she.fillColor;
          const fillOptsE = fillClrE ? { color: (() => { const fc = this.hexToRgbValues(fillClrE); return rgb(fc.r, fc.g, fc.b); })() } : {};
          page.drawEllipse({ x: center.x, y: center.y, xScale: swapDims ? element.height / 2 : element.width / 2, yScale: swapDims ? element.width / 2 : element.height / 2, ...fillOptsE, borderColor: shapeColor, borderWidth: lw, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
          break;
        }
        case 'arrow': {
          const pt1 = tp(she.x1, she.y1);
          const pt2 = tp(she.x2, she.y2);
          const pa = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x);
          const headLen = Math.max(12, lw * 5);
          const headThick = Math.max(1, Math.min(lw, lw * 0.4));
          page.drawLine({ start: { x: pt1.x, y: pt1.y }, end: { x: pt2.x, y: pt2.y }, thickness: lw, color: shapeColor });
          page.drawLine({ start: { x: pt2.x, y: pt2.y }, end: { x: pt2.x + headLen * Math.cos(pa + Math.PI * 0.75), y: pt2.y + headLen * Math.sin(pa + Math.PI * 0.75) }, thickness: headThick, color: shapeColor });
          page.drawLine({ start: { x: pt2.x, y: pt2.y }, end: { x: pt2.x + headLen * Math.cos(pa - Math.PI * 0.75), y: pt2.y + headLen * Math.sin(pa - Math.PI * 0.75) }, thickness: headThick, color: shapeColor });
          break;
        }
        case 'freehand': {
          if (she.points.length < 2) break;
          // Convert to SVG coords: tp() gives PDF (y-up), drawSvgPath maps SVG y-down via origin (0, Ho).
          // SVG y = Ho - pdf_y ensures SVG (px, Ho-pdf_y) → PDF (px, pdf_y) with origin {x:0,y:Ho}.
          const tpts = she.points.map(p => { const r = tp(p.x, p.y); return { x: r.x, y: Ho - r.y }; });
          let d = `M ${tpts[0].x} ${tpts[0].y}`;
          for (let i = 1; i < tpts.length; i++) d += ` L ${tpts[i].x} ${tpts[i].y}`;
          page.drawSvgPath(d, { x: 0, y: Ho, borderColor: shapeColor, borderWidth: lw, scale: 1 });
          break;
        }
      }
    } else if (element.type === 'comment') {
      const ce = element as CommentElement;
      const col = this.hexToRgbValues(ce.color);
      const ew = swapDims ? ce.height : ce.width;
      const eh = swapDims ? ce.width : ce.height;
      const corner = tp(ce.x, ce.y + ce.height);
      const a = _anchorForCenter(corner.x, corner.y, ew, eh);
      page.drawRectangle({ x: a.x, y: a.y, width: ew, height: eh, color: rgb(col.r, col.g, col.b), opacity: 0.85, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
      if (ce.text) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        // Text starts at top of box with 4px padding + ~10pt ascent (matches canvas textarea layout)
        const anchor2 = tp(ce.x + 4, ce.y + 4 + 10);
        page.drawText(ce.text.slice(0, 200), { x: anchor2.x, y: anchor2.y, size: 10, font, color: rgb(0, 0, 0), maxWidth: swapDims ? ce.height - 8 : ce.width - 8, lineHeight: 14, opacity: 0.9, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
      }
    } else if (element.type === 'redaction') {
      const ew = swapDims ? element.height : element.width;
      const eh = swapDims ? element.width : element.height;
      const corner = tp(element.x, element.y + element.height);
      const a = _anchorForCenter(corner.x, corner.y, ew, eh);
      const redCol = this.hexToRgbValues((element as { color?: string }).color ?? '#000000');
      page.drawRectangle({ x: a.x, y: a.y, width: ew, height: eh, color: rgb(redCol.r, redCol.g, redCol.b), borderWidth: 0, ...(pdfRotVal ? { rotate: pdfRotVal } : {}) });
    }
  }

  // W_orig / H_orig are the CropBox dimensions; cropOriginX/Y shift tiling into MediaBox space.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _drawWatermark(page: any, W_orig: number, H_orig: number, cropOriginX: number, cropOriginY: number, libs: { rgb: any; degrees: any; pdfDoc: any; StandardFonts: any }): Promise<void> {
    const { rgb, degrees, pdfDoc, StandardFonts } = libs;
    const wm = this.documentModel.watermark;
    const col = this.hexToRgbValues(wm.color);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const textWidth = font.widthOfTextAtSize(wm.text, wm.fontSize);
    const densityFactors = [0, 2.0, 1.5, 1.0, 0.7, 0.5]; // index 1–5
    const spacingFactor = densityFactors[Math.max(1, Math.min(5, wm.density ?? 3))];
    const stepX = Math.max(textWidth + wm.fontSize * 0.8, W_orig / 5) * spacingFactor;
    const stepY = Math.max(wm.fontSize * 2, H_orig / 4) * spacingFactor;
    for (let y = cropOriginY - (stepY / 2); y < cropOriginY + H_orig + stepY; y += stepY) {
      for (let x = cropOriginX - (stepX / 2); x < cropOriginX + W_orig + stepX; x += stepX) {
        page.drawText(wm.text, {
          x: x - textWidth / 2,
          y,
          size: wm.fontSize,
          font,
          color: rgb(col.r, col.g, col.b),
          opacity: wm.opacity,
          rotate: degrees(wm.angle),
        });
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _embedImage(pdfDoc: any, src: string): Promise<any> {
    if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
      return pdfDoc.embedJpg(this._dataUrlToBytes(src));
    }
    // PNG or WEBP/other — canvas re-encode to PNG
    return new Promise<unknown>((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        (c.getContext('2d') as CanvasRenderingContext2D).drawImage(img, 0, 0);
        const pngBytes = this._dataUrlToBytes(c.toDataURL('image/png'));
        resolve(await pdfDoc.embedPng(pngBytes));
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  private _dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('Invalid data URL: no base64 payload');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  _getStandardFont(fontFamily: string, bold: boolean, italic: boolean): string {
    const map: Record<string, Record<string, string>> = {
      'Arial':           { '': 'Helvetica',  'b': 'HelveticaBold', 'i': 'HelveticaOblique',  'bi': 'HelveticaBoldOblique' },
      'Helvetica':       { '': 'Helvetica',  'b': 'HelveticaBold', 'i': 'HelveticaOblique',  'bi': 'HelveticaBoldOblique' },
      'Times New Roman': { '': 'TimesRoman', 'b': 'TimesBold',     'i': 'TimesItalic',       'bi': 'TimesBoldItalic' },
      'Courier New':     { '': 'Courier',    'b': 'CourierBold',   'i': 'CourierOblique',    'bi': 'CourierBoldOblique' },
      'Courier':         { '': 'Courier',    'b': 'CourierBold',   'i': 'CourierOblique',    'bi': 'CourierBoldOblique' },
    };
    const variant = (bold ? 'b' : '') + (italic ? 'i' : '');
    return (map[fontFamily]?.[variant]) || 'Helvetica';
  }

  hexToRgbValues(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(result[1], 16) / 255, g: parseInt(result[2], 16) / 255, b: parseInt(result[3], 16) / 255 };
  }

  private _updatePlacementGhost(e: PointerEvent): void {
    const placementModes: ToolMode[] = ['addText', 'addComment', 'addImage', 'addSignature'];
    if (!placementModes.includes(this.mode)) {
      if (this._placementGhost) this._placementGhost.style.display = 'none';
      return;
    }
    if (!this._placementGhost) {
      const ghost = document.createElement('div');
      ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;border:2px dashed rgba(0,100,255,0.7);background:rgba(0,100,255,0.07);border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:16px;color:rgba(0,100,255,0.8);box-sizing:border-box;';
      document.body.appendChild(ghost);
      this._placementGhost = ghost;
    }
    const ghost = this._placementGhost;
    const cfg: Record<string, { icon: string; w: number; h: number }> = {
      addText:    { icon: 'T', w: 80, h: 28 },
      addComment: { icon: '🗒', w: 80, h: 60 },
      addImage:   { icon: '🖼', w: 60, h: 60 },
      addSignature: { icon: '✍', w: 80, h: 40 },
    };
    const c = cfg[this.mode] ?? { icon: '+', w: 40, h: 40 };
    ghost.textContent = c.icon;
    ghost.style.width  = c.w + 'px';
    ghost.style.height = c.h + 'px';
    ghost.style.left   = (e.clientX + 12) + 'px';
    ghost.style.top    = (e.clientY + 12) + 'px';
    ghost.style.display = 'flex';
  }
}
