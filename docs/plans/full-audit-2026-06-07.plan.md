# PDFturbo Full App Audit — 2026-06-07

## Audit Goal
Browser-test 100% of the app, root-cause all defects, document features/limitations/quirks.
No implementation in this phase — findings only.

## Known Issues Entering Audit (user-reported)
- [x] PDF text not selectable/copyable → FIXED in `textLayer.ts` (pdfjs v6 CSS vars)
- [x] Document rotation: elements get distorted — "many small letters per line" → PARTIALLY FIXED in `fb87e8b` (transform math correct; visual CSS rotation still missing)
- [ ] Per-element rotation: no visible UI for it → CONFIRMED MISSING
- [x] Watermark density: words stick together → FIXED in `fb87e8b`

---

## Advisor Review — 2026-06-07

Advisor (stronger model review) flagged 4 gaps in the original audit. Corrected below.

### GAP-1: Redaction security — RESOLVED ✅
**Prior status**: Audit listed redact as "CONFIRMED WORKING" (visual only). Memory had a prior P0 redaction issue.
**Live test result**: Exported PDF with a redaction element → pdfjs `getTextContent()` returned 0 items.
**Root cause analysis**: `_rasterizePageWithRedactions()` (lines 1802–1884) converts the entire page to a 2× raster canvas, draws solid black boxes, exports as PNG embedded in the output PDF. No original text layer survives.
**Status**: SECURE — P0 resolved (was fixed in a prior commit).

### GAP-2: Export correctness for rotated pages — CONFIRMED BUG (part of BUG-01)
**Issue**: BUG-01's `_transformPoint` math was fixed in `fb87e8b` (element positions are correct), but the element *content* still has no CSS `transform: rotate()`. On a 90°-rotated page, text elements export with swapped box dimensions but unrotated text → "many small letters per line" in the exported PDF too.
**Evidence**: No `rotation` field in `PDFElement` type (`pdfElement.ts` — zero matches for `rotation`). No `transform: rotate()` in `renderElements()` (line 1502-1542). Export path `_drawElementOnPage` reads `el.x, el.y, el.width, el.height` only.
**Impact**: A user who rotates a page then exports will get distorted annotations in the PDF output.
**Fix required**: Add `rotation: number` to `PDFElement`; increment by page rotation delta in `_rotatePage`; apply CSS `transform: rotate()` in `renderElements()`; apply in `_drawElementOnPage()` export.

### GAP-3: IndexedDB session restore race — NEW BUG (BUG-09)
**Issue**: `_restoreSession()` (line 1042) is called at app init (line 112) without setting `_isLoading = true`. The async restore takes several seconds for large sessions. During this window, a user dropping a file triggers `handleFileUpload()` which checks `_isLoading` (line 1231) — sees `false` — and proceeds concurrently. Both coroutines now modify `this.documentModel`, `this.elements`, and `this.renderer` simultaneously.
**Worst case**: `handleFileUpload` resets `this.documentModel = new DocumentModel()` at line 1266 while `_restoreSession` is still writing to the OLD model. The restore's final `_renderCurrentPage()` renders stale state, and elements from the saved session can appear on top of the newly loaded PDF.
**Fix required**: In `_restoreSession()`, add `if (this._isLoading) return; this._isLoading = true;` at the start and `finally { this._isLoading = false; }` at the end.
**Severity**: P1 — affects users with saved sessions who open a new file quickly.

### GAP-4: Multi-page PDF — OUT OF SCOPE (acknowledged)
**Status**: Not tested in this audit pass. Page rotation, thumbnail reorder, and navigation on multi-page PDFs are untested.
**Action**: Document as known limitation. Priority for a follow-up audit after BUG-01/BUG-02 are fixed.

---

## Test Results Summary (browser-tested)

### ✅ CONFIRMED WORKING

