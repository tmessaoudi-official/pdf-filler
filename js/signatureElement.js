// SignatureElement module
import { PDFElement } from './pdfElement.js?v=11';
export class SignatureElement extends PDFElement {
  constructor(x, y, page, signatureData, options = {}) {
    super('signature', x, y,
            options.width || 200,
            options.height || 80,
            page);
    this.data = signatureData;
  }
  render(container, canvasOffset, scale = 1) {
    const div = document.createElement('div');
    div.className = 'pdf-element signature-element';
    div.dataset.id = this.id;
    this.applyStyles(div, canvasOffset, scale);
    div.style.backgroundImage = `url(${this.data})`;
    div.style.backgroundSize = 'contain';
    div.style.backgroundRepeat = 'no-repeat';
    div.style.backgroundPosition = 'center';
    const controls = this.createControls();
    const resizeHandle = this.createResizeHandle();
    div.appendChild(controls);
    div.appendChild(resizeHandle);
    return div;
  }
  applyStyles(div, canvasOffset, scale = 1) {
    div.style.left = (canvasOffset.left + this.x * scale) + 'px';
    div.style.top = (canvasOffset.top + this.y * scale) + 'px';
    div.style.width = (this.width * scale) + 'px';
    div.style.height = (this.height * scale) + 'px';
  }
  toJSON() {
    return {
      ...super.toJSON(),
      data: this.data
    };
  }
}
