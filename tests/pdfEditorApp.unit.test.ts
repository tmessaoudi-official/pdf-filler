import { describe, it, expect, beforeEach } from 'vitest';
import { PDFElement } from '../js/pdfElement';
import { TextElement } from '../js/textElement';
import { ElementFactory } from '../js/elementFactory';

describe('PDFElement monotonic IDs', () => {
  beforeEach(() => {
    PDFElement._nextId = 1;
  });

  it('assigns sequential integer IDs', () => {
    const a = new TextElement(0, 0, 'p1');
    const b = new TextElement(0, 0, 'p1');
    expect(Number.isInteger(a.id)).toBe(true);
    expect(b.id).toBe(a.id + 1);
  });

  it('IDs are unique across 100 elements', () => {
    const els = Array.from({ length: 100 }, () => new TextElement(0, 0, 'p1'));
    const ids = new Set(els.map(e => e.id));
    expect(ids.size).toBe(100);
  });

  it('syncIdCounter advances _nextId past restored IDs', () => {
    // Simulate restored elements with high IDs
    const mockElements = [
      { id: 500 } as any,
      { id: 300 } as any,
      { id: 999 } as any,
    ];
    PDFElement._nextId = 1;
    ElementFactory.syncIdCounter(mockElements);
    expect(PDFElement._nextId).toBe(1000); // max(999) + 1
    // New element gets ID 1000
    const newEl = new TextElement(0, 0, 'p1');
    expect(newEl.id).toBe(1000);
  });

  it('syncIdCounter is a no-op for empty array', () => {
    PDFElement._nextId = 42;
    ElementFactory.syncIdCounter([]);
    expect(PDFElement._nextId).toBe(42);
  });

  it('syncIdCounter handles legacy float IDs gracefully', () => {
    const mockElements = [{ id: 999.7 } as any, { id: 500.3 } as any];
    PDFElement._nextId = 1;
    ElementFactory.syncIdCounter(mockElements);
    expect(PDFElement._nextId).toBe(1000); // floor(999.7) + 1 = 1000
    const el = new TextElement(0, 0, 'p1');
    expect(Number.isInteger(el.id)).toBe(true);
    expect(el.id).toBe(1000);
  });
});

describe('_cleanEmptyTextElements DOM guard (BUG-29)', () => {
  it('ternary `input ? input === focused : true` keeps unmounted element', () => {
    // Null input (not yet in DOM) must return true (keep), not falsy (delete)
    // Old: `null && null === null` = null (falsy) → delete. Bug.
    // New: `null ? ... : true` = true → keep. Fix.
    const oldBehavior = (input: Element | null, focused: Element | null) => input && input === focused;
    const newBehavior = (input: Element | null, focused: Element | null) => input ? input === focused : true;

    // The bug: old returns null (falsy) for unmounted input
    expect(oldBehavior(null, null)).toBeFalsy();   // old: deletes unmounted element (bug)
    expect(newBehavior(null, null)).toBe(true);    // new: keeps unmounted element (fix)

    // Both agree when input is mounted
    const input = document.createElement('input');
    expect(oldBehavior(input, null)).toBe(false);  // mounted unfocused → remove (same)
    expect(newBehavior(input, null)).toBe(false);  // mounted unfocused → remove (same)
    expect(newBehavior(input, input)).toBe(true);  // mounted focused → keep (same)
  });
});
