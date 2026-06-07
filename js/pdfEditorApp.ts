import * as pdfjsLib from 'pdfjs-dist';
import { PDFRenderer } from './pdfRenderer';
import { TextElement } from './textElement';
import { SignatureElement } from './signatureElement';
import { ImageElement } from './imageElement';
import { HighlightElement } from './highlightElement';
import { TextSearchHandler } from './textSearchHandler';
import type { MatchResult } from './textSearchHandler';
import { SignaturePad } from './signaturePad';
import { InteractionHandler } from './interactionHandler';
import { ShapeElement } from './shapeElement';
import { PDFElement } from './pdfElement';
import type { ElementJSON } from './pdfElement';
import { ElementFactory } from './elementFactory';
import { UIController } from './uiController';
import type { UIRefs } from './uiController';
import { DrawingHandler } from './drawingHandler';
import { EraserHandler } from './eraserHandler';
import {
  HistoryManager, AddElementCmd, RemoveElementCmd, ClearAllCmd, TextEditCmd,
  MoveResizeCmd, DeletePageCmd, ReorderPagesCmd, AddPagesCmd, RotatePageCmd,
  MacroCmd, TransformAnnotationsCmd, ClearInkCmd,
} from './historyManager';
import type { ElementTransformSnapshot } from './historyManager';
import { InkLayer } from './inkLayer';
import { InkLayerHandler } from './inkLayerHandler';
import { DocumentModel } from './documentModel';
import type { WatermarkSettings } from './documentModel';
import { PageThumbnailPanel } from './pageThumbnailPanel';
import { saveState, loadState, clearState } from './storage';
import { FormFieldOverlay } from './formFieldOverlay';
import { CommentElement } from './commentElement';
import { t } from './i18n';
import { trapFocus } from './focusTrap';

export type ToolMode = 'select' | 'addText' | 'addSignature' | 'addImage' | 'drawArrow' | 'drawRect' | 'drawEllipse' | 'drawFreehand' | 'drawHighlight' | 'addComment' | 'drawRedaction' | 'drawErase';

export class PDFEditorApp {
  renderer!: PDFRenderer;
  documentModel!: DocumentModel;
  elements: PDFElement[] = [];
  interactionHandler!: InteractionHandler;
  signaturePad!: SignaturePad;
  mode: ToolMode = 'select';
  zoomScale = 1.0;
  selectedElement: PDFElement | null = null;
  historyManager!: HistoryManager;
  _textChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingTextBefore: string | null = null;
  private _pendingTextElementId: number | null = null;
  currentFilename: string | null = null;
  currentSignature: string | null = null;
  uiController!: UIController;
  drawingHandler!: DrawingHandler;
  eraserHandler!: EraserHandler;
  private _thumbnailPanel: PageThumbnailPanel | null = null;
  private _pendingImageSrc: string | null = null;
  private _autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _textSearch = new TextSearchHandler();
  private _findMatches: MatchResult[] = [];
  private _findMatchIndex = -1;
  private _searchGen = 0;
  private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _findCaseSensitive = false;
  private _findRegex = false;
  private _formFieldOverlay!: FormFieldOverlay;
  private _formValues: Record<string, Record<string, string>> = {};
  private _warnedUnsupportedFields = false;
  private _formFieldGen = 0;
  private _isLoading = false;
  private _pageUpdatePending = false;
  inkLayer!: InkLayer;
  inkLayerHandler!: InkLayerHandler;
  private _inkCanvas!: HTMLCanvasElement;
  private _isFitMode = true;
  private _clipboard: ElementJSON | null = null;
  private _exportPreviewOpen = false;
  private _trapCleanup: (() => void) | null = null;

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

