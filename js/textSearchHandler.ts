export interface MatchResult {
  pageId: string;
  x: number; // scale=1 canvas coords
  y: number;
  width: number;
  height: number;
}

interface RawTextItem {
  str: string;
  transform: number[]; // [a,b,c,d,tx,ty] — tx/ty are baseline position in PDF user space
  width: number;       // advance width in PDF user space units
  height: number;      // approximate font height in PDF user space units
}

// Inline 2×3 affine transform — avoids relying on pdfjsLib.Util TS types
function applyTransform(p: [number, number], m: number[]): [number, number] {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

export class TextSearchHandler {
  // Cache raw text items per pageId (viewport-independent)
  private _cache = new Map<string, RawTextItem[]>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async buildIndex(page: any, pageId: string): Promise<void> {
    if (this._cache.has(pageId)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = content.items.filter((item: any) => typeof item.str === 'string' && item.str.length > 0) as RawTextItem[];
    this._cache.set(pageId, items);
  }

  /** Search the current page. Returns match positions in scale=1 canvas coordinates. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  search(query: string, pageId: string, viewport: any, currentScale: number): MatchResult[] {
    if (!query.trim()) return [];
    const items = this._cache.get(pageId);
    if (!items) return [];

    const q = query.toLowerCase();
    const results: MatchResult[] = [];
    const vt = viewport.transform as number[];

    for (const item of items) {
      if (!item.str.toLowerCase().includes(q)) continue;

      // Map baseline position from PDF user space to canvas pixel space
      const canvasPt = applyTransform([item.transform[4], item.transform[5]], vt);
      // Scale of viewport (absolute value to handle y-flip)
      const scaleInVp = Math.abs(vt[0]) || currentScale;

      // Approximate text box in canvas pixels (top-left origin):
      // baseline is at canvasPt[1]; text extends above baseline by ~85% of height
      const w = item.width * scaleInVp;
      const h = item.height * scaleInVp;
      const x = canvasPt[0];
      const y = canvasPt[1] - h * 0.9; // approx top of text

      results.push({
        pageId,
        x: x / currentScale,         // convert to scale=1
        y: y / currentScale,
        width: w / currentScale,
        height: h / currentScale,
      });
    }
    return results;
  }

  clearCache(): void {
    this._cache.clear();
  }

  invalidatePage(pageId: string): void {
    this._cache.delete(pageId);
  }
}
