import { describe, it, expect } from 'vitest';
import { TextSearchHandler } from '../js/textSearchHandler';

function makePage(text: string) {
  return {
    getTextContent: async () => ({
      items: [{ str: text, transform: [1, 0, 0, 1, 50, 500], width: text.length * 7, height: 14 }],
    }),
  } as any;
}

describe('TextSearchHandler LRU cache', () => {
  it('evicts oldest entry when cache exceeds 20 pages', async () => {
    const handler = new TextSearchHandler();
    for (let i = 0; i < 21; i++) {
      await handler.buildIndex(makePage(`content of page ${i}`), `page-${i}`);
    }
    const vp = { transform: [1, 0, 0, -1, 0, 842] } as any;
    // page-0 was evicted (oldest)
    const matches0 = handler.search('content of page 0', 'page-0', vp, 1);
    expect(matches0).toHaveLength(0);
    // page-20 is still cached (most recent)
    const matches20 = handler.search('content of page 20', 'page-20', vp, 1);
    expect(matches20).toHaveLength(1);
  });

  it('re-accessing a page promotes it (LRU)', async () => {
    const handler = new TextSearchHandler();
    await handler.buildIndex(makePage('important page'), 'page-0');
    for (let i = 1; i < 20; i++) {
      await handler.buildIndex(makePage(`page ${i}`), `page-${i}`);
    }
    // Access page-0 again — should promote it
    await handler.buildIndex(makePage('important page'), 'page-0');
    // Add one more — should evict page-1 (now the oldest), not page-0
    await handler.buildIndex(makePage('new page'), 'page-21');

    const vp = { transform: [1, 0, 0, -1, 0, 842] } as any;
    expect(handler.search('important page', 'page-0', vp, 1)).toHaveLength(1);
    expect(handler.search('page 1', 'page-1', vp, 1)).toHaveLength(0);
  });
});

describe('TextSearchHandler word-level highlights', () => {
  it('match width is narrower than full item width', async () => {
    const handler = new TextSearchHandler();
    const text = 'Test content for search: Hello World';
    await handler.buildIndex(makePage(text), 'p1');

    const vp = { transform: [1, 0, 0, -1, 0, 842] } as any;
    const matches = handler.search('search', 'p1', vp, 1);
    expect(matches).toHaveLength(1);

    const itemWidth = text.length * 7; // as in makePage stub
    expect(matches[0].width).toBeLessThan(itemWidth * 0.5);
  });

  it('match x is offset from item start for mid-string match', async () => {
    const handler = new TextSearchHandler();
    const text = 'AAAAAABBBBBBBBBBB'; // match "BBB" is in the second half
    await handler.buildIndex(makePage(text), 'p2');

    const vp = { transform: [1, 0, 0, -1, 0, 842] } as any;
    const matches = handler.search('bbb', 'p2', vp, 1);
    expect(matches).toHaveLength(1);
    // The match should start at x > item start (which is 50 in the stub)
    expect(matches[0].x).toBeGreaterThan(50);
  });
});