  setupEventListeners() {
    this.ui.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    this.ui.addPdfInput.addEventListener('change', (e) => this._handleAddPdfUpload(e));
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
      if (this.documentModel.currentPage) this._showExportPreview();
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

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    document.getElementById('clearSignature')!.addEventListener('click', () => this.signaturePad.clear());
    document.getElementById('cancelSignature')!.addEventListener('click', () => this.closeSignatureModal());
    document.getElementById('saveSignature')!.addEventListener('click', () => this.saveSignature());
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

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
    this.ui.copyBtn.addEventListener('click', () => this._copySelectedElement());
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
      if (!this.documentModel.pageCount) return;
      this.setMode(this.mode === 'drawFreehand' ? 'select' : 'drawFreehand');
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
    document.addEventListener('click', () => this.ui.fileMenuWrap.classList.remove('open'));
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
    this.ui.helpBtn.addEventListener('click', () => this._toggleHelp());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    document.getElementById('closeHelp')!.addEventListener('click', () => this._toggleHelp(false));
    this.ui.helpModal.addEventListener('click', (e) => { if (e.target === this.ui.helpModal) this._toggleHelp(false); });

    this.ui.colorSwatches.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        if (this.ui.textColorInput.disabled) return;
        this.ui.textColorInput.value = (swatch as HTMLElement).dataset["color"] ?? '#000000';
        this.ui.textColorInput.dispatchEvent(new Event('change'));
      });
    });

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
    this.ui.textColorInput.addEventListener('change', (e) => {
      if (this.selectedElement && this.selectedElement.type === 'text') {
        const te = this.selectedElement as TextElement;
        const before = { color: te.color };
        te.color = (e.target as HTMLInputElement).value;
        this.historyManager.record(new MoveResizeCmd(this.elements, te, before, { color: te.color }));
        this.renderElements(); this._autosave();
      }
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
    this.ui.shapeColor.addEventListener('input', (e) => {
      if (this.selectedElement?.type === 'shape') {
        (this.selectedElement as ShapeElement).strokeColor = (e.target as HTMLInputElement).value;
        this.renderElements(); this._autosave();
      }
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
          case 'c': e.preventDefault(); this._copySelectedElement(); break;
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

    // Also match user-added text boxes on the current page
    for (const el of this.elements) {
      if (el.type !== 'text' || el.pageId !== docPage.id) continue;
      const textEl = el as TextElement;
      if (!textEl.text) continue;
      let matched = false;
      if (this._findRegex) {
        try { matched = new RegExp(query, this._findCaseSensitive ? '' : 'i').test(textEl.text); } catch { /* invalid regex */ }
      } else {
        const haystack = this._findCaseSensitive ? textEl.text : textEl.text.toLowerCase();
        matched = haystack.includes(this._findCaseSensitive ? query : query.toLowerCase());
      }
      if (matched) this._findMatches.push({ pageId: docPage.id, x: textEl.x, y: textEl.y, width: textEl.width, height: textEl.height });
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
        zIndex: '3',
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
      this._pendingImageSrc = src;
      this.setMode('addImage');
      this.showToast(t('toast.clickToPlaceImage'));
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

    if (!pageElements.length) {
      this.historyManager.execute(rotateCmd);
      return;
    }

    // Build before/after snapshots for all annotations on this page
    const before = new Map<number, ElementTransformSnapshot>();
    const after  = new Map<number, ElementTransformSnapshot>();
    for (const el of pageElements) {
      before.set(el.id, { x: el.x, y: el.y, width: el.width, height: el.height,
        x1: (el as ShapeElement).x1, y1: (el as ShapeElement).y1,
        x2: (el as ShapeElement).x2, y2: (el as ShapeElement).y2,
        points: (el as ShapeElement).points?.map(p => ({ ...p })),
      });
      after.set(el.id, this._rotateElementSnapshot(el, W, H, fromRot, toRot));
    }

    // TransformAnnotationsCmd executes first so elements are in correct positions
    // when RotatePageCmd's onUpdate triggers the re-render (async, so elements are
    // already updated before renderElements() is called).
    this.historyManager.execute(new MacroCmd([
      new TransformAnnotationsCmd(this.elements, before, after),
      rotateCmd,
    ]));
    this.showToast(t('toast.annotationsAdjusted'));
  }

  /** Transform canvas-space point (top-left origin, scale=1) to PDF content-space point (bottom-left origin).
   *  W_orig / H_orig are the unrotated page content dimensions.
   *  totalRot is the effective CCW rotation (source + user) in degrees. */
  private _transformPoint(px: number, py: number, W: number, H: number, totalRot: number): { x: number; y: number } {
    switch (((totalRot % 360) + 360) % 360) {
      case 90:  return { x: W - py, y: H - px };
      case 180: return { x: W - px, y: H - py };
      case 270: return { x: py,     y: px };
      default:  return { x: px,     y: H - py };
    }
  }

  /** Inverse of _transformPoint: PDF content space → canvas space. */
  private _inverseTransformPoint(pdfX: number, pdfY: number, W: number, H: number, totalRot: number): { x: number; y: number } {
    switch (((totalRot % 360) + 360) % 360) {
      case 90:  return { x: H - pdfY, y: W - pdfX };
      case 180: return { x: W - pdfX, y: H - pdfY };
      case 270: return { x: pdfY,     y: pdfX };
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

    // Standard box elements: derive new bounding box from all 4 transformed corners
    const corners = [
      tp(el.x, el.y), tp(el.x + el.width, el.y),
      tp(el.x, el.y + el.height), tp(el.x + el.width, el.y + el.height),
    ];
    const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
    return {
      x: Math.min(...xs), y: Math.min(...ys),
      width:  Math.max(...xs) - Math.min(...xs) || el.width,
      height: Math.max(...ys) - Math.min(...ys) || el.height,
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

  private async _restoreSession(): Promise<void> {
    const state = await loadState();
    if (!state?.sourcePdfs?.length) return;
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      document.getElementById('emptyState')!.style.display = 'none';
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
    }
  }

  _clearSave() {
    this._closeDocument();
    this.showToast(t('toast.sessionCleared'));
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    document.getElementById('emptyState')!.style.display = 'flex';
    this._disableFileMenuDocItems();
    this.showToast(t('toast.documentClosed'));
  }

  // ── File upload ───────────────────────────────────────────────
  private async _imagesToPdf(imageFiles: File[]): Promise<{ bytes: Uint8Array; name: string }> {
    const { PDFDocument } = await import('pdf-lib');
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
              canvas.getContext('2d')!.drawImage(imgEl, 0, 0);
              canvas.toBlob((b) => {
                b!.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
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
      const doc = await pdfjsLib.getDocument({ data: rawBytes }).promise;

      // Reset state for new document
      this.documentModel = new DocumentModel();
      this.renderer.setModel(this.documentModel);
      this.elements = [];
      this._formValues = {};
      this._warnedUnsupportedFields = false;
      this._formFieldOverlay.clear();
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

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      document.getElementById('emptyState')!.style.display = 'none';
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
    this.uiController.updateModeButtons(mode);
    this._formFieldOverlay.setPointerEvents(mode === 'select');
    if (mode === 'addSignature') this.openSignatureModal();

    const modeHintKeys: Partial<Record<ToolMode, string>> = {
      addText: 'toast.modeHint.addText', addSignature: 'toast.modeHint.addSignature',
      addImage: 'toast.modeHint.addImage', drawArrow: 'toast.modeHint.drawArrow',
      drawRect: 'toast.modeHint.drawRect', drawEllipse: 'toast.modeHint.drawEllipse',
      drawFreehand: 'toast.modeHint.drawFreehand', drawHighlight: 'toast.modeHint.drawHighlight',
      addComment: 'toast.modeHint.addComment', drawRedaction: 'toast.modeHint.drawRedaction',
      drawErase: 'toast.modeHint.drawErase',
    };
    const hintKey = modeHintKeys[mode];
    if (hintKey) this.uiController.showToast(t(hintKey), 1500);
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
    this.ui.signatureModal.classList.remove('active');
    this._trapCleanup?.();
    this._trapCleanup = null;
    this.mode = 'addSignature';
    this.ui.addSignatureBtn.classList.add('active');
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
    if (this._isShapeMode()) return;
    if (this.mode === 'addText') {
      this.addTextAtPosition(e);
      this.setMode('select');
    } else if (this.mode === 'addSignature' && this.currentSignature) {
      this.addSignatureAtPosition(e);
      this.mode = 'select';
      this.ui.addSignatureBtn.classList.remove('active');
      this.currentSignature = null;
    } else if (this.mode === 'addImage' && this._pendingImageSrc) {
      this.addImageAtPosition(e);
    } else if (this.mode === 'addComment') {
      this._addCommentAtPosition(e);
      this.setMode('select');
    } else {
      this.selectElement(null);
    }
  }

  private _addCommentAtPosition(e: MouseEvent): void {
    const pageId = this.documentModel.currentPage?.id;
    if (!pageId) return;
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top)  / this.zoomScale;
    const el = new CommentElement(x, y, pageId);
    this.historyManager.execute(new AddElementCmd(this.elements, el));
    this._autosave();
    this.renderElements();
    this.selectElement(el);
  }

  addTextAtPosition(e: MouseEvent) {
    const pageId = this.documentModel.currentPage?.id;
    if (!pageId) return;
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const options = { fontSize: parseInt(this.ui.fontSizeInput.value), color: this.ui.textColorInput.value };
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

  addSignatureAtPosition(e: MouseEvent) {
    const pageId = this.documentModel.currentPage?.id;
    if (!pageId) return;
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const sigElement = new SignatureElement(x, y, pageId, this.currentSignature ?? '');
    sigElement.x -= sigElement.width / 2;
    sigElement.y -= sigElement.height / 2;
    this.historyManager.execute(new AddElementCmd(this.elements, sigElement));
    this._autosave();
    this.renderElements();
    this.selectElement(sigElement);
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
    currentPageElements.forEach(element => {
      const div = element.render(this.ui.container, canvasOffset, this.zoomScale);
      if (this.selectedElement && this.selectedElement.id === element.id) div.classList.add('selected');
      div.addEventListener('click', (e) => { e.stopPropagation(); this.selectElement(element); });
      div.addEventListener('pointerdown', (e) => { this.interactionHandler.handlePointerDown(e, element, div); });
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
      ctx.strokeStyle = this.ui.shapeColor.value;
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
    this.renderInkLayer();
  }

  private async _renderFormFields(): Promise<void> {
    const myGen = ++this._formFieldGen;
    const docPage = this.documentModel.currentPage;
    if (!docPage) { this._formFieldOverlay.clear(); return; }
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
    this.ui.exportPreviewOverlay.style.display = '';
  }

  private _drawWatermarkOnCanvas(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, wm: WatermarkSettings, scale?: number): void {
    if (!wm.enabled || !wm.text) return;
    const effectiveScale = scale ?? this.zoomScale;
    const fontSize = wm.fontSize * effectiveScale;
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    const textWidth = ctx.measureText(wm.text).width;
    const densityFactors = [0, 2.0, 1.5, 1.0, 0.7, 0.5];
    const sf = densityFactors[Math.max(1, Math.min(5, wm.density ?? 3))];
    const stepX = Math.max(textWidth + fontSize * 0.8, screenW / 5) * sf;
    const stepY = Math.max(fontSize * 2, screenH / 4) * sf;
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
    this.uiController.updateCopyPasteBtns(!!this.selectedElement, !!this._clipboard);
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
    const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
    void rgb; void StandardFonts; // used via libs param below

    // 1. Build a temp single-page PDF with all NON-redaction elements drawn in
    const tempDoc = await PDFDocument.create();
    const [tempPage] = await tempDoc.copyPages(srcDoc, [docPage.sourcePageNum - 1]);
    tempDoc.addPage(tempPage);

    const userRot  = docPage.rotation ?? 0;
    const srcRot   = tempPage.getRotation().angle as number;
    const totalRot = ((srcRot + userRot) % 360 + 360) % 360;
    if (userRot) tempPage.setRotation(degrees(totalRot));

    const { width: W_orig, height: H_orig } = tempPage.getSize() as { width: number; height: number };
    const { width: w_eff, height: h_eff }   = this._getEffectivePageDims(tempPage);

    const nonRedactions = elements.filter(e => e.type !== 'redaction');
    const rasterErrors: string[] = [];
    for (const el of nonRedactions) {
      try {
        await this._drawElementOnPage(tempDoc, tempPage, el, h_eff, w_eff, libs, W_orig, H_orig, totalRot);
      } catch {
        rasterErrors.push(`${el.type} (id ${el.id})`);
      }
    }
    if (rasterErrors.length > 0) {
      this.showToast(`⚠ ${rasterErrors.length} element(s) skipped in redacted page: ${rasterErrors.join(', ')}`, 6000);
    }

    if (this.documentModel.watermark.enabled) {
      await this._drawWatermark(tempPage, W_orig, H_orig, {
        rgb: libs.rgb, degrees, pdfDoc: tempDoc, StandardFonts: libs.StandardFonts,
      });
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ctx          = offscreen.getContext('2d')!;
    await renderPage.render({ canvas: offscreen, viewport: vp }).promise;

    // 3. Paint redaction boxes onto the canvas (permanently covers content)
    ctx.fillStyle = '#000000';
    for (const el of elements.filter(e => e.type === 'redaction')) {
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
    const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
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

        // Original (unrotated) content dims for coordinate transform
        const { width: W_orig, height: H_orig } = page.getSize() as { width: number; height: number };
        // Visual (effective) dims after rotation — used for watermark centering
        const { width: w_eff, height: h_eff } = this._getEffectivePageDims(page);

        const exportErrors: string[] = [];
        for (const element of pageElements) {
          try {
            await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts }, W_orig, H_orig, totalRot);
          } catch {
            exportErrors.push(`${element.type} (id ${element.id})`);
          }
        }
        if (exportErrors.length > 0) {
          this.showToast(`⚠ ${exportErrors.length} element(s) failed to render: ${exportErrors.join(', ')}`, 6000);
        }

        if (this.documentModel.watermark.enabled) {
          await this._drawWatermark(page, W_orig, H_orig, { rgb, degrees, pdfDoc, StandardFonts });
        }

        const inkDataUrl = this._renderInkForExport(docPage.id, W_orig, H_orig, totalRot);
        if (inkDataUrl) {
          const inkPng = this._dataUrlToUint8Array(inkDataUrl);
          const inkImg = await pdfDoc.embedPng(inkPng);
          page.drawImage(inkImg, { x: 0, y: 0, width: W_orig, height: H_orig });
        }
      }

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
    const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
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

        const { width: W_orig, height: H_orig } = page.getSize() as { width: number; height: number };
        const { width: w_eff, height: h_eff }   = this._getEffectivePageDims(page);
        const exportErrors: string[] = [];
        for (const element of pageElements) {
          try { await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts }, W_orig, H_orig, totalRot); }
          catch { exportErrors.push(`${element.type} (id ${element.id})`); }
        }
        if (exportErrors.length > 0) {
          this.showToast(`⚠ ${exportErrors.length} element(s) failed to render: ${exportErrors.join(', ')}`, 6000);
        }
        if (this.documentModel.watermark.enabled) {
          await this._drawWatermark(page, W_orig, H_orig, { rgb, degrees, pdfDoc, StandardFonts });
        }

        const inkDataUrl = this._renderInkForExport(docPage.id, W_orig, H_orig, totalRot);
        if (inkDataUrl) {
          const inkPng = this._dataUrlToUint8Array(inkDataUrl);
          const inkImg = await pdfDoc.embedPng(inkPng);
          page.drawImage(inkImg, { x: 0, y: 0, width: W_orig, height: H_orig });
        }
      }

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
      const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
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
      const { width: W_orig, height: H_orig } = page.getSize() as { width: number; height: number };
      const { width: w_eff, height: h_eff }   = this._getEffectivePageDims(page);

      const imgExportErrors: string[] = [];
      for (const element of this.elements.filter(el => el.pageId === docPage.id)) {
        try { await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts }, W_orig, H_orig, totalRot); }
        catch { imgExportErrors.push(`${element.type} (id ${element.id})`); }
      }
      if (imgExportErrors.length > 0) {
        this.showToast(`⚠ ${imgExportErrors.length} element(s) failed to render: ${imgExportErrors.join(', ')}`, 6000);
      }
      if (this.documentModel.watermark.enabled) {
        await this._drawWatermark(page, W_orig, H_orig, { rgb, degrees, pdfDoc, StandardFonts });
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

  private _getEffectivePageDims(page: { getSize(): { width: number; height: number }; getRotation(): { angle: number } }): { width: number; height: number } {
    const { width, height } = page.getSize();
    const angle = page.getRotation().angle;
    return (angle === 90 || angle === 270) ? { width: height, height: width } : { width, height };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _drawElementOnPage(pdfDoc: any, page: any, element: PDFElement, h: number, w: number, libs: { rgb: any; StandardFonts: any }, W_orig = 0, H_orig = 0, totalRot = 0): Promise<void> {
    const { rgb, StandardFonts } = libs;
    // W_orig/H_orig are the unrotated content dims; fall back to effective dims when totalRot=0
    const Wo = W_orig || w;
    const Ho = H_orig || h;
    const tp = (px: number, py: number) => this._transformPoint(px, py, Wo, Ho, totalRot);
    const swapDims = ((totalRot % 360) + 360) % 360 === 90 || ((totalRot % 360) + 360) % 360 === 270;

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
        const anchor = tp(te.x, te.y + te.fontSize * 0.9 + i * lineHeight);
        page.drawText(line, { x: anchor.x, y: anchor.y, size: te.fontSize, font, color: rgb(col.r, col.g, col.b) });
      });
    } else if (element.type === 'signature') {
      const se = element as SignatureElement;
      const img = await pdfDoc.embedPng(this._dataUrlToBytes(se.data));
      const anchor = tp(element.x, element.y + element.height);
      page.drawImage(img, { x: anchor.x, y: anchor.y, width: swapDims ? element.height : element.width, height: swapDims ? element.width : element.height });
    } else if (element.type === 'image') {
      const ie = element as ImageElement;
      const pdfImg = await this._embedImage(pdfDoc, ie.src);
      const anchor = tp(element.x, element.y + element.height);
      page.drawImage(pdfImg, { x: anchor.x, y: anchor.y, width: swapDims ? element.height : element.width, height: swapDims ? element.width : element.height });
    } else if (element.type === 'highlight') {
      const he = element as HighlightElement;
      const col = this.hexToRgbValues(he.color);
      const anchor = tp(element.x, element.y + element.height);
      page.drawRectangle({ x: anchor.x, y: anchor.y, width: swapDims ? element.height : element.width, height: swapDims ? element.width : element.height, color: rgb(col.r, col.g, col.b), opacity: he.opacity, borderWidth: 0 });
    } else if (element.type === 'shape') {
      const she = element as ShapeElement;
      const col = this.hexToRgbValues(she.strokeColor);
      const shapeColor = rgb(col.r, col.g, col.b);
      const lw = she.strokeWidth;
      switch (she.shapeType) {
        case 'rect': {
          const anchor = tp(element.x, element.y + element.height);
          page.drawRectangle({ x: anchor.x, y: anchor.y, width: swapDims ? element.height : element.width, height: swapDims ? element.width : element.height, borderColor: shapeColor, borderWidth: lw });
          break;
        }
        case 'ellipse': {
          const center = tp(element.x + element.width / 2, element.y + element.height / 2);
          page.drawEllipse({ x: center.x, y: center.y, xScale: swapDims ? element.height / 2 : element.width / 2, yScale: swapDims ? element.width / 2 : element.height / 2, borderColor: shapeColor, borderWidth: lw });
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
      const anchor = tp(ce.x, ce.y + ce.height);
      page.drawRectangle({ x: anchor.x, y: anchor.y, width: swapDims ? ce.height : ce.width, height: swapDims ? ce.width : ce.height, color: rgb(col.r, col.g, col.b), opacity: 0.85, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1 });
      if (ce.text) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        // Text starts at top of box with 4px padding + ~10pt ascent (matches canvas textarea layout)
        const anchor2 = tp(ce.x + 4, ce.y + 4 + 10);
        page.drawText(ce.text.slice(0, 200), { x: anchor2.x, y: anchor2.y, size: 10, font, color: rgb(0, 0, 0), maxWidth: swapDims ? ce.height - 8 : ce.width - 8, lineHeight: 14, opacity: 0.9 });
      }
    } else if (element.type === 'redaction') {
      const anchor = tp(element.x, element.y + element.height);
      page.drawRectangle({ x: anchor.x, y: anchor.y, width: swapDims ? element.height : element.width, height: swapDims ? element.width : element.height, color: rgb(0, 0, 0), borderWidth: 0 });
    }
  }

  // W_orig / H_orig are the unrotated content dimensions — ensures centering is correct
  // regardless of user-applied page rotation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _drawWatermark(page: any, W_orig: number, H_orig: number, libs: { rgb: any; degrees: any; pdfDoc: any; StandardFonts: any }): Promise<void> {
    const { rgb, degrees, pdfDoc, StandardFonts } = libs;
    const wm = this.documentModel.watermark;
    const col = this.hexToRgbValues(wm.color);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const textWidth = font.widthOfTextAtSize(wm.text, wm.fontSize);
    const densityFactors = [0, 2.0, 1.5, 1.0, 0.7, 0.5]; // index 1–5
    const spacingFactor = densityFactors[Math.max(1, Math.min(5, wm.density ?? 3))];
    const stepX = Math.max(textWidth + wm.fontSize * 0.8, W_orig / 5) * spacingFactor;
    const stepY = Math.max(wm.fontSize * 2, H_orig / 4) * spacingFactor;
    for (let y = -(stepY / 2); y < H_orig + stepY; y += stepY) {
      for (let x = -(stepX / 2); x < W_orig + stepX; x += stepX) {
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
}
