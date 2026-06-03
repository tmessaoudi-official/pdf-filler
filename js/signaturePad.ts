export interface SignaturePadOptions {
  lineWidth?: number;
  color?: string;
}

export class SignaturePad {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing = false;
  lineWidth: number;
  color: string;

  constructor(canvas: HTMLCanvasElement, options: SignaturePadOptions = {}) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.lineWidth = options.lineWidth ?? 2;
    this.color     = options.color     ?? '#000000';
    this._setupEvents();
  }

  private _setupEvents(): void {
    this.canvas.addEventListener('pointerdown',   (e) => this._startDrawing(e));
    this.canvas.addEventListener('pointermove',   (e) => this._draw(e));
    this.canvas.addEventListener('pointerup',     ()  => this._stopDrawing());
    this.canvas.addEventListener('pointercancel', ()  => this._stopDrawing());
    this.canvas.addEventListener('pointerleave',  ()  => this._stopDrawing());
  }

  private _startDrawing(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.buttons !== 1) return;
    this.isDrawing = true;
    this.canvas.setPointerCapture(e.pointerId);
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.beginPath();
    this.ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    e.preventDefault();
  }

  private _draw(e: PointerEvent): void {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth   = this.lineWidth;
    this.ctx.lineCap     = 'round';
    this.ctx.lineJoin    = 'round';
    this.ctx.stroke();
    e.preventDefault();
  }

  private _stopDrawing(): void { this.isDrawing = false; }

  clear():                    void   { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  getDataURL():               string { return this.canvas.toDataURL(); }
  setLineWidth(w: number):    void   { this.lineWidth = w; }
  setColor(c: string):        void   { this.color = c; }
}
