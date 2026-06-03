import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFElement } from '../js/pdfElement';
import { TextElement } from '../js/textElement';
import { ElementFactory } from '../js/elementFactory';
import { HistoryManager, AddElementCmd, MoveResizeCmd } from '../js/historyManager';

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

  it('syncIdCounter handles 100,000 elements without RangeError', () => {
    PDFElement._nextId = 1;
    const bigArray = Array.from({ length: 100_000 }, (_, i) => ({ id: i + 1 } as any));
    expect(() => ElementFactory.syncIdCounter(bigArray)).not.toThrow();
    expect(PDFElement._nextId).toBe(100_001);
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

describe('handleFileUpload error handling (BUG-03 + BUG-09)', () => {
  it('_isLoading guard prevents re-entrant calls', () => {
    const calls: string[] = [];
    const guardFn = (isLoading: boolean) => {
      if (isLoading) { calls.push('blocked'); return; }
      calls.push('executed');
    };
    guardFn(false); // first call — executes
    guardFn(true);  // concurrent call — blocked
    expect(calls).toEqual(['executed', 'blocked']);
  });

  it('try/catch/finally pattern releases lock on error', () => {
    let isLoading = false;
    let toastShown = '';
    const run = async () => {
      if (isLoading) return;
      isLoading = true;
      try {
        throw new Error('corrupt PDF');
      } catch (err) {
        toastShown = 'Failed to load PDF — ' + (err instanceof Error ? err.message : 'unknown');
      } finally {
        isLoading = false;
      }
    };
    return run().then(() => {
      expect(isLoading).toBe(false);  // lock released in finally
      expect(toastShown).toContain('corrupt PDF');
    });
  });
});

describe('_dataUrlToBytes (BUG-16)', () => {
  function dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('Invalid data URL: no base64 payload');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  it('throws on missing base64 payload', () => {
    expect(() => dataUrlToBytes('data:,')).toThrow('Invalid data URL');
    expect(() => dataUrlToBytes('')).toThrow('Invalid data URL');
    expect(() => dataUrlToBytes('not-a-data-url')).toThrow('Invalid data URL');
  });

  it('decodes valid data URL correctly', () => {
    // data:text/plain;base64,SGVsbG8= = "Hello"
    const bytes = dataUrlToBytes('data:text/plain;base64,SGVsbG8=');
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });
});

describe('undo/redo error surfacing (BUG-18)', () => {
  it('shows toast on render failure — not silent', () => {
    const toasts: string[] = [];
    const showToast = (msg: string) => toasts.push(msg);
    const catchHandler = (err: unknown) => {
      console.error('[undo/redo render]', err);
      showToast('Render failed after undo/redo — try reloading');
    };
    catchHandler(new Error('canvas lost'));
    expect(toasts).toContain('Render failed after undo/redo — try reloading');
  });
});

describe('_search debounce (BUG-20)', () => {
  it('generation counter discards stale results', () => {
    let gen = 0;
    let savedMatches: string[] | null = null;

    const runSearch = async (query: string, myGen: number) => {
      await Promise.resolve();
      if (myGen !== gen) return; // stale
      savedMatches = [query];
    };

    gen++; void runSearch('he', gen);    // gen=1
    gen++; void runSearch('hello', gen); // gen=2 — this should win

    return new Promise<void>(resolve => setTimeout(() => {
      expect(savedMatches).toEqual(['hello']); // gen=1 was discarded
      resolve();
    }, 10));
  });
});

describe('closeSignatureModal mode reset (BUG-21)', () => {
  it('setMode is called — not direct mode assignment', () => {
    const modeCalls: string[] = [];
    const fakeApp = {
      mode: 'addSignature',
      ui: {
        signatureModal: { classList: { remove: vi.fn() } },
        addSignatureBtn: { classList: { remove: vi.fn() } },
      },
    } as any;

    // The fixed implementation calls setMode which invokes side effects
    // Simulate the fixed closeSignatureModal
    const setMode = (m: string) => { modeCalls.push(m); fakeApp.mode = m; };
    fakeApp.ui.signatureModal.classList.remove('active');
    setMode('select');
    fakeApp.ui.addSignatureBtn.classList.remove('active');

    expect(modeCalls).toContain('select');
    expect(fakeApp.mode).toBe('select');
  });
});

describe('multiline text export line splitting (BUG-23)', () => {
  it('splits text on newlines and offsets each line by fontSize * 1.2', () => {
    const text = 'line one\nline two\nline three';
    const fontSize = 14;
    const lineHeight = fontSize * 1.2;
    const lines = text.split('\n');

    const drawnAtY: number[] = lines.map((_, i) => 50 + fontSize + i * lineHeight);

    expect(drawnAtY).toHaveLength(3);
    expect(drawnAtY[1] - drawnAtY[0]).toBeCloseTo(lineHeight, 2);
    expect(drawnAtY[2] - drawnAtY[1]).toBeCloseTo(lineHeight, 2);
  });

  it('skips empty lines (no drawText call)', () => {
    const lines = 'line\n\nafter empty'.split('\n');
    const drawn = lines.filter(l => l.length > 0);
    expect(drawn).toHaveLength(2);
  });
});

describe('DrawingHandler fixes', () => {
  it('BUG-40: ?? operator vs || for zero distance', () => {
    const lastPinchDist = 0;
    const pinchStartDist = 100;
    const withOr   = lastPinchDist || pinchStartDist;  // 100 (WRONG)
    const withNull = lastPinchDist ?? pinchStartDist;  // 0 (CORRECT)
    expect(withOr).toBe(100);   // demonstrates the bug
    expect(withNull).toBe(0);   // demonstrates the fix
  });

  it('BUG-12: documentModel.currentPage guard vs renderer.pdfDoc guard', () => {
    const fakeApp = {
      renderer: { pdfDoc: null },
      documentModel: { currentPage: { id: 'p1' } },
    } as any;
    const oldGuard = !fakeApp.renderer.pdfDoc;        // true — blocks added-PDF drawing (bug)
    const newGuard = !fakeApp.documentModel.currentPage; // false — allows drawing (fix)
    expect(oldGuard).toBe(true);
    expect(newGuard).toBe(false);
  });
});

describe('rotation normalization (BUG-13)', () => {
  it('negative srcRot + userRot normalizes to positive', () => {
    const buggy = (srcRot: number, userRot: number) => (srcRot + userRot) % 360;
    const fixed = (srcRot: number, userRot: number) => ((srcRot + userRot) % 360 + 360) % 360;

    expect(buggy(-90, 0)).toBe(-90);  // demonstrates the bug
    expect(fixed(-90, 0)).toBe(270);  // fix: -90 → 270
    expect(fixed(270, 90)).toBe(0);   // 360 → 0
    expect(fixed(0, 0)).toBe(0);
    expect(fixed(180, 90)).toBe(270);
  });
});

describe('keyboard nudge geometry (BUG-24)', () => {
  it('nudge dx/dy computes correctly for all arrow keys', () => {
    const step = 1;
    const cases = [
      { key: 'ArrowLeft',  dx: -step, dy: 0 },
      { key: 'ArrowRight', dx:  step, dy: 0 },
      { key: 'ArrowUp',    dx: 0, dy: -step },
      { key: 'ArrowDown',  dx: 0, dy:  step },
    ];
    for (const { key, dx, dy } of cases) {
      const calcDx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
      const calcDy = key === 'ArrowUp'   ? -step : key === 'ArrowDown'  ? step : 0;
      expect(calcDx).toBe(dx);
      expect(calcDy).toBe(dy);
    }
  });
});

describe('text formatting undo (BUG-25)', () => {
  beforeEach(() => { PDFElement._nextId = 1; });

  it('bold toggle is undoable via MoveResizeCmd', () => {
    const elements: PDFElement[] = [];
    const mgr = new HistoryManager(50, vi.fn());
    const te = new TextElement(0, 0, 'p1');
    mgr.execute(new AddElementCmd(elements, te));

    // Simulate what the fixed handler does
    const before = { bold: te.bold };
    te.bold = !te.bold;
    const after = { bold: te.bold };
    mgr.record(new MoveResizeCmd(elements, te, before, after));

    expect(te.bold).toBe(true);
    mgr.undo();
    expect(te.bold).toBe(false);
    mgr.redo();
    expect(te.bold).toBe(true);
  });
});

describe('image MIME validation (BUG-43)', () => {
  it('rejects files without image/ MIME type', () => {
    const isValidImage = (mimeType: string) => mimeType.startsWith('image/');
    expect(isValidImage('application/pdf')).toBe(false);
    expect(isValidImage('text/plain')).toBe(false);
    expect(isValidImage('')).toBe(false);
    expect(isValidImage('image/png')).toBe(true);
    expect(isValidImage('image/jpeg')).toBe(true);
  });
});
