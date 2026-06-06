# PDF Editor — Improvements Plan

**Created**: 2026-06-06  
**Source**: Full 37-feature live test session with user feedback  
**Status**: SPEC COMPLETE — awaiting brainstorm sessions before implementation  
**Deployed app**: https://tmessaoudi-official.github.io/pdfturbo/

---

## Decisions Log

- [2026-06-06 00:00] AGREED: All 37 features tested one by one with structured feedback
- [2026-06-06 00:00] AGREED: Write full spec before touching any code
- [2026-06-06 00:00] AGREED: Items marked [BRAINSTORM] need a dedicated design session before implementation
- [2026-06-06 00:00] AGREED: Export preview boxes should use the same coordinate transform as the actual export
- [2026-06-06 00:00] AGREED: Resize minimum threshold drop from 50×20 px to 10×10 px (per-type minimums TBD in brainstorm)
- [2026-06-06 00:00] AGREED: Text tool should always use `<textarea>` (multiline by default)
- [2026-06-06 00:00] AGREED: Thumbnail panel owns ALL per-page actions — toolbar Export Page + Export PNG move there

---

## Overview

| Category | Count | Priority |
|----------|-------|----------|
| P0 — Critical bugs (broken behavior) | 6 | Fix first |
| P1 — Export accuracy bugs | 4 | Fix second |
| P2 — Modal / interaction bugs | 5 | Fix third |
| P3 — UX polish | 6 | After bugs |
| [BRAINSTORM] Design decisions needed | 7 | Design first, then implement |

---

## Part 1 — Critical Bugs (P0)

These break core features and must be fixed before anything else.

---

### BUG-01 — Text multi-line disabled (P0)

**Feature**: F13 Text Tool  
**Symptom**: Pressing Enter inside a text element does nothing — no new line created.  
**Root cause**: `TextElement` constructor defaults `multiline: false`, which renders an `<input type="text">` (single-line). The `<textarea>` code path exists but is never activated from `addTextAtPosition()`.  
**Location**: `js/textElement.ts:31`, `js/pdfEditorApp.ts:1062`

