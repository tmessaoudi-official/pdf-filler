// PDFEditorApp module
import { PDFRenderer } from './pdfRenderer.js?v=7';
import { TextElement } from './textElement.js?v=7';
import { SignatureElement } from './signatureElement.js?v=7';
import { SignaturePad } from './signaturePad.js?v=7';
import { InteractionHandler } from './interactionHandler.js?v=7';
import { ShapeElement } from './shapeElement.js?v=7';

export class PDFEditorApp {
  constructor() {
    this.renderer = new PDFRenderer(document.getElementById('pdfCanvas'));
    this.elements = [];
    this.interactionHandler = new InteractionHandler(this);
    this.signaturePad = null;
    this.mode = 'select';
    this.zoomScale = 1.0;
    this.selectedElement = null;
    this.historyStack = [];
    this.redoStack = [];
    this._textChangeTimer = null;
    this.currentFilename = null;
    this._toastTimer = null;
    this.currentSignature = null;
    this._drawing     = false;
    this._drawStart   = null;
    this._drawPoints  = [];
    this._previewSvg  = null;
    this._activeDrawPointerId = null;
    this._pinchPointers   = new Map();
    this._pinchStartDist  = null;
    this._pinchStartZoom  = null;
    this._lastPinchDist   = null;
    this.initUI();
    this.setupEventListeners();
  }

  initUI() {
    this.ui = {
      fileInput: document.getElementById('fileInput'),
      addTextBtn: document.getElementById('addTextBtn'),
      addSignatureBtn: document.getElementById('addSignatureBtn'),
      downloadBtn: document.getElementById('downloadBtn'),
      prevPageBtn: document.getElementById('prevPage'),
      nextPageBtn: document.getElementById('nextPage'),
      pageInfo: document.getElementById('pageInfo'),
      canvas: document.getElementById('pdfCanvas'),
      container: document.getElementById('canvasContainer'),
      signatureModal: document.getElementById('signatureModal'),
      signatureCanvas: document.getElementById('signatureCanvas'),
      fontSizeInput: document.getElementById('fontSize'),
      textColorInput: document.getElementById('textColor'),
      sigLineWidthInput: document.getElementById('sigLineWidth'),
      sigColorInput: document.getElementById('sigColor'),
      zoomOutBtn: document.getElementById('zoomOutBtn'),
      zoomInBtn: document.getElementById('zoomInBtn'),
      zoomDisplay: document.getElementById('zoomDisplay'),
      fitBtn: document.getElementById('fitBtn'),
      undoBtn: document.getElementById('undoBtn'),
      redoBtn: document.getElementById('redoBtn'),
      fontFamily: document.getElementById('fontFamily'),
      boldBtn: document.getElementById('boldBtn'),
      italicBtn: document.getElementById('italicBtn'),
      modeBadge: document.getElementById('modeBadge'),
      clearSaveBtn: document.getElementById('clearSaveBtn'),
      firstPage: document.getElementById('firstPage'),
      lastPage: document.getElementById('lastPage'),
      pageInput: document.getElementById('pageInput'),
      pageTotal: document.getElementById('pageTotal'),
      toast: document.getElementById('toast'),
      arrowBtn:    document.getElementById('arrowBtn'),
      rectBtn:     document.getElementById('rectBtn'),
      circleBtn:   document.getElementById('circleBtn'),
      freehandBtn: document.getElementById('freehandBtn'),
      shapeColor:       document.getElementById('shapeColor'),
      shapeWidth:       document.getElementById('shapeWidth'),
      fontSizeDownBtn:  document.getElementById('fontSizeDownBtn'),
      fontSizeUpBtn:    document.getElementById('fontSizeUpBtn')
    };
    this.signaturePad = new SignaturePad(this.ui.signatureCanvas);
  }

