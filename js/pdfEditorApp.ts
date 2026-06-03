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
import type { PDFElement } from './pdfElement';
import { ElementFactory } from './elementFactory';
import { UIController } from './uiController';
import type { UIRefs } from './uiController';
import { DrawingHandler } from './drawingHandler';
import {
  HistoryManager, AddElementCmd, RemoveElementCmd, ClearAllCmd, TextEditCmd,
  MoveResizeCmd, DeletePageCmd, ReorderPagesCmd, AddPagesCmd, RotatePageCmd,
} from './historyManager';
import { DocumentModel } from './documentModel';
import { PageThumbnailPanel } from './pageThumbnailPanel';
import { saveState, loadState, clearState } from './storage';
import { FormFieldOverlay } from './formFieldOverlay';
import { CommentElement } from './commentElement';

export type ToolMode = 'select' | 'addText' | 'addSignature' | 'addImage' | 'drawArrow' | 'drawRect' | 'drawEllipse' | 'drawFreehand' | 'drawHighlight' | 'addComment' | 'drawRedaction';

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
  private _thumbnailPanel: PageThumbnailPanel | null = null;
  private _pendingImageSrc: string | null = null;
  private _autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private _textSearch = new TextSearchHandler();
  private _findMatches: MatchResult[] = [];
  private _findMatchIndex = -1;
  private _searchGen = 0;
  private _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _formFieldOverlay!: FormFieldOverlay;
  private _formValues: Record<string, Record<string, string>> = {};
  private _warnedUnsupportedFields = false;
  private _formFieldGen = 0;
  private _isLoading = false;
  private _pageUpdatePending = false;

  get ui(): UIRefs { return this.uiController.refs; }

  constructor() {
    this.documentModel = new DocumentModel();
    this.renderer = new PDFRenderer(document.getElementById('pdfCanvas') as HTMLCanvasElement);
    this.renderer.setModel(this.documentModel);
    this.elements = [];
    this.uiController = new UIController();
    this.interactionHandler = new InteractionHandler(this);
    this.drawingHandler = new DrawingHandler(this);
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
    });
  }

  setupEventListeners() {
    this.ui.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    this.ui.addPdfInput.addEventListener('change', (e) => this._handleAddPdfUpload(e));
    this.ui.addTextBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this.setMode('addText'); });
    this.ui.addSignatureBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this.setMode('addSignature'); });
    this.ui.addImageBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this.ui.addImageInput.click(); });
    this.ui.addImageInput.addEventListener('change', (e) => this._handleImageFileSelect(e));
    this.ui.highlightBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this.setMode('drawHighlight'); });
    this.ui.commentBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this.setMode('addComment'); });
    this.ui.redactBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this.setMode('drawRedaction'); });
    this.ui.exportImgBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this.downloadPageAsImage(); });
    this.ui.findBtn.addEventListener('click', () => { if (this.documentModel.pageCount) this._openFindBar(); });
    this.ui.findInput.addEventListener('input', () => {
      clearTimeout(this._searchDebounceTimer ?? undefined);
      this._searchDebounceTimer = setTimeout(() => this._search(), 300);
    });
    this.ui.findNext.addEventListener('click', () => this._nextMatch());
    this.ui.findPrev.addEventListener('click', () => this._prevMatch());
    this.ui.findHighlight.addEventListener('click', () => this._highlightCurrentMatch());
    this.ui.findClose.addEventListener('click', () => this._closeFindBar());
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
    });
    document.addEventListener('pointerup', (e) => {
      this.interactionHandler.handlePointerUp(e);
      this.drawingHandler.handlePointerUp(e);
    });
    document.addEventListener('pointercancel', (e) => {
      this.interactionHandler.handlePointerCancel(e);
      this.drawingHandler.handlePointerCancel(e);
    });

    this.ui.zoomInBtn.addEventListener('click',  () => this.applyZoom(this.zoomScale + 0.1));
    this.ui.zoomOutBtn.addEventListener('click', () => this.applyZoom(this.zoomScale - 0.1));
    this.ui.fitBtn.addEventListener('click', () => this.fitToWidth());
    this.ui.undoBtn.addEventListener('click', () => this.undo());
    this.ui.redoBtn.addEventListener('click', () => this.redo());

    this.ui.arrowBtn.addEventListener('click',    () => this.setMode('drawArrow'));
    this.ui.rectBtn.addEventListener('click',     () => this.setMode('drawRect'));
    this.ui.circleBtn.addEventListener('click',   () => this.setMode('drawEllipse'));
    this.ui.freehandBtn.addEventListener('click', () => this.setMode('drawFreehand'));
    this.ui.canvas.addEventListener('pointerdown', (e) => this.drawingHandler.handlePointerDown(e));

    this.ui.clearSaveBtn.addEventListener('click', () => this._clearSave());
    this.ui.clearAllBtn.addEventListener('click', () => this.clearAll());
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
    this.ui.watermarkModal.addEventListener('click', (e) => { if (e.target === this.ui.watermarkModal) this._closeWatermarkModal(); });
    this.ui.wmApply.addEventListener('click', () => this._applyWatermark());
    this._setupWatermarkPreviewListeners();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.ui.helpModal.classList.contains('active')) { this._toggleHelp(false); return; }
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
        case 't': case 'T': if (this.documentModel.pageCount) this.setMode('addText'); break;
        case 's': case 'S': if (this.documentModel.pageCount) this.setMode('addSignature'); break;
        case 'i': case 'I': if (this.documentModel.pageCount) this.ui.addImageInput.click(); break;
        case 'a': case 'A': if (this.documentModel.pageCount) this.setMode('drawArrow'); break;
        case 'r': case 'R': if (this.documentModel.pageCount) this.setMode('drawRect'); break;
        case 'c': case 'C': if (this.documentModel.pageCount) this.setMode('drawEllipse'); break;
        case 'd': case 'D': if (this.documentModel.pageCount) this.setMode('drawFreehand'); break;
        case 'h': case 'H': if (this.documentModel.pageCount) this.setMode('drawHighlight'); break;
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
  }

  private _updateWatermarkPreview(): void {
    const t = this.ui.wmPreviewText;
    t.textContent = this.ui.wmText.value || 'WATERMARK';
    t.style.color = this.ui.wmColor.value;
    t.style.opacity = String(parseInt(this.ui.wmOpacity.value) / 100);
    t.style.fontSize = Math.min(28, parseInt(this.ui.wmFontSize.value) / 3) + 'px';
    t.style.transform = `rotate(${this.ui.wmAngle.value}deg)`;
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
    this._updateWatermarkPreview();
    this.ui.watermarkModal.classList.add('active');
  }

  private _closeWatermarkModal(): void {
    this.ui.watermarkModal.classList.remove('active');
  }

  private _applyWatermark(): void {
    this.documentModel.watermark = {
      enabled: this.ui.wmEnabled.checked,
      text: this.ui.wmText.value || 'WATERMARK',
      color: this.ui.wmColor.value,
      fontSize: parseInt(this.ui.wmFontSize.value) || 60,
      opacity: parseInt(this.ui.wmOpacity.value) / 100,
      angle: parseInt(this.ui.wmAngle.value),
    };
    this._closeWatermarkModal();
    this._autosave();
    const status = this.documentModel.watermark.enabled ? 'Watermark enabled' : 'Watermark disabled';
    this.showToast(status);
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
    this._findMatches = this._textSearch.search(query, docPage.id, viewport, this.zoomScale);

    if (myGen !== this._searchGen) return; // stale after search

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
    this.showToast('Highlight added — Ctrl+Z to undo');
  }

  private _showSearchMatches(): void {
    this._clearSearchMatches();
    const offset = { left: this.ui.canvas.offsetLeft, top: this.ui.canvas.offsetTop };
    this._findMatches.forEach((match, i) => {
      const div = document.createElement('div');
      div.className = 'search-match' + (i === this._findMatchIndex ? ' search-match-active' : '');
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
    });
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!src) return;
      this._pendingImageSrc = src;
      this.setMode('addImage');
      this.showToast('Click on the PDF to place the image');
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
    const files = (e.target as HTMLInputElement).files;
    (e.target as HTMLInputElement).value = '';
    if (!files?.length) return;

    let addedCount = 0;
    for (const file of Array.from(files)) {
      if (file.type !== 'application/pdf') continue;
      try {
        const typedBytes = new Uint8Array(await file.arrayBuffer());
        const bytesToStore = typedBytes.slice(0); // pdf.js transfers the ArrayBuffer; copy first
        const doc = await pdfjsLib.getDocument(typedBytes).promise;
        const src = this.documentModel.addSourcePdf(doc, bytesToStore, file.name);
        const cmd = new AddPagesCmd(this.documentModel, src.id, undefined, () => this._onPageStructureChange());
        this.historyManager.execute(cmd);
        addedCount++;
      } catch {
        this.showToast(`Failed to load "${file.name}" — skipping`, 4000);
      }
    }
    if (addedCount > 0) {
      this.showToast(`Added ${addedCount} PDF file${addedCount > 1 ? 's' : ''}`);
    }
  }

  private _deletePage(pageId: string): void {
    if (this.documentModel.pageCount <= 1) {
      this.showToast('Cannot delete the only page');
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

  private _rotatePage(pageId: string, delta: number): void {
    if (this.elements.some(e => e.pageId === pageId)) {
      this.showToast('Tip: existing annotations may shift in export after rotation', 4000);
    }
    const cmd = new RotatePageCmd(this.documentModel, pageId, delta, () => {
      this._thumbnailPanel?.invalidateThumb(pageId);
      this._onPageStructureChange();
    });
    this.historyManager.execute(cmd);
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
        this.showToast('Render failed after undo — try reloading', 4000);
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
        this.showToast('Render failed after redo — try reloading', 4000);
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
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        this.showToast('Storage full — export your PDF to avoid losing work', 8000);
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
        const doc = await pdfjsLib.getDocument(spBytes).promise;
        const src = this.documentModel.addSourcePdf(doc, bytesToStore, sp.name);
        // Override auto-generated id with the saved one
        this.documentModel.sourcePdfs.delete(src.id);
        src.id = sp.id;
        this.documentModel.sourcePdfs.set(sp.id, src);
      }
      this.documentModel.pages = state.pages ?? [];
      this.documentModel.watermark = state.watermark ?? this.documentModel.watermark;
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
      this.currentFilename = state.sourcePdfs[0]?.name ?? null;

      // Compute initial scale
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      document.getElementById('emptyState')!.style.display = 'none';
      this.ui.clearSaveBtn.disabled = false;
      this.ui.pageThumbnailContainer.style.display = '';
      await this._thumbnailPanel?.render();
      this.updatePageInfo();
      this.renderElements();
      this.showToast('Session restored');
    } catch (err) {
      // BUG-19: reset to clean state on partial restore failure
      console.warn('[_restoreSession] failed, resetting to clean state', err);
      this.documentModel = new DocumentModel();
      this.renderer.setModel(this.documentModel);
      this.elements = [];
      this._thumbnailPanel = null;
      this.showToast('Previous session could not be restored — starting fresh');
    }
  }

  _clearSave() {
    clearState().then(() => this.showToast('Saved session cleared'));
  }

  clearAll() {
    if (!this.elements.length) return;
    this.historyManager.execute(new ClearAllCmd(this.elements));
    this.selectedElement = null;
    this._updateFormattingToolbar();
    this._autosave();
    this.renderElements();
    this.showToast('All annotations cleared — Ctrl+Z to undo');
  }

  _toggleHelp(show?: boolean) { this.uiController.toggleHelp(show); }
  showToast(msg: string, duration = 3000) { this.uiController.showToast(msg, duration); }

  // ── File upload ───────────────────────────────────────────────
  async handleFileUpload(e: Event) {
    if (this._isLoading) return;
    this._isLoading = true;
    const file = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!file || file.type !== 'application/pdf') {
      alert('Please select a valid PDF file');
      this._isLoading = false;
      return;
    }
    try {
      const rawBytes = new Uint8Array(await file.arrayBuffer());
      const bytesToStore = rawBytes.slice(0); // pdf.js transfers the ArrayBuffer; copy first
      const doc = await pdfjsLib.getDocument(rawBytes).promise;

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
      });

      const src = this.documentModel.addSourcePdf(doc, bytesToStore, file.name);
      this.documentModel.addPagesFrom(src.id);
      this.renderer.pdfDoc = doc;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      document.getElementById('emptyState')!.style.display = 'none';
      const fitScale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
      const isMobile = window.innerWidth <= 640;
      await this.applyZoom(isMobile ? Math.max(fitScale, 0.65) : fitScale);
      this.enableUI();
      this.ui.clearSaveBtn.disabled = false;
      this.ui.pageThumbnailContainer.style.display = '';
      await this._thumbnailPanel.render();
      this.updatePageInfo();
      this.renderElements();
      this._autosave();
    } catch (err) {
      this.showToast('Failed to load PDF — ' + (err instanceof Error ? err.message.slice(0, 80) : 'unknown error'));
      console.error('[handleFileUpload]', err);
    } finally {
      this._isLoading = false;
    }
  }

  enableUI() { this.uiController.enableUI(); }

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
    this.mode = mode;
    this.uiController.updateModeButtons(mode);
    this._formFieldOverlay.setPointerEvents(mode === 'select');
    if (mode === 'addSignature') this.openSignatureModal();
  }

  _isShapeMode() { return this.mode.startsWith('draw'); }

  openSignatureModal() {
    this.ui.signatureModal.classList.add('active');
    const w = this.ui.signatureCanvas.offsetWidth || 500;
    this.ui.signatureCanvas.width = w;
    this.ui.signatureCanvas.height = Math.round(w * 0.4);
    this.signaturePad.clear();
  }

  closeSignatureModal() {
    this.ui.signatureModal.classList.remove('active');
    this.setMode('select');
    this.ui.addSignatureBtn.classList.remove('active');
  }

  saveSignature() {
    this.currentSignature = this.signaturePad.getDataURL();
    this.ui.signatureModal.classList.remove('active');
    this.mode = 'addSignature';
    this.ui.addSignatureBtn.classList.add('active');
  }

  selectElement(element: PDFElement | null) {
    if (this.selectedElement === element) { this._updateFormattingToolbar(); return; }
    this._cleanEmptyTextElements();
    this.selectedElement = element;
    this.renderElements();
    this._updateFormattingToolbar();
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

  // ── Navigation ────────────────────────────────────────────────
  private async _renderCurrentPage(): Promise<void> {
    await this.renderer.renderPageAtIndex(this.documentModel.currentPageIndex);
    await this._renderFormFields();
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
      this.showToast(
        `This PDF has ${unsupportedCount} checkbox/dropdown field${unsupportedCount > 1 ? 's' : ''} — only text fields are supported`,
        5000,
      );
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
    await this._renderCurrentPage();
    this._thumbnailPanel?.updateActive();
    this.updatePageInfo();
    this.renderElements();
    if (this.ui.findBar.style.display !== 'none' && this.ui.findInput.value) this._search();
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
  }

  async fitToWidth() {
    const scale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
    await this.applyZoom(scale);
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
    const renderDoc  = await pdfjsLib.getDocument(tempBytes).promise;
    const renderPage = await renderDoc.getPage(1);
    const SCALE = 2;
    const effectiveRotation = ((renderPage.rotate + userRot) % 360 + 360) % 360;
    const vp = renderPage.getViewport({ scale: SCALE, rotation: effectiveRotation });

    const offscreen    = document.createElement('canvas');
    offscreen.width    = Math.round(vp.width);
    offscreen.height   = Math.round(vp.height);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ctx          = offscreen.getContext('2d')!;
    await renderPage.render({ canvasContext: ctx, viewport: vp }).promise;

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
  async downloadPageAsImage(): Promise<void> {
    const pageIdx = this.documentModel.currentPageIndex;
    const docPage = this.documentModel.pages[pageIdx];
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
      const renderDoc = await pdfjsLib.getDocument(pdfBytes).promise;
      const renderPage = await renderDoc.getPage(1);
      const SCALE = 2;
      const vp = renderPage.getViewport({ scale: SCALE });
      const offscreen = document.createElement('canvas');
      offscreen.width  = Math.round(vp.width);
      offscreen.height = Math.round(vp.height);
      const ctx = offscreen.getContext('2d')!;
      await renderPage.render({ canvasContext: ctx, viewport: vp }).promise;

      offscreen.toBlob((blob) => {
        if (!blob) { this.showToast('Image export failed'); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const base = (this.currentFilename || 'document').replace(/\.pdf$/i, '');
        link.download = `${base}-page${pageIdx + 1}.png`;
        link.click();
        this.showToast(`Page ${pageIdx + 1} exported as PNG!`);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } finally {
      this.ui.container.style.opacity = '1';
    }
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
      const lineHeight = te.fontSize * 1.2;
      te.text.split('\n').forEach((line, i) => {
        if (!line) return;
        const anchor = tp(te.x, te.y + te.fontSize + i * lineHeight);
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
          const headLen = Math.max(8, lw * 4);
          page.drawLine({ start: { x: pt1.x, y: pt1.y }, end: { x: pt2.x, y: pt2.y }, thickness: lw, color: shapeColor });
          page.drawLine({ start: { x: pt2.x, y: pt2.y }, end: { x: pt2.x + headLen * Math.cos(pa + Math.PI * 0.75), y: pt2.y + headLen * Math.sin(pa + Math.PI * 0.75) }, thickness: lw, color: shapeColor });
          page.drawLine({ start: { x: pt2.x, y: pt2.y }, end: { x: pt2.x + headLen * Math.cos(pa - Math.PI * 0.75), y: pt2.y + headLen * Math.sin(pa - Math.PI * 0.75) }, thickness: lw, color: shapeColor });
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
        const anchor2 = tp(ce.x + 4, ce.y + ce.height - 18);
        page.drawText(ce.text.slice(0, 200), { x: anchor2.x, y: anchor2.y, size: 10, font, color: rgb(0, 0, 0), maxWidth: swapDims ? ce.height - 8 : ce.width - 8, opacity: 0.9 });
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
    page.drawText(wm.text, {
      x: W_orig / 2 - textWidth / 2,
      y: H_orig / 2 - wm.fontSize / 4,
      size: wm.fontSize,
      font,
      color: rgb(col.r, col.g, col.b),
      opacity: wm.opacity,
      rotate: degrees(wm.angle),
    });
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
