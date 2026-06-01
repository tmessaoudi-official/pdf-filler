import { PDFRenderer } from './pdfRenderer';
import { TextElement } from './textElement';
import { SignatureElement } from './signatureElement';
import { SignaturePad } from './signaturePad';
import { InteractionHandler } from './interactionHandler';
import { ShapeElement } from './shapeElement';
import type { PDFElement } from './pdfElement';
import { ElementFactory } from './elementFactory';
import { UIController } from './uiController';
import type { UIRefs } from './uiController';
import { DrawingHandler } from './drawingHandler';
import { HistoryManager, AddElementCmd, RemoveElementCmd, ClearAllCmd, SnapshotCmd } from './historyManager';

export type ToolMode = 'select' | 'addText' | 'addSignature' | 'drawArrow' | 'drawRect' | 'drawEllipse' | 'drawFreehand';

export class PDFEditorApp {
  renderer!: PDFRenderer;
  elements: PDFElement[] = [];
  interactionHandler!: InteractionHandler;
  signaturePad!: SignaturePad;
  mode: ToolMode = 'select';
  zoomScale = 1.0;
  selectedElement: PDFElement | null = null;
  historyManager!: HistoryManager;
  _textChangeTimer: ReturnType<typeof setTimeout> | null = null;
  _pendingTextCmd: SnapshotCmd | null = null;
  currentFilename: string | null = null;
  currentSignature: string | null = null;
  uiController!: UIController;
  drawingHandler!: DrawingHandler;

  get ui(): UIRefs { return this.uiController.refs; }