  setupEventListeners() {
    this.ui.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    this.ui.addTextBtn.addEventListener('click', () => this.setMode('addText'));
    this.ui.addSignatureBtn.addEventListener('click', () => this.setMode('addSignature'));
    this.ui.downloadBtn.addEventListener('click', () => this.downloadPDF());
    this.ui.prevPageBtn.addEventListener('click', () => this.prevPage());
    this.ui.nextPageBtn.addEventListener('click', () => this.nextPage());
    this.ui.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
    document.getElementById('clearSignature').addEventListener('click', () => {
      this.signaturePad.clear();
    });
    document.getElementById('cancelSignature').addEventListener('click', () => {
      this.closeSignatureModal();
    });
    document.getElementById('saveSignature').addEventListener('click', () => {
      this.saveSignature();
    });
    this.ui.sigLineWidthInput.addEventListener('change', (e) => {
      this.signaturePad.setLineWidth(parseInt(e.target.value));
    });
    this.ui.sigColorInput.addEventListener('change', (e) => {
      this.signaturePad.setColor(e.target.value);
    });
    document.addEventListener('pointermove', (e) => {
      this.interactionHandler.handlePointerMove(e);
      this._handleDrawPointerMove(e);
    });
    document.addEventListener('pointerup', (e) => {
      this.interactionHandler.handlePointerUp(e);
      this._handleDrawPointerUp(e);
    });
    document.addEventListener('pointercancel', (e) => {
      this.interactionHandler.handlePointerCancel(e);
      this._handleDrawPointerCancel(e);
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

    this.ui.canvas.addEventListener('pointerdown', (e) => this._handleDrawPointerDown(e));

    this.ui.clearSaveBtn.addEventListener('click', () => this._clearSave());
    this.ui.firstPage.addEventListener('click', () => this._goToPage(1));
    this.ui.lastPage.addEventListener('click', () =>
      this._goToPage(this.renderer.pdfDoc?.numPages || 1));

    this.ui.pageInput.addEventListener('change', (e) => {
      this._goToPage(parseInt(e.target.value) || 1);
    });
    this.ui.pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
        this._goToPage(parseInt(e.target.value) || 1);
      }
    });