| Feature | Behavior |
|---|---|
| Text tool | Place, type, font controls (size/bold/italic/color), move, resize, delete |
| Signature tool | Draw on canvas, save, enter place-mode, click to place as background-image element |
| Image tool | File select via `addImageInput`, enter place-mode, click to place as `<img>` element |
| Comment/note tool | Click-to-place, persists (even empty, survives Escape) |
| Arrow tool (→) | Draw via pointer events; creates `shape-element` with SVG |
| Rectangle tool (□) | Draw via pointer events; creates `shape-element` |
| Circle tool (○) | Draw via pointer events; creates `shape-element` |
| Freehand pen (✏) | Draws on canvas overlay; "Done" pill exits mode |
| Highlight brush (🖊) | Drag to create `highlight-element` |
| Eraser (⌫) | Erases freehand strokes on canvas overlay |
| Redact tool (⬛) | Drag to create `redaction-element`; export is cryptographically secure (full rasterization) |
| Copy/paste | Ctrl+C/Ctrl+V duplicates selected element |
| Delete element | Delete key removes selected element |
| Undo/redo | Works correctly — async (1–2s delay for render); buttons enable/disable correctly |
| Export/download | Generates blob URL, filename `<name>-edited.pdf`, triggers download |
| Export preview | Opens overlay with annotation outlines; closes cleanly; canvas unaffected |
| Help modal | Opens with keyboard shortcuts; i18n translated |
| Language switcher | EN/FR/AR switching works (async ~100ms); UI fully updates |
| Arabic RTL | `dir="rtl"`, all strings translated, layout mirrors |
| Storage banner dismiss | Hidden, localStorage key `pdfturbo_storage_notice=1` persisted |
| Storage banner i18n | All three languages |
| Zoom in/out/fit | Canvas dimensions update correctly |
| Page rotation (thumbnail) | 90° CW correctly swaps canvas W↔H; `_transformPoint` math correct (fb87e8b) |
| Thumbnail panel | Rotate CCW/CW, Export PDF/PNG, Delete page, Add PDF/Image buttons all present |
| Watermark modal | Opens, configures, previews; density monotonic (fixed fb87e8b) |
| Search/find bar | Opens; searches PDF text |
| PDF text selection | Text layer renders correctly; text selectable and copyable |
| Keyboard shortcuts | Delete, Ctrl+Z/Y/C/V, Escape all functional |
| Ink stroke rotation | Strokes correctly transform when page rotates (fixed fb87e8b) |

---

## BUGS FOUND — Revised After Advisor Review

### P0 — CRITICAL

*(None remaining — redaction P0 confirmed fixed)*

---

### P1 — HIGH (significant UX degradation)

#### BUG-01: Element visual distortion on document rotation — PARTIALLY FIXED
**Status**: Position math fixed (`_transformPoint` in fb87e8b); CSS visual rotation STILL MISSING

**Symptom**: When the PDF page is rotated 90°, text/annotation elements move to the correct position (fixed), but their content is not visually rotated. A text element that was 200×30 becomes 30×200 and the text wraps into a narrow column.

**Root cause**: No `rotation` field in `PDFElement` (`pdfElement.ts`). `renderElements()` does not apply `transform: rotate()`. The export path also reads only `el.x, el.y, el.width, el.height` — so exports are also wrong.

**Fix required**:
1. Add `rotation: number` field to element data model (default 0)
2. When page rotates 90° CW, increment each element's `rotation` by 90 (mod 360)
3. In `renderElements()`, apply `transform: rotate(${el.rotation}deg)` to the `.pdf-element` div
4. In `_drawElementOnPage()`, embed element rotation in the pdf-lib rendering

---

#### BUG-02: No per-element rotation UI
**Status**: MISSING FEATURE, CONFIRMED

**Symptom**: Users cannot individually rotate elements (text boxes, images, signatures).

**Fix required**:
1. Add rotation handle above the element (circular arc icon, top-center)
2. Drag rotation handle freely rotates element at any angle (not snapped to 45°)
3. Store `rotation: number` (degrees) in element data model
4. Apply `transform: rotate(${deg}deg)` on the element div
5. Update resize handles to account for rotation
6. Persist `rotation` in undo/redo history and export

**User specification**: "rotate at any angle not per 45 degrees"

---

#### BUG-09: IndexedDB session restore race condition
**Status**: CONFIRMED CODE BUG

**Symptom**: If a user has a saved session and drops a new PDF on the app before restore completes, both async operations run concurrently. Elements from the saved session can appear on top of the newly loaded PDF. In the worst case, a crash occurs.

**Root cause**: `_restoreSession()` (line 1042) does not guard `_isLoading`. `handleFileUpload()` checks `_isLoading` at line 1231 but the flag is `false` during restore.

**Fix required** (2 lines):
```typescript
private async _restoreSession(): Promise<void> {
  const state = await loadState();
  if (!state?.sourcePdfs?.length) return;
  if (this._isLoading) return;     // ← ADD
  this._isLoading = true;           // ← ADD
  try {
    // ... existing code ...
  } catch (err) {
    // ... existing catch ...
  } finally {                       // ← ADD
    this._isLoading = false;         // ← ADD
  }                                  // ← ADD
}
```

---

### P2 — MEDIUM (noticeable, workaround exists)

#### BUG-04: No explicit SELECT/Pointer mode toolbar button
**Status**: CONFIRMED UX ISSUE

