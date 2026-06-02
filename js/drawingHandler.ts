import type { PDFEditorApp } from './pdfEditorApp';
import { ShapeElement } from './shapeElement';
import { HighlightElement } from './highlightElement';
import { RedactionElement } from './redactionElement';
import { AddElementCmd } from './historyManager';

export class DrawingHandler {
  private _drawing = false;
  private _drawStart: { x: number; y: number } | null = null;
  private _drawPoints: Array<{ x: number; y: number }> = [];
  private _previewSvg: SVGSVGElement | null = null;
  private _activeDrawPointerId: number | null = null;
  private _pinchPointers: Map<number, { x: number; y: number }> = new Map();
  private _pinchStartDist: number | null = null;
  private _pinchStartZoom: number | null = null;
  private _lastPinchDist: number | null = null;

  constructor(private app: PDFEditorApp) {}

  cancel(): void {
    if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }
    this._drawing = false;
    this._drawStart = null;
    this._drawPoints = [];
    this._activeDrawPointerId = null;
  }

  handlePointerDown(e: PointerEvent): void {
    if (!this.app.renderer.pdfDoc) return;

    this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pinchPointers.size >= 2) {
      this.cancel();
      if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }
      this._pinchStartDist = this._getPinchDist();
      this._pinchStartZoom = this.app.zoomScale;
      this._lastPinchDist  = this._pinchStartDist;
      e.preventDefault();
      return;
    }

    if (!this.app.mode.startsWith('draw')) return;
    if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }

    const rect = this.app.ui.canvas.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom) return;

    const x = (e.clientX - rect.left) / this.app.zoomScale;
    const y = (e.clientY - rect.top)  / this.app.zoomScale;
    this._drawing             = true;
    this._activeDrawPointerId = e.pointerId;
    this._drawStart           = { x, y };
    this._drawPoints          = [{ x, y }];

    this._previewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this._previewSvg.id = 'drawPreview';
    Object.assign(this._previewSvg.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%',
      pointerEvents: 'none', overflow: 'visible', zIndex: '10'
    });
    this.app.ui.container.appendChild(this._previewSvg);
    e.preventDefault();
  }

  handlePointerMove(e: PointerEvent): void {
    if (this._pinchPointers.has(e.pointerId)) {
      this._pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this._pinchPointers.size >= 2 && this._pinchStartDist) {
      const dist = this._getPinchDist();
      this._lastPinchDist = dist;
      const ratio = dist / this._pinchStartDist;
      this.app.ui.canvas.style.transform = `scale(${ratio})`;
      this.app.ui.canvas.style.transformOrigin = 'center center';
      return;
    }

    if (!this._drawing || !this._drawStart) return;
    if (e.pointerId !== this._activeDrawPointerId) return;

    const rect = this.app.ui.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.app.zoomScale;
    const y = (e.clientY - rect.top)  / this.app.zoomScale;

    if (this.app.mode === 'drawFreehand') {
      const last = this._drawPoints[this._drawPoints.length - 1];
      const dist = Math.hypot((x - last.x) * this.app.zoomScale, (y - last.y) * this.app.zoomScale);
      if (dist > 3) this._drawPoints.push({ x, y });
    }
    this._updatePreview(x, y);
  }

  handlePointerUp(e: PointerEvent): void {
    this._pinchPointers.delete(e.pointerId);

    if (this._pinchStartDist !== null && this._pinchStartZoom !== null && this._pinchPointers.size < 2) {
      const finalDist = this._lastPinchDist || this._pinchStartDist;
      const newScale = this._pinchStartZoom * finalDist / this._pinchStartDist;
      this.app.ui.canvas.style.transform = '';
      this._pinchStartDist = null;
      this._pinchStartZoom = null;
      this._lastPinchDist  = null;
      this.app.applyZoom(newScale);
      return;
    }

    if (!this._drawing) return;
    if (e.pointerId !== this._activeDrawPointerId) return;
    this._drawing             = false;
    this._activeDrawPointerId = null;

    if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }

    const rect = this.app.ui.canvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / this.app.zoomScale;
    const endY = (e.clientY - rect.top)  / this.app.zoomScale;
    const col    = this.app.ui.shapeColor.value;
    const sw     = parseInt(this.app.ui.shapeWidth.value) || 2;
    const opts   = { strokeColor: col, strokeWidth: sw };
    const start  = this._drawStart;
    const pageId = this.app.documentModel.currentPage?.id ?? '';
    let shape: ShapeElement | null = null;

    if (!start || !pageId) { this._drawPoints = []; return; }

    if (this.app.mode === 'drawArrow') {
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement('arrow', x, y, w, h, pageId, {
        ...opts, x1: start.x, y1: start.y, x2: endX, y2: endY
      });

    } else if (this.app.mode === 'drawRect' || this.app.mode === 'drawEllipse') {
      const st = this.app.mode === 'drawRect' ? 'rect' : 'ellipse';
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement(st as 'rect' | 'ellipse', x, y, w, h, pageId, opts);

    } else if (this.app.mode === 'drawHighlight') {
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      const hlEl = new HighlightElement(x, y, w, h, pageId);
      this._drawStart = null;
      this._drawPoints = [];
      this.app.historyManager.execute(new AddElementCmd(this.app.elements, hlEl));
      this.app._autosave();
      this.app.renderElements();
      return;

    } else if (this.app.mode === 'drawFreehand') {
      this._drawPoints.push({ x: endX, y: endY });
      if (this._drawPoints.length < 2) { this._drawStart = null; this._drawPoints = []; return; }
      const xs = this._drawPoints.map(p => p.x);
      const ys = this._drawPoints.map(p => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement('freehand', x, y, w, h, pageId,
        { ...opts, points: [...this._drawPoints] });

    } else if (this.app.mode === 'drawRedaction') {
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      const redEl = new RedactionElement(x, y, w, h, pageId);
      this._drawStart = null;
      this._drawPoints = [];
      this.app.historyManager.execute(new AddElementCmd(this.app.elements, redEl));
      this.app._autosave();
      this.app.renderElements();
      return;
    }

    this._drawStart  = null;
    this._drawPoints = [];

    if (shape) {
      this.app.historyManager.execute(new AddElementCmd(this.app.elements, shape));
      this.app._autosave();
      this.app.renderElements();
    }
  }

  handlePointerCancel(e: PointerEvent): void {
    this._pinchPointers.delete(e.pointerId);
    this.cancel();
    if (this._pinchPointers.size === 0) {
      this.app.ui.canvas.style.transform = '';
      this._pinchStartDist = null;
      this._pinchStartZoom = null;
      this._lastPinchDist  = null;
    }
  }

  private _updatePreview(curX: number, curY: number): void {
    if (!this._previewSvg || !this._drawStart) return;
    while (this._previewSvg.firstChild) this._previewSvg.firstChild.remove();

    const s   = this.app.zoomScale;
    const ox  = this.app.ui.canvas.offsetLeft;
    const oy  = this.app.ui.canvas.offsetTop;
    const col = this.app.ui.shapeColor.value;
    const sw  = (parseInt(this.app.ui.shapeWidth.value) || 2) * s;

    const sx0 = this._drawStart.x * s + ox;
    const sy0 = this._drawStart.y * s + oy;
    const sxC = curX * s + ox;
    const syC = curY * s + oy;

    const ns = 'http://www.w3.org/2000/svg';

    if (this.app.mode === 'drawRect') {
      const el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', String(Math.min(sx0, sxC)));
      el.setAttribute('y', String(Math.min(sy0, syC)));
      el.setAttribute('width', String(Math.abs(sxC - sx0)));
      el.setAttribute('height', String(Math.abs(syC - sy0)));
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', col);
      el.setAttribute('stroke-width', String(sw));
      this._previewSvg.appendChild(el);

    } else if (this.app.mode === 'drawEllipse') {
      const el = document.createElementNS(ns, 'ellipse');
      el.setAttribute('cx', String((sx0 + sxC) / 2));
      el.setAttribute('cy', String((sy0 + syC) / 2));
      el.setAttribute('rx', String(Math.abs(sxC - sx0) / 2));
      el.setAttribute('ry', String(Math.abs(syC - sy0) / 2));
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', col);
      el.setAttribute('stroke-width', String(sw));
      this._previewSvg.appendChild(el);

    } else if (this.app.mode === 'drawArrow') {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', String(sx0)); line.setAttribute('y1', String(sy0));
      line.setAttribute('x2', String(sxC)); line.setAttribute('y2', String(syC));
      line.setAttribute('stroke', col);
      line.setAttribute('stroke-width', String(sw));
      line.setAttribute('stroke-linecap', 'round');
      this._previewSvg.appendChild(line);

      const headLen = Math.max(8, sw * 4);
      const angle = Math.atan2(syC - sy0, sxC - sx0);
      const pts = [
        `${sxC},${syC}`,
        `${sxC + headLen * Math.cos(angle + Math.PI * 0.8)},${syC + headLen * Math.sin(angle + Math.PI * 0.8)}`,
        `${sxC + headLen * Math.cos(angle - Math.PI * 0.8)},${syC + headLen * Math.sin(angle - Math.PI * 0.8)}`,
      ].join(' ');
      const head = document.createElementNS(ns, 'polygon');
      head.setAttribute('points', pts);
      head.setAttribute('fill', col);
      head.setAttribute('stroke', 'none');
      this._previewSvg.appendChild(head);

    } else if (this.app.mode === 'drawHighlight') {
      const el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', String(Math.min(sx0, sxC)));
      el.setAttribute('y', String(Math.min(sy0, syC)));
      el.setAttribute('width', String(Math.abs(sxC - sx0)));
      el.setAttribute('height', String(Math.abs(syC - sy0)));
      el.setAttribute('fill', 'rgba(255,220,0,0.35)');
      el.setAttribute('stroke', '#e5a000');
      el.setAttribute('stroke-width', '1');
      this._previewSvg.appendChild(el);

    } else if (this.app.mode === 'drawFreehand') {
      if (this._drawPoints.length < 2) return;
      const pts = this._drawPoints.map(p => `${p.x * s + ox},${p.y * s + oy}`).join(' ');
      const pl = document.createElementNS(ns, 'polyline');
      pl.setAttribute('points', pts);
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke', col);
      pl.setAttribute('stroke-width', String(sw));
      pl.setAttribute('stroke-linecap', 'round');
      pl.setAttribute('stroke-linejoin', 'round');
      this._previewSvg.appendChild(pl);

    } else if (this.app.mode === 'drawRedaction') {
      const el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', String(Math.min(sx0, sxC)));
      el.setAttribute('y', String(Math.min(sy0, syC)));
      el.setAttribute('width', String(Math.abs(sxC - sx0)));
      el.setAttribute('height', String(Math.abs(syC - sy0)));
      el.setAttribute('fill', 'rgba(0,0,0,0.8)');
      el.setAttribute('stroke', '#c00');
      el.setAttribute('stroke-width', '2');
      el.setAttribute('stroke-dasharray', '6,3');
      this._previewSvg.appendChild(el);
    }
  }

  private _getPinchDist(): number {
    const pts = [...this._pinchPointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }
}
