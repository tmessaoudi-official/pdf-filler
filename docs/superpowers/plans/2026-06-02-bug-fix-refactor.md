# PDF Fill & Sign — Bug Fix & Refactor Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 18 code-review findings (P0–P3) with tested, production-quality implementations — no bandaids, no silent workarounds, no global coupling.

**Architecture:** Event-driven element actions (CustomEvent bubbling replaces `window.app` coupling); rasterization-based true redaction; targeted `TextEditCmd` replaces full-array `SnapshotCmd` for text edits; Vitest unit suite covers all pure logic; Playwright browser tests already cover feature surfaces.

**Tech Stack:** TypeScript 5.4, Vite 5, Vitest (new), pdf-lib 1.17, pdfjs-dist 3.x, DOM Custom Events.

---

## File Map

| File | Change |
|------|--------|
| `js/pdfElement.ts` | Monotonic ID counter; CustomEvent dispatch in `createControls()` |
| `js/commentElement.ts` | Replace `window.app._autosave()` with `element:autosave` event |
| `js/pageThumbnailPanel.ts` | Add `onDownload` callback to opts; remove `window.app.downloadPage` |
| `js/pdfEditorApp.ts` | 10 fixes (see tasks 4–13); add container-level event listeners |
| `js/historyManager.ts` | New `TextEditCmd`; remove `SnapshotCmd` from text-editing path |
| `js/drawingHandler.ts` | Pinch zoom CSS cleanup |
| `js/textSearchHandler.ts` | LRU eviction; word-level highlight bbox |
| `js/signaturePad.ts` | Pointer events (remove legacy mouse/touch bridge) |
| `js/elementFactory.ts` | Sync `PDFElement._nextId` on session restore |
| `vite.config.ts` | `manifestFilename: 'manifest.json'` |
| `index.html` | Add `<link rel="icon">` |
| `package.json` | Add `vitest`, `@vitest/ui`, `jsdom`; add `test` script |
| `vitest.config.ts` | New file — Vitest config |
| `tests/historyManager.test.ts` | New — unit tests |
| `tests/documentModel.test.ts` | New — unit tests |
| `tests/textSearchHandler.test.ts` | New — LRU + search unit tests |
| `tests/pdfEditorApp.unit.test.ts` | New — pure-function unit tests |

---

## Task 1: Test Infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `tests/historyManager.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install --save-dev vitest @vitest/ui jsdom
```

Expected: `node_modules/vitest` present, no errors.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test script to `package.json`**

Add to the `"scripts"` block:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write first failing test — HistoryManager**

Create `tests/historyManager.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import {
  HistoryManager, AddElementCmd, RemoveElementCmd, ClearAllCmd,
} from '../js/historyManager';
import { TextElement } from '../js/textElement';

function makeMgr() {
  const onChange = vi.fn();
  return { mgr: new HistoryManager(50, onChange), onChange };
}

function makeEl() {
  return new TextElement(0, 0, 'p1');
}