**Fix**:
1. Change `TextElement` constructor default: `this.multiline = options.multiline ?? true`
2. Remove the `multiline` option from `TextOptions` (it's always true now) — or keep it but never pass `false`
3. In `_applyInputFormatting`, add `textarea`-specific styles: `resize: none`, `overflow: hidden`, auto-expand height on input
4. In the export (`_drawElementOnPage`), the `text.split('\n').forEach(...)` loop already handles multi-line — no change needed there

**Acceptance test**: Type "Line 1", press Enter, type "Line 2" → two lines appear and export correctly.

---

### BUG-02 — Signature: Save on empty pad creates invisible element (P0)

**Feature**: F19 Signature  
**Symptom**: Clicking Save with a blank signature pad creates an empty transparent element on the canvas.  
**Root cause**: `saveSignature()` calls `this.signaturePad.getDataURL()` without checking if the pad has any strokes.  
**Location**: `js/pdfEditorApp.ts:1004-1009`

**Fix**:
1. Add `isEmpty(): boolean` to `SignaturePad` class — check if all canvas pixels are transparent (or track stroke count)
2. In `saveSignature()`: if `this.signaturePad.isEmpty()` → show toast "Please draw a signature first" and return without closing the modal

**Acceptance test**: Open modal, click Save without drawing → modal stays open, toast appears. Draw something, Save → works.

---

### BUG-03 — Signature: Escape key doesn't close modal (P0)

**Feature**: F19 Signature  
**Symptom**: Pressing Escape while the signature modal is open does nothing — all other modals (help, watermark) close on Escape.  
**Root cause**: The global `keydown` Escape handler checks `helpModal`, `watermarkModal`, and `findBar`, but not `signatureModal`.  
**Location**: `js/pdfEditorApp.ts:356-364`

**Fix**: Add signature modal check to the Escape handler chain:
```typescript
if (e.key === 'Escape') {
  if (this.ui.helpModal.classList.contains('active'))      { this._toggleHelp(false); return; }
  if (this.ui.signatureModal.classList.contains('active')) { this.closeSignatureModal(); return; } // ADD THIS
  if (this.ui.watermarkModal.classList.contains('active')) { this._closeWatermarkModal(); return; }
  if (this.ui.findBar.style.display !== 'none')           { this._closeFindBar(); return; }
  ...
}
```

**Acceptance test**: Open signature modal → press Escape → modal closes, mode returns to SELECT.

---

### BUG-04 — Delete page: no toast when only 1 page (P0)

**Feature**: F9 Delete Page  
**Symptom**: When only 1 page remains and the user clicks the Delete button on the thumbnail, nothing happens — no feedback at all. The button appears to be disabled (no click fires), so the toast never shows.  
**Root cause**: `pageThumbnailPanel.ts` likely disables the delete button when `pageCount === 1`. The guard in `_deletePage()` has the toast but it's never reached.  
**Location**: `js/pageThumbnailPanel.ts` (delete button rendering), `js/pdfEditorApp.ts:665-670`

**Fix**:
1. Do NOT disable the delete button — keep it always enabled
2. Let the click fire through to `_deletePage()` which already has `this.showToast('Cannot delete the only page')`
3. Alternatively, add a `title="Cannot delete the only page"` tooltip to the button when `pageCount === 1`, so there's hover feedback even if the click is swallowed

**Acceptance test**: 1-page document → click thumbnail × → toast "Cannot delete the only page" appears.

---

### BUG-05 — Watermark modal closes on text selection drag (P0)

**Feature**: F26 Watermark  
**Symptom**: When selecting text in the watermark text input and dragging the mouse outside the modal boundary, the modal closes. This interrupts normal text editing.  
**Root cause**: The backdrop close handler uses `click` on the modal: `if (e.target === this.ui.watermarkModal) this._closeWatermarkModal()`. A `mouseup` after a drag outside triggers this.  
**Location**: `js/pdfEditorApp.ts:351`

**Fix**: Replace the backdrop `click` listener with a `mousedown` + `mouseup` pair that only closes if both events occurred on the backdrop (not a drag):
```typescript
let _wmBackdropDown = false;
this.ui.watermarkModal.addEventListener('mousedown', (e) => {
  _wmBackdropDown = e.target === this.ui.watermarkModal;
});
this.ui.watermarkModal.addEventListener('mouseup', (e) => {
  if (_wmBackdropDown && e.target === this.ui.watermarkModal) this._closeWatermarkModal();
  _wmBackdropDown = false;
});
```
Apply the same pattern to all modals that have backdrop-click-to-close (help, watermark, signature).

**Acceptance test**: Open watermark modal → select all text in the text field → drag mouse outside modal → modal stays open.

---

### BUG-06 — Watermark preview invisible (P0)

**Feature**: F26 Watermark  
**Symptom**: The watermark preview area in the modal shows nothing — the preview text element exists in the DOM but isn't visible.  
**Root cause**: Need to inspect `index.html` for the `wmPreviewText` element's container — likely missing `position: relative`, `overflow: visible`, or the container has `height: 0`.  
**Location**: `index.html` (watermark modal HTML), `js/pdfEditorApp.ts:454-461`

**Fix**:
1. Read the watermark modal HTML structure in `index.html`
2. Ensure the preview container has sufficient height (min 80px) and `position: relative`
3. Ensure `wmPreviewText` has `position: absolute`, `display: flex`, `align-items: center`, `justify-content: center`
4. The preview should show a small scaled representation of the watermark text with current color/opacity/rotation

**Acceptance test**: Open watermark modal → type any text → preview area shows the watermark text with current settings.

---

## Part 2 — Export Accuracy Bugs (P1)

These affect the fidelity of the exported PDF. All share a similar root cause: coordinate transform mismatch between canvas space and PDF space.

---

### BUG-07 — Text exports slightly above canvas position (P1)

**Feature**: F3, F4, F5, F6  
**Symptom**: Text annotations appear a few pixels above their canvas position in the exported PDF.  
**Root cause**: The export uses `te.fontSize * 0.9` as the Y offset from the element's top to the text baseline. The comment says this was "measured" but the user consistently observes upward drift. The `0.9` constant may be too small (text baseline is actually lower in the input box).  
**Location**: `js/pdfEditorApp.ts:1629`

```typescript
// Current:
const anchor = tp(te.x, te.y + te.fontSize * 0.9 + i * lineHeight);
// The 0.9 factor positions the baseline 90% of fontSize below te.y
// If actual CSS baseline is higher, the factor needs to be smaller (not larger)
```

**Investigation needed**:
- In the browser, the text in a `<textarea>` (after BUG-01 fix) has its baseline at approximately `paddingTop + lineHeight * 0.8` from the element's top
- With default styles and `fontSize` px, the first line baseline ≈ `fontSize * 0.85 + 4` (4px top padding)
- The `4` (padding) offset is being ignored

**Proposed fix**:
```typescript
// Account for top padding (4px in textarea) + true ascent
const TEXT_TOP_PADDING = 4; // textarea padding-top
const anchor = tp(te.x, te.y + TEXT_TOP_PADDING + te.fontSize * 0.85 + i * lineHeight);
```

**Calibration**: After applying, export a test PDF with several font sizes (8, 14, 24, 48, 72) and visually verify alignment. Adjust constants as needed.

**Also affects**: Export Preview positioning (BUG-08).

---

### BUG-08 — Export preview boxes don't match actual export positions (P1)

**Feature**: F6 Export Preview  
**Symptom**: The blue dashed preview boxes show elements in different positions than where they actually land in the exported PDF. Also the boxes are too faint to see clearly.  
**Root cause**: The preview uses `_transformPoint` to place boxes but maps from `(el.x, el.y)` directly — same transform the export uses — so theoretically they should match. However, text is shown at `(el.x, el.y)` whereas the export draws text at `te.y + fontSize * 0.9`. If BUG-07 is fixed, preview and export will use the same math.  
**Location**: `js/pdfEditorApp.ts:1248-1264`

**Fix** (two parts):
1. **Visibility**: Change preview box style from `border: '2px dashed rgba(37,99,235,0.7)'` and `background: 'rgba(37,99,235,0.12)'` to something more visible: `border: '3px dashed #e63946'` (red), `background: 'rgba(230,57,70,0.18)'`
2. **Accuracy**: After BUG-07 fix, also account for the text baseline offset in preview boxes for text elements — shift the preview box down by `TEXT_TOP_PADDING + fontSize * 0.85` to match the export anchor

**Acceptance test**: Add text + rectangle + image → open preview → blue/red boxes appear clearly and sit exactly where the annotations are on the canvas.

---

### BUG-09 — Rectangle exports slightly misplaced (P1)

**Feature**: F15 Rectangle  
**Symptom**: Rectangles land in slightly different positions in the exported PDF vs their canvas position. Ellipses are not affected.  
**Root cause**: Unknown — the coordinate math looks correct for both rect and ellipse. Likely a sub-pixel rounding issue, or the canvas has a fractional offset that affects rect placement but is absorbed into the center-point calc for ellipses.  
**Location**: `js/pdfEditorApp.ts:1653-1656`

**Investigation**:
1. Add `console.log` to log `element.x/y`, `anchor.x/y` for a placed rect
2. Compare with the actual rect position in the PDF (using a PDF inspector tool)
3. Check if `canvasOffset.left / canvasOffset.top` is non-zero (canvas container padding) — this offset is NOT subtracted from element coordinates during export because elements are stored relative to the canvas, not the container

**Likely fix**: The canvas container has `padding: 8px` (from `.canvas-container` CSS class on mobile: `padding: 8px`). On desktop it may have similar padding. Element positions are stored with `canvasOffset` subtracted during render, but are the stored `x/y` values truly canvas-relative (not container-relative)?

Trace: `interactionHandler.ts` and `drawingHandler.ts` — how they compute `x/y` on mousedown — whether they use `canvas.getBoundingClientRect()` or `container.getBoundingClientRect()`. If they use the canvas rect, coordinates are canvas-relative ✓. If they use the container rect, they include the canvas offset and coordinates are wrong ✓.

**Acceptance test**: Place a rect at a known position → export → verify rect in PDF is within 1pt of its canvas position.

---

### BUG-10 — Arrow with large line width: arrowhead breaks (P1)

**Feature**: F15 Arrow  
**Symptom**: When arrow line width is set to a large value (e.g. 8+), the arrowhead looks broken — the head lines are as thick as the shaft, creating a visual mess.  
**Root cause**: Arrowhead lines use `thickness: lw` (same as shaft). For large `lw`, the head lines become too thick relative to their length.  
**Location**: `js/pdfEditorApp.ts:1668-1670`

**Fix**: Cap arrowhead thickness independently from shaft:
```typescript
const headThickness = Math.min(lw, Math.max(1, lw * 0.4)); // max 40% of shaft, min 1
// Replace both head drawLine calls' thickness: lw with thickness: headThickness
```

Also consider: at large widths, increase arrowhead length proportionally:
```typescript
const headLen = Math.max(12, lw * 5); // was Math.max(8, lw * 4)
```

**Acceptance test**: Draw an arrow with width 10 → arrowhead is visually clean and proportional.

---

### BUG-11 — Comment: text exports at wrong vertical position (P1)

**Feature**: F22 Comment  
**Symptom**: Comment note renders correctly on canvas (text below the "💬 Note" header) but in the exported PDF, the text appears near the top of the box with space below.  
**Root cause**: Export anchor uses `tp(ce.x + 4, ce.y + ce.height - 18)` which is 18px from the **bottom** of the box in canvas space. In PDF space this lands near the **top** of the box. But in the canvas, text starts ~22px from the top (after the header). These are opposite positions.  
**Location**: `js/pdfEditorApp.ts:1691-1693`

**Fix**: The text in the exported PDF should start ~22px from the top of the box (matching where it appears on canvas). In canvas space, the top of the comment is `ce.y`. The text starts at `ce.y + headerHeight + paddingTop` where `headerHeight ≈ 20px` and `paddingTop = 4px`.

After coordinate transform:
```typescript
// Canvas: text starts at ce.y + 24 (header 20px + padding 4px)  
// PDF: drawText y = tp(ce.x + 4, ce.y + 24 + fontSize).y
//   = H - (ce.y + 24 + 10)  [for fontSize=10]
//   = H - ce.y - 34
const TEXT_START_Y = 24; // header height (20) + padding (4)
const FONT_SIZE    = 10;
const anchor2 = tp(ce.x + 4, ce.y + TEXT_START_Y + FONT_SIZE);
```

**Also fix**: Add a visual separator or label to the export (even just "Note: " prefix or a top border line) so what you see on canvas is what you get in the PDF. See BUG-12.

---

### BUG-12 — Comment: canvas has header, export doesn't (P1)

**Feature**: F22 Comment  
**Symptom**: The comment element on canvas shows a "💬 Note" header bar with a delete button. The exported PDF shows only a plain rectangle with text — no header indication.  
**Root cause**: `_drawElementOnPage` for `comment` type draws a rectangle + text but doesn't draw any header.  
**Location**: `js/pdfEditorApp.ts:1684-1693`

**Design decision** (minor, decide during implementation):

**Option A** — Remove the header from the canvas DOM too. Make the comment a plain colored textarea with no header bar. Delete via the standard element controls (× button). Simpler, WYSIWYG.

**Option B** — Add a thin header line to the PDF export: draw a slightly darker rectangle across the top 20px of the comment box, add "Note" text in it at font size 8. WYSIWYG preserved.

**Recommendation**: Option A — simpler, cleaner, avoids header height discrepancy in coordinates. The delete button can move to the standard element controls like all other elements.

---

## Part 3 — Modal / Interaction Bugs (P2)

---

### BUG-13 — Highlight color parse: zero channels replaced by fallback (P2)

**Feature**: F21 Highlight  
**Symptom**: Any highlight color where one RGB channel is 0 renders incorrectly. E.g. red `#FF0000` renders as orange because the green (0) and blue (0) channels are replaced by fallback values.  
**Root cause**: `parseInt(hex, 16) || fallback` — the `||` treats `0` as falsy.  
**Location**: `js/highlightElement.ts:20-22`

**Fix**: Replace `|| fallback` with `isNaN(v) ? fallback : v`:
```typescript
// Before:
const r = parseInt(hex.slice(1,3), 16) || 255;
const g = parseInt(hex.slice(3,5), 16) || 220;
const b = parseInt(hex.slice(5,7), 16) || 0;

// After:
const parse = (s: string, fb: number) => { const v = parseInt(s, 16); return isNaN(v) ? fb : v; };
const r = parse(hex.slice(1,3), 255);
const g = parse(hex.slice(3,5), 220);
const b = parse(hex.slice(5,7), 0);
```

Note: this bug only matters when highlight color becomes user-configurable (currently it's hardcoded to `#FFFF00`). Fix it preemptively.

---

### BUG-14 — Search: no scroll-to-match on Next/Prev (P2)

**Feature**: F24 Text Search  
**Symptom**: Pressing Next/Prev updates the match counter and changes which match is "active" (bolded overlay) but doesn't scroll the canvas to make the match visible. If the match is off-screen, the user can't see it.  
**Root cause**: `_nextMatch()` and `_prevMatch()` call `_showSearchMatches()` but don't scroll.  
**Location**: `js/pdfEditorApp.ts:543-554`

**Fix**: After updating `_findMatchIndex`, scroll the active match into view:
```typescript
private _scrollToMatch(): void {
  if (this._findMatchIndex < 0) return;
  const match = this._findMatches[this._findMatchIndex];
  const container = this.ui.container.parentElement; // scrollable ancestor
  if (!container) return;
  const canvasTop = this.ui.canvas.offsetTop;
  const matchTop = canvasTop + match.y * this.zoomScale;
  const matchBottom = matchTop + match.height * this.zoomScale;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  if (matchTop < viewTop || matchBottom > viewBottom) {
    container.scrollTo({ top: matchTop - container.clientHeight / 2, behavior: 'smooth' });
  }
}
```
Call `_scrollToMatch()` at the end of `_nextMatch()` and `_prevMatch()`.

---

### BUG-15 — Help modal: shortcuts table incomplete (P2)

**Feature**: F32 Help Modal  
**Symptom**: `E` (eraser) and `F` (freehand alternate) keyboard shortcuts are not listed in the help modal table. User also noticed other gaps.  
**Root cause**: Help table in `index.html` was not updated when eraser and freehand `F` alias were added.  
**Location**: `index.html` (help modal HTML)

**Fix**: Audit the help table against all registered shortcuts in `pdfEditorApp.ts` keydown handler (line 355–431). Add missing entries:

| Missing | Should show |
|---------|-------------|
| `E` | Eraser mode |
| `F` | Freehand draw (alias for D) |
| `S` shortcut behavior | Opens signature modal |
| Comment shortcut | No keyboard shortcut currently — should add `N` for Note |

Also: add a `C` → "Clear All annotations" shortcut (currently no keyboard shortcut for clear all).

---

## Part 4 — UX Polish (P3)

---

### UX-01 — Thumbnail panel: per-page actions redesign

**Feature**: F8 Thumbnail Panel  
**Problem**: Per-page actions (Export Page PDF, Export PNG) are in the toolbar but belong to individual pages. The thumbnail Download button is also missing.  

**Decision** (from test session): Move ALL page-specific actions INTO the thumbnail panel. Remove Export Page + Export PNG from toolbar.

**Proposed thumbnail layout** (compact strip — always visible, touch-friendly):
```
┌─────────────────────┐
│   Page image        │
├─────────────────────┤
│ ↺  ↻ │ 📄  📷 │  × │
├─────────────────────┤
│      Page 1         │
└─────────────────────┘
```
- ↺ ↻ = rotate CCW / CW (existing)
- 📄 = download this page as PDF
- 📷 = download this page as PNG
- × = delete page (always clickable, shows toast if only 1 page)
- Vertical separators between groups

**Toolbar cleanup**: Remove `exportPageBtn` and `exportImgBtn` from toolbar row 1. The "Download all" (⬇) and "Preview Export" (👁) stay in the toolbar since they operate on the whole document.

**Files to change**: `js/pageThumbnailPanel.ts`, `index.html` (toolbar row 1 HTML)

---

### UX-02 — Button size inconsistency

**Feature**: F36 Mobile  
**Problem**: Toolbar buttons are different sizes. Desktop: Image + Highlight buttons are larger than others. Mobile: Text + Sign buttons are larger. This makes the toolbar look unpolished.  
**Root cause**: Some buttons have text labels (`<span class="btn-label">`) that add width, others are icon-only. CSS doesn't enforce uniform button dimensions.

**Fix**:
1. Set a fixed width and height for all `.btn-icon` elements: `min-width: 36px; height: 28px` on desktop
2. On mobile: `min-width: 40px; min-height: 40px` (already exists but inconsistently applied)
3. All buttons should use icon-only display (no text labels in the button itself — rely on mode badge + tooltips)
4. Add `title="..."` tooltip to every toolbar button for accessibility

---

### UX-03 — Resize minimum threshold too large

**Feature**: F12 Element Controls, F21 Highlight  
**Problem**: All elements have a 50×20 px minimum resize size. User can't make elements as small as needed (e.g. a small "X" text label, a thin highlight line).

**Fix**: Lower the minimums per element type:
- `text`: `max(fontSize, 20)` × `max(fontSize * 1.2, 16)` — just enough for one character
- `highlight`, `redaction`: 5×5 px — can be a thin line
- `shape` (rect/ellipse/arrow): 10×10 px
- `image`, `signature`: 20×20 px — below this images are meaningless
- `comment`: 80×40 px — needs to be readable

**Location**: `js/interactionHandler.ts` (resize handler, minimum clamp)

---

### UX-04 — Watermark tiles too sparse

**Feature**: F26 Watermark  
**Problem**: Watermark tiles are too far apart — large empty areas between watermark instances.  
**Root cause**: Step size in the tiling loop:
```typescript
const stepX = Math.max(textWidth + wm.fontSize * 1.5, W_orig / 3);
const stepY = Math.max(wm.fontSize * 3, H_orig / 3);
```
`W_orig / 3` and `H_orig / 3` produce only ~9 tiles for an A4 page.

**Fix**: Reduce step multipliers:
```typescript
const stepX = Math.max(textWidth + wm.fontSize * 0.8, W_orig / 5);
const stepY = Math.max(wm.fontSize * 2, H_orig / 4);
```
This produces ~20 tiles on an A4 page — denser, more professional-looking.

Also: add a "Density" slider to the watermark modal (low / medium / high) that maps to a step multiplier the user can control.

---

### UX-05 — Fonts: limited selection

**Feature**: F13 Text Tool  
**Problem**: Only 4 fonts available (Arial, Helvetica, Times New Roman, Courier New). Arial and Helvetica both export as Helvetica — effectively 3 typefaces.

**Constraints**: PDF Standard Type 1 fonts limit us to: Helvetica (+ Bold/Italic), Times Roman (+ Bold/Italic), Courier (+ Bold/Italic), Symbol, Zapf Dingbats. Any font outside this set requires embedding the font file in the PDF.

**Options**:

A) **No change** — document the limitation clearly. The 4 current fonts are the safe PDF-native options.

B) **Add Symbol / Zapf Dingbats** — useful for checkmarks, bullets etc. Map to their Standard Font names.

