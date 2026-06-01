import type { PDFEditorApp } from './pdfEditorApp';
import type { PDFElement } from './pdfElement';
import type { ShapeElement } from './shapeElement';
import { MoveResizeCmd } from './historyManager';

export class InteractionHandler {
  private app: PDFEditorApp;
  isDragging = false;
  isResizing = false;
  currentElement: PDFElement | null = null;
  private _activePointerId: number | null = null;
  private offsetX = 0;
  private offsetY = 0;
  private startX = 0;
  private startY = 0;
  private startWidth = 0;
  private startHeight = 0;
  private _beforeState: Record<string, unknown> | null = null;

  constructor(app: PDFEditorApp) {
    this.app = app;
  }

  private _captureState(el: PDFElement): Record<string, unknown> {
    const base = { x: el.x, y: el.y, width: el.width, height: el.height };
    if (el.type === 'shape') {
      const s = el as ShapeElement;
      if (s.shapeType === 'arrow') {
        return { ...base, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
      }
      if (s.shapeType === 'freehand') {
        return { ...base, points: s.points.map(p => ({ ...p })) };
      }
    }
    return base;
  }

  handlePointerDown(e: PointerEvent, element: PDFElement, div: HTMLDivElement): void {
    if ((e.target as HTMLElement).classList.contains('control-btn')) return;
    if ((e.target as HTMLElement).classList.contains('resize-handle')) {
      this.startResize(e, element);
    } else if (!(e.target as HTMLElement).matches('input, textarea')) {
      this.startDrag(e, element, div);
    }
  }

  private startDrag(e: PointerEvent, element: PDFElement, div: HTMLDivElement): void {
    this.isDragging = true;
    this.currentElement = element;
    this._activePointerId = e.pointerId;
    this._beforeState = this._captureState(element);
    const divRect = div.getBoundingClientRect();
    this.offsetX = e.clientX - divRect.left;
    this.offsetY = e.clientY - divRect.top;
    e.preventDefault();
  }

  private startResize(e: PointerEvent, element: PDFElement): void {
    this.isResizing = true;
    this.currentElement = element;
    this._activePointerId = e.pointerId;
    this._beforeState = this._captureState(element);
    this.startX = e.clientX; this.startY = e.clientY;
    this.startWidth = element.width; this.startHeight = element.height;
    e.preventDefault(); e.stopPropagation();
  }

  handlePointerMove(e: PointerEvent): void {
    if (e.pointerId !== this._activePointerId) return;
    if (this.isDragging && this.currentElement) this.drag(e);
    else if (this.isResizing && this.currentElement) this.resize(e);
  }

  private drag(e: PointerEvent): void {
    const canvas = this.app.renderer.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const scale = this.app.zoomScale;
    const newX = (e.clientX - canvasRect.left - this.offsetX) / scale;
    const newY = (e.clientY - canvasRect.top - this.offsetY) / scale;
    const maxX = (canvas.width / scale) - this.currentElement!.width;
    const maxY = (canvas.height / scale) - this.currentElement!.height;
    const clampedX = Math.max(0, Math.min(maxX, newX));
    const clampedY = Math.max(0, Math.min(maxY, newY));
    const dx = clampedX - this.currentElement!.x;
    const dy = clampedY - this.currentElement!.y;
    this.currentElement!.x = clampedX;
    this.currentElement!.y = clampedY;

    const el = this.currentElement as ShapeElement;
    if (el.type === 'shape') {
      if (el.shapeType === 'arrow') {
        el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy;
      } else if (el.shapeType === 'freehand') {
        el.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      }
    }
    this.app.renderElements();
  }

  private resize(e: PointerEvent): void {
    const canvas = this.app.renderer.canvas;
    const scale = this.app.zoomScale;
    const deltaX = (e.clientX - this.startX) / scale;
    const deltaY = (e.clientY - this.startY) / scale;
    const newWidth  = Math.max(50, this.startWidth  + deltaX);
    const newHeight = Math.max(20, this.startHeight + deltaY);
    const maxW = (canvas.width  / scale) - this.currentElement!.x;
    const maxH = (canvas.height / scale) - this.currentElement!.y;
    this.currentElement!.width  = Math.min(newWidth,  maxW);
    this.currentElement!.height = Math.min(newHeight, maxH);
    this.app.renderElements();
  }

  handlePointerUp(e: PointerEvent): void {
    if (e.pointerId !== this._activePointerId) return;
    this._finish();
  }

  handlePointerCancel(e: PointerEvent): void {
    if (e.pointerId !== this._activePointerId) return;
    this._finish();
  }

  private _finish(): void {
    const wasDragging = this.isDragging;
    const wasResizing = this.isResizing;
    const movedEl = this.currentElement;
    const before = this._beforeState;
    this.isDragging = false; this.isResizing = false;
    this.currentElement = null; this._activePointerId = null;
    this._beforeState = null;

    if (movedEl && (wasDragging || wasResizing) && before) {
      const after = this._captureState(movedEl);
      const moved = (after['x'] !== before['x']) || (after['y'] !== before['y']);
      const resized = wasResizing && ((after['width'] !== before['width']) || (after['height'] !== before['height']));
      if (moved || resized) {
        this.app.historyManager.record(new MoveResizeCmd(movedEl, before, after));
        this.app._autosave();
      }
    }
  }
}
