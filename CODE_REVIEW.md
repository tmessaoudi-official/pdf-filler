# Code Review — PDF Fill & Sign

**Reviewer**: Senior automated review  
**Date**: 2026-06-02  
**Scope**: Full codebase — 22 TypeScript source files, 3,657 lines  
**Method**: Static analysis (`tsc`, ESLint), Playwright live feature testing, PDF binary inspection  

---

## Static Gate Results

| Tool | Result |
|------|--------|
| `npm run type-check` | ❌ **1 error** (unused import, pdfEditorApp.ts:26) |
| `npm run lint` | ❌ **2 errors, 2 warnings** across 2 files |
| `npm run build` | ✅ Pass (227 modules, 3.25 s) |

---

## Findings

### P0 — Security / Correctness Blockers

---

#### P0-1 · Redaction is cosmetic — underlying content is NOT removed

**File**: `js/pdfEditorApp.ts:1274`, `js/drawingHandler.ts:174–183`, `js/redactionElement.ts`

**The code**:
```typescript
} else if (element.type === 'redaction') {
  const anchor = tp(element.x, element.y + element.height);
  page.drawRectangle({
    x: anchor.x, y: anchor.y,
    width: ..., height: ...,
    color: rgb(0, 0, 0), borderWidth: 0
  });
}
```

**What it does**: Draws a black filled rectangle on top of the page content. The original page content — text, images, form data — is copied verbatim by `pdfDoc.copyPages()` before any drawing occurs. The rectangle is added as an additional paint layer above the original content.

**Why it's dangerous**: Any PDF reader, `pdftotext`, `pdf-redlines`, or even a hex editor can expose the original content. The user interface labels this feature "Redact" and uses a redaction icon (⬛), strongly implying permanent removal. This is a false sense of security.

**Evidence** (live test, 2026-06-02):

A clean PDF containing `"CONFIDENTIAL TEXT TO REDACT"` at PDF y=600 was loaded. A redaction box was drawn over that text and the document exported. Two independent tools confirmed the text is fully extractable:

```
# pdftotext -layout clean-redacted.pdf
Redaction security test document
CONFIDENTIAL TEXT TO REDACT          ← still present
This text is below the redaction box

# pdfjs text extraction
"Redaction security test document  CONFIDENTIAL TEXT TO REDACT  This text is below the redaction box"
```

**Fix required**: True redaction requires either (a) re-rendering the page to a rasterized image (losing vector quality) or (b) using a PDF editor library that supports content-stream editing to remove/replace text operators within the bounding rectangle. pdf-lib does not provide (b). The safest correct implementation is approach (a): rasterize the page to a canvas, draw a black box on the canvas, then embed the resulting PNG as a full-page image replacement. Alternatively, rename the feature to "Black Box" and document clearly that it provides visual coverage only, not content removal.

---

### P1 — High-Impact Quality Issues

---

#### P1-1 · TypeScript compilation error: unused import

**File**: `js/pdfEditorApp.ts:26`

```typescript
import { CommentElement } from './commentElement';
import { RedactionElement } from './redactionElement'; // ← never used in this file
```

`RedactionElement` is used in `DrawingHandler` and `ElementFactory`, not in `pdfEditorApp.ts`. `tsc --noEmit` exits 2. This blocks any CI pipeline that runs type-check before build.

**Fix**: Remove the unused import.

---

#### P1-2 · ESLint error: ternary used as expression statement

**File**: `js/pdfEditorApp.ts:113`

```typescript
this.ui.findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.shiftKey ? this._prevMatch() : this._nextMatch(); // ← no-unused-expressions
  }
  ...
});
```

A ternary used purely for side effects is flagged as an error by `@typescript-eslint/no-unused-expressions`. The value of the ternary is discarded.

**Fix**:
```typescript
if (e.shiftKey) this._prevMatch(); else this._nextMatch();
```

---

#### P1-3 · Silent element-drop on PDF export with no user feedback

**File**: `js/pdfEditorApp.ts:1058–1063`, `1110`, `1156`

```typescript
for (const element of pageElements) {
  try {
    await this._drawElementOnPage(...);
  } catch { /* skip malformed element */ }
}
```

This same pattern appears in `downloadPDF`, `downloadPage`, and `downloadPageAsImage`. Any element that fails to render — corrupted image data, an out-of-range font, a shape with zero points — silently vanishes from the export. The user receives no warning and may not notice missing content.

