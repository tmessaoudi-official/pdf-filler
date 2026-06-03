import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { DocumentModel } from './documentModel';

// Use Vite's ?url import to copy the worker to dist/ and get its hashed URL
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).href;

export class PDFRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Legacy compat: first loaded PDF doc (used for computeFitScale and initial state) */
  pdfDoc: PDFDocumentProxy | null = null;
  scale = 1.0;
  private isRendering = false;
  private pendingPage: { doc: PDFDocumentProxy; pageNum: number; userRotation: number } | null = null;
  private _pendingResolve: (() => void) | null = null;
  private _model: DocumentModel | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  setModel(model: DocumentModel): void {
    this._model = model;
  }

  get currentPage(): number {
    return (this._model?.currentPageIndex ?? 0) + 1;
  }

  get pageCount(): number {
    return this._model?.pageCount ?? (this.pdfDoc ? this.pdfDoc.numPages : 0);
  }

  setScale(scale: number): void {
    this.scale = Math.max(0.25, Math.min(3.0, scale));
  }

  computeFitScale(containerWidth: number): Promise<number> {
    const model = this._model;
    if (model?.currentPage) {
      const docPage = model.currentPage;
      const src = model.sourcePdfs.get(docPage.sourcePdfId);
      if (src) {
        return src.doc.getPage(docPage.sourcePageNum).then((page: PDFPageProxy) => {
          const effectiveRotation = (page.rotate + (docPage.rotation ?? 0)) % 360;
          const vp = page.getViewport({ scale: 1, rotation: effectiveRotation });
          return Math.max(0.25, (containerWidth - 40) / vp.width);
        });
      }
    }
    // Legacy fallback
    const doc = this.pdfDoc;
    if (!doc) return Promise.resolve(1.0);
    return doc.getPage(1).then((page: PDFPageProxy) => {
      const vp = page.getViewport({ scale: 1 });
      return Math.max(0.25, (containerWidth - 40) / vp.width);
    });
  }

  async loadPDF(fileData: ArrayBuffer): Promise<PDFDocumentProxy> {
    const typedArray = new Uint8Array(fileData);
    const doc = await pdfjsLib.getDocument(typedArray).promise;
    this.pdfDoc = doc;
    return doc;
  }

  /** Render the page at documentModel.currentPageIndex */
  async renderCurrentPage(): Promise<void> {
    const model = this._model;
    if (!model || !model.currentPage) return;
    const docPage = model.currentPage;
    const src = model.sourcePdfs.get(docPage.sourcePdfId);
    if (!src) return;
    await this._renderPdfPage(src.doc, docPage.sourcePageNum, docPage.rotation ?? 0);
  }

  async renderPageAtIndex(index: number): Promise<void> {
    const model = this._model;
    if (!model) {
      // Fallback for legacy call without model
      if (this.pdfDoc) await this._renderPdfPage(this.pdfDoc, index + 1);
      return;
    }
    const docPage = model.pages[index];
    if (!docPage) return;
    const src = model.sourcePdfs.get(docPage.sourcePdfId);
    if (!src) return;
    await this._renderPdfPage(src.doc, docPage.sourcePageNum, docPage.rotation ?? 0);
  }

  /** Render a specific page from a specific pdf.js document */
  private async _renderPdfPage(doc: PDFDocumentProxy, pageNum: number, userRotation = 0): Promise<void> {
    if (this.isRendering) {
      return new Promise<void>((resolve) => {
        this.pendingPage = { doc, pageNum, userRotation };
        this._pendingResolve = resolve;
      });
    }
    this.isRendering = true;
    const page = await doc.getPage(pageNum);
    const effectiveRotation = (page.rotate + userRotation) % 360;
    const viewport = page.getViewport({ scale: this.scale, rotation: effectiveRotation });
    this.canvas.height = viewport.height;
    this.canvas.width = viewport.width;
    await page.render({ canvasContext: this.ctx, viewport }).promise;
    this.isRendering = false;
    if (this.pendingPage !== null) {
      const { doc: pendingDoc, pageNum: pending, userRotation: pendingRot } = this.pendingPage;
      const pendingResolve = this._pendingResolve;
      this.pendingPage = null;
      this._pendingResolve = null;
      await this._renderPdfPage(pendingDoc, pending, pendingRot);
      if (pendingResolve) pendingResolve();
    }
  }

  /** Generate a thumbnail data URL for a page at a given document index */
  async generateThumbnail(docIndex: number, thumbScale = 0.15): Promise<string> {
    const model = this._model;
    if (!model) return '';
    const docPage = model.pages[docIndex];
    if (!docPage) return '';
    const src = model.sourcePdfs.get(docPage.sourcePdfId);
    if (!src) return '';

    const page = await src.doc.getPage(docPage.sourcePageNum);
    const effectiveRotation = (page.rotate + (docPage.rotation ?? 0)) % 360;
    const vp = page.getViewport({ scale: thumbScale, rotation: effectiveRotation });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  getPageInfo(): { current: number; total: number } {
    return {
      current: this.currentPage,
      total: this.pageCount,
    };
  }
}
