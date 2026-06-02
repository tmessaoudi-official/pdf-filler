export type ElementType = 'text' | 'signature' | 'shape' | 'image';

export interface ElementJSON {
  id: number;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  pageId: string;
  [key: string]: unknown;
}

export abstract class PDFElement {
  id: number;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  pageId: string;

  constructor(type: ElementType, x: number, y: number, width: number, height: number, pageId: string) {
    this.id = Date.now() + Math.random();
    this.type = type;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.pageId = pageId;
  }

  createControls(): HTMLDivElement {
    const controls = document.createElement('div');
    controls.className = 'element-controls';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'control-btn delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.app.removeElement(this.id);
    });
    controls.appendChild(deleteBtn);
    return controls;
  }

  createResizeHandle(): HTMLDivElement {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    return handle;
  }

  abstract render(container: HTMLElement, canvasOffset: { left: number; top: number }, scale: number): HTMLDivElement;

  toJSON(): ElementJSON {
    return { id: this.id, type: this.type, x: this.x, y: this.y, width: this.width, height: this.height, pageId: this.pageId };
  }
}

// Augment global Window so window.app is known
declare global {
  interface Window {
    app: import('./pdfEditorApp').PDFEditorApp;
  }
}
