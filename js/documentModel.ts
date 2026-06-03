import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface SourcePdf {
  id: string;
  doc: PDFDocumentProxy;
  bytes: Uint8Array;
  name: string;
  pageCount: number;
}

export interface DocumentPage {
  id: string;
  sourcePdfId: string;
  sourcePageNum: number; // 1-indexed within source PDF
  rotation?: number;     // CCW degrees applied by user (0/90/180/270); defaults to 0
}

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  opacity: number;
  angle: number;
  color: string;
  fontSize: number;
}

export class DocumentModel {
  sourcePdfs: Map<string, SourcePdf> = new Map();
  pages: DocumentPage[] = [];
  currentPageIndex = 0;
  watermark: WatermarkSettings = {
    enabled: false,
    text: 'WATERMARK',
    opacity: 0.25,
    angle: -45,
    color: '#888888',
    fontSize: 60,
  };

  get currentPage(): DocumentPage | null {
    return this.pages[this.currentPageIndex] ?? null;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  addSourcePdf(doc: PDFDocumentProxy, bytes: Uint8Array, name: string): SourcePdf {
    const id = `src_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const src: SourcePdf = { id, doc, bytes, name, pageCount: doc.numPages };
    this.sourcePdfs.set(id, src);
    return src;
  }

  addPagesFrom(sourcePdfId: string, pageNums?: number[]): DocumentPage[] {
    const src = this.sourcePdfs.get(sourcePdfId);
    if (!src) return [];
    const nums = pageNums ?? Array.from({ length: src.pageCount }, (_, i) => i + 1);
    const newPages = nums.map(n => ({
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2)}_${n}`,
      sourcePdfId,
      sourcePageNum: n,
    }));
    this.pages.push(...newPages);
    return newPages;
  }

  deletePage(pageId: string): DocumentPage | null {
    const idx = this.pages.findIndex(p => p.id === pageId);
    if (idx === -1) return null;
    const [removed] = this.pages.splice(idx, 1);
    // Clamp currentPageIndex
    if (this.currentPageIndex >= this.pages.length) {
      this.currentPageIndex = Math.max(0, this.pages.length - 1);
    }
    // GC sourcePdf if no pages reference it anymore
    this._gcSourcePdf(removed.sourcePdfId);
    return removed;
  }

  restorePage(page: DocumentPage, atIndex: number): void {
    // Ensure source is still present (caller must restore it if needed)
    this.pages.splice(atIndex, 0, page);
  }

  reorderPages(newOrder: string[]): void {
    const map = new Map(this.pages.map(p => [p.id, p]));
    // Keep only entries in newOrder that exist in current pages
    const reordered = newOrder.map(id => map.get(id)).filter(Boolean) as DocumentPage[];
    // Ensure all current pages are present in result
    const reorderedIds = new Set(reordered.map(p => p.id));
    const allPresent = this.pages.every(p => reorderedIds.has(p.id));
    if (!allPresent || reordered.length !== this.pages.length) return;
    const currentId = this.currentPage?.id;
    this.pages = reordered;
    if (currentId) {
      const newIdx = this.pages.findIndex(p => p.id === currentId);
      this.currentPageIndex = newIdx >= 0 ? newIdx : 0;
    }
  }

  private _gcSourcePdf(sourcePdfId: string): void {
    const stillUsed = this.pages.some(p => p.sourcePdfId === sourcePdfId);
    if (!stillUsed) this.sourcePdfs.delete(sourcePdfId);
  }

  toJSON(): object {
    return {
      pages: this.pages,
      watermark: this.watermark,
      currentPageIndex: this.currentPageIndex,
    };
  }
}
