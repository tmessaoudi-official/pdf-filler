import type { PDFRenderer } from './pdfRenderer';
import type { DocumentModel } from './documentModel';

export class PageThumbnailPanel {
  private container: HTMLElement;
  private strip: HTMLElement;
  private renderer: PDFRenderer;
  private model: DocumentModel;
  private onNavigate: (index: number) => void;
  private onDelete: (pageId: string) => void;
  private onReorder: (newOrder: string[]) => void;
  private onRotate: (pageId: string, delta: number) => void;
  private onAddPdf: () => void;
  private _dragSrcIndex: number | null = null;
  private _thumbCache: Map<string, string> = new Map(); // pageId → dataURL

  constructor(opts: {
    container: HTMLElement;
    renderer: PDFRenderer;
    model: DocumentModel;
    onNavigate: (index: number) => void;
    onDelete: (pageId: string) => void;
    onReorder: (newOrder: string[]) => void;
    onRotate: (pageId: string, delta: number) => void;
    onAddPdf: () => void;
  }) {
    this.container = opts.container;
    this.renderer = opts.renderer;
    this.model = opts.model;
    this.onNavigate = opts.onNavigate;
    this.onDelete = opts.onDelete;
    this.onReorder = opts.onReorder;
    this.onRotate = opts.onRotate;
    this.onAddPdf = opts.onAddPdf;

    this.strip = document.createElement('div');
    this.strip.className = 'page-thumb-strip';
    this.container.appendChild(this.strip);
  }

  async render(): Promise<void> {
    this.strip.innerHTML = '';
    const pages = this.model.pages;
    const current = this.model.currentPageIndex;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const item = document.createElement('div');
      item.className = 'thumb-item' + (i === current ? ' thumb-active' : '');
      item.dataset.index = String(i);
      item.dataset.pageId = page.id;
      item.draggable = true;

      // Thumbnail image
      const img = document.createElement('img');
      img.className = 'thumb-img';
      img.alt = `Page ${i + 1}`;

      if (this._thumbCache.has(page.id)) {
        img.src = this._thumbCache.get(page.id) ?? '';
      } else {
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // blank placeholder
        // Lazy-generate
        this.renderer.generateThumbnail(i).then(url => {
          if (url) {
            this._thumbCache.set(page.id, url);
            img.src = url;
          }
        });
      }

      // Page number label
      const label = document.createElement('span');
      label.className = 'thumb-label';
      label.textContent = String(i + 1);

      // Delete button
      const del = document.createElement('button');
      del.className = 'thumb-delete';
      del.textContent = '×';
      del.title = 'Delete page';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pages.length <= 1) return; // don't delete last page
        this.onDelete(page.id);
      });

      // Rotate CCW (↺) and CW (↻) buttons
      const rotateCcw = document.createElement('button');
      rotateCcw.className = 'thumb-rotate thumb-rotate-ccw';
      rotateCcw.textContent = '↺';
      rotateCcw.title = 'Rotate CCW';
      rotateCcw.addEventListener('click', (e) => { e.stopPropagation(); this.onRotate(page.id, 90); });

      const rotateCw = document.createElement('button');
      rotateCw.className = 'thumb-rotate thumb-rotate-cw';
      rotateCw.textContent = '↻';
      rotateCw.title = 'Rotate CW';
      rotateCw.addEventListener('click', (e) => { e.stopPropagation(); this.onRotate(page.id, -90); });

      // Per-page download button (Feature B: split PDF)
      const dlBtn = document.createElement('button');
      dlBtn.className = 'thumb-dl';
      dlBtn.textContent = '⬇';
      dlBtn.title = `Download page ${i + 1}`;
      dlBtn.addEventListener('click', (e) => { e.stopPropagation(); window.app.downloadPage(i); });

      item.appendChild(img);
      item.appendChild(label);
      item.appendChild(rotateCcw);
      item.appendChild(rotateCw);
      item.appendChild(dlBtn);
      item.appendChild(del);

      // Navigate on click
      item.addEventListener('click', () => this.onNavigate(i));

      // Drag-and-drop reorder
      item.addEventListener('dragstart', (e) => {
        this._dragSrcIndex = i;
        item.classList.add('thumb-dragging');
        e.dataTransfer?.setData('text/plain', String(i));
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('thumb-dragging');
        this._dragSrcIndex = null;
        this.strip.querySelectorAll('.thumb-item').forEach(el => el.classList.remove('thumb-over'));
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this._dragSrcIndex !== null && this._dragSrcIndex !== i) {
          item.classList.add('thumb-over');
        }
      });
      item.addEventListener('dragleave', () => item.classList.remove('thumb-over'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('thumb-over');
        if (this._dragSrcIndex === null || this._dragSrcIndex === i) return;
        const newOrder = [...this.model.pages.map(p => p.id)];
        const [moved] = newOrder.splice(this._dragSrcIndex, 1);
        newOrder.splice(i, 0, moved);
        this.onReorder(newOrder);
      });

      this.strip.appendChild(item);
    }

    // "Add PDF" button at the end
    const addBtn = document.createElement('button');
    addBtn.className = 'thumb-add-btn';
    addBtn.title = 'Add pages from PDF';
    addBtn.innerHTML = '<span>+</span><span class="thumb-add-label">Add PDF</span>';
    addBtn.addEventListener('click', this.onAddPdf);
    this.strip.appendChild(addBtn);
  }

  /** Invalidate thumbnail cache for a page (call after page content changes) */
  invalidateThumb(pageId: string): void {
    this._thumbCache.delete(pageId);
  }

  /** Invalidate all thumbnails (call after zoom/source changes) */
  invalidateAll(): void {
    this._thumbCache.clear();
  }

  updateActive(): void {
    const current = this.model.currentPageIndex;
    this.strip.querySelectorAll('.thumb-item').forEach((el, i) => {
      el.classList.toggle('thumb-active', i === current);
    });
  }
}
