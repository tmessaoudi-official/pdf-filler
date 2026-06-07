# PDFturbo Live Browser Audit — Phase C (2026-06-07)

> This file is the live running spec for the Phase C browser audit.
> Every finding is written here as discovered — survives context compaction.
> NO implementation in this phase.

## Context
- Phase A (quick fixes) ✅ committed `5801055`
- Phase B (element rotation) ✅ committed `77d34e5`
- This audit: validate all Phase A/B fixes, find NEW issues, collect UX improvements
- User-reported issues to validate: 4 items (see § Known Issues)

## Audit Date
2026-06-07 — auditor: Claude (automated browser testing)

---

## Known Issues to Validate (user-reported)

| # | Issue | Status |
|---|-------|--------|
| K1 | SELECT tool counter-productive after placing text | ✅ ROOT CAUSE FOUND |
| K2 | Element rotation on page rotation still off | ✅ ROOT CAUSE FOUND |
| K3 | PDF text selection visual offset (shows partial line selected) | ✅ CONFIRMED |
| K4 | Ctrl+C/Ctrl+V don't work on PDF text layer | ✅ ROOT CAUSE FOUND |
| K5 | Free per-element rotation ✓ (user confirmed working) | CONFIRMED OK |

---

## NEW BUGS FOUND (this session)

### BUG-RESET-1: "Réinitialiser" leaves annotation elements on canvas after resetting
**Priority**: P2 (Medium)
**Where**: Fichier → Réinitialiser
**Symptom**: Clicking "Réinitialiser" closes/unloads the PDF (shows "Téléchargez un PDF pour commencer") but annotation elements remain visible on the grey canvas overlay.
**Root cause CONFIRMED**: `_closeDocument()` (pdfEditorApp.ts:1186) clears `this.elements = []` and `this.documentModel` but never calls `renderElements()`. The old DOM divs remain in the page container. Fix: add `this.renderElements()` call at end of `_closeDocument()`.

---

### BUG-K1: SELECT mode drag broken — textLayer intercepts pointer events over annotation elements ✅ FIXED
**Priority**: P1 (High — elements not draggable/resizable in SELECT mode)
**Where**: `index.html` CSS — `.pdf-element` z-index vs `.textLayer` z-index
**Symptom**: After placing a text element (toolbar auto-switches to SELECT mode), the element cannot be dragged or resized. Workaround: click T Text again (switches to addText mode, text layer gets `pointer-events: none`).
**Root cause CONFIRMED** (live browser `elementFromPoint()` hit test):
- `.pdf-element`: `z-index: auto` (= 0) — siblings under `.canvas-container`
- `.textLayer`: `z-index: 1`, `pointer-events: auto` in SELECT mode
- In SELECT mode, `textLayerManager.setPointerEvents(true)` makes text layer sit ABOVE annotation elements → intercepts all drag/resize pointer events
- `elementFromPoint()` WITHOUT fix → `DIV.textLayer`; WITH fix → `TEXTAREA` inside `.pdf-element`
**Fix applied** (`index.html` line 417-426): Added `z-index: 2` to `.pdf-element` CSS rule. Both layers share `.canvas-container` stacking context → direct z-index comparison, reliable. PDF text selection still works on empty canvas areas.
**Status**: ✅ FIXED — verified in browser, rebuilt dist/ (2026-06-07)

---

