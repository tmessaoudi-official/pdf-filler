import type { PDFEditorApp } from './pdfEditorApp';
import type { PDFElement } from './pdfElement';
import type { ShapeElement } from './shapeElement';
import { MoveResizeCmd } from './historyManager';

interface PendingTouchDrag {
  element: PDFElement;
  div: HTMLDivElement;
  offsetX: number;
  offsetY: number;
  startClientX: number;
  startClientY: number;
  pointerId: number;
}

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
  private _pendingTouchDrag: PendingTouchDrag | null = null;
  private static readonly _DRAG_THRESHOLD = 5;

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
    } else if ((e.target as HTMLElement).matches('input, textarea') && e.pointerType === 'touch') {
      // On touch, defer drag start until movement threshold so tap-to-edit still works
      const divRect = div.getBoundingClientRect();
      this._pendingTouchDrag = {
        element, div,
        offsetX: e.clientX - divRect.left,
        offsetY: e.clientY - divRect.top,
        startClientX: e.clientX,
        startClientY: e.clientY,
        pointerId: e.pointerId
      };
    } else if (!(e.target as HTMLElement).matches('input, textarea')) {
      this.startDrag(e, element, div);
    }
  }

  private _commitTouchDrag(e: PointerEvent): void {
    const p = this._pendingTouchDrag;
    if (!p) return;
    this.isDragging = true;
    this.currentElement = p.element;
    this._activePointerId = p.pointerId;
    this._beforeState = this._captureState(p.element);
    this.offsetX = p.offsetX;
    this.offsetY = p.offsetY;
    p.div.setPointerCapture(p.pointerId);
    this._pendingTouchDrag = null;
    this.drag(e);
  }

  private startDrag(e: PointerEvent, element: PDFElement, div: HTMLDivElement): void {
    this.isDragging = true;
    this.currentElement = element;
    this._activePointerId = e.pointerId;
    this._beforeState = this._captureState(element);
    const divRect = div.getBoundingClientRect();
    this.offsetX = e.clientX - divRect.left;
    this.offsetY = e.clientY - divRect.top;
    div.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  private startResize(e: PointerEvent, element: PDFElement): void {
    this.isResizing = true;
    this.currentElement = element;
    this._activePointerId = e.pointerId;
    this._beforeState = this._captureState(element);
    this.startX = e.clientX; this.startY = e.clientY;
    this.startWidth = element.width; this.startHeight = element.height;
    (e.target as Element).setPointerCapture(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  }

  handlePointerMove(e: PointerEvent): void {
    if (this._pendingTouchDrag && e.pointerId === this._pendingTouchDrag.pointerId) {
      const dx = e.clientX - this._pendingTouchDrag.startClientX;
      const dy = e.clientY - this._pendingTouchDrag.startClientY;
      if (Math.hypot(dx, dy) > InteractionHandler._DRAG_THRESHOLD) this._commitTouchDrag(e);
      return;
    }
    if (e.pointerId !== this._activePointerId) return;
    if (this.isDragging && this.currentElement) this.drag(e);
    else if (this.isResizing && this.currentElement) this.resize(e);
  }

  private drag(e: PointerEvent): void {
    const el = this.currentElement;
    if (!el) return;
    const canvas = this.app.renderer.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const scale = this.app.zoomScale;
    const newX = (e.clientX - canvasRect.left - this.offsetX) / scale;
    const newY = (e.clientY - canvasRect.top - this.offsetY) / scale;
    const maxX = (canvas.width / scale) - el.width;
    const maxY = (canvas.height / scale) - el.height;
    const clampedX = Math.max(0, Math.min(maxX, newX));
    const clampedY = Math.max(0, Math.min(maxY, newY));
    const dx = clampedX - el.x;
    const dy = clampedY - el.y;
    el.x = clampedX;
    el.y = clampedY;

    const shape = el as ShapeElement;
    if (shape.type === 'shape') {
      if (shape.shapeType === 'arrow') {
        shape.x1 += dx; shape.y1 += dy; shape.x2 += dx; shape.y2 += dy;
      } else if (shape.shapeType === 'freehand') {
        shape.points = shape.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      }
    }
    this.app.renderElements();
  }

  private resize(e: PointerEvent): void {
    const el = this.currentElement;
    if (!el) return;
    const canvas = this.app.renderer.canvas;
    const scale = this.app.zoomScale;
    const deltaX = (e.clientX - this.startX) / scale;
    const deltaY = (e.clientY - this.startY) / scale;
    const newWidth  = Math.max(50, this.startWidth  + deltaX);
    const newHeight = Math.max(20, this.startHeight + deltaY);
    const maxW = (canvas.width  / scale) - el.x;
    const maxH = (canvas.height / scale) - el.y;
    el.width  = Math.min(newWidth,  maxW);
    el.height = Math.min(newHeight, maxH);
    this.app.renderElements();
  }

  handlePointerUp(e: PointerEvent): void {
    if (this._pendingTouchDrag && e.pointerId === this._pendingTouchDrag.pointerId) {
      this._pendingTouchDrag = null;
      return;
    }
    if (e.pointerId !== this._activePointerId) return;
    this._finish();
  }

  handlePointerCancel(e: PointerEvent): void {
    if (this._pendingTouchDrag && e.pointerId === this._pendingTouchDrag.pointerId) {
      this._pendingTouchDrag = null;
      return;
    }
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
        this.app.historyManager.record(new MoveResizeCmd(this.app.elements, movedEl, before, after));
        this.app._autosave();
      }
    }
  }
}