C) **Font embedding** — allow user to load a TTF/OTF font file. pdf-lib supports `embedFont()` with a custom font. High complexity, large PDFs.

**Recommendation**: Option B as a quick win (add Symbol), document the limitation, defer C to a future version. [BRAINSTORM: if user wants to pursue C, needs a dedicated design session]

---

### UX-06 — PWA manifest URL collision

**Feature**: F37 PWA  
**Problem**: `index.html` hardcodes `<link rel="manifest" href="./manifest.json">` but vite-plugin-pwa generates `manifest.webmanifest`. The first link 404s, breaking the PWA install prompt.  
**Location**: `index.html` line 11

**Fix**:
1. Remove `<link rel="manifest" href="./manifest.json">` from `index.html`
2. vite-plugin-pwa injects the correct `<link rel="manifest" href="manifest.webmanifest">` automatically during build
3. Verify in `vite.config.ts` that `injectManifest` or `generateSW` is configured correctly

**Note**: In dev mode, the manifest console error (F1 feedback) will remain — this is unavoidable in Vite dev server. Only matters in production.

---

## Part 5 — Items Requiring Brainstorming [BRAINSTORM]

These items need a dedicated design session before any implementation. Do NOT implement them without first completing the brainstorm.

---

### [BRAINSTORM-01] — Ink Layer / Paint-style Drawing