### BUG-K2: Element rotation + page rotation — dimension swap cancels CSS rotation visually
**Priority**: P1 (High — annotation positions are wrong after page rotation)
**Where**: `_rotatePage()` / `_rotateElementSnapshot()` in pdfEditorApp.ts
**Symptom**: After rotating page 90° CW, text annotation appears visually displaced from its correct position on the landscape page.
**Root cause CONFIRMED** (code analysis — current build, commit 77d34e5):
1. `_rotateElementSnapshot()` (line 919-956) derives the new bounding box by transforming all 4 element corners geometrically — this causes dimensions to SWAP (200×30 → 30×200) ✓ (position math is correct)
2. Line 870: `snap.rotation = ((el.rotation + delta) % 360 + 360) % 360` — also increments CSS rotation ✓
3. **The cancel-out**: a 30×200 div with `rotate(90deg)` displays as a 200px × 30px box centered on (627, 200) — NOT at the correct position (642, 100) for the rotated page canvas
4. The CSS `transform: rotate()` rotates around the div's center, so positioning the div at (css_left=612, css_top=100) with 30×200 size causes the visual to appear ~30px to the left of where it should be
**Phase B DID fix part of this**: position math (`_transformPoint`/`_inverseTransformPoint`) is correct. But the combined dimension-swap + CSS rotation produces wrong visual placement.
**Fix required**: Since `el.rotation` already drives the CSS visual rotation, the bounding box dimensions should NOT be swapped in `_rotateElementSnapshot`. Only the position (x, y) should change. Width/height should stay as-is — the CSS rotation handles the visual reorientation:
```typescript
// In _rotateElementSnapshot for standard box elements:
// Instead of deriving new w/h from transformed corners:
return {
  x: Math.min(...xs), y: Math.min(...ys),
  width: el.width,    // ← keep original width (CSS rotate handles visual)
  height: el.height,  // ← keep original height
};
```

---

### BUG-K3: PDF text selection highlight is visually offset
**Priority**: P2 (Medium — cosmetic but confusing)
**Where**: pdfjs text layer (`textLayer.ts`)
**Symptom**: User drags to select a full line "Test Page 1 — Draw ink strokes here" but only a portion is visually highlighted (the last 25% of the text appears unselected).
**Root cause hypothesis**: The text layer highlight rectangles don't fully account for the CSS scaling/transform or the canvas offset. The DOM selection IS correct (verified: `window.getSelection().toString()` returns the full text). Only the visual highlight is clipped.
**Impact**: User thinks they selected less than they did — causes incorrect assumptions about what will be copied.

---

### BUG-K4: Ctrl+C intercepts PDF text selection — copies nothing
**Priority**: P1 (High — major UX breakage for PDF text copy workflow)
**Where**: pdfEditorApp.ts line 443 keyboard handler
**Root cause CONFIRMED**:
```typescript
// Line 437 — only guards input/textarea/select elements
if (e.target instanceof Element && e.target.matches('input, textarea, select')) return;
if (e.ctrlKey || e.metaKey) {
  case 'c': e.preventDefault(); this._copySelectedElement(); break;  // LINE 443
```
When user has PDF text selected (text layer spans) and presses Ctrl+C:
1. Guard line 437 does NOT match (target is span/document, not input/textarea)
2. `e.preventDefault()` is called → cancels browser's native text copy
3. `_copySelectedElement()` runs — no app element selected → does nothing
4. Result: **clipboard unchanged**, selected PDF text is NOT copied
**Fix**: Check `window.getSelection()?.toString()` before calling `e.preventDefault()`:
```typescript
case 'c':
  if (!window.getSelection()?.toString()) {
    e.preventDefault();
    this._copySelectedElement();
  }
  break;
```

---

### BUG-K1b: Ctrl+C on focused textarea captures element text instead of element
**Priority**: P3 (Low — edge case)
**Where**: pdfEditorApp.ts line 437 keyboard guard
**Symptom**: When a text element's textarea is focused and user presses Ctrl+C, the app guard (`input, textarea, select`) causes early return — so the app copies textarea text content (correct for editing) but the user cannot copy the element while inside it.
**Workaround**: Click on element border area (not textarea content) then Ctrl+C. Or use toolbar copy button.

---

### BUG-ZOOM-PERSIST: Zoom level not reset on page reload
**Priority**: P3 (Low — minor state persistence quirk)
**Observed**: After reload, zoom shows 144% instead of resetting to fit. The zoom level appears to persist from last session (possibly via IndexedDB `saveState()`).