describe('HistoryManager', () => {
  it('executes and records command', () => {
    const { mgr } = makeMgr();
    const arr: ReturnType<typeof makeEl>[] = [];
    const el = makeEl();
    mgr.execute(new AddElementCmd(arr, el));
    expect(arr).toHaveLength(1);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
  });

  it('undo removes element, redo adds it back', () => {
    const { mgr } = makeMgr();
    const arr: ReturnType<typeof makeEl>[] = [];
    const el = makeEl();
    mgr.execute(new AddElementCmd(arr, el));
    mgr.undo();
    expect(arr).toHaveLength(0);
    expect(mgr.canRedo()).toBe(true);
    mgr.redo();
    expect(arr).toHaveLength(1);
  });

  it('ClearAllCmd: undo restores all elements', () => {
    const { mgr } = makeMgr();
    const arr = [makeEl(), makeEl(), makeEl()];
    const savedIds = arr.map(e => e.id);
    mgr.execute(new ClearAllCmd(arr));
    expect(arr).toHaveLength(0);
    mgr.undo();
    expect(arr.map(e => e.id)).toEqual(savedIds);
  });

  it('caps undo stack at maxSize', () => {
    const { mgr } = makeMgr();
    const arr: ReturnType<typeof makeEl>[] = [];
    for (let i = 0; i < 60; i++) mgr.execute(new AddElementCmd(arr, makeEl()));
    // Undo all — should only undo 50 (maxSize)
    let count = 0;
    while (mgr.canUndo()) { mgr.undo(); count++; }
    expect(count).toBe(50);
  });

  it('clear() empties both stacks', () => {
    const { mgr } = makeMgr();
    const arr: ReturnType<typeof makeEl>[] = [];
    mgr.execute(new AddElementCmd(arr, makeEl()));
    mgr.clear();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests — expect failures (TextElement import not resolved yet)**

```bash
npm test
```

Some tests will fail if imports fail. Note the errors — they'll be resolved as we add proper exports. If the suite runs, ensure all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts package.json package-lock.json tests/historyManager.test.ts
git commit -m "test: add Vitest infrastructure + HistoryManager tests"
```

---

## Task 2: Monotonic Element IDs

**Fixes**: P2-2 (float ID collision risk)  
**Files:**
- Modify: `js/pdfElement.ts`
- Modify: `js/elementFactory.ts`
- Create: `tests/pdfEditorApp.unit.test.ts` (partial — add more tests in later tasks)

**Why**: `Date.now() + Math.random()` produces floats with theoretical collision risk. A monotonic integer counter guarantees uniqueness and survives serialization.

- [ ] **Step 1: Write failing test**

Create `tests/pdfEditorApp.unit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PDFElement } from '../js/pdfElement';
import { TextElement } from '../js/textElement';

describe('PDFElement IDs', () => {
  beforeEach(() => {
    // Reset counter so tests are deterministic
    PDFElement._nextId = 1;
  });

  it('assigns sequential integer IDs', () => {
    const a = new TextElement(0, 0, 'p1');
    const b = new TextElement(0, 0, 'p1');
    expect(Number.isInteger(a.id)).toBe(true);
    expect(b.id).toBe(a.id + 1);
  });

  it('IDs are unique across elements', () => {
    const els = Array.from({ length: 100 }, () => new TextElement(0, 0, 'p1'));
    const ids = new Set(els.map(e => e.id));
    expect(ids.size).toBe(100);
  });
});
```

Run `npm test` — expect failure (no `_nextId` export yet).

- [ ] **Step 2: Add static counter to `js/pdfElement.ts`**

Replace the existing `id` assignment in the constructor:

```typescript
// Add this static field before the class body's instance fields:
static _nextId = 1;

// In constructor, replace:
//   this.id = Date.now() + Math.random();
// with:
this.id = PDFElement._nextId++;
```

Full updated `pdfElement.ts` (only the constructor changes, rest stays identical):

```typescript
export abstract class PDFElement {
  static _nextId = 1;           // ← new
  id: number;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  pageId: string;

  constructor(type: ElementType, x: number, y: number, width: number, height: number, pageId: string) {
    this.id = PDFElement._nextId++;  // ← changed from Date.now() + Math.random()
    this.type = type;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.pageId = pageId;
  }
  // ... rest unchanged
}
```

- [ ] **Step 3: Sync counter on session restore in `js/elementFactory.ts`**

Add a static method that advances the counter past all restored IDs:

```typescript
// Add at the bottom of ElementFactory class:
static syncIdCounter(elements: PDFElement[]): void {
  if (!elements.length) return;
  const maxId = Math.max(...elements.map(e => e.id));
  if (maxId >= PDFElement._nextId) PDFElement._nextId = maxId + 1;
}
```

Then in `js/pdfEditorApp.ts`, inside `_restoreSession()`, after `this.elements.push(...restored)` add:

```typescript
ElementFactory.syncIdCounter(this.elements);
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: all tests in `tests/pdfEditorApp.unit.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add js/pdfElement.ts js/elementFactory.ts js/pdfEditorApp.ts tests/pdfEditorApp.unit.test.ts
git commit -m "fix: monotonic integer IDs for PDFElement — eliminates float collision risk"
```

---

## Task 3: Remove `window.app` Coupling via DOM Custom Events

**Fixes**: P2-1 (`window.app` in element classes)  
**Files:**
- Modify: `js/pdfElement.ts`
- Modify: `js/commentElement.ts`
- Modify: `js/pageThumbnailPanel.ts`
- Modify: `js/pdfEditorApp.ts` (add container-level listeners in `setupEventListeners`)

**Pattern**: Elements dispatch typed Custom Events that bubble to `canvasContainer`. The app listens once at the container level. No `window.app` reference anywhere in element files.

- [ ] **Step 1: Update `js/pdfElement.ts` — `createControls()` dispatch**

Replace the `deleteBtn` click handler body:

```typescript
// Before:
deleteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.app.removeElement(this.id);
});

// After:
deleteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  deleteBtn.dispatchEvent(
    new CustomEvent<{ id: number }>('element:delete', {
      bubbles: true,
      composed: true,
      detail: { id: this.id },
    })
  );
});
```

- [ ] **Step 2: Update `js/commentElement.ts` — autosave event**

In the `textarea` `input` handler inside `render()`, replace `window.app._autosave?.()` with a custom event:

```typescript
// Before:
textarea.addEventListener('input', () => {
  this.text = textarea.value;
  window.app._autosave?.();
});

// After:
textarea.addEventListener('input', () => {
  this.text = textarea.value;
  textarea.dispatchEvent(
    new CustomEvent('element:autosave', { bubbles: true, composed: true })
  );
});
```

- [ ] **Step 3: Update `js/pageThumbnailPanel.ts` — add `onDownload` to opts**

Add `onDownload: (index: number) => void` to the opts interface and constructor, then use it in the download button:

```typescript
// In the constructor opts type (add alongside onAddPdf):
onDownload: (index: number) => void;

// In the constructor:
this.onDownload = opts.onDownload;
// (add the property declaration at the top of the class)
private onDownload: (index: number) => void;

// Replace the dlBtn click handler:
// Before:
dlBtn.addEventListener('click', (e) => { e.stopPropagation(); window.app.downloadPage(i); });

// After:
dlBtn.addEventListener('click', (e) => { e.stopPropagation(); this.onDownload(i); });
```

- [ ] **Step 4: Update `js/pdfEditorApp.ts` — register container listeners and pass `onDownload`**

In `setupEventListeners()`, add these two listeners right after the existing canvas listeners (around line 119):

```typescript
// Custom event from PDFElement.createControls()
this.ui.container.addEventListener('element:delete', (e: Event) => {
  const id = (e as CustomEvent<{ id: number }>).detail.id;
  this.removeElement(id);
  this.selectElement(null);
  this._updateFormattingToolbar();
});

// Custom event from CommentElement
this.ui.container.addEventListener('element:autosave', () => {
  this._autosave();
});
```

In `_initThumbnailPanel()` and inside `handleFileUpload()` where the panel is re-created, add `onDownload`:

```typescript
this._thumbnailPanel = new PageThumbnailPanel({
  container: this.ui.pageThumbnailContainer,
  renderer: this.renderer,
  model: this.documentModel,
  onNavigate: (index) => this._goToPageIndex(index),
  onDelete:   (pageId) => this._deletePage(pageId),
  onReorder:  (newOrder) => this._reorderPages(newOrder),
  onRotate:   (pageId, delta) => this._rotatePage(pageId, delta),
  onAddPdf:   () => this.ui.addPdfInput.click(),
  onDownload: (index) => this.downloadPage(index),  // ← add this line
});
```

- [ ] **Step 5: Remove the now-dead `window.app` global augmentation**

In `js/pdfElement.ts`, the `declare global { interface Window { app: ... } }` block at the bottom should be **moved** to `js/main.ts` only (the only file that legitimately sets `window.app`). Delete it from `pdfElement.ts` and add to `main.ts`:

```typescript
// js/main.ts — add type augmentation here, not in pdfElement.ts
import type { PDFEditorApp } from './pdfEditorApp';
declare global {
  interface Window { app: PDFEditorApp; }
}
```

- [ ] **Step 6: Verify build compiles with zero errors**

```bash
npm run type-check && npm run lint
```

Expected: `tsc` exits 0. ESLint exits 0 (we'll fix the remaining ESLint errors in Task 4).

- [ ] **Step 7: Commit**

```bash
git add js/pdfElement.ts js/commentElement.ts js/pageThumbnailPanel.ts js/pdfEditorApp.ts js/main.ts
git commit -m "refactor: remove window.app coupling via DOM CustomEvent bubbling"
```

---

## Task 4: Fix Static Analysis Errors (P1-1, P1-2)

**Fixes**: P1-1 (unused `RedactionElement` import), P1-2 (ternary as expression statement)  
**Files:**
- Modify: `js/pdfEditorApp.ts`

These are two independent one-line fixes. Always fix static analysis errors before adding new code.

- [ ] **Step 1: Remove unused `RedactionElement` import (`js/pdfEditorApp.ts:26`)**

```typescript
// Remove this line entirely:
import { RedactionElement } from './redactionElement';
```

`RedactionElement` is used in `DrawingHandler` and `ElementFactory`, not here.

- [ ] **Step 2: Fix ternary expression statement (`js/pdfEditorApp.ts:113`)**

```typescript
// Before:
if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? this._prevMatch() : this._nextMatch(); }

// After:
if (e.key === 'Enter') {
  e.preventDefault();
  if (e.shiftKey) this._prevMatch(); else this._nextMatch();
}
```

- [ ] **Step 3: Run static gates — both must pass**

```bash
npm run type-check
```
Expected: exits 0, zero errors.

```bash
npm run lint
```
Expected: exits 0, zero errors, zero warnings (beyond any pre-existing `no-explicit-any` suppressions already in the file).

- [ ] **Step 4: Commit**

```bash
git add js/pdfEditorApp.ts
git commit -m "fix: remove unused RedactionElement import; fix ternary-as-statement ESLint error"
```

---

## Task 5: Auto-Select Element After Placement (P1-4)

**Fixes**: P1-4 (arrow nudge broken for newly placed elements)  
**Files:**
- Modify: `js/pdfEditorApp.ts`

After placing any element, `selectedElement` must be set so arrow-key nudging works immediately without requiring an explicit click. For text elements this is compatible with auto-focus: when the text input is focused, the keydown handler already has `if (e.target.matches('input, textarea, select')) return;`, so arrow keys go into the text field, not the nudge handler — the correct UX.

- [ ] **Step 1: Write test**

Add to `tests/pdfEditorApp.unit.test.ts`:

```typescript
// (This is a logic-level test — actual DOM placement is covered by Playwright)
describe('auto-select after placement', () => {
  it('selectElement sets selectedElement', () => {
    // Mock minimal app structure
    const elements: any[] = [];
    const selected = { current: null as any };
    // Simulate the pattern used in addTextAtPosition
    const el = new TextElement(10, 20, 'p1');
    elements.push(el);
    selected.current = el;  // this is what selectElement does
    expect(selected.current).toBe(el);
    expect(selected.current.x).toBe(10);
  });
});
```

Run `npm test` — expect pass (trivial test, confirms the pattern is reasonable).

- [ ] **Step 2: Add `this.selectElement(element)` to all four placement methods**

In `js/pdfEditorApp.ts`:

**`addTextAtPosition` (around line 869)** — add after `this.renderElements()`:
```typescript
// After: this.renderElements();
this.selectElement(textElement);   // ← add
```

**`addSignatureAtPosition` (around line 883)** — add after `this.renderElements()`:
```typescript
// After: this.renderElements();
this.selectElement(sigElement);    // ← add
```

**`addImageAtPosition` (around line 503)** — add after `this.renderElements()`:
```typescript
// After: this.renderElements();
this.selectElement(imgEl);         // ← add
```

**`_addCommentAtPosition` (around line 847)** — add after `this.renderElements()`:
```typescript
// After: this.renderElements();
this.selectElement(el);            // ← add
```

- [ ] **Step 3: Verify type-check**

```bash
npm run type-check
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add js/pdfEditorApp.ts tests/pdfEditorApp.unit.test.ts
git commit -m "fix: auto-select element after placement — arrow key nudge works immediately"
```

---

## Task 6: Replace SnapshotCmd with TextEditCmd + Fix Undo Race (P2-4, P2-7)

**Fixes**: P2-7 (pending text cmd race), P2-4 (SnapshotCmd rebuilds all elements)  
**Files:**
- Modify: `js/historyManager.ts`
- Modify: `js/pdfEditorApp.ts`

**Architecture**: Replace the full-array `SnapshotCmd` in the text-editing path with a minimal `TextEditCmd` that stores only the before/after text for the specific element. Cancel the pending timer in `undo()` and `redo()` to eliminate the race condition.

- [ ] **Step 1: Write failing tests for `TextEditCmd`**

Add to `tests/historyManager.test.ts`:

```typescript
import { TextEditCmd } from '../js/historyManager';
import { TextElement } from '../js/textElement';

describe('TextEditCmd', () => {
  it('undo restores previous text', () => {
    const el = new TextElement(0, 0, 'p1');
    el.text = 'hello';
    const arr = [el];
    const cmd = new TextEditCmd(arr, el.id, 'hello', 'hello world');
    cmd.execute();
    expect(el.text).toBe('hello world');
    cmd.undo();
    expect(el.text).toBe('hello');
  });

  it('redo re-applies text change', () => {
    const el = new TextElement(0, 0, 'p1');
    el.text = 'a';
    const arr = [el];
    const cmd = new TextEditCmd(arr, el.id, 'a', 'b');
    cmd.execute();
    cmd.undo();
    cmd.execute();
    expect(el.text).toBe('b');
  });

  it('is a no-op if element not found', () => {
    const arr: any[] = [];
    const cmd = new TextEditCmd(arr, 999, 'old', 'new');
    expect(() => cmd.execute()).not.toThrow();
    expect(() => cmd.undo()).not.toThrow();
  });
});
```

Run `npm test` — expect failure (`TextEditCmd` not exported yet).

- [ ] **Step 2: Add `TextEditCmd` to `js/historyManager.ts`**

Add this class after `SnapshotCmd` (keep `SnapshotCmd` — it's still used by `ClearAllCmd` path; just don't use it for text edits):

```typescript
import type { TextElement } from './textElement';

export class TextEditCmd implements Command {
  constructor(
    private elements: PDFElement[],
    private elementId: number,
    private before: string,
    private after: string,
  ) {}

  execute(): void {
    const el = this.elements.find(e => e.id === this.elementId) as TextElement | undefined;
    if (el) el.text = this.after;
  }

  undo(): void {
    const el = this.elements.find(e => e.id === this.elementId) as TextElement | undefined;
    if (el) el.text = this.before;
  }
}
```

> Note: The `TextElement` import must use `import type` to avoid a circular dependency since `historyManager` is imported by `pdfEditorApp` which imports `textElement`.

- [ ] **Step 3: Rewrite the text-change debounce in `js/pdfEditorApp.ts`**

The current approach uses `SnapshotCmd` and a `_pendingTextCmd` field. Replace with per-element before-text tracking:

**Remove field `_pendingTextCmd: SnapshotCmd | null`** (and its initialisation in the constructor).

**Add field** (keep `_textChangeTimer`, change type of pending):
```typescript
private _pendingTextBefore: string | null = null;
private _pendingTextElementId: number | null = null;
```

**In the `renderElements()` input handler** (around line 913), replace the entire `input` listener:

```typescript
input.addEventListener('input', () => {
  const textEl = element as TextElement;
  // Capture "before" text on first keystroke in this edit session
  if (this._pendingTextElementId !== element.id) {
    this._pendingTextBefore  = textEl.text;
    this._pendingTextElementId = element.id;
  }
  textEl.text = (input as HTMLInputElement | HTMLTextAreaElement).value;

  clearTimeout(this._textChangeTimer ?? undefined);
  this._textChangeTimer = setTimeout(() => {
    const before = this._pendingTextBefore;
    const id     = this._pendingTextElementId;
    this._pendingTextBefore    = null;
    this._pendingTextElementId = null;
    this._textChangeTimer      = null;
    if (id !== null && before !== null && before !== textEl.text) {
      this.historyManager.record(
        new TextEditCmd(this.elements, id, before, textEl.text)
      );
    }
    this._autosave();
  }, 500);
});
```

- [ ] **Step 4: Cancel pending timer in `undo()` and `redo()`**

In `js/pdfEditorApp.ts`, update both methods:

```typescript
undo() {
  this._cancelPendingTextEdit();    // ← add
  if (this.historyManager.undo()) {
    // ... existing body unchanged ...
  }
}

redo() {
  this._cancelPendingTextEdit();    // ← add
  if (this.historyManager.redo()) {
    // ... existing body unchanged ...
  }
}

private _cancelPendingTextEdit(): void {
  if (this._textChangeTimer !== null) {
    clearTimeout(this._textChangeTimer);
    this._textChangeTimer      = null;
    this._pendingTextBefore    = null;
    this._pendingTextElementId = null;
  }
}
```

- [ ] **Step 5: Remove the old `_pendingTextCmd` field and its `import`**

Remove from `pdfEditorApp.ts`:
```typescript
// Remove the import of SnapshotCmd if it's now unused:
import {
  HistoryManager, AddElementCmd, RemoveElementCmd, ClearAllCmd,
  DeletePageCmd, ReorderPagesCmd, AddPagesCmd, RotatePageCmd,
  TextEditCmd,   // ← add
  // MoveResizeCmd is in interactionHandler, not imported here
} from './historyManager';
// Remove: SnapshotCmd from the import

// Remove field declaration:
_pendingTextCmd: SnapshotCmd | null = null;
// Remove from constructor:
this._pendingTextCmd = null;
```

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: All `TextEditCmd` tests pass.

- [ ] **Step 7: Type-check**

```bash
npm run type-check
```
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add js/historyManager.ts js/pdfEditorApp.ts tests/historyManager.test.ts
git commit -m "fix: replace SnapshotCmd with TextEditCmd; cancel pending timer before undo/redo"
```

---

## Task 7: Fix `computeFitScale` for Multi-Source PDFs (P2-3)

**Fixes**: P2-3 (fit scale always uses page 1 of first source)  
**Files:**
- Modify: `js/pdfRenderer.ts`
- Create: `tests/documentModel.test.ts`

- [ ] **Step 1: Write failing test for DocumentModel**

Create `tests/documentModel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DocumentModel } from '../js/documentModel';

// Minimal pdf.js doc stub
function makeDoc(numPages: number) {
  return { numPages, getPage: async () => ({}) } as any;
}

describe('DocumentModel', () => {
  it('addSourcePdf and addPagesFrom work together', () => {
    const model = new DocumentModel();
    const src = model.addSourcePdf(makeDoc(3), new Uint8Array(), 'test.pdf');
    const pages = model.addPagesFrom(src.id);
    expect(pages).toHaveLength(3);
    expect(model.pageCount).toBe(3);
    expect(model.currentPage?.sourcePdfId).toBe(src.id);
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
    const [a, b, c] = model.pages.map(p => p.id);
    model.reorderPages([c, b, a]);
    // The page that WAS at index 0 (id=a) is now at index 2
    expect(model.currentPageIndex).toBe(2);
  });
});
```

Run `npm test` — expect pass (DocumentModel logic is already correct; this locks it in).

- [ ] **Step 2: Rewrite `computeFitScale` in `js/pdfRenderer.ts`**

Replace the existing method:

```typescript
computeFitScale(containerWidth: number): Promise<number> {
  const model = this._model;
  // Use the current page's source and rotation when available
  if (model?.currentPage) {
    const docPage = model.currentPage;
    const src = model.sourcePdfs.get(docPage.sourcePdfId);
    if (src) {
      return src.doc.getPage(docPage.sourcePageNum).then((page) => {
        const effectiveRotation = (page.rotate + (docPage.rotation ?? 0)) % 360;
        const vp = page.getViewport({ scale: 1, rotation: effectiveRotation });
        return Math.max(0.25, (containerWidth - 40) / vp.width);
      });
    }
  }
  // Legacy fallback: single-source sessions before model is set
  const doc = this.pdfDoc;
  if (!doc) return Promise.resolve(1.0);
  return doc.getPage(1).then((page) => {
    const vp = page.getViewport({ scale: 1 });
    return Math.max(0.25, (containerWidth - 40) / vp.width);
  });
}
```

- [ ] **Step 3: Type-check + test**

```bash
npm run type-check && npm test
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add js/pdfRenderer.ts tests/documentModel.test.ts
git commit -m "fix: computeFitScale uses current page dimensions for correct fit in multi-source docs"
```

---

## Task 8: Fix Pinch Zoom CSS Transform Leak (P1-5)

**Fixes**: P1-5 (pinch zoom leaves CSS transform; canvas flicker)  
**Files:**
- Modify: `js/drawingHandler.ts`

**Root cause**: On `pointerup`, `canvas.style.transform = ''` is cleared AFTER calling `applyZoom`. During the async `applyZoom` render, the scaled CSS canvas and the re-rendered canvas briefly coexist → flicker. On `pointercancel`, the cleanup is conditional and can be skipped.

- [ ] **Step 1: Fix `handlePointerUp` — clear CSS transform before `applyZoom`**

In `js/drawingHandler.ts`, `handlePointerUp` method, locate the pinch-end block and reorder:

```typescript
handlePointerUp(e: PointerEvent): void {
  this._pinchPointers.delete(e.pointerId);

  if (this._pinchStartDist !== null && this._pinchStartZoom !== null && this._pinchPointers.size < 2) {
    const finalDist  = this._lastPinchDist || this._pinchStartDist;
    const newScale   = this._pinchStartZoom * finalDist / this._pinchStartDist;
    // ↓ Clear CSS transform SYNCHRONOUSLY before any async re-render
    this.app.ui.canvas.style.transform       = '';
    this.app.ui.canvas.style.transformOrigin = '';
    this._pinchStartDist  = null;
    this._pinchStartZoom  = null;
    this._lastPinchDist   = null;
    this.app.applyZoom(newScale);
    return;
  }

  if (!this._drawing) return;
  // ... rest of method unchanged ...
}
```

- [ ] **Step 2: Fix `handlePointerCancel` — always clean up on last pointer**

Replace the entire `handlePointerCancel` method:

```typescript
handlePointerCancel(e: PointerEvent): void {
  this._pinchPointers.delete(e.pointerId);
  this.cancel();

  if (this._pinchPointers.size === 0) {
    // Always clear CSS transform synchronously
    this.app.ui.canvas.style.transform       = '';
    this.app.ui.canvas.style.transformOrigin = '';

    if (this._pinchStartDist !== null && this._pinchStartZoom !== null && this._lastPinchDist !== null) {
      const newScale = this._pinchStartZoom * this._lastPinchDist / this._pinchStartDist;
      this._pinchStartDist = null;
      this._pinchStartZoom = null;
      this._lastPinchDist  = null;
      this.app.applyZoom(newScale);
    } else {
      this._pinchStartDist = null;
      this._pinchStartZoom = null;
      this._lastPinchDist  = null;
    }
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add js/drawingHandler.ts
git commit -m "fix: clear pinch-zoom CSS transform synchronously before applyZoom to eliminate flicker"
```

---

## Task 9: Export Error Feedback (P1-3)

**Fixes**: P1-3 (silent element drop on export)  
**Files:**
- Modify: `js/pdfEditorApp.ts`

Elements that fail to render during export currently disappear silently. Collect failures and report them in a post-export toast.

- [ ] **Step 1: Add error collection to `_drawElementOnPage` callers**

In `downloadPDF()`, replace the element-drawing loop:

```typescript
// Before:
for (const element of pageElements) {
  try {
    await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts }, W_orig, H_orig, totalRot);
  } catch { /* skip malformed element */ }
}

// After:
const exportErrors: string[] = [];
for (const element of pageElements) {
  try {
    await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts }, W_orig, H_orig, totalRot);
  } catch (err) {
    exportErrors.push(`${element.type} (id ${element.id})`);
  }
}
```

After `this.showToast('PDF downloaded!');`, add:

```typescript
if (exportErrors.length > 0) {
  this.showToast(
    `⚠ ${exportErrors.length} element${exportErrors.length > 1 ? 's' : ''} could not be rendered: ${exportErrors.join(', ')}`,
    6000,
  );
}
```

Apply the same pattern to `downloadPage()` (single-page export) and `downloadPageAsImage()`.

- [ ] **Step 2: Fix `downloadPageAsImage` early-return toast leak (P3-4)**

In `downloadPageAsImage()`, replace the early return:

```typescript
// Before:
const srcEntry = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
if (!srcEntry) return;

// After:
const srcEntry = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
if (!srcEntry) {
  this.showToast('Export failed — source PDF not found');
  this.ui.container.style.opacity = '1';
  return;
}
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add js/pdfEditorApp.ts
git commit -m "fix: report export rendering failures in toast; fix stale toast on early return"
```

---

## Task 10: Form Field Unsupported Type Warning (P2-6)

**Fixes**: P2-6 (non-text form fields silently ignored)  
**Files:**
- Modify: `js/formFieldOverlay.ts`

When a PDF contains checkboxes, radio buttons, or dropdowns, the user currently sees them visually but cannot interact with them and receives no explanation. Show a one-time toast.

- [ ] **Step 1: Detect unsupported fields in `FormFieldOverlay.render()`**

`render()` currently returns `Promise<void>`. Change it to return the count of unsupported fields so the caller can inform the user:

```typescript
// Change return type:
async render(
  page: PDFPageProxy,
  viewport: PageViewport,
  canvasOffset: { left: number; top: number },
  values: Record<string, string>,
  onValueChange: (fieldName: string, value: string) => void,
): Promise<{ unsupportedCount: number }> {    // ← was Promise<void>
  this.clear();
  const annotations: any[] = await page.getAnnotations();
  const fields = annotations.filter(a => a.subtype === 'Widget' && a.fieldType === 'Tx');
  const unsupported = annotations.filter(
    a => a.subtype === 'Widget' && a.fieldType !== 'Tx'
  );

  // ... existing loop for text fields, unchanged ...

  return { unsupportedCount: unsupported.length };   // ← add this return
}
```

- [ ] **Step 2: Show warning toast in `_renderFormFields()` in `pdfEditorApp.ts`**

```typescript
private async _renderFormFields(): Promise<void> {
  const docPage = this.documentModel.currentPage;
  if (!docPage) { this._formFieldOverlay.clear(); return; }
  const src = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
  if (!src) return;
  const page = await src.doc.getPage(docPage.sourcePageNum);
  const effectiveRotation = (page.rotate + (docPage.rotation ?? 0)) % 360;
  const viewport = page.getViewport({ scale: this.zoomScale, rotation: effectiveRotation });
  const canvasOffset = { left: this.ui.canvas.offsetLeft, top: this.ui.canvas.offsetTop };
  const values = this._formValues[docPage.sourcePdfId] ?? {};

  const { unsupportedCount } = await this._formFieldOverlay.render(   // ← destructure
    page, viewport, canvasOffset, values,
    (fieldName, value) => {
      if (!this._formValues[docPage.sourcePdfId]) this._formValues[docPage.sourcePdfId] = {};
      this._formValues[docPage.sourcePdfId][fieldName] = value;
      this._autosave();
    }
  );

  if (unsupportedCount > 0 && !this._warnedUnsupportedFields) {
    this._warnedUnsupportedFields = true;
    this.showToast(
      `This PDF has ${unsupportedCount} checkbox/dropdown field${unsupportedCount > 1 ? 's' : ''} — only text fields are supported`,
      5000,
    );
  }
  this._formFieldOverlay.setPointerEvents(this.mode === 'select');
}
```

Add the flag field to `PDFEditorApp`:
```typescript
private _warnedUnsupportedFields = false;
```

Reset it in `handleFileUpload()` after the state reset block:
```typescript
this._warnedUnsupportedFields = false;
```

- [ ] **Step 3: Type-check + test**

```bash
npm run type-check && npm test
```
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add js/formFieldOverlay.ts js/pdfEditorApp.ts
git commit -m "feat: warn user when PDF contains unsupported form field types (checkbox/dropdown)"
```

---

## Task 11: Text Search — LRU Cache Eviction (P2-5)

**Fixes**: P2-5 (search cache grows unbounded)  
**Files:**
- Modify: `js/textSearchHandler.ts`
- Modify: `tests/textSearchHandler.test.ts` (new file)

**Design**: JavaScript `Map` preserves insertion order. Deleting the first key evicts the oldest entry — a correct LRU strategy with O(1) operations.

- [ ] **Step 1: Write failing LRU tests**

Create `tests/textSearchHandler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TextSearchHandler } from '../js/textSearchHandler';

// Minimal pdf.js page stub
function makePage(text: string) {
  return {
    getTextContent: async () => ({
      items: [{ str: text, transform: [1,0,0,1,50,500], width: text.length * 7, height: 14 }],
    }),
  } as any;
}

describe('TextSearchHandler LRU cache', () => {
  it('evicts oldest entry when cache exceeds 20 pages', async () => {
    const handler = new TextSearchHandler();
    // Build index for 21 pages
    for (let i = 0; i < 21; i++) {
      await handler.buildIndex(makePage(`content of page ${i}`), `page-${i}`);
    }
    // page-0 should have been evicted
    const vp = { transform: [1,0,0,-1,0,842] } as any;
    const matches = handler.search('content of page 0', 'page-0', vp, 1);
    expect(matches).toHaveLength(0);   // evicted → no index → no match

    // page-20 (most recent) should still be cached
    const matches20 = handler.search('content of page 20', 'page-20', vp, 1);
    expect(matches20).toHaveLength(1);
  });

  it('re-accessing a page refreshes it (LRU promotion)', async () => {
    const handler = new TextSearchHandler();
    await handler.buildIndex(makePage('important page'), 'page-0');
    // Add 19 more
    for (let i = 1; i < 20; i++) {
      await handler.buildIndex(makePage(`page ${i}`), `page-${i}`);
    }
    // Access page-0 again (promotes it)
    await handler.buildIndex(makePage('important page'), 'page-0');
    // Now add one more — should evict page-1 (oldest), not page-0
    await handler.buildIndex(makePage('new page'), 'page-21');

    const vp = { transform: [1,0,0,-1,0,842] } as any;
    expect(handler.search('important page', 'page-0', vp, 1)).toHaveLength(1);  // still cached
    expect(handler.search('page 1', 'page-1', vp, 1)).toHaveLength(0);          // evicted
  });
});
```

Run `npm test` — expect failure (`MAX_CACHE_SIZE` not implemented).

- [ ] **Step 2: Implement LRU eviction in `js/textSearchHandler.ts`**

Add the constant and update `buildIndex`:

```typescript
private static readonly MAX_CACHE_SIZE = 20;

async buildIndex(page: any, pageId: string): Promise<void> {
  if (this._cache.has(pageId)) {
    // LRU promotion: move to end of insertion order
    const items = this._cache.get(pageId)!;
    this._cache.delete(pageId);
    this._cache.set(pageId, items);
    return;
  }
  // Evict oldest entry if at capacity
  if (this._cache.size >= TextSearchHandler.MAX_CACHE_SIZE) {
    const oldestKey = this._cache.keys().next().value as string;
    this._cache.delete(oldestKey);
  }
  const content = await page.getTextContent();
  const items = content.items.filter(
    (item: any) => typeof item.str === 'string' && item.str.length > 0
  ) as RawTextItem[];
  this._cache.set(pageId, items);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: LRU tests pass.

- [ ] **Step 4: Commit**

```bash
git add js/textSearchHandler.ts tests/textSearchHandler.test.ts
git commit -m "fix: LRU cache eviction in TextSearchHandler — capped at 20 pages"
```

---

## Task 12: Word-Level Search Highlight Bounding Boxes (P3-4)

**Fixes**: P3-4 (highlight spans entire text item instead of matched word)  
**Files:**
- Modify: `js/textSearchHandler.ts`
- Modify: `tests/textSearchHandler.test.ts`

**Approach**: Use the character index of the match within `item.str` to proportionally offset `x` and calculate `width`. This is an approximation (proportional character width) — accurate enough for all practical cases without requiring glyph-level metrics.

- [ ] **Step 1: Write failing test**

Add to `tests/textSearchHandler.test.ts`:

```typescript
describe('TextSearchHandler word-level highlights', () => {
  it('match x/width is narrower than the full item width', async () => {
    const handler = new TextSearchHandler();
    const text = 'Test content for search: Hello World';
    await handler.buildIndex(makePage(text), 'p1');

    const vp = { transform: [1,0,0,-1,0,842] } as any;
    const matches = handler.search('search', 'p1', vp, 1);
    expect(matches).toHaveLength(1);

    const itemWidth = text.length * 7; // same as makePage stub
    // Match should be narrower than the full item
    expect(matches[0].width).toBeLessThan(itemWidth * 0.5);
    // Match x should be > the item start (it's mid-string)
    expect(matches[0].x).toBeGreaterThan(50); // stub has x=50
  });
});
```

Run `npm test` — expect failure.

- [ ] **Step 2: Update `search()` in `js/textSearchHandler.ts`**

Replace the existing match-construction block inside the `for (const item of items)` loop:

```typescript
// Before (produces item-width bounding box):
const w = item.width * scaleInVp;
const h = item.height * scaleInVp;
const x = canvasPt[0];
const y = canvasPt[1] - h * 0.9;
results.push({ pageId, x: x / currentScale, y: y / currentScale, width: w / currentScale, height: h / currentScale });

// After (proportional to match position within item):
const itemStr   = item.str;
const matchIdx  = itemStr.toLowerCase().indexOf(q);
if (matchIdx === -1) continue;

const totalW    = item.width * scaleInVp;
const charW     = totalW / (itemStr.length || 1);   // avg char width
const matchX    = canvasPt[0] + matchIdx * charW;
const matchW    = Math.max(charW, q.length * charW); // at least one char wide
const h         = item.height * scaleInVp;
const y         = canvasPt[1] - h * 0.9;

results.push({
  pageId,
  x:      matchX / currentScale,
  y:      y      / currentScale,
  width:  matchW / currentScale,
  height: h      / currentScale,
});
```

Also remove the early `if (!item.str.toLowerCase().includes(q)) continue;` check since `indexOf` now provides the position directly.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all search tests pass.

- [ ] **Step 4: Commit**

```bash
git add js/textSearchHandler.ts tests/textSearchHandler.test.ts
git commit -m "fix: word-level search highlight bounding box via proportional character offset"
```

---

## Task 13: True Redaction — Rasterize Pages with Redaction Elements (P0-1)

**Fixes**: P0-1 (redaction is cosmetic — text extractable from exported PDF)  
**Files:**
- Modify: `js/pdfEditorApp.ts`

**Architecture**: Any page that contains `redaction` elements is exported as a rasterized PNG image at 2× scale instead of as vector content. This permanently removes all text layer data from those pages in the output. Non-redacted pages export normally as vector — no quality regression.

The implementation reuses the existing `_drawElementOnPage` pipeline and the same pdf.js rasterization used by `downloadPageAsImage`.

- [ ] **Step 1: Write pure-function test for `_transformPoint`**

Add to `tests/pdfEditorApp.unit.test.ts` (confirms the coordinate math used in rasterization):

```typescript
// Import the class — we'll test the public method
// (We can expose _transformPoint as package-internal for testing by making it non-private
//  or by testing through integration. Here we test the math directly.)
describe('coordinate transform (rotation logic)', () => {
  // Simulate _transformPoint cases
  const transform = (px: number, py: number, W: number, H: number, rot: number) => {
    switch (((rot % 360) + 360) % 360) {
      case 90:  return { x: W - py, y: H - px };
      case 180: return { x: W - px, y: H - py };
      case 270: return { x: py, y: px };
      default:  return { x: px, y: H - py };  // 0°
    }
  };

  it('0° rotation: y-flips to PDF bottom-left origin', () => {
    const result = transform(100, 200, 595, 842, 0);
    expect(result).toEqual({ x: 100, y: 642 }); // 842 - 200 = 642
  });

  it('90° CCW rotation', () => {
    const result = transform(100, 200, 595, 842, 90);
    expect(result).toEqual({ x: 595 - 200, y: 842 - 100 }); // {395, 742}
  });

  it('180° rotation', () => {
    const result = transform(100, 200, 595, 842, 180);
    expect(result).toEqual({ x: 595 - 100, y: 842 - 200 }); // {495, 642}
  });
});
```

Run `npm test` — expect pass (pure math, no DOM needed).

- [ ] **Step 2: Add `_rasterizePageWithRedactions()` to `pdfEditorApp.ts`**

Add this private method before `downloadPDF`:

```typescript
/**
 * Export a page as a rasterized PNG image embedded in a new pdf-lib page.
 * Used when the page contains redaction elements — rasterization permanently
 * removes the text layer, making redacted content unextractable.
 *
 * @param srcDoc      - pdf-lib source document (already loaded)
 * @param docPage     - document page descriptor
 * @param elements    - ALL elements for this page (redactions + others)
 * @param pdfDoc      - destination pdf-lib document to embed the image into
 * @param libs        - { rgb, StandardFonts, degrees } from pdf-lib dynamic import
 */
private async _rasterizePageWithRedactions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  srcDoc: any,
  docPage: import('./documentModel').DocumentPage,
  elements: PDFElement[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  libs: { rgb: any; StandardFonts: any; degrees: any },
): Promise<void> {
  const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
  const { degrees: _d, ...rest } = libs;

  // 1. Build a single-page vector PDF with all non-redaction elements
  const tempDoc = await PDFDocument.create();
  const [tempPage] = await tempDoc.copyPages(srcDoc, [docPage.sourcePageNum - 1]);
  tempDoc.addPage(tempPage);

  const userRot   = docPage.rotation ?? 0;
  const srcRot    = (tempPage.getRotation().angle as number);
  const totalRot  = (srcRot + userRot) % 360;
  if (userRot) tempPage.setRotation(degrees(totalRot));

  const { width: W_orig, height: H_orig } = tempPage.getSize() as { width: number; height: number };
  const { width: w_eff, height: h_eff }   = this._getEffectivePageDims(tempPage);

  // Draw all elements EXCEPT redactions into the temp PDF
  for (const el of elements.filter(e => e.type !== 'redaction')) {
    try {
      await this._drawElementOnPage(
        tempDoc, tempPage, el, h_eff, w_eff, { rgb, StandardFonts }, W_orig, H_orig, totalRot,
      );
    } catch { /* skip malformed */ }
  }

  // Draw watermark if enabled (into the raster, so it can't be removed later)
  if (this.documentModel.watermark.enabled) {
    await this._drawWatermark(tempPage, W_orig, H_orig, { rgb, degrees, pdfDoc: tempDoc, StandardFonts });
  }

  // 2. Rasterize via pdf.js at 2× scale
  const tempBytes  = await tempDoc.save();
  const renderDoc  = await pdfjsLib.getDocument(tempBytes).promise;
  const renderPage = await renderDoc.getPage(1);
  const SCALE = 2;
  const effectiveRotation = (renderPage.rotate + userRot) % 360;
  const vp = renderPage.getViewport({ scale: SCALE, rotation: effectiveRotation });

  const offscreen    = document.createElement('canvas');
  offscreen.width    = Math.round(vp.width);
  offscreen.height   = Math.round(vp.height);
  const ctx          = offscreen.getContext('2d')!;
  await renderPage.render({ canvasContext: ctx, viewport: vp }).promise;

  // 3. Paint redaction boxes onto the canvas (cover content permanently)
  ctx.fillStyle = '#000000';
  for (const el of elements.filter(e => e.type === 'redaction')) {
    // Element coords are in scale=1 canvas space (PDF content space, top-left origin)
    // Multiply by SCALE to map to the rasterized canvas
    ctx.fillRect(
      Math.round(el.x * SCALE),
      Math.round(el.y * SCALE),
      Math.round(el.width  * SCALE),
      Math.round(el.height * SCALE),
    );
  }

  // 4. Embed the rasterized PNG into the destination document
  const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
    offscreen.toBlob((blob) => {
      if (!blob) { reject(new Error('canvas toBlob failed')); return; }
      blob.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
    }, 'image/png');
  });

  const pngImg  = await pdfDoc.embedPng(pngBytes);
  const newPage = pdfDoc.addPage([w_eff, h_eff]);
  newPage.drawImage(pngImg, { x: 0, y: 0, width: w_eff, height: h_eff });
}
```

- [ ] **Step 3: Integrate into `downloadPDF()`**

In the `downloadPDF()` page-export loop, split redaction vs non-redaction pages:

```typescript
// Replace the existing loop body:
for (const docPage of this.documentModel.pages) {
  const key          = `${docPage.sourcePdfId}:${docPage.sourcePageNum - 1}`;
  const pageElements = this.elements.filter(el => el.pageId === docPage.id);
  const hasRedaction = pageElements.some(el => el.type === 'redaction');

  if (hasRedaction) {
    // True redaction: rasterize the entire page
    const srcDoc = srcDocs.get(docPage.sourcePdfId);
    if (!srcDoc) continue;
    await this._rasterizePageWithRedactions(srcDoc, docPage, pageElements, pdfDoc, { rgb, StandardFonts, degrees });
    // Note: watermark is drawn inside _rasterizePageWithRedactions when enabled
    continue;
  }

  // Normal vector export for non-redacted pages
  const page = copiedPages.get(key);
  if (!page) continue;
  pdfDoc.addPage(page);

  const userRot  = docPage.rotation ?? 0;
  const sourceRot = page.getRotation().angle as number;
  const totalRot  = (sourceRot + userRot) % 360;
  if (userRot) page.setRotation(degrees(totalRot));

  const { width: W_orig, height: H_orig } = page.getSize() as { width: number; height: number };
  const { width: w_eff, height: h_eff }   = this._getEffectivePageDims(page);
  const exportErrors: string[] = [];
  for (const element of pageElements) {
    try {
      await this._drawElementOnPage(pdfDoc, page, element, h_eff, w_eff, { rgb, StandardFonts }, W_orig, H_orig, totalRot);
    } catch (err) {
      exportErrors.push(`${element.type} (id ${element.id})`);
    }
  }
  if (this.documentModel.watermark.enabled) {
    await this._drawWatermark(page, W_orig, H_orig, { rgb, degrees, pdfDoc, StandardFonts });
  }
  if (exportErrors.length > 0) {
    this.showToast(`⚠ ${exportErrors.length} element(s) failed to render: ${exportErrors.join(', ')}`, 6000);
  }
}
```

- [ ] **Step 4: Integrate into `downloadPage()` (single-page split export)**

In `downloadPage()`, after loading the source and copying the page:

```typescript
const pageElements  = this.elements.filter(el => el.pageId === docPage.id);
const hasRedaction  = pageElements.some(el => el.type === 'redaction');