  constructor() {
    this.renderer = new PDFRenderer(document.getElementById('pdfCanvas') as HTMLCanvasElement);
    this.elements = [];
    this.uiController = new UIController();
    this.interactionHandler = new InteractionHandler(this);
    this.drawingHandler = new DrawingHandler(this);
    this.signaturePad = new SignaturePad(this.uiController.refs.signatureCanvas);
    this.mode = 'select';
    this.zoomScale = 1.0;
    this.selectedElement = null;
    this.historyManager = new HistoryManager(50, (canUndo, canRedo) => {
      this.uiController.updateUndoRedoBtns(canUndo, canRedo);
    });
    this._textChangeTimer = null;
    this._pendingTextCmd = null;
    this.currentFilename = null;
    this.currentSignature = null;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.ui.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    this.ui.addTextBtn.addEventListener('click', () => this.setMode('addText'));
    this.ui.addSignatureBtn.addEventListener('click', () => this.setMode('addSignature'));
    this.ui.downloadBtn.addEventListener('click', () => this.downloadPDF());
    this.ui.prevPageBtn.addEventListener('click', () => this.prevPage());
    this.ui.nextPageBtn.addEventListener('click', () => this.nextPage());
    this.ui.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    document.getElementById('clearSignature')!.addEventListener('click', () => {
      this.signaturePad.clear();
    });
    document.getElementById('cancelSignature')!.addEventListener('click', () => {
      this.closeSignatureModal();
    });
    document.getElementById('saveSignature')!.addEventListener('click', () => {
      this.saveSignature();
    });
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
    this.ui.zoomInBtn.addEventListener('click', () =>
      this.applyZoom(this.zoomScale + 0.1));
    this.ui.zoomOutBtn.addEventListener('click', () =>
      this.applyZoom(this.zoomScale - 0.1));
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
    this.ui.lastPage.addEventListener('click', () =>
      this._goToPage(this.renderer.pdfDoc?.numPages || 1));

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
      (this.selectedElement as TextElement).fontFamily = (e.target as HTMLInputElement).value;
      this.renderElements();
      this._autosave();
    });

    this.ui.boldBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      (this.selectedElement as TextElement).bold = !(this.selectedElement as TextElement).bold;
      this.ui.boldBtn.classList.toggle('btn-active-fmt', (this.selectedElement as TextElement).bold);
      this.renderElements();
      this._autosave();
    });

    this.ui.italicBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      (this.selectedElement as TextElement).italic = !(this.selectedElement as TextElement).italic;
      this.ui.italicBtn.classList.toggle('btn-active-fmt', (this.selectedElement as TextElement).italic);
      this.renderElements();
      this._autosave();
    });

    this.ui.fontSizeInput.addEventListener('change', (e) => {
      const size = Math.max(8, Math.min(72, parseInt((e.target as HTMLInputElement).value) || 14));
      if (this.selectedElement && this.selectedElement.type === 'text') {
        (this.selectedElement as TextElement).fontSize = size;
        this.renderElements();
        this._autosave();
      }
    });

    this.ui.textColorInput.addEventListener('change', (e) => {
      if (this.selectedElement && this.selectedElement.type === 'text') {
        (this.selectedElement as TextElement).color = (e.target as HTMLInputElement).value;
        this.renderElements();
        this._autosave();
      }
    });

    this.ui.fontSizeDownBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const newSize = Math.max(8, (this.selectedElement as TextElement).fontSize - 2);
      (this.selectedElement as TextElement).fontSize = newSize;
      this.ui.fontSizeInput.value = String(newSize);
      this.renderElements();
      this._autosave();
    });

    this.ui.fontSizeUpBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const newSize = Math.min(72, (this.selectedElement as TextElement).fontSize + 2);
      (this.selectedElement as TextElement).fontSize = newSize;
      this.ui.fontSizeInput.value = String(newSize);
      this.renderElements();
      this._autosave();
    });

    this.ui.shapeColor.addEventListener('input', (e) => {
      if (this.selectedElement?.type === 'shape') {
        (this.selectedElement as ShapeElement).strokeColor = (e.target as HTMLInputElement).value;
        this.renderElements();
        this._autosave();
      }
    });

    this.ui.shapeWidth.addEventListener('change', (e) => {
      if (this.selectedElement?.type === 'shape') {
        (this.selectedElement as ShapeElement).strokeWidth = parseInt((e.target as HTMLInputElement).value) || 2;
        this.renderElements();
        this._autosave();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.ui.helpModal.classList.contains('active')) { this._toggleHelp(false); return; }
        this.setMode('select');
        this.selectElement(null);
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      if (e.target instanceof Element && e.target.matches('input, textarea, select')) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) this.redo(); else this.undo();
            break;
          case 'y':
            e.preventDefault();
            this.redo();
            break;
          case 'arrowright':
            e.preventDefault();
            this.nextPage();
            break;
          case 'arrowleft':
            e.preventDefault();
            this.prevPage();
            break;
        }
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (this.selectedElement) {
            e.preventDefault();
            this.removeElement(this.selectedElement.id);
            this.selectedElement = null;
            this._updateFormattingToolbar();
          }
          break;
        case 't': case 'T':
          if (this.renderer.pdfDoc) this.setMode('addText');
          break;
        case 's': case 'S':
          if (this.renderer.pdfDoc) this.setMode('addSignature');
          break;
        case 'a': case 'A':
          if (this.renderer.pdfDoc) this.setMode('drawArrow');
          break;
        case 'r': case 'R':
          if (this.renderer.pdfDoc) this.setMode('drawRect');
          break;
        case 'c': case 'C':
          if (this.renderer.pdfDoc) this.setMode('drawEllipse');
          break;
        case 'd': case 'D':
          if (this.renderer.pdfDoc) this.setMode('drawFreehand');
          break;
        case '?':
          this._toggleHelp();
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          if (this.selectedElement) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            if (e.key === 'ArrowUp')    this.selectedElement.y -= step;
            if (e.key === 'ArrowDown')  this.selectedElement.y += step;
            if (e.key === 'ArrowLeft')  this.selectedElement.x -= step;
            if (e.key === 'ArrowRight') this.selectedElement.x += step;
            this.renderElements();
          }
          break;
      }
    });

    this.ui.canvas.style.touchAction = 'pan-x pan-y';
  }

  undo() {
    if (this.historyManager.undo()) {
      this.selectedElement = null;
      this.renderElements();
      this._updateFormattingToolbar();
      this._autosave();
    }
  }

  redo() {
    if (this.historyManager.redo()) {
      this.selectedElement = null;
      this.renderElements();
      this._updateFormattingToolbar();
      this._autosave();
    }
  }

  _autosave() {
    if (!this.currentFilename) return;
    const key = `pdf-fill-sign:${this.currentFilename}`;
    const data = this.elements.map(el => el.toJSON());
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  _loadSaved() {
    if (!this.currentFilename) return;
    const key = `pdf-fill-sign:${this.currentFilename}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (!data.length) return;
      this.importState(JSON.stringify({ elements: data }));
      this.showToast(`Restored ${data.length} element${data.length > 1 ? 's' : ''} from last session`);
    } catch { /* ignore */ }
  }

  _clearSave() {
    if (!this.currentFilename) return;
    localStorage.removeItem(`pdf-fill-sign:${this.currentFilename}`);
    this.showToast('Saved session cleared');
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

  async handleFileUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please select a valid PDF file');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      await this.renderer.loadPDF(((event.target as FileReader).result as ArrayBuffer));
      this.elements = [];
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      document.getElementById("emptyState")!.style.display = 'none';
      const fitScale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
      const isMobile = window.innerWidth <= 640;
      await this.applyZoom(isMobile ? Math.max(fitScale, 0.65) : fitScale);
      this.enableUI();
      this.currentFilename = file.name;
      this.ui.clearSaveBtn.disabled = false;
      this._loadSaved();
      this.updatePageInfo();
      this.renderElements();
    };
    reader.readAsArrayBuffer(file);
  }

  enableUI() { this.uiController.enableUI(); }

  _cleanEmptyTextElements() {
    const focused = document.activeElement;
    const before = this.elements.length;
    const keep = this.elements.filter(e => {
      if (!(e.type === 'text' && !(e as TextElement).text)) return true;
      const input = document.querySelector(`[data-id="${e.id}"] input, [data-id="${e.id}"] textarea`);
      return input && input === focused;
    });
    if (keep.length < before) {
      this.elements.splice(0, this.elements.length, ...keep);
      this.renderElements();
    }
  }

  setMode(mode: ToolMode) {
    // Don't clean here — setMode('select') is called right after placing a text element
    // and would delete it before the user types. Cleaning happens in selectElement() instead.
    this.drawingHandler.cancel();
    this.mode = mode;
    this.uiController.updateModeButtons(mode);
    if (mode === 'addSignature') this.openSignatureModal();
  }

  _isShapeMode() {
    return this.mode.startsWith('draw');
  }

  openSignatureModal() {
    this.ui.signatureModal.classList.add('active');
    const w = this.ui.signatureCanvas.offsetWidth || 500;
    this.ui.signatureCanvas.width = w;
    this.ui.signatureCanvas.height = Math.round(w * 0.4);
    this.signaturePad.clear();
  }

  closeSignatureModal() {
    this.ui.signatureModal.classList.remove('active');
    this.mode = 'select';
    this.ui.addSignatureBtn.classList.remove('active');
  }

  saveSignature() {
    this.currentSignature = this.signaturePad.getDataURL();
    this.ui.signatureModal.classList.remove('active');
    this.mode = 'addSignature';
    this.ui.addSignatureBtn.classList.add('active');
  }

  selectElement(element: PDFElement | null) {
    if (this.selectedElement === element) {
      this._updateFormattingToolbar();
      return;
    }
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
    } else {
      this.selectElement(null);
    }
  }

  addTextAtPosition(e: MouseEvent) {
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const options = {
      fontSize: parseInt(this.ui.fontSizeInput.value),
      color: this.ui.textColorInput.value
    };
    const textElement = new TextElement(x, y, this.renderer.currentPage, options);
    textElement.x -= textElement.width / 2;
    textElement.y -= textElement.height / 2;
    this.historyManager.execute(new AddElementCmd(this.elements, textElement));
    this._autosave();
    this.renderElements();
    const inputEl = this.ui.container.querySelector(
      `[data-id='${textElement.id}'] input, [data-id='${textElement.id}'] textarea`
    ) as HTMLInputElement | null;
    if (inputEl) {
      (inputEl as HTMLElement).style.pointerEvents = 'auto';
      inputEl.focus();
    }
  }

  addSignatureAtPosition(e: MouseEvent) {
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const sigElement = new SignatureElement(x, y, this.renderer.currentPage, this.currentSignature ?? '');
    sigElement.x -= sigElement.width / 2;
    sigElement.y -= sigElement.height / 2;
    this.historyManager.execute(new AddElementCmd(this.elements, sigElement));
    this._autosave();
    this.renderElements();
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
    const canvasOffset = {
      left: this.ui.canvas.offsetLeft,
      top: this.ui.canvas.offsetTop
    };
    const currentPageElements = this.elements.filter(
      el => el.page === this.renderer.currentPage
    );
    currentPageElements.forEach(element => {
      const div = element.render(this.ui.container, canvasOffset, this.zoomScale);
      if (this.selectedElement && this.selectedElement.id === element.id) {
        div.classList.add('selected');
      }
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectElement(element);
      });
      div.addEventListener('pointerdown', (e) => {
        this.interactionHandler.handlePointerDown(e, element, div);
      });
      if (element.type === 'text') {
        const input = div.querySelector('input, textarea');
        if (input) {
          const isSelected = this.selectedElement && this.selectedElement.id === element.id;
          if (!isSelected) (input as HTMLElement).style.pointerEvents = 'none';
          input.addEventListener('input', () => {
            if (!this._pendingTextCmd) {
              this._pendingTextCmd = new SnapshotCmd(this.elements);
            }
            clearTimeout(this._textChangeTimer ?? undefined);
            this._textChangeTimer = setTimeout(() => {
              const cmd = this._pendingTextCmd;
              if (cmd) {
                cmd.captureAfter();
                this.historyManager.record(cmd);
                this._pendingTextCmd = null;
                this._autosave();
              }
            }, 500);
          });
        }
      }
      this.ui.container.appendChild(div);
    });
  }

  async _goToPage(n: number) {
    if (!this.renderer.pdfDoc) return;
    const changed = await this.renderer.goToPage(n);
    if (changed) {
      this.selectElement(null);
      this.updatePageInfo();
      this.renderElements();
    }
  }

  async prevPage() {
    await this._goToPage(this.renderer.currentPage - 1);
  }

  async nextPage() {
    await this._goToPage(this.renderer.currentPage + 1);
  }

  updatePageInfo() {
    const info = this.renderer.getPageInfo();
    this.uiController.updatePageInfo(info.current, info.total);
  }

  async applyZoom(newScale: number): Promise<void> {
    this.zoomScale = Math.max(0.25, Math.min(3.0, newScale));
    this.renderer.setScale(this.zoomScale);
    this.ui.zoomDisplay.textContent = Math.round(this.zoomScale * 100) + '%';
    await this.renderer.renderPage(this.renderer.currentPage);
    this.renderElements();
  }

  async fitToWidth() {
    const scale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
    await this.applyZoom(scale);
  }

  async downloadPDF() {
    if (!this.renderer.pdfDoc) return;
    this._cleanEmptyTextElements();
    this.showToast('Generating PDF…', 60000);
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    this.ui.container.style.opacity = '0.4';
    try {
      for (let pageNum = 1; pageNum <= this.renderer.pdfDoc.numPages; pageNum++) {
        await this.renderer.renderPage(pageNum);

        const origPage = await this.renderer.pdfDoc.getPage(pageNum);
        const origVp = origPage.getViewport({ scale: 1 });

        const pageImage = await pdfDoc.embedPng(this.ui.canvas.toDataURL());
        const page = pdfDoc.addPage([origVp.width, origVp.height]);
        page.drawImage(pageImage, {
          x: 0,
          y: 0,
          width: origVp.width,
          height: origVp.height
        });

        const pageElements = this.elements.filter(el => el.page === pageNum);
        for (const element of pageElements) {
          if (element.type === 'text' && (element as TextElement).text) {
            const te = element as TextElement;
            const { r, g, b } = this.hexToRgbValues(te.color);
            const fontName = this._getStandardFont(
              te.fontFamily, te.bold, te.italic
            );
            const font = await pdfDoc.embedFont(StandardFonts[fontName as keyof typeof StandardFonts]);
            page.drawText(te.text, {
              x: te.x,
                y: origVp.height - te.y - te.fontSize,
              size: te.fontSize,
              font,
              color: rgb(r, g, b)
            });
          } else if (element.type === 'signature') {
            const se = element as SignatureElement;
            const sigImage = await pdfDoc.embedPng(se.data);
            page.drawImage(sigImage, {
              x: element.x,
              y: origVp.height - element.y - element.height,
              width: element.width,
              height: element.height
            });
          } else if (element.type === 'shape') {
            const she = element as ShapeElement;
            const { r, g, b } = this.hexToRgbValues(she.strokeColor);
            const shapeColor = rgb(r, g, b);
            const lw = she.strokeWidth;

            switch (she.shapeType) {
              case 'rect':
                page.drawRectangle({
                  x: element.x,
                  y: origVp.height - element.y - element.height,
                  width: element.width,
                  height: element.height,
                  borderColor: shapeColor,
                  borderWidth: lw
                });
                break;

              case 'ellipse':
                page.drawEllipse({
                  x: element.x + element.width / 2,
                  y: origVp.height - element.y - element.height / 2,
                  xScale: element.width / 2,
                  yScale: element.height / 2,
                  borderColor: shapeColor,
                  borderWidth: lw
                });
                break;

              case 'arrow': {
                page.drawLine({
                  start: { x: she.x1, y: origVp.height - she.y1 },
                  end:   { x: she.x2, y: origVp.height - she.y2 },
                  thickness: lw,
                  color: shapeColor
                });
                const headLen = Math.max(8, lw * 4);
                const pdfAngle = Math.atan2(
                  -(she.y2 - she.y1),
                   (she.x2 - she.x1)
                );
                const ex = she.x2;
                const ey = origVp.height - she.y2;
                page.drawLine({
                  start: { x: ex, y: ey },
                  end:   { x: ex + headLen * Math.cos(pdfAngle + Math.PI * 0.75),
                           y: ey + headLen * Math.sin(pdfAngle + Math.PI * 0.75) },
                  thickness: lw, color: shapeColor
                });
                page.drawLine({
                  start: { x: ex, y: ey },
                  end:   { x: ex + headLen * Math.cos(pdfAngle - Math.PI * 0.75),
                           y: ey + headLen * Math.sin(pdfAngle - Math.PI * 0.75) },
                  thickness: lw, color: shapeColor
                });
                break;
              }

              case 'freehand': {
                if (she.points.length < 2) break;
                const pts = she.points;
                let d = `M ${pts[0].x} ${pts[0].y}`;
                for (let i = 1; i < pts.length; i++) {
                  d += ` L ${pts[i].x} ${pts[i].y}`;
                }
                page.drawSvgPath(d, {
                  x: 0,
                  y: origVp.height,
                  borderColor: shapeColor,
                  borderWidth: lw,
                  scale: 1
                });
                break;
              }
            }
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const baseName = (this.currentFilename || 'document').replace(/\.pdf$/i, '');
      link.download = baseName + '-signed.pdf';
      link.click();
      this.showToast('PDF downloaded!');
      URL.revokeObjectURL(url);
    } finally {
      this.ui.container.style.opacity = '1';
      await this.renderer.renderPage(this.renderer.currentPage);
      this.renderElements();
    }
  }

  _getStandardFont(fontFamily: string, bold: boolean, italic: boolean): string {
    const map: Record<string, Record<string, string>> = {
      'Arial':           { '': 'Helvetica',       'b': 'HelveticaBold', 'i': 'HelveticaOblique',     'bi': 'HelveticaBoldOblique' },
      'Helvetica':       { '': 'Helvetica',       'b': 'HelveticaBold', 'i': 'HelveticaOblique',     'bi': 'HelveticaBoldOblique' },
      'Times New Roman': { '': 'TimesRoman',      'b': 'TimesBold',     'i': 'TimesItalic',          'bi': 'TimesBoldItalic' },
      'Courier New':     { '': 'Courier',         'b': 'CourierBold',   'i': 'CourierOblique',       'bi': 'CourierBoldOblique' },
      'Courier':         { '': 'Courier',         'b': 'CourierBold',   'i': 'CourierOblique',       'bi': 'CourierBoldOblique' },
    };
    const variant = (bold ? 'b' : '') + (italic ? 'i' : '');
    return (map[fontFamily] && map[fontFamily][variant]) || 'Helvetica';
  }

  hexToRgbValues(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    };
  }

  exportState() {
    return JSON.stringify({
      elements: this.elements.map(el => el.toJSON()),
      currentPage: this.renderer.currentPage
    });
  }

  importState(stateJSON: string) {
    const state = JSON.parse(stateJSON);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restored = (state.elements as Array<Record<string, any>>)
      .map((data) => ElementFactory.fromJSON(data))
      .filter(Boolean) as PDFElement[];
    this.elements.splice(0, this.elements.length, ...restored);
    this.renderElements();
  }
}