---

### BUG-STORAGE-BANNER: Storage notice shows again after hard reload
**Priority**: P3 (Low)
**Observed**: Banner showed after page reload even though it was previously dismissed. The `clearState()` from Réinitialiser may have also cleared the localStorage key, or the key is stored inconsistently.
**Needs investigation**: Does `clearState()` also clear `localStorage`?

---

## Test Areas Checklist

### [1] File Loading
- [ ] Drag & drop PDF
- [ ] File picker ("Ouvrir…")
- [ ] PDF renders correctly
- [ ] Multi-page PDF: navigation works
- [ ] "Fermer le document" clears everything
- [ ] "Réinitialiser" clears everything ← BUG-RESET-1 already found

### [2] Text Tool + SELECT Interaction (K1)
- [ ] Click "T Texte" → places text element with placeholder
- [ ] Typing works
- [ ] After placing text, auto-switch to select mode?
- [ ] Can resize text element without re-activating text tool?
- [ ] SELECT (↖) button is visible and clickable
- [ ] SELECT mode allows resize/move of existing elements
- [ ] SELECT button highlights when active

### [3] Element Rotation (Per-element)
- [ ] Rotation handle (↻ purple) visible on selected elements
- [ ] Dragging handle rotates freely (not snapped)
- [ ] Rotation preserved in undo/redo
- [ ] Rotation exported correctly to PDF

### [4] Document Page Rotation + Element Behavior (K2)
- [ ] Rotate page CW — elements move to correct position
- [ ] Element's rotation field increments by 90°?
- [ ] Elements visually correct after page rotation
- [ ] Undo page rotation → elements revert

### [5] Signature Tool
- [ ] Drawing pad opens
- [ ] Can draw signature
- [ ] Place mode activates after save
- [ ] Placed signature has rotation handle + resize

### [6] Image Tool
- [ ] File picker triggers
- [ ] Image placed, resize/move works
- [ ] Rotation handle works on image

### [7] Comment/Note Tool
- [ ] Click to place note
- [ ] Note text editable
- [ ] Note persists (even empty)
- [ ] Has rotation handle

### [8] Shape Tools (Arrow, Rectangle, Circle)
- [ ] Arrow: draw, arrow head visible
- [ ] Rectangle: draw, resize
- [ ] Circle: draw, resize
- [ ] Shape color changes work (FORME color picker)

### [9] Freehand Pen
- [ ] Draw mode activates
- [ ] Strokes appear on canvas
- [ ] "Done" pill exits mode
- [ ] Eraser works on strokes

### [10] Highlight / Redact
- [ ] Highlight: drag to create yellow strip
- [ ] Redact: drag to create black block
- [ ] Redact export: text hidden in output PDF

### [11] Copy/Paste
- [ ] Ctrl+C / Ctrl+V duplicates selected element
- [ ] Paste offset (not on top of original)
- [ ] Works for all element types

### [12] Undo / Redo
- [ ] Ctrl+Z undoes last action
- [ ] Ctrl+Y / Ctrl+Shift+Z redoes
- [ ] Undo/redo buttons in toolbar
- [ ] Undo after page rotation reverts correctly

### [13] Export
- [ ] Export button triggers download
- [ ] Exported PDF has correct content
- [ ] Rotated elements export at correct angle
- [ ] Redactions are permanent in export

### [14] Export Preview
- [ ] Eye icon opens preview overlay
- [ ] Second click on eye closes it (toggle) ← Phase A fix
- [ ] Preview shows annotation outlines

### [15] PDF Text Layer (K3, K4)
- [ ] Can select PDF text with mouse
- [ ] Selection highlight correct position (K3)
- [ ] Ctrl+C copies selected text (K4)
- [ ] Ctrl+V pastes (K4 — browser limitation likely)
- [ ] Find/search bar searches text

### [16] Zoom
- [ ] + button increases zoom
- [ ] - button decreases zoom
- [ ] "Ajuster" fits to view
- [ ] Zoom level indicator updates