**Trigger**: F17 Freehand, F18 Eraser  
**Problem**: User wants a "paint-like" mode where all pen strokes accumulate on a persistent ink layer, not individual selectable elements. The eraser should work pixel/path-level, not element-level.

**Key questions to resolve**:
1. Is the ink layer a separate tool ("Pen" vs current "Freehand Shape") or does it replace freehand entirely?
2. How is the ink layer stored? Options:
   - **SVG layer per page**: accumulate all strokes in a single SVG element per page. Erasable at the stroke level (split/remove strokes). Vector, scalable.
   - **Raster canvas layer per page**: draw onto an off-screen canvas. Erasable pixel-by-pixel. Simpler, but not scalable and large storage.
   - **Hybrid**: keep element-based system but make strokes "part of a group" that looks and feels like a layer.
3. How does it export? SVG layer → embed as SVG path in PDF. Raster layer → embed as PNG.
4. How does undo work? Per-stroke, or per-brush-gesture?
5. What does the eraser erase? Stroke segments (SVG), or pixels (raster)?
6. Are strokes on the ink layer selectable/moveable as a group?

**Proposed brainstorm approach**: Start with SVG layer (best quality, vector export). Each pen-down → pen-up is one SVG `<path>` appended to the layer. Eraser removes path segments that intersect the erase stroke. Entire layer is one PDF element (exported as a single compound path).