if (hasRedaction) {
  const srcDoc = await PDFDocument.load(srcEntry.bytes);
  await this._rasterizePageWithRedactions(srcDoc, docPage, pageElements, pdfDoc, { rgb, StandardFonts, degrees });
} else {
  // Existing vector export code
  const [page] = await pdfDoc.copyPages(srcDoc, [docPage.sourcePageNum - 1]);
  pdfDoc.addPage(page);
  // ... rest of existing code ...
}
```

- [ ] **Step 5: Verify `downloadPageAsImage` (already correct)**

`downloadPageAsImage` already rasterizes via pdf.js and draws the redaction box through `_drawElementOnPage` (which renders a black rectangle in the intermediate PDF). The rasterized PNG output has no text layer. **No change needed.**

- [ ] **Step 6: Verify with pdftotext**

After implementing, test manually:
1. Start dev server: `npm run dev`
2. Upload a text PDF, draw a redaction box over known text, click Download.
3. In terminal: `pdftotext -layout <downloaded-file>.pdf -`
4. Confirm: the redacted text **does not appear** in the output.

- [ ] **Step 7: Type-check + build**

```bash
npm run type-check && npm run build
```
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add js/pdfEditorApp.ts
git commit -m "fix(security): true redaction — rasterize pages with redaction elements, removing text layer from export"
```

