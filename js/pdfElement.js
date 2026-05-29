// PDFElement base class
export class PDFElement {
  constructor(type, x, y, width, height, page) {
    this.id = Date.now() + Math.random();
    this.type = type;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.page = page;
  }
  createControls() {
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

  createResizeHandle() {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    return handle;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      page: this.page
    };
  }
}
