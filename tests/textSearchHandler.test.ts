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