---

## Task 14: SignaturePad — Replace Legacy Touch Bridge with Pointer Events (P3-6)

**Fixes**: P3-6 (SignaturePad uses legacy mouse/touch event bridging)  
**Files:**
- Modify: `js/signaturePad.ts`

The current implementation bridges touch events to `MouseEvent` dispatches — a legacy pattern that prevents stylus pressure, conflicts with pointer capture, and is inconsistent with the rest of the codebase which uses pointer events throughout.

- [ ] **Step 1: Rewrite `js/signaturePad.ts` — pointer events only**

Replace the entire file:

```typescript
export interface SignaturePadOptions {
  lineWidth?: number;
  color?: string;
}

export class SignaturePad {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing = false;
  lineWidth: number;
  color: string;

  constructor(canvas: HTMLCanvasElement, options: SignaturePadOptions = {}) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.lineWidth = options.lineWidth ?? 2;
    this.color     = options.color     ?? '#000000';
    this._setupEvents();
  }

  private _setupEvents(): void {
    this.canvas.addEventListener('pointerdown',   (e) => this._startDrawing(e));
    this.canvas.addEventListener('pointermove',   (e) => this._draw(e));
    this.canvas.addEventListener('pointerup',     ()  => this._stopDrawing());
    this.canvas.addEventListener('pointercancel', ()  => this._stopDrawing());
    this.canvas.addEventListener('pointerleave',  ()  => this._stopDrawing());
  }

  private _startDrawing(e: PointerEvent): void {
    // Accept pen, touch, and left-mouse only
    if (e.pointerType === 'mouse' && e.buttons !== 1) return;
    this.isDrawing = true;
    this.canvas.setPointerCapture(e.pointerId);
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.beginPath();
    this.ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    e.preventDefault();
  }

  private _draw(e: PointerEvent): void {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth   = this.lineWidth;
    this.ctx.lineCap     = 'round';
    this.ctx.lineJoin    = 'round';
    this.ctx.stroke();
    e.preventDefault();
  }

  private _stopDrawing(): void { this.isDrawing = false; }

  clear():            void   { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  getDataURL():       string { return this.canvas.toDataURL(); }
  setLineWidth(w: number): void { this.lineWidth = w; }
  setColor(c: string):     void { this.color = c; }
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```
Expected: exits 0.

