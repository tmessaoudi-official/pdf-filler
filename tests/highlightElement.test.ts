import { describe, it, expect } from 'vitest';
import { HighlightElement } from '../src/highlightElement';

function getRenderedBackground(el: HighlightElement): string {
  const div = el.render(document.body, { left: 0, top: 0 }, 1);
  return div.style.background;
}

describe('HighlightElement color parsing (BUG-02)', () => {
  it('renders red #FF0000 correctly — not rgba(255,220,0,...)', () => {
    const el = new HighlightElement(0, 0, 100, 20, 'p1', '#FF0000', 0.3);
    const bg = getRenderedBackground(el);
    expect(bg).not.toMatch(/rgba\(255,\s*220,\s*0/);
    expect(bg).toMatch(/rgba\(255,\s*0,\s*0/);
  });

  it('renders black #000000 as rgba(0,0,0,...)', () => {
    const el = new HighlightElement(0, 0, 100, 20, 'p1', '#000000', 0.5);
    const bg = getRenderedBackground(el);
    expect(bg).toMatch(/rgba\(0,\s*0,\s*0/);
  });

  it('renders default yellow #FFFF00 correctly', () => {
    const el = new HighlightElement(0, 0, 100, 20, 'p1', '#FFFF00', 0.3);
    const bg = getRenderedBackground(el);
    expect(bg).toMatch(/rgba\(255,\s*255,\s*0/);
  });

  it('returns 0 for invalid hex channel (not the fallback value)', () => {
    const el = new HighlightElement(0, 0, 100, 20, 'p1', '#GGGGGG', 0.3);
    const bg = getRenderedBackground(el);
    expect(bg).toMatch(/rgba\(0,\s*0,\s*0/);
  });
});