    this.ui.container.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.applyZoom(this.zoomScale + (e.deltaY < 0 ? 0.05 : -0.05));
    }, { passive: false });

    this.ui.fontFamily.addEventListener('change', (e) => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      this.selectedElement.fontFamily = e.target.value;
      this.renderElements();
      this._autosave();
    });

    this.ui.boldBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      this.selectedElement.bold = !this.selectedElement.bold;
      this.ui.boldBtn.classList.toggle('btn-active-fmt', this.selectedElement.bold);
      this.renderElements();
      this._autosave();
    });

    this.ui.italicBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      this.selectedElement.italic = !this.selectedElement.italic;
      this.ui.italicBtn.classList.toggle('btn-active-fmt', this.selectedElement.italic);
      this.renderElements();
      this._autosave();
    });

    this.ui.fontSizeInput.addEventListener('change', (e) => {
      const size = Math.max(8, Math.min(72, parseInt(e.target.value) || 14));
      if (this.selectedElement && this.selectedElement.type === 'text') {
        this.selectedElement.fontSize = size;
        this.renderElements();
        this._autosave();
      }
    });

    this.ui.textColorInput.addEventListener('change', (e) => {
      if (this.selectedElement && this.selectedElement.type === 'text') {
        this.selectedElement.color = e.target.value;
        this.renderElements();
        this._autosave();
      }
    });

    this.ui.fontSizeDownBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const newSize = Math.max(8, this.selectedElement.fontSize - 2);
      this.selectedElement.fontSize = newSize;
      this.ui.fontSizeInput.value = newSize;
      this.renderElements();
      this._autosave();
    });

    this.ui.fontSizeUpBtn.addEventListener('click', () => {
      if (!this.selectedElement || this.selectedElement.type !== 'text') return;
      const newSize = Math.min(72, this.selectedElement.fontSize + 2);
      this.selectedElement.fontSize = newSize;
      this.ui.fontSizeInput.value = newSize;
      this.renderElements();
      this._autosave();
    });

    // Shape property editing — update selected shape when color/width changes
    this.ui.shapeColor.addEventListener('input', (e) => {
      if (this.selectedElement?.type === 'shape') {
        this.selectedElement.strokeColor = e.target.value;
        this.renderElements();
        this._autosave();
      }
    });

    this.ui.shapeWidth.addEventListener('change', (e) => {
      if (this.selectedElement?.type === 'shape') {
        this.selectedElement.strokeWidth = parseInt(e.target.value) || 2;
        this.renderElements();
        this._autosave();
      }
    });

    document.addEventListener('keydown', (e) => {
      // Escape always works — cancel mode and deselect
      if (e.key === 'Escape') {
        this.setMode('select');
        this.selectElement(null);
        return;
      }

      // All other shortcuts blocked when typing in an input/textarea/select
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
        case 't':
        case 'T':
          if (this.renderer.pdfDoc) this.setMode('addText');
          break;
        case 's':
        case 'S':
          if (this.renderer.pdfDoc) this.setMode('addSignature');
          break;
        case 'a':
        case 'A':
          if (this.renderer.pdfDoc) this.setMode('drawArrow');
          break;
        case 'r':
        case 'R':
          if (this.renderer.pdfDoc) this.setMode('drawRect');
          break;
        case 'c':
        case 'C':
          if (this.renderer.pdfDoc) this.setMode('drawEllipse');
          break;
        case 'd':
        case 'D':
          if (this.renderer.pdfDoc) this.setMode('drawFreehand');
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          if (this.selectedElement) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            if (e.key === 'ArrowUp') this.selectedElement.y -= step;
            if (e.key === 'ArrowDown') this.selectedElement.y += step;
            if (e.key === 'ArrowLeft') this.selectedElement.x -= step;
            if (e.key === 'ArrowRight') this.selectedElement.x += step;
            this.renderElements();
          }
          break;
      }
    });

    // Initialize canvas touch-action for select mode (pan allowed).
    // setMode() overrides this to 'none' when entering draw modes.
    this.ui.canvas.style.touchAction = 'pan-x pan-y';
  }

  _snapshotElements() {
    return this.elements.map(el => el.toJSON());
  }

  pushHistory() {
    this.historyStack.push(this._snapshotElements());
    if (this.historyStack.length > 50) this.historyStack.shift();
    this.redoStack = [];
    this._updateUndoRedoBtns();
  }

  undo() {
    if (!this.historyStack.length) return;
    this.redoStack.push(this._snapshotElements());
    const snapshot = this.historyStack.pop();
    this._restoreSnapshot(snapshot);
    this._updateUndoRedoBtns();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.historyStack.push(this._snapshotElements());
    const snapshot = this.redoStack.pop();
    this._restoreSnapshot(snapshot);
    this._updateUndoRedoBtns();
  }

  _restoreSnapshot(snapshot) {
    this.elements = snapshot.map(data => {
      if (data.type === 'text') {
        const el = new TextElement(data.x, data.y, data.page, {
          width: data.width, height: data.height,
          fontSize: data.fontSize, color: data.color,
          fontFamily: data.fontFamily || 'Arial',
          bold: data.bold || false, italic: data.italic || false,
          multiline: data.multiline
        });
        el.text = data.text;
        return el;
      } else if (data.type === 'signature') {
        return new SignatureElement(
          data.x, data.y, data.page, data.data,
          { width: data.width, height: data.height }
        );
      } else if (data.type === 'shape') {
        return new ShapeElement(data.shapeType, data.x, data.y, data.width, data.height, data.page, {
          strokeColor: data.strokeColor,
          strokeWidth: data.strokeWidth,
          x1: data.x1, y1: data.y1,
          x2: data.x2, y2: data.y2,
          points: data.points || []
        });
      }
    }).filter(Boolean);
    this.selectedElement = null;
    this.renderElements();
    this._updateFormattingToolbar();
    this._autosave();
  }

  _updateUndoRedoBtns() {
    this.ui.undoBtn.disabled = this.historyStack.length === 0;
    this.ui.redoBtn.disabled = this.redoStack.length === 0;
  }

  _autosave() {
    if (!this.currentFilename) return;
    const key = `pdf-fill-sign:${this.currentFilename}`;
    const data = this.elements.map(el => el.toJSON());
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (_) {}
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
    } catch (_) {}
  }

  _clearSave() {
    if (!this.currentFilename) return;
    localStorage.removeItem(`pdf-fill-sign:${this.currentFilename}`);
    this.showToast('Saved session cleared');
  }

  showToast(msg, duration = 3000) {
    this.ui.toast.textContent = msg;
    this.ui.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.ui.toast.classList.remove('show');
    }, duration);
  }

  async handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please select a valid PDF file');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      await this.renderer.loadPDF(event.target.result);
      this.elements = [];
      document.getElementById('emptyState').style.display = 'none';
      const fitScale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
      // On mobile, fit-to-width can give very small zooms (e.g. 35%) — enforce a readable minimum
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

  enableUI() {
    this.ui.addTextBtn.disabled = false;
    this.ui.addSignatureBtn.disabled = false;
    this.ui.downloadBtn.disabled = false;
    this.ui.prevPageBtn.disabled = false;
    this.ui.nextPageBtn.disabled = false;
    this.ui.zoomInBtn.disabled = false;
    this.ui.zoomOutBtn.disabled = false;
    this.ui.fitBtn.disabled = false;
    this.ui.firstPage.disabled = false;
    this.ui.lastPage.disabled = false;
    this.ui.pageInput.disabled = false;
    this.ui.arrowBtn.disabled    = false;
    this.ui.rectBtn.disabled     = false;
    this.ui.circleBtn.disabled   = false;
    this.ui.freehandBtn.disabled = false;
  }

  _cancelDrawing() {
    if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }
    this._drawing             = false;
    this._drawStart           = null;
    this._drawPoints          = [];
    this._activeDrawPointerId = null;
  }

  _cleanEmptyTextElements() {
    // Preserve any empty text element whose input is currently focused
    // (user just placed it and is about to type)
    const focused = document.activeElement;
    const before = this.elements.length;
    this.elements = this.elements.filter(e => {
      if (!(e.type === 'text' && !e.text)) return true;
      const input = document.querySelector(`[data-id="${e.id}"] input, [data-id="${e.id}"] textarea`);
      return input && input === focused;
    });
    if (this.elements.length < before) this.renderElements();
  }

  setMode(mode) {
    // Don't clean here — setMode('select') is called right after placing a text element
    // and would delete it before the user types. Cleaning happens in selectElement() instead.
    this._cancelDrawing();
    this.mode = mode;
    // draw modes need touch-action:none so finger doesn't scroll container while drawing;
    // select mode restores single-finger pan of zoomed PDF
    this.ui.canvas.style.touchAction = mode.startsWith('draw') ? 'none' : 'pan-x pan-y';
    this.ui.addTextBtn.classList.toggle('active', mode === 'addText');
    this.ui.addSignatureBtn.classList.toggle('active', mode === 'addSignature');
    this.ui.arrowBtn.classList.toggle('active',    mode === 'drawArrow');
    this.ui.rectBtn.classList.toggle('active',     mode === 'drawRect');
    this.ui.circleBtn.classList.toggle('active',   mode === 'drawEllipse');
    this.ui.freehandBtn.classList.toggle('active', mode === 'drawFreehand');

    const badges = {
      select:       'SELECT',
      addText:      '+ TEXT',
      addSignature: '✍ SIGN',
      drawArrow:    '→ ARROW',
      drawRect:     '□ RECT',
      drawEllipse:  '○ CIRCLE',
      drawFreehand: '✏ DRAW'
    };
    this.ui.modeBadge.textContent = badges[mode] || 'SELECT';
    this.ui.modeBadge.classList.toggle('active', mode !== 'select');

    this.ui.canvas.className = mode === 'select' ? 'cursor-default' : 'cursor-crosshair';

    // Shape controls: enabled in draw modes; _updateFormattingToolbar handles selected shape
    const isShapeMode = mode.startsWith('draw');
    this.ui.shapeColor.disabled = !isShapeMode;
    this.ui.shapeWidth.disabled = !isShapeMode;

    if (mode === 'addSignature') this.openSignatureModal();
  }

  _isShapeMode() {
    return this.mode.startsWith('draw');
  }

  _handleDrawPointerDown(e) {
    if (!this.renderer.pdfDoc) return;

    // Track all canvas pointer contacts for pinch detection
    this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Second finger → cancel any draw in progress and switch to pinch-zoom
    if (this._pinchPointers.size >= 2) {
      this._cancelDrawing();
      if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }
      this._pinchStartDist = this._getPinchDist();
      this._pinchStartZoom = this.zoomScale;
      this._lastPinchDist  = this._pinchStartDist;
      e.preventDefault();
      return;
    }

    if (!this._isShapeMode()) return;
    if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }

    const rect = this.ui.canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) return;

    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top)  / this.zoomScale;
    this._drawing             = true;
    this._activeDrawPointerId = e.pointerId;
    this._drawStart           = { x, y };
    this._drawPoints          = [{ x, y }];

    this._previewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this._previewSvg.id = 'drawPreview';
    Object.assign(this._previewSvg.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'visible', zIndex: '10'
    });
    this.ui.container.appendChild(this._previewSvg);
    e.preventDefault();
  }

  _handleDrawPointerMove(e) {
    // Keep pinch pointer positions current
    if (this._pinchPointers.has(e.pointerId)) {
      this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Live CSS-scale feedback during pinch (no PDF re-render until release)
    if (this._pinchPointers.size >= 2 && this._pinchStartDist) {
      const dist = this._getPinchDist();
      this._lastPinchDist = dist;
      const ratio = dist / this._pinchStartDist;
      this.ui.canvas.style.transform = `scale(${ratio})`;
      this.ui.canvas.style.transformOrigin = 'center center';
      return;
    }

    if (!this._drawing || !this._drawStart) return;
    if (e.pointerId !== this._activeDrawPointerId) return;

    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top)  / this.zoomScale;

    if (this.mode === 'drawFreehand') {
      const last = this._drawPoints[this._drawPoints.length - 1];
      const dist = Math.hypot((x - last.x) * this.zoomScale, (y - last.y) * this.zoomScale);
      if (dist > 3) this._drawPoints.push({ x, y });
    }
    this._updateDrawPreview(x, y);
  }

  _updateDrawPreview(curX, curY) {
    if (!this._previewSvg) return;
    while (this._previewSvg.firstChild) this._previewSvg.firstChild.remove();

    const s   = this.zoomScale;
    const ox  = this.ui.canvas.offsetLeft;
    const oy  = this.ui.canvas.offsetTop;
    const col = this.ui.shapeColor.value;
    const sw  = (parseInt(this.ui.shapeWidth.value) || 2) * s;

    const sx0  = this._drawStart.x * s + ox;
    const sy0  = this._drawStart.y * s + oy;
    const sxC  = curX * s + ox;
    const syC  = curY * s + oy;

    const ns = 'http://www.w3.org/2000/svg';

    if (this.mode === 'drawRect') {
      const el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', Math.min(sx0, sxC));
      el.setAttribute('y', Math.min(sy0, syC));
      el.setAttribute('width',  Math.abs(sxC - sx0));
      el.setAttribute('height', Math.abs(syC - sy0));
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', col);
      el.setAttribute('stroke-width', sw);
      this._previewSvg.appendChild(el);

    } else if (this.mode === 'drawEllipse') {
      const el = document.createElementNS(ns, 'ellipse');
      el.setAttribute('cx', (sx0 + sxC) / 2);
      el.setAttribute('cy', (sy0 + syC) / 2);
      el.setAttribute('rx', Math.abs(sxC - sx0) / 2);
      el.setAttribute('ry', Math.abs(syC - sy0) / 2);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', col);
      el.setAttribute('stroke-width', sw);
      this._previewSvg.appendChild(el);

    } else if (this.mode === 'drawArrow') {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', sx0); line.setAttribute('y1', sy0);
      line.setAttribute('x2', sxC); line.setAttribute('y2', syC);
      line.setAttribute('stroke', col);
      line.setAttribute('stroke-width', sw);
      line.setAttribute('stroke-linecap', 'round');
      this._previewSvg.appendChild(line);

      const headLen = Math.max(8, sw * 4);
      const angle = Math.atan2(syC - sy0, sxC - sx0);
      const a1 = angle + Math.PI * 0.8;
      const a2 = angle - Math.PI * 0.8;
      const head = document.createElementNS(ns, 'polygon');
      head.setAttribute('points', [
        `${sxC},${syC}`,
        `${sxC + headLen * Math.cos(a1)},${syC + headLen * Math.sin(a1)}`,
        `${sxC + headLen * Math.cos(a2)},${syC + headLen * Math.sin(a2)}`
      ].join(' '));
      head.setAttribute('fill', col);
      this._previewSvg.appendChild(head);

    } else if (this.mode === 'drawFreehand' && this._drawPoints.length >= 2) {
      const pts = this._drawPoints.map(p => `${p.x * s + ox},${p.y * s + oy}`).join(' ');
      const pl = document.createElementNS(ns, 'polyline');
      pl.setAttribute('points', pts);
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke', col);
      pl.setAttribute('stroke-width', sw);
      pl.setAttribute('stroke-linecap', 'round');
      pl.setAttribute('stroke-linejoin', 'round');
      this._previewSvg.appendChild(pl);
    }
  }

  _handleDrawPointerUp(e) {
    this._pinchPointers.delete(e.pointerId);

    // Commit pinch zoom when finger count drops below 2
    if (this._pinchStartDist !== null && this._pinchPointers.size < 2) {
      const finalDist = this._lastPinchDist || this._pinchStartDist;
      const newScale  = this._pinchStartZoom * finalDist / this._pinchStartDist;
      this.ui.canvas.style.transform = '';
      this._pinchStartDist = null;
      this._pinchStartZoom = null;
      this._lastPinchDist  = null;
      this.applyZoom(newScale);
      return;
    }

    if (!this._drawing) return;
    if (e.pointerId !== this._activeDrawPointerId) return;
    this._drawing             = false;
    this._activeDrawPointerId = null;

    if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }

    const rect = this.ui.canvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / this.zoomScale;
    const endY = (e.clientY - rect.top)  / this.zoomScale;
    const col  = this.ui.shapeColor.value;
    const sw   = parseInt(this.ui.shapeWidth.value) || 2;
    const opts = { strokeColor: col, strokeWidth: sw };
    let shape  = null;

    if (this.mode === 'drawArrow') {
      const x = Math.min(this._drawStart.x, endX);
      const y = Math.min(this._drawStart.y, endY);
      const w = Math.abs(endX - this._drawStart.x);
      const h = Math.abs(endY - this._drawStart.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement('arrow', x, y, w, h, this.renderer.currentPage, {
        ...opts, x1: this._drawStart.x, y1: this._drawStart.y, x2: endX, y2: endY
      });

    } else if (this.mode === 'drawRect' || this.mode === 'drawEllipse') {
      const st = this.mode === 'drawRect' ? 'rect' : 'ellipse';
      const x = Math.min(this._drawStart.x, endX);
      const y = Math.min(this._drawStart.y, endY);
      const w = Math.abs(endX - this._drawStart.x);
      const h = Math.abs(endY - this._drawStart.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement(st, x, y, w, h, this.renderer.currentPage, opts);

    } else if (this.mode === 'drawFreehand') {
      this._drawPoints.push({ x: endX, y: endY });
      if (this._drawPoints.length < 2) { this._drawStart = null; this._drawPoints = []; return; }
      const xs = this._drawPoints.map(p => p.x);
      const ys = this._drawPoints.map(p => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement('freehand', x, y, w, h, this.renderer.currentPage,
        { ...opts, points: [...this._drawPoints] });
    }

    this._drawStart  = null;
    this._drawPoints = [];

    if (shape) {
      this.pushHistory();
      this.elements.push(shape);
      this._autosave();
      this.renderElements();
    }
  }

  _handleDrawPointerCancel(e) {
    this._pinchPointers.delete(e.pointerId);
    this._cancelDrawing();
    if (this._pinchPointers.size === 0) {
      this.ui.canvas.style.transform = '';
      this._pinchStartDist = null;
      this._pinchStartZoom = null;
      this._lastPinchDist  = null;
    }
  }

  _getPinchDist() {
    const pts = [...this._pinchPointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  openSignatureModal() {
    this.ui.signatureModal.classList.add('active');
    // Resize canvas intrinsic dimensions to match rendered width (must be after show).
    // offsetWidth forces layout flush so the value reflects the actual rendered size.
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

  selectElement(element) {
    if (this.selectedElement === element) {
      this._updateFormattingToolbar();
      return;
    }
    // Clean up all empty text elements (except any currently focused input)
    // whenever the user selects something or clicks away
    this._cleanEmptyTextElements();
    this.selectedElement = element;
    this.renderElements();
    this._updateFormattingToolbar();
  }

  _updateFormattingToolbar() {
    const el = this.selectedElement;
    const isText  = el?.type === 'text';
    const isShape = el?.type === 'shape';

    // Text controls
    this.ui.fontFamily.disabled     = !isText;
    this.ui.boldBtn.disabled        = !isText;
    this.ui.italicBtn.disabled      = !isText;
    this.ui.fontSizeInput.disabled  = !isText;
    this.ui.fontSizeDownBtn.disabled = !isText;
    this.ui.fontSizeUpBtn.disabled   = !isText;
    this.ui.textColorInput.disabled = !isText;
    if (isText) {
      this.ui.fontFamily.value = el.fontFamily || 'Arial';
      this.ui.boldBtn.classList.toggle('btn-active-fmt', !!el.bold);
      this.ui.italicBtn.classList.toggle('btn-active-fmt', !!el.italic);
      this.ui.fontSizeInput.value = el.fontSize;
      this.ui.textColorInput.value = el.color;
    } else {
      this.ui.boldBtn.classList.remove('btn-active-fmt');
      this.ui.italicBtn.classList.remove('btn-active-fmt');
    }

    // Shape controls: enabled when shape selected OR in active draw mode
    const shapeActive = isShape || this.mode.startsWith('draw');
    this.ui.shapeColor.disabled = !shapeActive;
    this.ui.shapeWidth.disabled = !shapeActive;
    if (isShape) {
      this.ui.shapeColor.value = el.strokeColor;
      this.ui.shapeWidth.value = el.strokeWidth;
    }
  }

  handleCanvasClick(e) {
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

  addTextAtPosition(e) {
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const options = {
      fontSize: parseInt(this.ui.fontSizeInput.value),
      color: this.ui.textColorInput.value
    };
    const textElement = new TextElement(x, y, this.renderer.currentPage, options);
    this.pushHistory();
    this.elements.push(textElement);
    this._autosave();
    this.renderElements();
    const inputEl = this.ui.container.querySelector(
      `[data-id='${textElement.id}'] input, [data-id='${textElement.id}'] textarea`
    );
    if (inputEl) inputEl.focus();
  }

  addSignatureAtPosition(e) {
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoomScale;
    const y = (e.clientY - rect.top) / this.zoomScale;
    const signatureElement = new SignatureElement(
      x, y,
      this.renderer.currentPage,
      this.currentSignature
    );
    this.pushHistory();
    this.elements.push(signatureElement);
    this._autosave();
    this.renderElements();
  }

  removeElement(id) {
    this.pushHistory();
    this.elements = this.elements.filter(el => el.id !== id);
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
          input.addEventListener('input', () => {
            clearTimeout(this._textChangeTimer);
            this._textChangeTimer = setTimeout(() => {
              this.pushHistory();
              this._autosave();
            }, 500);
          });
        }
      }
      this.ui.container.appendChild(div);
    });
  }

  async _goToPage(n) {
    if (!this.renderer.pdfDoc) return;
    const changed = await this.renderer.goToPage(n);
    if (changed) {
      this.selectElement(null);
      this.updatePageInfo();
      this.renderElements();
    } else {
      this.updatePageInfo(); // reset input if out of range
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
    this.ui.pageInput.value = info.current;
    this.ui.pageInput.max = info.total;
    this.ui.pageTotal.textContent = `/ ${info.total}`;
  }

  async applyZoom(newScale) {
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
    const { PDFDocument, rgb, StandardFonts } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
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
          if (element.type === 'text' && element.text) {
            const { r, g, b } = this.hexToRgbValues(element.color);
            const fontName = this._getStandardFont(
              element.fontFamily, element.bold, element.italic
            );
            const font = await pdfDoc.embedFont(StandardFonts[fontName]);
            page.drawText(element.text, {
              x: element.x,
              y: origVp.height - element.y - element.fontSize,
              size: element.fontSize,
              font,
              color: rgb(r, g, b)
            });
          } else if (element.type === 'signature') {
            const sigImage = await pdfDoc.embedPng(element.data);
            page.drawImage(sigImage, {
              x: element.x,
              y: origVp.height - element.y - element.height,
              width: element.width,
              height: element.height
            });
          } else if (element.type === 'shape') {
            const { r, g, b } = this.hexToRgbValues(element.strokeColor);
            const shapeColor = rgb(r, g, b);
            const lw = element.strokeWidth;

            switch (element.shapeType) {
              case 'rect':
                // Omitting `color` gives stroke-only (no fill) in pdf-lib
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
                  start: { x: element.x1, y: origVp.height - element.y1 },
                  end:   { x: element.x2, y: origVp.height - element.y2 },
                  thickness: lw,
                  color: shapeColor
                });
                // Two-line arrowhead (V-shape) at endpoint
                const headLen = Math.max(8, lw * 4);
                const pdfAngle = Math.atan2(
                  -(element.y2 - element.y1),
                   (element.x2 - element.x1)
                );
                const ex = element.x2;
                const ey = origVp.height - element.y2;
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
                if (element.points.length < 2) break;
                const pts = element.points;
                // Pass screen-y coords (y from top); set y:origVp.height so pdf-lib's
                // internal flip converts correctly to PDF space (y from bottom)
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
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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

  _getStandardFont(fontFamily, bold, italic) {
    const f = (fontFamily || 'Arial').toLowerCase();
    if (f.includes('times')) {
      if (bold && italic) return 'TimesRomanBoldItalic';
      if (bold)           return 'TimesRomanBold';
      if (italic)         return 'TimesRomanItalic';
      return 'TimesRoman';
    }
    if (f.includes('courier')) {
      if (bold && italic) return 'CourierBoldOblique';
      if (bold)           return 'CourierBold';
      if (italic)         return 'CourierOblique';
      return 'Courier';
    }
    // Arial / Helvetica (default)
    if (bold && italic) return 'HelveticaBoldOblique';
    if (bold)           return 'HelveticaBold';
    if (italic)         return 'HelveticaOblique';
    return 'Helvetica';
  }

  hexToRgbValues(hex) {
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

  importState(stateJSON) {
    const state = JSON.parse(stateJSON);
    this.elements = state.elements.map(data => {
      if (data.type === 'text') {
        const el = new TextElement(data.x, data.y, data.page, {
          width: data.width,
          height: data.height,
          fontSize: data.fontSize,
          color: data.color,
          fontFamily: data.fontFamily || 'Arial',
          bold: data.bold || false,
          italic: data.italic || false,
          multiline: data.multiline
        });
        el.text = data.text;
        return el;
      } else if (data.type === 'signature') {
        return new SignatureElement(
          data.x, data.y, data.page, data.data,
          { width: data.width, height: data.height }
        );
      } else if (data.type === 'shape') {
        return new ShapeElement(data.shapeType, data.x, data.y, data.width, data.height, data.page, {
          strokeColor: data.strokeColor,
          strokeWidth: data.strokeWidth,
          x1: data.x1, y1: data.y1,
          x2: data.x2, y2: data.y2,
          points: data.points || []
        });
      }
    }).filter(Boolean);
    this.renderElements();
  }
}
