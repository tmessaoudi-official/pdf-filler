/**
 * Storage module — saveState, loadState, clearState.
 * Uses fake-indexeddb to provide a real IndexedDB implementation in jsdom.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';   // patches globalThis.indexedDB before imports
import { saveState, loadState, clearState } from '../src/storage';
import type { SavedState } from '../src/storage';

const makeState = (override: Partial<SavedState> = {}): SavedState => ({
  elements: [],
  pages: [{ id: 'p1', sourcePdfId: 'src1', originalPageNum: 1, rotation: 0 }],
  watermark: { enabled: false, text: '', color: '#000000', fontSize: 48, opacity: 0.15, angle: -30, density: 3 },
  currentPageIndex: 0,
  sourcePdfs: [],
  ...override,
});

beforeEach(async () => {
  // Clean state between tests
  await clearState();
});

// ── loadState — nothing stored ─────────────────────────────────────────────────
describe('loadState', () => {
  it('returns null when nothing has been saved', async () => {
    const result = await loadState();
    expect(result).toBeNull();
  });
});

// ── saveState → loadState round-trip ──────────────────────────────────────────
describe('saveState / loadState round-trip', () => {
  it('restores the same data that was saved', async () => {
    const state = makeState();
    await saveState(state);
    const loaded = await loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.currentPageIndex).toBe(0);
    expect(loaded!.pages).toHaveLength(1);
    expect(loaded!.pages[0].id).toBe('p1');
  });

  it('overwrites previous state on second save', async () => {
    await saveState(makeState({ currentPageIndex: 0 }));
    await saveState(makeState({ currentPageIndex: 3 }));
    const loaded = await loadState();
    expect(loaded!.currentPageIndex).toBe(3);
  });

  it('preserves elements array', async () => {
    const state = makeState({
      elements: [
        { id: 1, type: 'text', x: 10, y: 20, width: 200, height: 30, pageId: 'p1',
          text: 'hello', fontSize: 14, color: '#000000', fontFamily: 'Arial',
          bold: false, italic: false, multiline: true },
      ],
    });
    await saveState(state);
    const loaded = await loadState();
    expect(loaded!.elements).toHaveLength(1);
    expect(loaded!.elements[0].type).toBe('text');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((loaded!.elements[0] as any).text).toBe('hello');
  });

  it('preserves watermark settings', async () => {
    const state = makeState({
      watermark: { enabled: true, text: 'DRAFT', color: '#FF0000', fontSize: 60, opacity: 0.3, angle: 45, density: 5 },
    });
    await saveState(state);
    const loaded = await loadState();
    expect(loaded!.watermark.enabled).toBe(true);
    expect(loaded!.watermark.text).toBe('DRAFT');
    expect(loaded!.watermark.color).toBe('#FF0000');
    expect(loaded!.watermark.fontSize).toBe(60);
    expect(loaded!.watermark.angle).toBe(45);
  });

  it('preserves inkData when provided', async () => {
    const state = makeState({
      inkData: {
        p1: [{ type: 'ink', points: [{ x: 0, y: 0 }, { x: 10, y: 5 }], width: 2, color: '#000' }],
      },
    });
    await saveState(state);
    const loaded = await loadState();
    expect(loaded!.inkData).toBeDefined();
    expect(loaded!.inkData!['p1']).toHaveLength(1);
    expect(loaded!.inkData!['p1'][0].color).toBe('#000');
  });

  it('preserves formValues when provided', async () => {
    const state = makeState({ formValues: { p1: { field1: 'value1', field2: 'value2' } } });
    await saveState(state);
    const loaded = await loadState();
    expect(loaded!.formValues).toBeDefined();
    expect(loaded!.formValues!['p1']['field1']).toBe('value1');
  });

  it('preserves multiple pages', async () => {
    const state = makeState({
      pages: [
        { id: 'p1', sourcePdfId: 's1', originalPageNum: 1, rotation: 0 },
        { id: 'p2', sourcePdfId: 's1', originalPageNum: 2, rotation: 90 },
        { id: 'p3', sourcePdfId: 's2', originalPageNum: 1, rotation: 0 },
      ],
      currentPageIndex: 2,
    });
    await saveState(state);
    const loaded = await loadState();
    expect(loaded!.pages).toHaveLength(3);
    expect(loaded!.currentPageIndex).toBe(2);
    expect(loaded!.pages[1].rotation).toBe(90);
  });
});

// ── clearState ─────────────────────────────────────────────────────────────────
describe('clearState', () => {
  it('makes loadState return null after clear', async () => {
    await saveState(makeState());
    await clearState();
    const loaded = await loadState();
    expect(loaded).toBeNull();
  });

  it('clearState is idempotent (safe to call on empty store)', async () => {
    await expect(clearState()).resolves.not.toThrow();
    await expect(clearState()).resolves.not.toThrow();
  });
});

// ── SavedState interface coverage ─────────────────────────────────────────────
describe('SavedState interface', () => {
  it('state without optional fields is accepted', async () => {
    const minimal: SavedState = {
      elements: [],
      pages: [],
      watermark: { enabled: false, text: '', color: '#000', fontSize: 48, opacity: 0.15, angle: -30, density: 3 },
      currentPageIndex: 0,
      sourcePdfs: [],
    };
    await saveState(minimal);
    const loaded = await loadState();
    expect(loaded!.formValues).toBeUndefined();
    expect(loaded!.inkData).toBeUndefined();
  });
});