---

### [BRAINSTORM-02] — Annotation coordinate transform on page rotation

**Trigger**: F10 Page Rotation  
**Problem**: When a page is rotated, existing annotations stay in their original canvas-space positions instead of rotating with the page content. A note placed on "the heading" stays at its pixel coordinates but the heading has moved.

**Key questions**:
1. Should annotations rotate automatically (transform their coordinates) or should the user manage them?
2. If auto-rotate: what is the math? For a 90° CW rotation of a page with dimensions W×H:
   - New annotation position: `x' = H - (y + height)`, `y' = x`
   - Width/height swap: `w' = height`, `h' = width`
   - For freehand points: each point transforms individually
   - For arrows: both endpoints transform
3. Should there be a choice per rotation: "Rotate annotations with page?" or always auto?
4. What happens to annotations that go partially out of bounds after rotation?

**Proposed brainstorm approach**: Auto-transform on rotation (most natural UX). Add a `RotatePageCmd` that transforms all annotation coordinates on the page as part of the same undo unit. The user sees annotations move with the content.

---

### [BRAINSTORM-03] — Document close / nuclear reset / state management

**Trigger**: F9, F30  
**Problem**: Current state management has:
- ✕ Clear All: removes annotations (undoable)
- ✕ Clear Save: wipes IndexedDB
- No way to "close" the current document and start fresh