**Fix**: Collect failures and show a toast after generation: `"Export complete — 2 elements could not be rendered (corrupted data)"`. The `catch` blocks should log or count failures.

---

#### P1-4 · Newly placed element is not selected — arrow keys don't apply

**File**: `js/pdfEditorApp.ts:849–869` (`addTextAtPosition`), `871–883` (`addSignatureAtPosition`), `489–503` (`addImageAtPosition`), `837–847` (`_addCommentAtPosition`)

After placing any element, `selectElement()` is never called. `app.selectedElement` remains null. The arrow-key nudge handler checks `if (this.selectedElement)` and silently does nothing. The user must explicitly click the element to select it before nudging works.

**Fix**: Call `this.selectElement(textElement)` (or equivalent) at the end of each placement method.

---

#### P1-5 · Pinch zoom leaves CSS transform on canvas if interrupted

**File**: `js/drawingHandler.ts:77–78`, `102–107`, `199–208`

During a pinch gesture, the canvas gets `canvas.style.transform = scale(${ratio})` applied. On `pointerup`, `applyZoom()` is called and `canvas.style.transform = ''` is cleared before re-render. However, if a `pointercancel` fires for one of the two fingers (common on iOS when a third finger touches), the `_pinchPointers.size` drops to 1, the pinch cleanup branch is entered, but `canvas.style.transform` may be left set depending on event order. Additionally, `applyZoom()` is called asynchronously; during its re-render, the CSS-scaled canvas and the new canvas briefly overlap — a visible flicker.

**Fix**: Clear `canvas.style.transform = ''` synchronously in `handlePointerCancel` before delegating to `applyZoom`. Add a guard so `applyZoom` is only called when `_pinchPointers.size === 0`.

---

### P2 — Minor Quality Issues

---

#### P2-1 · `window.app` global coupling in core element classes

**Files**: `js/pdfElement.ts:41`, `js/commentElement.ts:~105`, `js/pageThumbnailPanel.ts:106`

Three places access `window.app` directly:
- `PDFElement.createControls()` calls `window.app.removeElement(this.id)` — every element's delete button reaches into the global app.
- `CommentElement.render()` calls `window.app._autosave?.()` — autosave triggered from a DOM event inside the element.
- `PageThumbnailPanel.render()` calls `window.app.downloadPage(i)` — thumbnail button invokes app method directly.

This creates a circular dependency between the data model layer and the application controller, and makes the classes impossible to unit-test without a global app object.

**Fix**: Pass callbacks at construction time (already done for most panel interactions via the `opts` pattern). `createControls()` should accept a `onDelete` callback.

---

#### P2-2 · Float ID collision risk

**File**: `js/pdfElement.ts:24`

```typescript
this.id = Date.now() + Math.random();
```

Two elements created programmatically in the same millisecond share the same `Date.now()` value. `Math.random()` reduces collision probability but does not eliminate it. The ID is used as a dictionary key in `findIndex(e => e.id === this.el.id)` — a collision causes one element's undo to silently remove the other.

**Fix**: Use a monotonically incrementing counter:
```typescript
static _nextId = 1;
this.id = PDFElement._nextId++;
```

---

#### P2-3 · `computeFitScale` always uses page 1 of the first source PDF

**File**: `js/pdfRenderer.ts:46`

```typescript
computeFitScale(containerWidth: number): Promise<number> {
  const doc = this.pdfDoc; // ← legacy compat: always first loaded doc
  if (!doc) return Promise.resolve(1.0);
  return doc.getPage(1).then(page => ...);
}
```

When multiple PDFs are merged, pages from different sources may have different dimensions (A4 vs US Letter, landscape vs portrait). The fit scale is always computed from page 1 of `this.pdfDoc` (the legacy compat field, set to the first-loaded PDF). Pages from other sources may overflow the viewport.

