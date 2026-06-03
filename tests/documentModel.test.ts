import { describe, it, expect } from 'vitest';
import { DocumentModel } from '../js/documentModel';

function makeDoc(numPages: number) {
  return { numPages, getPage: async () => ({}) } as any;
}

describe('DocumentModel', () => {
  it('addSourcePdf and addPagesFrom create correct page count', () => {
    const model = new DocumentModel();
    const src = model.addSourcePdf(makeDoc(3), new Uint8Array(), 'test.pdf');
    const pages = model.addPagesFrom(src.id);
    expect(pages).toHaveLength(3);
    expect(model.pageCount).toBe(3);
  });

  it('deletePage clamps currentPageIndex', () => {
    const model = new DocumentModel();
    const src = model.addSourcePdf(makeDoc(2), new Uint8Array(), 'test.pdf');
    model.addPagesFrom(src.id);
    model.currentPageIndex = 1;
    model.deletePage(model.pages[1].id);
    expect(model.currentPageIndex).toBe(0);
  });

  it('reorderPages updates currentPageIndex to track the same page', () => {
    const model = new DocumentModel();
    const src = model.addSourcePdf(makeDoc(3), new Uint8Array(), 'test.pdf');
    model.addPagesFrom(src.id);
    model.currentPageIndex = 0;
    const [a, , c] = model.pages.map(p => p.id);
    model.reorderPages([c, model.pages[1].id, a]);
    expect(model.currentPageIndex).toBe(2);
  });
});