**User wants**:
- Ability to delete the last page (currently blocked)
- "Close document" button → return to empty landing state
- "Reset Everything" button → wipe annotations + IndexedDB + history + close document

**Key questions**:
1. "Allow deleting last page": what is the empty state? Should the app return to the landing zone (upload prompt)? Currently the app has an `emptyState` div — can we re-show it and clear all state?
2. Where do these actions live? Options:
   - A separate "File" dropdown menu in the toolbar
   - A dedicated "danger zone" section in a settings panel
   - Individual buttons (Close Doc near Upload PDF, Reset in the session persistence area)
3. Should "Close document" require confirmation? (Unsaved work warning)

**Proposed approach**:
- Allow deleting the last page → triggers return to landing state (re-show `#emptyState`, clear all state, clear history)
- Add "Close Document" button near "Upload PDF" (same group)
- Rename "Clear All" button to "Clear Annotations" and add "Reset Session" (nuclear) that combines Clear Save + Close Document
- All destructive actions show a confirm dialog

---

### [BRAINSTORM-04] — Rich Text Search

**Trigger**: F24, F35  
**User wants**: Cross-page search, case-sensitive toggle, regex support

**Key questions**:
1. **Cross-page search**: requires building a text index for all pages (not just current). This means loading and parsing all pages on open. Performance impact on large PDFs?
2. **Case-sensitive**: easy — add a `Aa` toggle button to the find bar. `textSearchHandler.ts` passes the query directly; add a `caseSensitive` flag.
3. **Regex**: medium complexity — replace string matching with `new RegExp(query, flags)`. Add a `.*` toggle button. Need error handling for invalid regex.
4. **Navigation UX**: cross-page search means Next/Prev should navigate between pages. The current page-scoped model would need to become a global match list with `{ pageIndex, matchIndex }` entries.

