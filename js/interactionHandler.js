// InteractionHandler module
export class InteractionHandler {
  constructor(app) {
    this.app = app;
    this.isDragging = false;
    this.isResizing = false;
    this.currentElement = null;
    this.offsetX = 0;
    this.offsetY = 0;
    this.startX = 0;
    this.startY = 0;
    this.startWidth = 0;
    this.startHeight = 0;
    this._startElementX = 0;
    this._startElementY = 0;
  }

  handleMouseDown(e, element, div) {
    if (e.target.classList.contains('control-btn')) return;
    if (e.target.classList.contains('resize-handle')) {
      this._startElementX = element.x;
      this._startElementY = element.y;
      this.startResize(e, element);
    } else if (!e.target.matches('input, textarea')) {
      this._startElementX = element.x;
      this._startElementY = element.y;
      this.startDrag(e, element, div);
    }
  }

  startDrag(e, element, div) {
    this.isDragging = true;
    this.currentElement = element;
    const divRect = div.getBoundingClientRect();
    this.offsetX = e.clientX - divRect.left;
    this.offsetY = e.clientY - divRect.top;
    e.preventDefault();
  }

  startResize(e, element) {
    this.isResizing = true;
    this.currentElement = element;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startWidth = element.width;
    this.startHeight = element.height;
    e.preventDefault();
    e.stopPropagation();
  }

  handleMouseMove(e) {
    if (this.isDragging && this.currentElement) this.drag(e);
    else if (this.isResizing && this.currentElement) this.resize(e);
  }

  drag(e) {
    const canvas = this.app.renderer.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const newX = e.clientX - canvasRect.left - this.offsetX;
    const newY = e.clientY - canvasRect.top - this.offsetY;
    this.currentElement.x = Math.max(0, Math.min(canvas.width - this.currentElement.width, newX));
    this.currentElement.y = Math.max(0, Math.min(canvas.height - this.currentElement.height, newY));
    this.app.renderElements();
  }

  resize(e) {
    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;
    const newWidth = Math.max(50, this.startWidth + deltaX);
    const newHeight = Math.max(20, this.startHeight + deltaY);
    const canvas = this.app.renderer.canvas;
    this.currentElement.width = Math.min(newWidth, canvas.width - this.currentElement.x);
    this.currentElement.height = Math.min(newHeight, canvas.height - this.currentElement.y);
    this.app.renderElements();
  }

  handleMouseUp() {
    const wasDragging = this.isDragging;
    const wasResizing = this.isResizing;
    const movedEl = this.currentElement;

    this.isDragging = false;
    this.isResizing = false;
    this.currentElement = null;

    if (movedEl && (wasDragging || wasResizing)) {
      const movedX = movedEl.x !== this._startElementX;
      const movedY = movedEl.y !== this._startElementY;
      const resized = wasResizing && (movedEl.width !== this.startWidth || movedEl.height !== this.startHeight);
      if (movedX || movedY || resized) {
        this.app.pushHistory();
        this.app._autosave();
      }
    }
  }
}
