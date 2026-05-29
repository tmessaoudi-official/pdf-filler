// PDFEditorApp module
import { PDFRenderer } from './pdfRenderer.js?v=2';
import { TextElement } from './textElement.js?v=2';
import { SignatureElement } from './signatureElement.js?v=2';
import { SignaturePad } from './signaturePad.js?v=2';
import { InteractionHandler } from './interactionHandler.js?v=2';

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
    this.currentSignature = null;
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
      toast: document.getElementById('toast')
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
    document.addEventListener('mousemove', (e) => {
      this.interactionHandler.handleMouseMove(e);
    });
    document.addEventListener('mouseup', () => {
      this.interactionHandler.handleMouseUp();
    });
    this.ui.zoomInBtn.addEventListener('click', () =>
      this.applyZoom(this.zoomScale + 0.1));
    this.ui.zoomOutBtn.addEventListener('click', () =>
      this.applyZoom(this.zoomScale - 0.1));
    this.ui.fitBtn.addEventListener('click', () => this.fitToWidth());
    this.ui.undoBtn.addEventListener('click', () => this.undo());
    this.ui.redoBtn.addEventListener('click', () => this.redo());

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

    document.addEventListener('keydown', (e) => {
      // Escape always works — cancel mode and deselect
      if (e.key === 'Escape') {
        this.setMode('select');
        this.selectElement(null);
        return;
      }

      // All other shortcuts blocked when typing in an input/textarea/select
      if (e.target.matches('input, textarea, select')) return;

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

  _autosave() {}

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
      await this.applyZoom(fitScale);
      this.enableUI();
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
  }

  setMode(mode) {
    this.mode = mode;
    this.ui.addTextBtn.classList.toggle('active', mode === 'addText');
    this.ui.addSignatureBtn.classList.toggle('active', mode === 'addSignature');
    if (mode === 'addSignature') {
      this.openSignatureModal();
    }
  }

  openSignatureModal() {
    this.signaturePad.clear();
    this.ui.signatureModal.classList.add('active');
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
    this.selectedElement = element;
    this.renderElements();
    this._updateFormattingToolbar();
  }

  _updateFormattingToolbar() {
    const el = this.selectedElement;
    const isText = el && el.type === 'text';
    this.ui.fontFamily.disabled = !isText;
    this.ui.boldBtn.disabled = !isText;
    this.ui.italicBtn.disabled = !isText;
    this.ui.fontSizeInput.disabled = !isText;
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
  }

  handleCanvasClick(e) {
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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const options = {
      fontSize: parseInt(this.ui.fontSizeInput.value),
      color: this.ui.textColorInput.value
    };
    const textElement = new TextElement(x, y, this.renderer.currentPage, options);
    this.pushHistory();
    this.elements.push(textElement);
    this.renderElements();
  }

  addSignatureAtPosition(e) {
    const rect = this.ui.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const signatureElement = new SignatureElement(
      x, y,
      this.renderer.currentPage,
      this.currentSignature
    );
    this.pushHistory();
    this.elements.push(signatureElement);
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
      const div = element.render(this.ui.container, canvasOffset);
      if (this.selectedElement && this.selectedElement.id === element.id) {
        div.classList.add('selected');
      }
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectElement(element);
      });
      div.addEventListener('mousedown', (e) => {
        this.interactionHandler.handleMouseDown(e, element, div);
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
    const { PDFDocument, rgb } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
    const pdfDoc = await PDFDocument.create();
    const s = this.renderer.scale;

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
            page.drawText(element.text, {
              x: element.x / s,
              y: origVp.height - element.y / s - element.fontSize / s,
              size: element.fontSize / s,
              color: rgb(r, g, b)
            });
          } else if (element.type === 'signature') {
            const sigImage = await pdfDoc.embedPng(element.data);
            page.drawImage(sigImage, {
              x: element.x / s,
              y: origVp.height - element.y / s - element.height / s,
              width: element.width / s,
              height: element.height / s
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'filled-signed-' + Date.now() + '.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      this.ui.container.style.opacity = '1';
      await this.renderer.renderPage(this.renderer.currentPage);
      this.renderElements();
    }
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
      }
    }).filter(Boolean);
    this.renderElements();
  }
}