### [17] Page Navigation (multi-page PDF)
- [ ] Previous/next page buttons
- [ ] Thumbnail sidebar

### [18] Watermark
- [ ] Watermark modal opens
- [ ] Configure text, font, opacity, density
- [ ] Preview shows watermark
- [ ] Watermark applied to export

### [19] Language Switcher
- [ ] EN / FR / ع buttons
- [ ] All UI strings update
- [ ] RTL layout for Arabic

### [20] Help Modal
- [ ] Opens with keyboard shortcuts
- [ ] Correctly translated

### [21] Storage Notice Banner
- [ ] Visible on first load
- [ ] "Compris" dismisses it
- [ ] Not shown again on reload

### [22] Session Restore
- [ ] Session saved to IndexedDB
- [ ] On reload: dialog asks "restore" or "start fresh"
- [ ] "Restore" loads previous state
- [ ] "Start fresh" clears everything

### [23] Keyboard Shortcuts
- [ ] Delete removes selected element
- [ ] Escape exits tool mode
- [ ] Ctrl+Z/Y/C/V all work

---

---

### BUG-TOOLBAR-OVERFLOW-1: Right-side toolbar buttons hidden on narrow viewports (preview, watermark, help)
**Priority**: P2 (Medium — discoverability issue at ≤~1100px viewport width)
**Where**: Main toolbar, `#toolbar`
**Symptom**: Toolbar is ~1100px wide. At 960px viewport: `previewExportBtn` (👁 at x=998), `watermarkBtn` (≋ at x=1035), `helpBtn` (? at x=1069) are off-screen. At 1408px viewport all buttons are visible.
**Confirmed via**: `getBoundingClientRect()` at 960px and 1408px viewport widths.
**Affected users**: Anyone using split-screen, a smaller monitor, or a browser window narrower than ~1100px. Full-screen desktop users (1200px+) are unaffected.
**Fix required**: Reorder toolbar so most-used tools are visible first without scrolling, OR collapse less-used tools (watermark, help) into a "More…" dropdown/submenu, OR make toolbar responsive (wraps to 2 rows on narrow viewports).

---

