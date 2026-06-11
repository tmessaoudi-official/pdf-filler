import { describe, it, expect } from 'vitest';
import {
  reconstructPage,
  assignHeadings,
  type RawTextItem,
  type FontInfoMap,
  type FlowDoc,
} from '../../src/utils/flowDoc';

const FONTS: FontInfoMap = {
  f1: { name: 'Helvetica', family: 'sans-serif' },
  fb: { name: 'Arial-BoldMT', family: 'sans-serif' },
  fi: { name: 'Times-Italic', family: 'serif' },
};

function mkItem(str: string, x: number, y: number, opts: Partial<RawTextItem> = {}): RawTextItem {
  const size = opts.height ?? 12;
  return {
    str,
    dir: 'ltr',
    transform: [size, 0, 0, size, x, y],
    width: str.length * size * 0.5,
    height: size,
    fontName: 'f1',
    hasEOL: false,
    ...opts,
  };
}

const PAGE_W = 612;
const PAGE_H = 792;

describe('reconstructPage — line grouping', () => {
  it('joins same-baseline items into one line with a space across a gap', () => {
    // 'Hello' at x=50 (width 30, ends at 80), 'world' at x=85 → gap 5pt > threshold
    const page = reconstructPage(
      [mkItem('Hello', 50, 700), mkItem('world', 85, 700)],
      FONTS, PAGE_W, PAGE_H
    );
    expect(page.paragraphs).toHaveLength(1);
    expect(page.paragraphs[0].runs.map(r => r.text).join('')).toBe('Hello world');
  });

  it('joins adjacent items without inserting a space', () => {
    // 'Hel' ends at 50+18=68; 'lo' starts exactly at 68 → no gap → no space
    const page = reconstructPage(
      [mkItem('Hel', 50, 700), mkItem('lo', 68, 700)],
      FONTS, PAGE_W, PAGE_H
    );
    expect(page.paragraphs[0].runs.map(r => r.text).join('')).toBe('Hello');
  });

  it('emits lines in reading order even when items arrive out of order', () => {
    const page = reconstructPage(
      [mkItem('second line of text here', 50, 660), mkItem('First line of text here.', 50, 674)],
      FONTS, PAGE_W, PAGE_H
    );
    const text = page.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n');
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('second'));
  });
});

describe('reconstructPage — paragraph segmentation', () => {
  it('keeps normally-leaded lines in one paragraph and splits on a large gap', () => {
    // 14pt leading (12pt font) → same paragraph; 36pt gap → new paragraph
    const page = reconstructPage(
      [
        mkItem('Para one line one with some words.', 50, 700),
        mkItem('Para one line two with some words.', 50, 686),
        mkItem('Para two starts after a large gap.', 50, 650),
      ],
      FONTS, PAGE_W, PAGE_H
    );
    expect(page.paragraphs).toHaveLength(2);
  });
});

describe('reconstructPage — styles', () => {
  it('detects bold and italic from the real font name', () => {
    const page = reconstructPage(
      [
        mkItem('Bold', 50, 700, { fontName: 'fb' }),
        mkItem('Italic', 90, 700, { fontName: 'fi' }),
      ],
      FONTS, PAGE_W, PAGE_H
    );
    const runs = page.paragraphs[0].runs;
    const bold = runs.find(r => r.text.includes('Bold'));
    const italic = runs.find(r => r.text.includes('Italic'));
    expect(bold?.bold).toBe(true);
    expect(bold?.italic).toBe(false);
    expect(italic?.italic).toBe(true);
    expect(italic?.fontFamily).toBe('serif');
  });

  it('flags RTL runs and paragraphs', () => {
    const page = reconstructPage(
      [mkItem('مرحبا بالعالم', 300, 700, { dir: 'rtl' })],
      FONTS, PAGE_W, PAGE_H
    );
    expect(page.paragraphs[0].runs[0].rtl).toBe(true);
    expect(page.paragraphs[0].rtl).toBe(true);
  });
});

describe('reconstructPage — alignment', () => {
  it('detects a centered line', () => {
    // text from 250 → 250+110=360, center 305 ≈ page center 306
    const page = reconstructPage(
      [mkItem('Centered headline here', 250, 700, { width: 110 })],
      FONTS, PAGE_W, PAGE_H
    );
    expect(page.paragraphs[0].alignment).toBe('center');
  });

  it('defaults to left alignment for body text', () => {
    const page = reconstructPage(
      [mkItem('Plain left-margin body text line.', 50, 700)],
      FONTS, PAGE_W, PAGE_H
    );
    expect(page.paragraphs[0].alignment).toBe('left');
  });
});

describe('assignHeadings — document-wide font-size clustering', () => {
  it('marks the dominant size as body and larger sizes as headings', () => {
    const body = (s: string, y: number) => mkItem(s, 50, y);
    const page = reconstructPage(
      [
        mkItem('Document Title', 50, 740, { height: 24, transform: [24, 0, 0, 24, 50, 740] }),
        body('Body paragraph one with plenty of words to dominate.', 700),
        body('Body paragraph two with plenty of words to dominate.', 660),
        body('Body paragraph three with plenty of words to dominate.', 620),
      ],
      FONTS, PAGE_W, PAGE_H
    );
    const doc: FlowDoc = { pages: [page] };
    assignHeadings(doc);
    const [title, ...rest] = doc.pages[0].paragraphs;
    expect(title.heading).toBe(1);
    for (const p of rest) expect(p.heading).toBe(0);
  });
});
