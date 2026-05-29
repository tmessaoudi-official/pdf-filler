// SignaturePad module
export class SignaturePad {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isDrawing = false;
    this.lineWidth = options.lineWidth || 2;
    this.color = options.color || '#000000';
    this.setupEvents();
  }
  setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseout', () => this.stopDrawing());
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.canvas.dispatchEvent(new MouseEvent('mouseup'));
    });
  }
  startDrawing(e) {
    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.beginPath();
    this.ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }
  draw(e) {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
  }
  stopDrawing() {
    this.isDrawing = false;
  }
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  getDataURL() {
    return this.canvas.toDataURL();
  }
  setLineWidth(width) {
    this.lineWidth = width;
  }
  setColor(color) {
    this.color = color;
  }
}
