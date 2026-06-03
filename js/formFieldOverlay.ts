import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';

export class FormFieldOverlay {
  private _inputs: HTMLInputElement[] = [];
  private _container: HTMLElement;

  constructor(container: HTMLElement) {
    this._container = container;
  }

  async render(
    page: PDFPageProxy,
    viewport: PageViewport,
    canvasOffset: { left: number; top: number },
    values: Record<string, string>,
    onValueChange: (fieldName: string, value: string) => void,
  ): Promise<{ unsupportedCount: number }> {
    this.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const annotations: any[] = await page.getAnnotations();
    const fields = annotations.filter(a => a.subtype === 'Widget' && a.fieldType === 'Tx');
    const unsupported = annotations.filter(
      (a: any) => a.subtype === 'Widget' && a.fieldType !== 'Tx'
    );

    for (const field of fields) {
      const vr: number[] = viewport.convertToViewportRectangle(field.rect as number[]);
      const left = Math.min(vr[0], vr[2]);
      const top  = Math.min(vr[1], vr[3]);
      const w    = Math.abs(vr[2] - vr[0]);
      const h    = Math.abs(vr[3] - vr[1]);
      if (w < 2 || h < 2) continue;

      const name: string = (field.fieldName as string) ?? '';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-field-overlay';
      input.value = values[name] ?? ((field.fieldValue as string) ?? '');
      if (field.alternativeText) input.placeholder = field.alternativeText as string;
      Object.assign(input.style, {
        position: 'absolute',
        left:   `${canvasOffset.left + left}px`,
        top:    `${canvasOffset.top  + top}px`,
        width:  `${w}px`,
        height: `${h}px`,
      });

      const capturedName = name;
      input.addEventListener('input', () => onValueChange(capturedName, input.value));
      this._container.appendChild(input);
      this._inputs.push(input);
    }
    return { unsupportedCount: unsupported.length };
  }

  clear(): void {
    this._inputs.forEach(i => i.remove());
    this._inputs = [];
  }

  setPointerEvents(enabled: boolean): void {
    const pe = enabled ? 'auto' : 'none';
    this._inputs.forEach(i => { i.style.pointerEvents = pe; });
  }
}
