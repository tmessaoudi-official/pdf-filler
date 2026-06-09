import { RedactionElement } from './redactionElement';
import { TextElement } from './textElement';
import { AddElementCmd, MacroCmd } from './historyManager';
import type { PDFEditorApp } from './pdfEditorApp';

export class TextEditHandler {
  async handleCanvasClick(e: MouseEvent, app: PDFEditorApp): Promise<void> {
    const docPage = app.documentModel.currentPage;
    if (!docPage) return;
    const src = app.documentModel.sourcePdfs.get(docPage.sourcePdfId);
    if (!src) return;

    const rect = app.ui.canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) / app.zoomScale;
    const canvasY = (e.clientY - rect.top)  / app.zoomScale;

    const userRot = docPage.rotation ?? 0;
    const page = await src.doc.getPage(docPage.sourcePageNum);
    const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + userRot) % 360 });
    const pageH = viewport.height;

    // Convert canvas coords (top-left origin) → PDF coords (bottom-left origin)
    const pdfX = canvasX;
    const pdfY = pageH - canvasY;

    const content = await page.getTextContent();
    const items = content.items as { str: string; transform: number[]; width: number; height: number; fontName: string }[];
    const styles = content.styles as Record<string, { fontFamily: string }>;

    const TOLERANCE = 12;
    let best: (typeof items)[0] | null = null;
    let bestDist = Infinity;

    for (const it of items) {
      if (!it.str.trim()) continue;
      const tx = it.transform[4];
      const ty = it.transform[5];
      const w  = Math.max(Math.abs(it.width),  20);
      const h  = Math.max(Math.abs(it.height), 8);

      if (
        pdfX >= tx - TOLERANCE && pdfX <= tx + w + TOLERANCE &&
        pdfY >= ty - TOLERANCE && pdfY <= ty + h + TOLERANCE
      ) {
        const dist = Math.hypot(pdfX - (tx + w / 2), pdfY - (ty + h / 2));
        if (dist < bestDist) { bestDist = dist; best = it; }
      }
    }

    if (!best) return;

    const tx = best.transform[4];
    const ty = best.transform[5];
    const w  = Math.max(Math.abs(best.width),  40);
    const h  = Math.max(Math.abs(best.height), 10);

    // Canvas-space position: top-left origin
    const annX = tx;
    const annY = pageH - ty - h;

    const pageId = docPage.id;

    // Sample canvas background color at click position.
    // Use an offscreen 1×1 canvas with willReadFrequently so we don't trigger the
    // browser warning on the main pdfjs-owned canvas context.
    let bgColor = '#ffffff';
    const offscreen = document.createElement('canvas');
    offscreen.width = 1; offscreen.height = 1;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (offCtx) {
      const px = Math.round(e.clientX - rect.left);
      const py = Math.round(e.clientY - rect.top);
      offCtx.drawImage(app.ui.canvas, px, py, 1, 1, 0, 0, 1, 1);
      const d = offCtx.getImageData(0, 0, 1, 1).data;
      bgColor = `#${d[0].toString(16).padStart(2, '0')}${d[1].toString(16).padStart(2, '0')}${d[2].toString(16).padStart(2, '0')}`;
    }

    // Detect font family from pdfjs styles
    const pdfjsFontFamily = styles[best.fontName]?.fontFamily ?? '';
    let fontFamily = 'Arial';
    if (/times|serif/i.test(pdfjsFontFamily) || /times/i.test(best.fontName)) {
      fontFamily = 'Times New Roman';
    } else if (/courier|mono/i.test(pdfjsFontFamily) || /courier/i.test(best.fontName)) {
      fontFamily = 'Courier New';
    }

    // Font size from the affine transform matrix (handles rotation)
    const detectedFontSize = Math.round(Math.hypot(best.transform[0], best.transform[1]));
    const fontSize = Math.max(8, detectedFontSize || Math.round(h * 0.82));

    // Bold / italic from fontName heuristics
    const bold   = /bold/i.test(best.fontName);
    const italic = /italic|oblique/i.test(best.fontName);

    // Cover-up layer: background-color-sampled rectangle to hide original text on export
    const cover = new RedactionElement(annX - 2, annY - 2, w + 4, h + 4, pageId, bgColor);

    // Editable text annotation on top, pre-filled with original text + matched font
    const textEl = new TextElement(annX, annY, pageId, {
      width: w + 4,
      height: h + 4,
      fontSize,
      color: '#000000',
      fontFamily,
      bold,
      italic,
    });
    textEl.text = best.str;

    app.historyManager.execute(new MacroCmd([
      new AddElementCmd(app.elements, cover),
      new AddElementCmd(app.elements, textEl),
    ]));
    app._autosave();
    app.setMode('select');
    app.selectElement(textEl);

    // Focus the textarea immediately so the user can start editing
    const freshInput = app.ui.container.querySelector(
      `[data-id='${textEl.id}'] input, [data-id='${textEl.id}'] textarea`
    ) as HTMLElement | null;
    freshInput?.focus();
  }
}
