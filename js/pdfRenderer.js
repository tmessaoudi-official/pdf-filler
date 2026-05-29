// PDFRenderer module
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export class PDFRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pdfDoc = null;
    this.currentPage = 1;
    this.scale = 1.0;
    this.isRendering = false;
    this.pendingPage = null;
  }

  setScale(scale) {
    this.scale = Math.max(0.25, Math.min(3.0, scale));
  }

  computeFitScale(containerWidth) {
    if (!this.pdfDoc) return Promise.resolve(1.0);
    return this.pdfDoc.getPage(this.currentPage).then(page => {
      const vp = page.getViewport({ scale: 1 });
      const availableWidth = containerWidth - 40; // 20px padding each side
      return Math.max(0.25, availableWidth / vp.width);
    });
  }

  async loadPDF(fileData) {
    const typedArray = new Uint8Array(fileData);
    this.pdfDoc = await pdfjsLib.getDocument(typedArray).promise;
    this.currentPage = 1;
    await this.renderPage(this.currentPage);
  }

  async renderPage(pageNum) {
    if (this.isRendering) {
      this.pendingPage = pageNum;
      return;
    }
    this.isRendering = true;
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });
    this.canvas.height = viewport.height;
    this.canvas.width = viewport.width;
    await page.render({ canvasContext: this.ctx, viewport }).promise;
    this.isRendering = false;
    if (this.pendingPage !== null) {
      const pending = this.pendingPage;
      this.pendingPage = null;
      await this.renderPage(pending);
    }
  }

  async nextPage() {
    if (this.currentPage < this.pdfDoc.numPages) {
      this.currentPage++;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  async prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  async goToPage(pageNum) {
    const n = Math.max(1, Math.min(this.pdfDoc.numPages, pageNum));
    if (n !== this.currentPage) {
      this.currentPage = n;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  getPageInfo() {
    return {
      current: this.currentPage,
      total: this.pdfDoc ? this.pdfDoc.numPages : 0
    };
  }
}
