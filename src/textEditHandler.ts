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

    // Sample background color at the 4 corners of the text bounding box and pick
    // the lightest pixel (highest R+G+B sum). Sampling corners avoids hitting glyph
    // pixels (dark) that occur when sampling at the click point inside a character.
    let bgColor = '#ffffff';
    const offscreen = document.createElement('canvas');
    offscreen.width = 1; offscreen.height = 1;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (offCtx) {
      const s = app.zoomScale;
      const INSET = 2;
      const corners = [
        { x: Math.round(annX * s) + INSET,       y: Math.round(annY * s) + INSET },
        { x: Math.round((annX + w) * s) - INSET,  y: Math.round(annY * s) + INSET },
        { x: Math.round(annX * s) + INSET,       y: Math.round((annY + h) * s) - INSET },
        { x: Math.round((annX + w) * s) - INSET,  y: Math.round((annY + h) * s) - INSET },
      ];
      let bestBrightness = -1;
      let bestRgb = { r: 255, g: 255, b: 255 };
      for (const pt of corners) {
        offCtx.drawImage(app.ui.canvas, pt.x, pt.y, 1, 1, 0, 0, 1, 1);
        const d = offCtx.getImageData(0, 0, 1, 1).data;
        const brightness = d[0] + d[1] + d[2];
        if (brightness > bestBrightness) { bestBrightness = brightness; bestRgb = { r: d[0], g: d[1], b: d[2] }; }
      }
      bgColor = `#${bestRgb.r.toString(16).padStart(2, '0')}${bestRgb.g.toString(16).padStart(2, '0')}${bestRgb.b.toString(16).padStart(2, '0')}`;
    }

    // Detect font family from pdfjs styles and embedded font name heuristics
    const pdfjsFontFamily = styles[best.fontName]?.fontFamily ?? '';
    const ff = pdfjsFontFamily.toLowerCase();
    const fn = best.fontName.toLowerCase();
    let fontFamily = 'Arial';
    if (/times|roman/i.test(ff) || /times|roman/i.test(fn)) {
      fontFamily = 'Times New Roman';
    } else if (/courier|typewriter/i.test(ff) || /cour/i.test(fn)) {
      fontFamily = 'Courier New';
    } else if (/helvetica/i.test(ff) || /helv/i.test(fn)) {
      fontFamily = 'Helvetica';
    } else if (/georgia/i.test(ff) || /georgia/i.test(fn)) {
      fontFamily = 'Georgia';
    } else if (/\bmono\b/i.test(ff)) {
      fontFamily = 'Courier New';
    } else if (/\bserif\b/i.test(ff)) {
      fontFamily = 'Times New Roman';
    }

    // Font size from the affine transform matrix (handles rotation); clamp to valid range
    const detectedFontSize = Math.round(Math.hypot(best.transform[0], best.transform[1]));
    const fontSize = detectedFontSize >= 6 && detectedFontSize <= 144
      ? detectedFontSize
      : Math.max(8, Math.round(h * 0.82));

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
