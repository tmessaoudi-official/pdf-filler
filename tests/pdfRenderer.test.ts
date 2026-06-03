import { describe, it, expect, vi } from 'vitest';
import { PDFRenderer } from '../js/pdfRenderer';

function makeCanvas() {
  const canvas = document.createElement('canvas');
  return canvas;
}

function makeDoc(failOnPage?: number) {
  return {
    getPage: vi.fn(async (n: number) => {
      if (failOnPage !== undefined && n === failOnPage) throw new Error(`page ${n} corrupt`);
      return {
        rotate: 0,
        getViewport: () => ({ width: 100, height: 100 }),
        render: () => ({ promise: Promise.resolve() }),
      };
    }),
  } as any;
}

describe('PDFRenderer deadlock fix (BUG-05)', () => {
  it('isRendering resets to false after a getPage() exception', async () => {
    const renderer = new PDFRenderer(makeCanvas());
    const doc = makeDoc(1); // page 1 throws

    await expect((renderer as any)._renderPdfPage(doc, 1)).rejects.toThrow('page 1 corrupt');

    expect((renderer as any).isRendering).toBe(false);
  });

  it('can render again after an error (no deadlock)', async () => {
    const renderer = new PDFRenderer(makeCanvas());
    const doc = makeDoc(1);

    await expect((renderer as any)._renderPdfPage(doc, 1)).rejects.toThrow();
    // Second render should succeed (not deadlocked)
    const goodDoc = makeDoc();
    await expect((renderer as any)._renderPdfPage(goodDoc, 1)).resolves.toBeUndefined();
  });
});

describe('PDFRenderer pending queue fix (BUG-08)', () => {
  it('resolves previously queued Promise when a new render overwrites it', async () => {
    const renderer = new PDFRenderer(makeCanvas());
    const doc = makeDoc();

    const resolved: number[] = [];

    // Start first render (sets isRendering=true)
    const first = (renderer as any)._renderPdfPage(doc, 1).then(() => resolved.push(1));

    // Queue second render while first is in progress
    const second = (renderer as any)._renderPdfPage(doc, 2).then(() => resolved.push(2));

    // Queue third render — should resolve the second (overwrite with resolution)
    const third = (renderer as any)._renderPdfPage(doc, 3).then(() => resolved.push(3));

    await Promise.all([first, second, third]);

    // All three must resolve (no orphaned Promises)
    expect(resolved).toContain(1);
    expect(resolved).toContain(2);
    expect(resolved).toContain(3);
  });

  it('resolves queued Promise even when queued page throws', async () => {
    const renderer = new PDFRenderer(makeCanvas());
    const goodDoc = makeDoc();         // first render succeeds
    const badDoc = makeDoc(1);         // queued page 1 throws

    // Start first render
    const first = (renderer as any)._renderPdfPage(goodDoc, 1);

    // Queue a bad page while first is in progress
    let queuedResolved = false;
    const queued = (renderer as any)._renderPdfPage(badDoc, 1).then(
      () => { queuedResolved = true; },
      () => { queuedResolved = true; } // also resolved on rejection — we just want it to settle
    );

    // first may throw because the queued page error propagates through the recursive call
    await first.catch(() => {});
    await queued;
    expect(queuedResolved).toBe(true);
  });
});