**Proposed brainstorm approach**:
- Phase 1: Case-sensitive toggle + regex (current page only) — low effort
- Phase 2: Cross-page index — build lazily (index pages as user navigates, cache results)
- Phase 3: Cross-page Next/Prev navigation (auto-navigate to the page containing the next match)

---

### [BRAINSTORM-05] — Thumbnail panel action icons & global icon refresh

**Trigger**: F8 (thumbnail icons unclear), F36 (button size inconsistency)  
**Problem**: Many toolbar and thumbnail icons are unclear (the download 📄/📷 icons are ambiguous, and users noted general icon inconsistency).

**Key questions**:
1. Use emoji icons (current) vs SVG icons (professional, scalable, consistent)?
2. If SVG: which icon library? Options: Heroicons (MIT), Lucide (MIT), Phosphor (MIT) — all tree-shakeable
3. Add tooltips to ALL buttons (`title` attribute or custom tooltip component)?
4. Should buttons have text labels on desktop (icon + label) and icon-only on mobile?

**Proposed brainstorm approach**: Replace all emoji icons with Heroicons SVG (already used widely in the Tailwind ecosystem, clean minimal style). Keep icon-only on all screen sizes. Add `title` tooltips to every interactive element. Define a button size system: 28×28 px desktop, 40×40 px mobile, consistent across all.

---

### [BRAINSTORM-06] — Form fields: comb fields and unsupported types

**Trigger**: F25 Form Fields  
**Problem**: 
- Comb text fields (each character in its own box, e.g. 8-digit ID) are rendered as a single `<input>` instead of per-cell inputs
- Checkboxes, radio buttons, dropdowns not supported

