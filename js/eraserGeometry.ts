export type Point = { x: number; y: number };
export type Bbox  = { x: number; y: number; w: number; h: number };

export function segmentsIntersect(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
): { intersects: boolean; t?: number; point?: Point } {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return { intersects: false }; // parallel

  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      intersects: true,
      t,
      point: { x: a1.x + t * dx1, y: a1.y + t * dy1 },
    };
  }
  return { intersects: false };
}

export function bboxIntersectsPolyline(bbox: Bbox, polyline: Point[]): boolean {
  if (polyline.length < 2) return false;
  const { x, y, w, h } = bbox;
  const edges: [Point, Point][] = [
    [{x, y},     {x: x+w, y}    ],
    [{x: x+w, y},{x: x+w, y: y+h}],
    [{x: x+w, y: y+h},{x, y: y+h}],
    [{x, y: y+h},{x, y}          ],
  ];
  for (let i = 0; i < polyline.length - 1; i++) {
    for (const [e1, e2] of edges) {
      if (segmentsIntersect(polyline[i], polyline[i+1], e1, e2).intersects) return true;
    }
  }
  return polyline.some(p => p.x >= x && p.x <= x+w && p.y >= y && p.y <= y+h);
}

export function splitFreehandAtErase(
  strokePoints: Point[],
  erasePoints:  Point[],
): Point[][] {
  if (strokePoints.length < 2 || erasePoints.length < 2) return [strokePoints];

  type Crossing = { tStroke: number; point: Point };
  const crossings: Crossing[] = [];

  for (let i = 0; i < strokePoints.length - 1; i++) {
    const a1 = strokePoints[i], a2 = strokePoints[i + 1];
    for (let j = 0; j < erasePoints.length - 1; j++) {
      const b1 = erasePoints[j], b2 = erasePoints[j + 1];
      const r = segmentsIntersect(a1, a2, b1, b2);
      if (r.intersects && r.point) {
        crossings.push({ tStroke: i + (r.t ?? 0), point: r.point });
      }
    }
  }

  if (crossings.length === 0) return [strokePoints];

  const augmented: Array<Point & { isCrossing?: boolean }> = [];
  const crossingSet = new Set<number>();

  let ci = 0;
  const sorted = crossings.slice().sort((a, b) => a.tStroke - b.tStroke);
  for (let i = 0; i < strokePoints.length - 1; i++) {
    augmented.push(strokePoints[i]);
    while (ci < sorted.length && Math.floor(sorted[ci].tStroke) === i) {
      const idx = augmented.length;
      augmented.push({ ...sorted[ci].point, isCrossing: true });
      crossingSet.add(idx);
      ci++;
    }
  }
  augmented.push(strokePoints[strokePoints.length - 1]);

  const segments: Point[][] = [];
  let current: Point[] = [];
  for (let k = 0; k < augmented.length; k++) {
    current.push({ x: augmented[k].x, y: augmented[k].y });
    if (crossingSet.has(k) && k > 0) {
      if (current.length >= 2) segments.push(current);
      current = [{ x: augmented[k].x, y: augmented[k].y }];
    }
  }
  if (current.length >= 2) segments.push(current);

  if (segments.length <= 1) return segments;
  const eraseBbox = _polylineBbox(erasePoints);
  const surviving = segments.filter(seg => {
    // Use centroid to avoid false-positive matches at the crossing boundary itself.
    const cx = seg.reduce((s, p) => s + p.x, 0) / seg.length;
    const cy = seg.reduce((s, p) => s + p.y, 0) / seg.length;
    return !_pointInBbox({ x: cx, y: cy }, eraseBbox);
  });

  return surviving.length > 0 ? surviving : [strokePoints];
}

function _polylineBbox(pts: Point[]): Bbox {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function _pointInBbox(p: Point, bb: Bbox): boolean {
  return p.x >= bb.x && p.x <= bb.x + bb.w && p.y >= bb.y && p.y <= bb.y + bb.h;
}