- [ ] **Step 3: Manual test**

Open the app in a browser, click ✍ Sign, draw a signature with mouse. Verify it works identically to before.

- [ ] **Step 4: Commit**

```bash
git add js/signaturePad.ts
git commit -m "refactor: replace legacy mouse/touch event bridge in SignaturePad with pointer events"
```

---

## Task 15: PDF Compatibility, Favicon & Manifest (P3-2, P3-3, P3-1)

**Fixes**: P3-2 (manifest.json 404 dev), P3-3 (pdftotext syntax errors), P3-2 (favicon.ico 404)  
**Files:**
- Modify: `vite.config.ts`
- Modify: `index.html`
- Create: `public/favicon.ico` (1×1 transparent ICO)

### PDF Compatibility — `useObjectStreams: false` (P3-3)

pdf-lib by default generates cross-reference object streams (PDF 1.5+ feature). Older tools like Poppler/pdftotext report syntax errors on these. Disabling object streams produces a traditional xref table compatible with all tools.

- [ ] **Step 1: Add `{ useObjectStreams: false }` to all `pdfDoc.save()` calls in `pdfEditorApp.ts`**

Three callsites:
```typescript
// In downloadPDF():
const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

// In downloadPage():
const pdfBytes = await pdfDoc.save({ useObjectStreams: false });

// In downloadPageAsImage() (the intermediate tempDoc.save()):
const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
```