### BUG-TOOLBAR-OVERFLOW-2: Page navigation buttons hidden on narrow viewports (next/last page)
**Priority**: P2 (Medium — at ≤~1100px viewport, core navigation requires horizontal toolbar scroll that users don't discover)
**Where**: Second toolbar row, page navigation
**Symptom**: At 960px viewport: `nextPage` (▶ at x=1041) and `lastPage` (▶▶ at x=1075) are off-screen. At 1408px all navigation buttons visible. On narrow viewports, users with multi-page PDFs cannot navigate forward without scrolling the second toolbar — which is non-obvious.
**Confirmed via**: `getBoundingClientRect()` at 960px (off-screen) and 1408px (all visible).
**Workaround**: Ctrl+→ keyboard shortcut (not discoverable without reading help modal). The toolbar IS scrollable but has no visual affordance to indicate this.
**Fix required**: Move page navigation (prev/next + page counter) to a more prominent location that stays visible at all viewport widths — ideally the center of the second toolbar or as a fixed strip below the canvas.

---

### BUG-HELP-MISLEADING-CTRL-C: Help modal says Ctrl+C copies element — doesn't warn about PDF text conflict
**Priority**: P2 (Medium — causes user confusion)
**Where**: Help modal keyboard shortcuts table
**Symptom**: Shortcut table shows "Ctrl+C: Copy selected element" with no caveat. When user has PDF text selected (not a PDF element), Ctrl+C is intercepted by the app and does nothing (BUG-K4). The help is technically correct but misleads users into thinking Ctrl+C always copies element text.
**Fix**: Add a footnote or secondary row: "When PDF text is selected, Ctrl+C copies the text to clipboard."

---

## Features Tested — CONFIRMED WORKING (this session)

| Feature | Result |
|---------|--------|
| Rectangle tool (□) | ✅ draw, resize handles |
| Circle tool (○) | ✅ draw, resize handles |
| Export preview toggle (👁) | ✅ BUG-05 Phase A fix VERIFIED — second click closes |
| Help modal (?) | ✅ keyboard shortcut table, correct EN translation |
| Language switcher (EN/FR/AR) | ✅ full UI switch, RTL for Arabic, all strings translated |
| Arabic RTL layout | ✅ `dir="rtl"`, toolbar mirrored, storage banner translated |
| Zoom controls (− +) | ✅ decrease/increase correctly |
| Fit button | ✅ fits page to viewport |
| Comment/Note tool | ✅ yellow sticky, editable textarea, placed on click |
| Highlight tool | ✅ drag to create yellow strip over text |
| Freehand pen (D) | ✅ draw strokes, "Done drawing" pill exits mode |
| Eraser (E) | ✅ erases freehand strokes on canvas overlay |
| Watermark modal (≋) | ✅ text/color/size/opacity/angle/density/preview all working |
| Redact tool (⬛) | ✅ creates black block via pointer events |
| Undo (Ctrl+Z) | ✅ removes last action |
| Page navigation (next/prev) | ✅ navigates page 2 correctly |
| File menu | ✅ Open/Close/Clear/Reset options all present |
| Signature modal | ✅ draw pad with Line Width + Color, Clear/Cancel/Save |

---

## UX/UI Improvement Proposals (to discuss with user)

1. **Toolbar layout redesign** — critical tools visible without scrolling; watermark/help in a "More" submenu or persistent icon row
2. **Page navigation prominence** — prev/next buttons should be always visible (not in overflow); consider placing below canvas as a footer nav strip
3. **Help Ctrl+C clarification** — distinguish "copy element" from "copy PDF text" in the shortcut table
4. **Comment tool placement** — the large sticky note obscures annotations behind it; consider a collapsed/minimizable note widget
5. **Freehand/Highlight multi-tool UX** — after placing one highlight or comment, tool stays active; add a subtle "click to place more or press Esc to exit" nudge

---

## Decisions Log
- [2026-06-07] STARTED: Phase C browser audit in session
- [2026-06-07] CONTINUING: Post-compaction audit pass — rectangle, circle, export preview, language, zoom, comment, highlight, freehand, watermark, redact, signature, navigation all tested
- [2026-06-07] BUG-K1 FIXED: z-index: 2 on .pdf-element (CSS, index.html:425); approved by user; dist rebuilt
- [2026-06-07] BUG-K2 FIXED: _rotateElementSnapshot now preserves el.width/el.height, transforms center point only; 80/80 tests pass; dist rebuilt
- [2026-06-07] BUG-K4 FIXED: Ctrl+C only intercepts when getSelection() is empty; PDF text copy now works; 80/80 tests pass; dist rebuilt
- [2026-06-07] BUG-RESET-1 FIXED: renderElements() call added to _closeDocument(); ghost annotations cleared on reset; 80/80 tests pass; dist rebuilt
- [2026-06-07] BUG-K3 FIXED: pdfjs CSS var chain (--text-scale-factor, --font-height, --scale-x) added to index.html; span font-size confirmed 34.51px (was 16px); dist rebuilt
- [2026-06-07] BUG-TOOLBAR-OVERFLOW-1 FIXED: #tbg-actions moved before #tbg-shapes in DOM; Download/Preview/Watermark/Help visible at narrow viewports; 80/80 tests pass
- [2026-06-07] BUG-TOOLBAR-OVERFLOW-2 FIXED: margin-inline-start:auto removed from #navGroup; page nav flows naturally after zoom controls; 80/80 tests pass
- [2026-06-07] BUG-HELP-MISLEADING-CTRL-C FIXED: footnote added to help modal (EN/FR/AR) clarifying Ctrl+C copies annotation element; native copy takes precedence when PDF text selected
