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
  private static readonly MAX_CACHE_SIZE = 20;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async buildIndex(page: any, pageId: string): Promise<void> {
    if (this._cache.has(pageId)) {
      // LRU promotion: move to end of Map insertion order
      const items = this._cache.get(pageId)!;
      this._cache.delete(pageId);
      this._cache.set(pageId, items);
      return;
    }
    // Evict oldest entry if at capacity
    if (this._cache.size >= TextSearchHandler.MAX_CACHE_SIZE) {
      const oldestKey = this._cache.keys().next().value as string;
      this._cache.delete(oldestKey);
    }
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
      // Map baseline position from PDF user space to canvas pixel space
      const canvasPt = applyTransform([item.transform[4], item.transform[5]], vt);
      // Scale of viewport (absolute value to handle y-flip)
      const scaleInVp = Math.hypot(vt[0], vt[1]) || currentScale;

      const itemStr  = item.str;
      const matchIdx = itemStr.toLowerCase().indexOf(q);
      if (matchIdx === -1) continue;

      const totalW   = item.width * scaleInVp;
      const charW    = totalW / (itemStr.length || 1);
      const matchX   = canvasPt[0] + matchIdx * charW;
      const matchW   = Math.max(charW, q.length * charW);
      const h        = item.height * scaleInVp;
      const y        = canvasPt[1] - h * 0.9;

      results.push({
        pageId,
        x:      matchX / currentScale,
        y:      y      / currentScale,
        width:  matchW / currentScale,
        height: h      / currentScale,
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
