// ShapeElement module — arrow, rect, ellipse, freehand
import { PDFElement } from './pdfElement.js?v=3';

export class ShapeElement extends PDFElement {
  constructor(shapeType, x, y, width, height, page, options = {}) {
    super('shape', x, y, width, height, page);
    this.shapeType = shapeType; // 'arrow' | 'rect' | 'ellipse' | 'freehand'
    this.strokeColor = options.strokeColor || '#ef4444';
    this.strokeWidth = options.strokeWidth || 2;
    // Arrow endpoints in PDF units
    this.x1 = options.x1 !== undefined ? options.x1 : x;
    this.y1 = options.y1 !== undefined ? options.y1 : y;
    this.x2 = options.x2 !== undefined ? options.x2 : x + width;
    this.y2 = options.y2 !== undefined ? options.y2 : y + height;
    // Freehand point array [{x, y}] in PDF units
    this.points = options.points || [];
  }

  render(container, canvasOffset, scale = 1) {
    const div = document.createElement('div');
    div.className = 'pdf-element shape-element';
    div.dataset.id = this.id;
    this.applyStyles(div, canvasOffset, scale);

    const w = Math.max(1, this.width * scale);
    const h = Math.max(1, this.height * scale);
    const sw = this.strokeWidth * scale;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.style.overflow = 'visible';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';

    switch (this.shapeType) {
      case 'rect':    this._renderRect(svg, w, h, sw);    break;
      case 'ellipse': this._renderEllipse(svg, w, h, sw); break;
      case 'arrow':   this._renderArrow(svg, scale, sw);  break;
      case 'freehand':this._renderFreehand(svg, scale, sw);break;
    }

    div.appendChild(svg);
    div.appendChild(this.createControls());
    div.appendChild(this.createResizeHandle());
    return div;
  }

  _renderRect(svg, w, h, sw) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    el.setAttribute('x', sw / 2);
    el.setAttribute('y', sw / 2);
    el.setAttribute('width', Math.max(1, w - sw));
    el.setAttribute('height', Math.max(1, h - sw));
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', this.strokeColor);
    el.setAttribute('stroke-width', sw);
    svg.appendChild(el);
  }

  _renderEllipse(svg, w, h, sw) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    el.setAttribute('cx', w / 2);
    el.setAttribute('cy', h / 2);
    el.setAttribute('rx', Math.max(1, w / 2 - sw / 2));
    el.setAttribute('ry', Math.max(1, h / 2 - sw / 2));
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', this.strokeColor);
    el.setAttribute('stroke-width', sw);
    svg.appendChild(el);
  }

  _renderArrow(svg, scale, sw) {
    // Endpoints relative to bounding box
    const x1s = (this.x1 - this.x) * scale;
    const y1s = (this.y1 - this.y) * scale;
    const x2s = (this.x2 - this.x) * scale;
    const y2s = (this.y2 - this.y) * scale;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1s); line.setAttribute('y1', y1s);
    line.setAttribute('x2', x2s); line.setAttribute('y2', y2s);
    line.setAttribute('stroke', this.strokeColor);
    line.setAttribute('stroke-width', sw);
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);

    // Arrowhead polygon at endpoint
    const headLen = Math.max(8, sw * 4);
    const angle = Math.atan2(y2s - y1s, x2s - x1s);
    const a1 = angle + Math.PI * 0.8;
    const a2 = angle - Math.PI * 0.8;
    const pts = [
      `${x2s},${y2s}`,
      `${x2s + headLen * Math.cos(a1)},${y2s + headLen * Math.sin(a1)}`,
      `${x2s + headLen * Math.cos(a2)},${y2s + headLen * Math.sin(a2)}`
    ].join(' ');
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    head.setAttribute('points', pts);
    head.setAttribute('fill', this.strokeColor);
    head.setAttribute('stroke', 'none');
    svg.appendChild(head);
  }

  _renderFreehand(svg, scale, sw) {
    if (this.points.length < 2) return;
    const pts = this.points
      .map(p => `${(p.x - this.x) * scale},${(p.y - this.y) * scale}`)
      .join(' ');
    const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pl.setAttribute('points', pts);
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', this.strokeColor);
    pl.setAttribute('stroke-width', sw);
    pl.setAttribute('stroke-linecap', 'round');
    pl.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(pl);
  }

  applyStyles(div, canvasOffset, scale = 1) {
    div.style.left   = (canvasOffset.left + this.x * scale) + 'px';
    div.style.top    = (canvasOffset.top  + this.y * scale) + 'px';
    div.style.width  = Math.max(1, this.width  * scale) + 'px';
    div.style.height = Math.max(1, this.height * scale) + 'px';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      shapeType:   this.shapeType,
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      x1: this.x1, y1: this.y1,
      x2: this.x2, y2: this.y2,
      points: this.points
    };
  }
}
