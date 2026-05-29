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
    this._preActionSnapshot = null;
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
    this._preActionSnapshot = this.app._snapshotElements();
    const divRect = div.getBoundingClientRect();
    this.offsetX = e.clientX - divRect.left;
    this.offsetY = e.clientY - divRect.top;
    e.preventDefault();
  }

  startResize(e, element) {
    this.isResizing = true;
    this.currentElement = element;
    this._preActionSnapshot = this.app._snapshotElements();
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
    const scale = this.app.zoomScale;
    const newX = (e.clientX - canvasRect.left - this.offsetX) / scale;
    const newY = (e.clientY - canvasRect.top - this.offsetY) / scale;
    const maxX = (canvas.width / scale) - this.currentElement.width;
    const maxY = (canvas.height / scale) - this.currentElement.height;
    const clampedX = Math.max(0, Math.min(maxX, newX));
    const clampedY = Math.max(0, Math.min(maxY, newY));
    const dx = clampedX - this.currentElement.x;
    const dy = clampedY - this.currentElement.y;
    this.currentElement.x = clampedX;
    this.currentElement.y = clampedY;
    if (this.currentElement.type === 'shape') {
      if (this.currentElement.shapeType === 'arrow') {
        this.currentElement.x1 += dx;
        this.currentElement.y1 += dy;
        this.currentElement.x2 += dx;
        this.currentElement.y2 += dy;
      } else if (this.currentElement.shapeType === 'freehand') {
        this.currentElement.points = this.currentElement.points.map(p => ({
          x: p.x + dx, y: p.y + dy
        }));
      }
    }
    this.app.renderElements();
  }

  resize(e) {
    const canvas = this.app.renderer.canvas;
    const scale = this.app.zoomScale;
    const deltaX = (e.clientX - this.startX) / scale;
    const deltaY = (e.clientY - this.startY) / scale;
    const newWidth = Math.max(50, this.startWidth + deltaX);
    const newHeight = Math.max(20, this.startHeight + deltaY);
    const maxW = (canvas.width / scale) - this.currentElement.x;
    const maxH = (canvas.height / scale) - this.currentElement.y;
    this.currentElement.width = Math.min(newWidth, maxW);
    this.currentElement.height = Math.min(newHeight, maxH);
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
      if ((movedX || movedY || resized) && this._preActionSnapshot) {
        this.app.historyStack.push(this._preActionSnapshot);
        if (this.app.historyStack.length > 50) this.app.historyStack.shift();
        this.app.redoStack = [];
        this.app._updateUndoRedoBtns();
        this.app._autosave();
      }
    }
    this._preActionSnapshot = null;
  }
}
