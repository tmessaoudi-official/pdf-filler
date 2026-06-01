// TextElement module
import { PDFElement } from './pdfElement.js?v=11';

export class TextElement extends PDFElement {
  constructor(x, y, page, options = {}) {
    super('text', x, y,
      options.width || 200,
      options.height || 30,
      page);
    this.text = '';
    this.fontSize = options.fontSize || 14;
    this.color = options.color || '#000000';
    this.fontFamily = options.fontFamily || 'Arial';
    this.bold = options.bold || false;
    this.italic = options.italic || false;
    this.multiline = options.multiline || false;
  }

  render(container, canvasOffset, scale = 1) {
    const div = document.createElement('div');
    div.className = 'pdf-element text-element';
    div.dataset.id = this.id;
    this.applyStyles(div, canvasOffset, scale);

    const input = this.multiline
      ? document.createElement('textarea')
      : document.createElement('input');
    if (!this.multiline) input.type = 'text';
    input.value = this.text;
    this._applyInputFormatting(input, scale);
    input.addEventListener('input', (e) => { this.text = e.target.value; });

    const controls = this.createControls();
    const resizeHandle = this.createResizeHandle();
    div.appendChild(input);
    div.appendChild(controls);
    div.appendChild(resizeHandle);
    return div;
  }

  _applyInputFormatting(input, scale = 1) {
    input.style.fontSize = (this.fontSize * scale) + 'px';
    input.style.color = this.color;
    input.style.fontFamily = this.fontFamily;
    input.style.fontWeight = this.bold ? 'bold' : 'normal';
    input.style.fontStyle = this.italic ? 'italic' : 'normal';
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
      text: this.text,
      fontSize: this.fontSize,
      color: this.color,
      fontFamily: this.fontFamily,
      bold: this.bold,
      italic: this.italic,
      multiline: this.multiline
    };
  }
}
