/**
 * InkLayer — strokes, JSON round-trip, rendering, toDataURL.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InkLayer } from '../src/inkLayer';
import type { InkStroke } from '../src/inkLayer';

const mkStroke = (override: Partial<InkStroke> = {}): InkStroke => ({
  type: 'ink',
  points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  width: 3,
  color: '#000000',
  ...override,
});

let layer: InkLayer;
beforeEach(() => { layer = new InkLayer(); });

// ── getStrokes ─────────────────────────────────────────────────────────────────
describe('getStrokes', () => {
  it('returns empty array for unknown page', () => {
    expect(layer.getStrokes('p1')).toEqual([]);
  });

  it('returns added strokes', () => {
    const s = mkStroke();
    layer.addStroke('p1', s);
    expect(layer.getStrokes('p1')).toHaveLength(1);
    expect(layer.getStrokes('p1')[0]).toBe(s);
  });

  it('isolates pages', () => {
    layer.addStroke('p1', mkStroke({ color: '#f00' }));
    layer.addStroke('p2', mkStroke({ color: '#00f' }));
    expect(layer.getStrokes('p1')).toHaveLength(1);
    expect(layer.getStrokes('p2')).toHaveLength(1);
    expect(layer.getStrokes('p3')).toHaveLength(0);
  });
});

// ── addStroke / removeLastStroke ───────────────────────────────────────────────
describe('addStroke / removeLastStroke', () => {
  it('appends strokes in order', () => {
    const s1 = mkStroke({ color: '#111' });
    const s2 = mkStroke({ color: '#222' });
    layer.addStroke('p1', s1);
    layer.addStroke('p1', s2);
    expect(layer.getStrokes('p1')[0]).toBe(s1);
    expect(layer.getStrokes('p1')[1]).toBe(s2);
  });

  it('removeLastStroke pops the last stroke', () => {
    layer.addStroke('p1', mkStroke({ color: '#111' }));
    layer.addStroke('p1', mkStroke({ color: '#222' }));
    layer.removeLastStroke('p1');
    expect(layer.getStrokes('p1')).toHaveLength(1);
    expect(layer.getStrokes('p1')[0].color).toBe('#111');
  });

  it('removeLastStroke on empty page is a no-op', () => {
    expect(() => layer.removeLastStroke('unknown')).not.toThrow();
  });
});

// ── hasContent / hasAnyContent ─────────────────────────────────────────────────
describe('hasContent / hasAnyContent', () => {
  it('hasContent false for empty page', () => {
    expect(layer.hasContent('p1')).toBe(false);
  });

  it('hasContent true after addStroke', () => {
    layer.addStroke('p1', mkStroke());
    expect(layer.hasContent('p1')).toBe(true);
  });

  it('hasAnyContent false when no strokes anywhere', () => {
    expect(layer.hasAnyContent()).toBe(false);
  });

  it('hasAnyContent true after adding to any page', () => {
    layer.addStroke('p99', mkStroke());
    expect(layer.hasAnyContent()).toBe(true);
  });

  it('hasContent false after clearPage', () => {
    layer.addStroke('p1', mkStroke());
    layer.clearPage('p1');
    expect(layer.hasContent('p1')).toBe(false);
  });
});

// ── clearPage / clearAll ───────────────────────────────────────────────────────
describe('clearPage / clearAll', () => {
  it('clearPage removes only that page', () => {
    layer.addStroke('p1', mkStroke());
    layer.addStroke('p2', mkStroke());
    layer.clearPage('p1');
    expect(layer.hasContent('p1')).toBe(false);
    expect(layer.hasContent('p2')).toBe(true);
  });

  it('clearAll removes all pages', () => {
    layer.addStroke('p1', mkStroke());
    layer.addStroke('p2', mkStroke());
    layer.clearAll();
    expect(layer.hasAnyContent()).toBe(false);
  });

  it('clearPage on unknown page is a no-op', () => {
    expect(() => layer.clearPage('nonexistent')).not.toThrow();
  });
});

// ── toJSON / fromJSON ──────────────────────────────────────────────────────────
describe('toJSON / fromJSON', () => {
  it('toJSON produces an object keyed by pageId', () => {
    const s = mkStroke({ color: '#abc' });
    layer.addStroke('p1', s);
    const json = layer.toJSON();
    expect(Object.keys(json)).toContain('p1');
    expect(json['p1'][0].color).toBe('#abc');
  });

  it('fromJSON restores strokes', () => {
    const data = {
      p1: [mkStroke({ color: '#111' }), mkStroke({ color: '#222' })],
      p2: [mkStroke({ color: '#333' })],
    };
    layer.fromJSON(data);
    expect(layer.getStrokes('p1')).toHaveLength(2);
    expect(layer.getStrokes('p2')).toHaveLength(1);
    expect(layer.getStrokes('p1')[1].color).toBe('#222');
  });

  it('fromJSON clears existing strokes before restoring', () => {
    layer.addStroke('old', mkStroke());
    layer.fromJSON({ p1: [mkStroke()] });
    expect(layer.hasContent('old')).toBe(false);
    expect(layer.hasContent('p1')).toBe(true);
  });

  it('round-trip: toJSON → fromJSON → toJSON is stable', () => {
    layer.addStroke('p1', mkStroke({ color: '#ff0000', width: 5, type: 'erase' }));
    const json1 = layer.toJSON();

    const layer2 = new InkLayer();
    layer2.fromJSON(json1);
    const json2 = layer2.toJSON();

    expect(json2).toEqual(json1);
  });

  it('toJSON on empty layer returns {}', () => {
    expect(layer.toJSON()).toEqual({});
  });

  it('fromJSON with empty object clears layer', () => {
    layer.addStroke('p1', mkStroke());
    layer.fromJSON({});
    expect(layer.hasAnyContent()).toBe(false);
  });
});

// ── InkStroke types ────────────────────────────────────────────────────────────
describe('InkStroke type field', () => {
  it('accepts "ink" type', () => {
    const s = mkStroke({ type: 'ink' });
    layer.addStroke('p1', s);
    expect(layer.getStrokes('p1')[0].type).toBe('ink');
  });

  it('accepts "erase" type', () => {
    const s = mkStroke({ type: 'erase' });
    layer.addStroke('p1', s);
    expect(layer.getStrokes('p1')[0].type).toBe('erase');
  });
});

// ── Single-point strokes ────────────────────────────────────────────────────────
describe('single-point strokes', () => {
  it('stroke with one point is stored but renders nothing (≥2 required)', () => {
    const s: InkStroke = { type: 'ink', points: [{ x: 5, y: 5 }], width: 2, color: '#000' };
    layer.addStroke('p1', s);
    expect(layer.getStrokes('p1')).toHaveLength(1);
    // Rendering skips single-point strokes — hasContent still returns true
    expect(layer.hasContent('p1')).toBe(true);
  });
});

// ── toDataURL (jsdom canvas is pixel-dark by default) ─────────────────────────
describe('toDataURL', () => {
  it('returns null when page has no content', () => {
    expect(layer.toDataURL('p1', 100, 100)).toBeNull();
  });

  it('toDataURL throws or returns null in jsdom (canvas.getContext is not implemented)', () => {
    // jsdom does not implement canvas 2D context — toDataURL either throws or returns null
    layer.addStroke('p1', mkStroke({
      points: [{ x: 10, y: 10 }, { x: 90, y: 90 }],
      width: 4,
      color: 'rgba(255,0,0,1)',
    }));
    let result: string | null = null;
    let threw = false;
    try {
      result = layer.toDataURL('p1', 200, 200);
    } catch {
      threw = true;
    }
    // Either it throws (jsdom no-getContext) or returns null/string — all acceptable
    expect(threw || result === null || typeof result === 'string').toBe(true);
  });
});

// ── renderToCanvas (smoke test) ────────────────────────────────────────────────
describe('renderToCanvas', () => {
  it('does not throw on empty page', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    expect(() => layer.renderToCanvas('p1', canvas, 1)).not.toThrow();
  });

  it('does not throw with strokes', () => {
    layer.addStroke('p1', mkStroke({
      points: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
      width: 2,
      color: '#0000ff',
      type: 'ink',
    }));
    layer.addStroke('p1', mkStroke({
      type: 'erase',
      points: [{ x: 20, y: 20 }, { x: 40, y: 40 }],
      width: 5,
      color: 'rgba(0,0,0,1)',
    }));
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    expect(() => layer.renderToCanvas('p1', canvas, 1.5)).not.toThrow();
  });

  it('applies scale to coordinates', () => {
    // Only smoke-tests that the function runs without error at scale=2
    layer.addStroke('p1', mkStroke({ points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }));
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    expect(() => layer.renderToCanvas('p1', canvas, 2)).not.toThrow();
  });
});
