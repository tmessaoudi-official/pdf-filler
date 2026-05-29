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

    this.ui.container.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      this.applyZoom(this.zoomScale + (e.deltaY < 0 ? 0.05 : -0.05));
    }, { passive: false });
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

  handleCanvasClick(e) {
    if (this.mode === 'addText') {
      this.addTextAtPosition(e);
      this.setMode('select');
    } else if (this.mode === 'addSignature' && this.currentSignature) {
      this.addSignatureAtPosition(e);
      this.mode = 'select';
      this.ui.addSignatureBtn.classList.remove('active');
      this.currentSignature = null;
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
    this.elements.push(signatureElement);
    this.renderElements();
  }

  removeElement(id) {
    this.elements = this.elements.filter(el => el.id !== id);
    this.renderElements();
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
      div.addEventListener('mousedown', (e) => {
        this.interactionHandler.handleMouseDown(e, element, div);
      });
      this.ui.container.appendChild(div);
    });
  }

  async prevPage() {
    const changed = await this.renderer.prevPage();
    if (changed) {
      this.updatePageInfo();
      this.renderElements();
    }
  }

  async nextPage() {
    const changed = await this.renderer.nextPage();
    if (changed) {
      this.updatePageInfo();
      this.renderElements();
    }
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
    });
    this.renderElements();
  }
}