**Fix**: Compute fit scale from `documentModel.currentPage` dimensions (already accessible via the renderer's model reference).

---

#### P2-4 · `SnapshotCmd` serializes/deserializes all elements on every text undo

**File**: `js/historyManager.ts:59–83`

`SnapshotCmd.execute()` and `undo()` call `ElementFactory.fromJSON()` on every element in the array to rebuild the entire elements list. For a page with 50+ elements, every text undo triggers 50+ object reconstructions. Also, rebuilding all elements replaces object identity for all non-text elements, which breaks any external references (though none currently exist).

**Fix**: For text edits, snapshot only the changed text element's state rather than the full array. This changes `SnapshotCmd` into a targeted `TextEditCmd` that stores before/after text strings for a specific element ID.

---

#### P2-5 · `TextSearchHandler` cache never evicted

**File**: `js/textSearchHandler.ts:22–33`

The `_cache: Map<string, RawTextItem[]>` stores text content indexed by `pageId`. It is populated on `buildIndex()` and never cleared (no LRU, no max-size, `clearCache()` exists but is never called). For a 100-page merged document navigated in full, this holds all 100 pages' text items in memory indefinitely.

**Fix**: Cap the cache at a reasonable size (e.g., 20 pages) with LRU eviction, or call `clearCache()` when loading a new document.

---

#### P2-6 · Form fields: unsupported types silently ignored

**File**: `js/formFieldOverlay.ts:21`

```typescript
const fields = annotations.filter(a => a.subtype === 'Widget' && a.fieldType === 'Tx');
```

Checkboxes (`Btn`), radio buttons, and dropdown lists (`Ch`) are filtered out. The user sees them on the PDF but cannot interact with them. No warning is shown.

**Fix**: Either support additional field types or display a banner on load: "This PDF contains checkboxes/radio buttons which are not yet supported for interactive filling."

---

#### P2-7 · `_pendingTextCmd` can produce stale history entry

**File**: `js/pdfEditorApp.ts:913–919`

```typescript
if (!this._pendingTextCmd) this._pendingTextCmd = new SnapshotCmd(this.elements);
clearTimeout(this._textChangeTimer ?? undefined);
this._textChangeTimer = setTimeout(() => {
  const cmd = this._pendingTextCmd;
  if (cmd) { cmd.captureAfter(); this.historyManager.record(cmd); ... }
}, 500);
```

If the user types text and then immediately undoes the `AddElementCmd` (within 500 ms), the element is removed from `this.elements`. When the 500 ms timer fires, `SnapshotCmd.captureAfter()` serializes an empty or partial elements array (the element is gone). `historyManager.record(cmd)` pushes a malformed snapshot. Subsequent undo of the snapshot restores a stale state.

**Fix**: In `undo()`, check if `_pendingTextCmd !== null` and cancel the timer, discarding the pending snapshot.

---

### P3 — Informational / Low-Priority

---

#### P3-1 · `pdfjs-dist` `eval` warning in build output

**File**: `node_modules/pdfjs-dist/build/pdf.js`

Build warning: `"Use of eval in node_modules/pdfjs-dist/build/pdf.js is strongly discouraged"`. This is a known upstream issue in pdfjs-dist 3.x. Not actionable without upgrading to pdfjs-dist 4.x (which has a different module API).

---

#### P3-2 · `manifest.json` 404 / Syntax error in dev mode

Vite/VitePWA serves the PWA manifest as a JS module in dev mode, not as a JSON file. The browser logs "Manifest: Syntax error" in the console. Harmless in production (where `vite build` generates a proper `manifest.webmanifest`), but confusing in development.

---

#### P3-3 · `favicon.ico` 404

No `favicon.ico` in `public/`. Browser always requests it. Add an empty `favicon.ico` or a redirect in `vite.config.ts`.

---

#### P3-4 · `TextSearchHandler.search()` returns item-level bounding boxes

**File**: `js/textSearchHandler.ts:36–69`

When a PDF text item spans a long string (e.g., "Test content for search: Hello World PDF Editor") and the user searches for "search", the match highlight covers the entire item width, not just the word "search". This is a limitation of the item-level granularity in `getTextContent()`.

**Fix**: Slice the item text at the match position and compute a proportional x-offset using `item.width * (matchStart / item.str.length)` for a tighter highlight box.

---

#### P3-5 · Signature pad uses legacy mouse-event dispatch for touch

**File**: `js/signaturePad.ts:26–40`

Touch events are bridged to `MouseEvent` dispatches via `dispatchEvent(new MouseEvent(...))`. This works but bypasses the pointer event model used everywhere else in the codebase. Should be refactored to pointer events for consistency and to support stylus pressure.

---

#### P3-6 · `downloadPageAsImage` returns without closing the "Rendering…" toast on `srcEntry` null

**File**: `js/pdfEditorApp.ts:1133–1136`

```typescript
const srcEntry = this.documentModel.sourcePdfs.get(docPage.sourcePdfId);
if (!srcEntry) return; // ← early return, toast "Rendering page image…" stays indefinitely
```

The 30-second toast shown before this check will stay visible until it auto-dismisses. The user sees no error message.

**Fix**: Replace `return` with `this.showToast('Export failed — source PDF not found'); return;` and move the `finally` block to ensure `container.style.opacity = '1'` is always restored.

---

## Summary Table

| ID | File | Line | Severity | Summary |
|----|------|------|----------|---------|
| P0-1 | pdfEditorApp.ts | 1274 | **P0** | Redaction is cosmetic — text still extractable from exported PDF |
| P1-1 | pdfEditorApp.ts | 26 | **P1** | TypeScript compile error: unused `RedactionElement` import |
| P1-2 | pdfEditorApp.ts | 113 | **P1** | ESLint error: ternary expression used as statement |
| P1-3 | pdfEditorApp.ts | 1059–1063 | **P1** | Silent element drop on export — no user feedback |
| P1-4 | pdfEditorApp.ts | 849–883 | **P1** | Newly placed element not selected — arrow nudge broken |
| P1-5 | drawingHandler.ts | 77–107 | **P1** | Pinch zoom CSS transform not cleaned up on cancel; flicker |
| P2-1 | pdfElement.ts, commentElement.ts | 41, ~105 | P2 | `window.app` global coupling in element classes |
| P2-2 | pdfElement.ts | 24 | P2 | Float ID — theoretical collision risk in batch creation |
| P2-3 | pdfRenderer.ts | 46 | P2 | `computeFitScale` always uses page 1 of first source |
| P2-4 | historyManager.ts | 73–82 | P2 | `SnapshotCmd` rebuilds all elements on every text undo |
| P2-5 | textSearchHandler.ts | 22 | P2 | Search cache never evicted — memory leak on large docs |
| P2-6 | formFieldOverlay.ts | 21 | P2 | Non-text form fields silently ignored |
| P2-7 | pdfEditorApp.ts | 913–919 | P2 | `_pendingTextCmd` can commit stale state after rapid undo |
| P3-1 | (build) | — | P3 | pdfjs-dist eval warning in build output |
| P3-2 | (dev) | — | P3 | manifest.json syntax error in dev mode |
| P3-3 | public/ | — | P3 | favicon.ico 404 |
| P3-4 | textSearchHandler.ts | 36–69 | P3 | Search highlights entire text item, not matched word |
| P3-5 | signaturePad.ts | 26–40 | P3 | Touch events dispatched as legacy MouseEvents |
| P3-6 | pdfEditorApp.ts | 1133–1136 | P3 | Toast not cleared on early `return` in downloadPageAsImage |

---

## Test Matrix

All 22 feature surfaces verified via Playwright live evaluation on 2026-06-02:

| Feature | Result |
|---------|--------|
| Upload PDF | ✅ |
| Form field detection (2 Tx fields) | ✅ |
| Form field fill + persist to IDB | ✅ |
| Add text element | ✅ |
| Text font/size/bold/italic/color | ✅ (requires element selected first) |
| Arrow shape | ✅ |
| Rectangle shape | ✅ |
| Ellipse shape | ✅ |
| Freehand drawing | ✅ |
| Highlight | ✅ |
| Redaction | ✅ (visual) / ⚠️ (see P0-1) |
| Comment/sticky note | ✅ |
| Watermark modal + apply | ✅ |
| Text search (2 matches found) | ✅ |
| Find next/prev | ✅ |
| Find bar close | ✅ |
| Zoom in/out | ✅ |
| Fit to width | ✅ |
| Undo (full stack) | ✅ |
| Redo | ✅ |
| Clear all + undo | ✅ |
| Signature modal open/close | ✅ |
| Help modal | ✅ |
| Page rotation (CCW + CW) | ✅ |
| Delete key removes element | ✅ |
| `T` key → text mode | ✅ |
| `Escape` → select mode | ✅ |
| Arrow nudge (newly placed) | ❌ (P1-4) |
| Session save to IndexedDB | ✅ (7 elements, 1 page, source bytes) |
| PDF export (full) | ✅ |
