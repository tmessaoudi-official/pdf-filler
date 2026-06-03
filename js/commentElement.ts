import { PDFElement } from './pdfElement';
import type { ElementJSON } from './pdfElement';

export interface CommentOptions {
  color?: string;
  text?: string;
}

export class CommentElement extends PDFElement {
  color: string;
  text: string;

  constructor(x: number, y: number, pageId: string, opts: CommentOptions = {}) {
    super('comment', x, y, 200, 120, pageId);
    this.color = opts.color ?? '#FFFDE7';
    this.text  = opts.text  ?? '';
  }

  render(container: HTMLElement, canvasOffset: { left: number; top: number }, scale: number): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-element comment-element';
    wrapper.dataset['id'] = String(this.id);
    Object.assign(wrapper.style, {
      position: 'absolute',
      left:   `${canvasOffset.left + this.x * scale}px`,
      top:    `${canvasOffset.top  + this.y * scale}px`,
      width:  `${this.width  * scale}px`,
      height: `${this.height * scale}px`,
      background: this.color,
      border: '1px solid #ccc',
      borderRadius: '4px',
      boxShadow: '2px 2px 6px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
      zIndex: '20',
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      background: 'rgba(0,0,0,0.12)',
      padding: '2px 4px',
      fontSize: '10px',
      cursor: 'move',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    });
    const label = document.createElement('span');
    label.textContent = '💬 Note';
    label.style.flex = '1';
    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.title = 'Delete';
    Object.assign(delBtn.style, {
      background: 'none', border: 'none', cursor: 'pointer',
      color: 'rgba(0,0,0,0.5)', fontWeight: 'bold', fontSize: '13px',
      lineHeight: '1', padding: '0 2px', flexShrink: '0',
    });
    delBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      delBtn.dispatchEvent(new CustomEvent<{ id: number }>('element:delete', {
        bubbles: true, composed: true, detail: { id: this.id },
      }));
    });
    header.appendChild(label);
    header.appendChild(delBtn);

    const textarea = document.createElement('textarea');
    Object.assign(textarea.style, {
      flex: '1',
      border: 'none',
      background: 'transparent',
      padding: '4px',
      fontSize: `${Math.round(11 * scale)}px`,
      resize: 'none',
      outline: 'none',
      fontFamily: 'sans-serif',
    });
    textarea.value = this.text;
    textarea.placeholder = 'Add a note…';
    textarea.addEventListener('input', () => {
      this.text = textarea.value;
      textarea.dispatchEvent(
        new CustomEvent('element:autosave', { bubbles: true, composed: true })
      );
    });
    textarea.addEventListener('click', e => e.stopPropagation());

    wrapper.appendChild(header);
    wrapper.appendChild(textarea);
    wrapper.appendChild(this.createResizeHandle());
    container.appendChild(wrapper);
    return wrapper;
  }

  toJSON(): ElementJSON {
    return { ...super.toJSON(), color: this.color, text: this.text };
  }
}
