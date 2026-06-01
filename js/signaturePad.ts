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
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.lineWidth = options.lineWidth ?? 2;
    this.color = options.color ?? '#000000';
    this.setupEvents();
  }

  private setupEvents(): void {
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseout', () => this.stopDrawing());
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY }));
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY }));
    });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.canvas.dispatchEvent(new MouseEvent('mouseup'));
    });
  }

  private startDrawing(e: MouseEvent): void {
    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.beginPath();
    this.ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  private draw(e: MouseEvent): void {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
  }

  private stopDrawing(): void { this.isDrawing = false; }

  clear(): void { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  getDataURL(): string { return this.canvas.toDataURL(); }
  setLineWidth(width: number): void { this.lineWidth = width; }
  setColor(color: string): void { this.color = color; }
}