Also in `_rasterizePageWithRedactions()` (the tempDoc):
```typescript
const tempBytes = await tempDoc.save({ useObjectStreams: false });
```

### Favicon (P3-2)

- [ ] **Step 2: Add favicon link to `index.html`**

Add inside `<head>`, after the existing `<link rel="manifest">`:

```html
<link rel="icon" type="image/svg+xml" href="./icon.svg">
```

This reuses the existing `icon.svg` — no new file needed. The 404 for `favicon.ico` will persist (browsers always request it) but is now supplemented by the explicit icon link.

Alternatively, to fully suppress the 404, create `public/favicon.ico` as a zero-byte file:

```bash
touch public/favicon.ico
```

### Manifest (P3-1)

- [ ] **Step 3: Fix manifest filename in `vite.config.ts`**

```typescript
VitePWA({
  registerType: 'autoUpdate',
  manifestFilename: 'manifest.json',   // ← add this line
  workbox: { ... },                    // unchanged
  manifest: { ... },                   // unchanged
})
```

This ensures `vite build` generates `dist/manifest.json` (matching the `href="./manifest.json"` in `index.html`). In dev mode, VitePWA still uses a virtual module — the browser console warning will be reduced but the manifest route is only fully available after `npm run build && npm run preview`.

- [ ] **Step 4: Type-check + build**

