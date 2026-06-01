import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Use Vite's ?url import to copy the worker to dist/ and get its hashed URL
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).href;

export class PDFRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pdfDoc: PDFDocumentProxy | null = null;
  currentPage = 1;
  scale = 1.0;
  private isRendering = false;
  private pendingPage: number | null = null;
  private _pendingResolve: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  get pageCount(): number {
    return this.pdfDoc ? this.pdfDoc.numPages : 0;
  }

  setScale(scale: number): void {
    this.scale = Math.max(0.25, Math.min(3.0, scale));
  }

  computeFitScale(containerWidth: number): Promise<number> {
    if (!this.pdfDoc) return Promise.resolve(1.0);
    return this.pdfDoc.getPage(this.currentPage).then((page: PDFPageProxy) => {
      const vp = page.getViewport({ scale: 1 });
      const availableWidth = containerWidth - 40;
      return Math.max(0.25, availableWidth / vp.width);
    });
  }

  async loadPDF(fileData: ArrayBuffer): Promise<void> {
    const typedArray = new Uint8Array(fileData);
    this.pdfDoc = await pdfjsLib.getDocument(typedArray).promise;
    this.currentPage = 1;
    await this.renderPage(this.currentPage);
  }

  async renderPage(pageNum: number): Promise<void> {
    if (this.isRendering) {
      return new Promise<void>((resolve) => {
        this.pendingPage = pageNum;
        this._pendingResolve = resolve;
      });
    }
    if (!this.pdfDoc) return;
    this.isRendering = true;
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });
    this.canvas.height = viewport.height;
    this.canvas.width = viewport.width;
    await page.render({ canvasContext: this.ctx, viewport }).promise;
    this.isRendering = false;
    if (this.pendingPage !== null) {
      const pending = this.pendingPage;
      const pendingResolve = this._pendingResolve;
      this.pendingPage = null;
      this._pendingResolve = null;
      await this.renderPage(pending);
      if (pendingResolve) pendingResolve();
    }
  }

  async nextPage(): Promise<boolean> {
    if (this.pdfDoc && this.currentPage < this.pdfDoc.numPages) {
      this.currentPage++;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  async prevPage(): Promise<boolean> {
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  async goToPage(pageNum: number): Promise<boolean> {
    if (!this.pdfDoc) return false;
    const n = Math.max(1, Math.min(this.pdfDoc.numPages, pageNum));
    if (n !== this.currentPage) {
      this.currentPage = n;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  getPageInfo(): { current: number; total: number } {
    return {
      current: this.currentPage,
      total: this.pdfDoc ? this.pdfDoc.numPages : 0,
    };
  }
}