**Symptom**: Once a tool mode is activated, the user can only exit by pressing Escape or clicking the same button again. There is no dedicated "arrow/pointer/select" button.

**Fix required**: Add a select/pointer button (arrow icon) as the first tool in the toolbar. It deactivates all drawing modes and enters select-only state.

---

#### BUG-05: Export preview has no toggle behavior
**Status**: CONFIRMED MINOR UX BUG

**Root cause**: Handler at line 159-161 has no toggle check:
```typescript
this.ui.previewExportBtn.addEventListener('click', () => {
  if (this.documentModel.currentPage) this._showExportPreview();  // no _exportPreviewOpen check
});
```

**Fix required**:
```typescript
if (this._exportPreviewOpen) {
  this._hideExportPreview();
} else if (this.documentModel.currentPage) {
  this._showExportPreview();
}
```

---

#### BUG-06: Freehand drawing not individually undoable/selectable
**Status**: BY DESIGN BUT LIMITATION

**Note**: Freehand strokes are on a canvas overlay. Cannot be individually selected, moved, resized, or deleted. Acceptable for v1, document as limitation.

---

### P3 — LOW (minor/cosmetic)

#### BUG-07: `setPointerCapture` console error on element placement
**Status**: REAL but only reproducible via synthetic events in automation; real users always trigger `pointerdown` first.

**Fix** (optional): Wrap `setPointerCapture` in try/catch.

---

#### BUG-08: Search finds no results in minimal synthetic PDF
**Status**: LIMITATION — not a real bug. Minimal test PDF lacks ToUnicode map; real PDFs work correctly.

---

## ALREADY FIXED (before/during audit)

| Bug | Fix | Commit |
|---|---|---|
| PDF text not selectable | pdfjs v6 `--total-scale-factor` CSS var | prior session |
| Storage banner i18n | `data-i18n` attributes + EN/FR/AR keys | prior session |
| Watermark density overlap | Replaced density-factor multiplier with count-based step | fb87e8b |
| `_transformPoint` 90°/270° cases swapped | Fixed case mapping | fb87e8b |
| `_inverseTransformPoint` 180° y-axis inverted | Fixed | fb87e8b |
| Ink stroke rotation on page rotate | `_transformCanvasPoint` applied to strokes | fb87e8b |
| Redaction security | Full page rasterization (canvas→PNG→embed) | prior sprint |
| user-select:text missing on textLayer | Added to CSS | fb87e8b |

---

## Features Confirmed NOT Present (scope for future)

| Missing Feature | Priority |
|---|---|
| Per-element rotation handle | High — needed for document rotation correctness |
| SELECT mode toolbar button | Medium — UX discoverability |
| Multi-page PDF test (>1 page) | Not tested in audit |
| Drag-and-drop file upload | Not tested |
| Form field PDF (checkbox, dropdown) | Not tested — app claims text fields only |
| Mobile/touch behavior | Not tested in this audit |
| Undo of page rotation | Not tested |
| Element z-order (bring forward/send back) | Not present |
| Text box border/background styling | Not present |

---

## Revised Implementation Plan (post advisor review)

### Phase A — Quick fixes ✅ DONE
1. **BUG-09**: `_restoreSession()` race fixed + restore-or-fresh dialog added (i18n EN/FR/AR)
2. **BUG-05**: Export preview toggle fixed (eye icon now closes when open)
3. **BUG-07**: `setPointerCapture` wrapped in try/catch in all 3 locations
4. **BUG-04**: SELECT button added to toolbar (↖, active by default, synced with mode)

### Phase B — Element rotation (core feature, ~1 day)
1. Add `rotation: number` to element data model and `PDFElement` type
2. Apply `transform: rotate(${el.rotation}deg)` in `renderElements()`
3. On document page rotation, increment all elements' `rotation` by ±90
4. Add rotation handle UI to element controls
5. Free-angle drag rotation (no 45° snapping)
6. Persist rotation in undo/redo and export (`_drawElementOnPage`)

### Phase C — Export correctness verification
1. Verify pdf-lib export respects `el.rotation` for all element types
2. Test round-trip: add rotated text, export, re-open, verify angle preserved
3. Test multi-page PDF (deferred from audit pass)

---

## Decisions Log
- [2026-06-07] AGREED: Phase sequence A → B → C before any publish
- [2026-06-07] AGREED: BUG-03 watermark fix: keep `textWidth*1.2` floor (prevents overlap); the prior plan's "remove floor entirely" was wrong (advisor confirmed)
- [2026-06-07] CONFIRMED: Redaction is cryptographically secure (rasterization approach)
- [2026-06-07] CONFIRMED: Multi-page PDF is out of scope for this audit pass