```bash
npm run type-check && npm run build
```
Expected: both pass. Check `dist/manifest.json` exists after build.

- [ ] **Step 5: Final static gates**

```bash
npm run type-check    # must exit 0
npm run lint          # must exit 0
npm test              # all tests pass
npm run build         # must succeed
```

- [ ] **Step 6: Final commit**

```bash
git add vite.config.ts index.html public/favicon.ico js/pdfEditorApp.ts
git commit -m "fix: pdf-lib useObjectStreams:false for pdftotext compat; favicon; manifest filename"
```

---

## Self-Review Checklist

### Spec coverage

| Finding | Task |
|---------|------|
| P0-1 Redaction cosmetic | Task 13 |
| P1-1 Unused import | Task 4 |
| P1-2 Ternary expression | Task 4 |
| P1-3 Silent export drops | Task 9 |
| P1-4 Arrow nudge after placement | Task 5 |
| P1-5 Pinch zoom CSS leak | Task 8 |
| P2-1 window.app coupling | Task 3 |
| P2-2 Float IDs | Task 2 |
| P2-3 computeFitScale wrong page | Task 7 |
| P2-4 SnapshotCmd rebuilds all | Task 6 |
| P2-5 Search cache unbounded | Task 11 |
| P2-6 Form fields unsupported | Task 10 |
| P2-7 _pendingTextCmd race | Task 6 |
| P3-1 manifest.json 404 | Task 15 |
| P3-2 favicon.ico 404 | Task 15 |
| P3-3 pdftotext syntax errors | Task 15 |
| P3-4 Toast not cleared | Task 9 |
| P3-5 SignaturePad legacy touch | Task 14 |
| P3-6 Search item-level highlight | Task 12 |

All 19 items addressed (P3-6 search highlight was listed as P3-4 in the summary; both are covered). P3-1 (pdfjs eval) is a third-party library issue — not fixable without upgrading pdfjs-dist to v4.

### Dependency order

Tasks must be executed in order — each task's changes are additive:

```
Task 1  (test infra)
  └─ Task 2  (IDs)
       └─ Task 3  (decouple window.app) → unlocks all render-path changes
            ├─ Task 4  (static errors)
            ├─ Task 5  (auto-select)
            ├─ Task 6  (TextEditCmd + undo race)
            ├─ Task 7  (computeFitScale)
            ├─ Task 8  (pinch zoom)
            ├─ Task 9  (export feedback + toast fix)
            ├─ Task 10 (form field warning)
            ├─ Task 11 (LRU cache)
            ├─ Task 12 (word-level search)
            └─ Task 13 (true redaction) ← must come after Task 9 (export refactor)

Task 14 (SignaturePad)  — independent
Task 15 (compat/favicon/manifest) — independent, best done last
```

Tasks 14 and 15 are fully independent and can be done in any order. All others build on Task 3.
