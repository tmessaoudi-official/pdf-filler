import { PDFElement } from './pdfElement';

export class RedactionElement extends PDFElement {
  constructor(x: number, y: number, width: number, height: number, pageId: string) {
    super('redaction', x, y, width, height, pageId);
  }

  render(container: HTMLElement, canvasOffset: { left: number; top: number }, scale: number): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-element redaction-element';
    wrapper.dataset['id'] = String(this.id);
    Object.assign(wrapper.style, {
      position: 'absolute',
      left:       `${canvasOffset.left + this.x * scale}px`,
      top:        `${canvasOffset.top  + this.y * scale}px`,
      width:      `${this.width  * scale}px`,
      height:     `${this.height * scale}px`,
      background: '#000',
      border:     '2px dashed #c00',
      boxSizing:  'border-box',
      zIndex:     '15',
    });

    wrapper.appendChild(this.createControls());
    wrapper.appendChild(this.createResizeHandle());
    container.appendChild(wrapper);
    return wrapper;
  }
}