**Key questions**:
1. Comb fields: detect `fieldFlag & 0x100000` (comb flag in PDF spec) and `maxLen` attribute. Render N individual `<input maxlength="1">` elements side by side, each 1/N of the field width.
2. Checkboxes: render as `<input type="checkbox">`. On export, need to set the checkbox appearance stream in pdf-lib (complex — pdf-lib has limited checkbox support).
3. Dropdowns: render as `<select>`. On export: pdf-lib `form.getDropdown(name).select(value)`.
4. What's the priority? Comb fields are likely common in official documents.

**Proposed brainstorm approach**: 
- Comb fields: implement in current session (pure HTML/CSS, no new library)
- Checkboxes: medium effort, implement with pdf-lib form API
- Dropdowns: medium effort, implement with pdf-lib form API

---

### [BRAINSTORM-07] — Annotation rotate with page: design decision

*(See BRAINSTORM-02 — this is a sub-question of the rotation brainstorm)*  
**Specific design question**: Should rotate-with-page be the default behavior, or should it be an option the user chooses per-rotation? The current toast ("existing annotations may shift in export after rotation") could become: "Rotate annotations with the page? [Yes] [No]"

---

## Part 6 — Implementation Order

Once brainstorm sessions are done, implement in this order:

### Phase 1: Critical bugs (unblock everything else)
1. BUG-01 — Text multiline (textarea)
2. BUG-02 — Signature empty save guard
3. BUG-03 — Signature Escape key
4. BUG-04 — Delete page toast
5. BUG-05 — Watermark modal backdrop drag
6. BUG-06 — Watermark preview invisible

### Phase 2: Export accuracy (after text multiline — affects baseline calc)
7. BUG-07 — Text export Y offset
8. BUG-08 — Export preview visibility + accuracy
9. BUG-09 — Rectangle export position
10. BUG-10 — Arrow fat line width
11. BUG-11 — Comment text position in export
12. BUG-12 — Comment header consistency

### Phase 3: Search & interaction
13. BUG-13 — Highlight color parse
14. BUG-14 — Search scroll to match
15. BUG-15 — Help modal shortcuts

### Phase 4: UX polish (parallel with Phase 3)
16. UX-01 — Thumbnail actions redesign
17. UX-02 — Button size consistency
18. UX-03 — Resize minimum threshold
19. UX-04 — Watermark density
20. UX-05 — Font options (Symbol)
21. UX-06 — PWA manifest fix

### Phase 5: Brainstorm-derived features (after design sessions)
- BRAINSTORM-01 → Ink layer / paint mode
- BRAINSTORM-02 → Annotation rotation transform
- BRAINSTORM-03 → Document close / nuclear reset
- BRAINSTORM-04 → Rich search (phases)
- BRAINSTORM-05 → Icon refresh
- BRAINSTORM-06 → Form field improvements

---

## Files Impact Summary

| File | Bugs/Changes touching it |
|------|--------------------------|
| `js/pdfEditorApp.ts` | BUG-03, BUG-05, BUG-07, BUG-08, BUG-09, BUG-10, BUG-11, BUG-12, BUG-13, BUG-14, UX-04 |
| `js/textElement.ts` | BUG-01 |
| `js/signaturePad.ts` | BUG-02 |
| `js/commentElement.ts` | BUG-12 |
| `js/highlightElement.ts` | BUG-13 |
| `js/interactionHandler.ts` | UX-03, BUG-09 (investigation) |
| `js/pageThumbnailPanel.ts` | BUG-04, UX-01 |
| `js/historyManager.ts` | BRAINSTORM-02 (rotation transform), BRAINSTORM-03 |
| `index.html` | BUG-03 (modal HTML), BUG-06 (preview CSS), BUG-15 (help table), UX-01 (toolbar HTML), UX-06 (manifest link) |
| `vite.config.ts` | UX-06 (manifest config) |

---

## Brainstorm Session Agenda (Tomorrow)

Start with these 4 topics in order — they have the most design decisions to resolve before any code is written:

1. **BRAINSTORM-01** — Ink Layer / Paint mode (biggest feature, most impact)
2. **BRAINSTORM-03** — Document state management (close/reset/delete-last-page)
3. **BRAINSTORM-02** — Annotation rotation (coordinate transform design)
4. **BRAINSTORM-04** — Rich Search (quick wins possible in Phase 1)

BRAINSTORM-05 (icons) and BRAINSTORM-06 (form fields) can be resolved quickly during implementation — no dedicated session needed.
