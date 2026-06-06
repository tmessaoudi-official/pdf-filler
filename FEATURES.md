# PDF Fill & Sign — Feature Test Checklist

**Version**: 1.0.0  
**Build**: Vite 8 / TypeScript 6 / PWA  
**Base URL**: `/pdf-filler/`  
**Total features**: 37  
**Last updated**: 2026-06-05 (full codebase re-audit)

> **How to use this file**: Work through each numbered feature top to bottom.  
> For each one: test the steps listed, then report what works, what's broken, and what feels wrong.  
> We'll build a fix/improve plan from your feedback.

---

## Table of Contents

**File I/O (6)**
1. [Open PDF](#1-open-pdf)
2. [Add Pages from Another PDF](#2-add-pages-from-another-pdf)
3. [Export — Full PDF](#3-export--full-pdf)
4. [Export — Single Page PDF](#4-export--single-page-pdf)
5. [Export — Page as PNG Image](#5-export--page-as-png-image)
6. [Export Preview](#6-export-preview)

**Page Management (5)**
7. [Page Navigation](#7-page-navigation)
8. [Page Thumbnail Panel](#8-page-thumbnail-panel)
9. [Delete Page](#9-delete-page)
10. [Page Rotation](#10-page-rotation)
11. [Page Reorder](#11-page-reorder)

**Annotation Tools (11)**
12. [Element Controls](#12-element-controls-all-annotations)
13. [Text Tool + Formatting](#13-text-tool--formatting)
14. [Arrow Shape](#14-arrow-shape)
15. [Rectangle Shape](#15-rectangle-shape)
16. [Ellipse Shape](#16-ellipse-shape)
17. [Freehand Draw](#17-freehand-draw)
18. [Eraser Tool](#18-eraser-tool)
19. [Signature](#19-signature)
20. [Image Overlay](#20-image-overlay)
21. [Highlight](#21-highlight)
22. [Comment / Sticky Note](#22-comment--sticky-note)
23. [Redaction](#23-redaction)

**Search & Forms (2)**
24. [Text Search / Find](#24-text-search--find)
25. [Form Field Detection & Fill](#25-form-field-detection--fill)

**Document Settings (3)**
26. [Watermark](#26-watermark)
27. [Zoom & View](#27-zoom--view)
28. [Undo / Redo](#28-undo--redo)

**Session & State (2)**
29. [Session Persistence & Autosave](#29-session-persistence--autosave)
30. [Clear All Annotations](#30-clear-all-annotations)

**UX & Misc (7)**
31. [Keyboard Shortcuts](#31-keyboard-shortcuts)
32. [Help Modal](#32-help-modal)
33. [Toast Notifications](#33-toast-notifications)
34. [Mode Badge](#34-mode-badge)
35. [Done Pill (Freehand exit)](#35-done-pill-freehand-exit)
36. [Mobile / Touch Support](#36-mobile--touch-support)
37. [PWA / Offline Support](#37-pwa--offline-support)

---

## 1. Open PDF

**How it works**: Click **📁 Upload PDF** in toolbar row 1 (or click the empty-state landing area). Accepts `application/pdf` only. Loads via pdf.js, resets all state (elements, history, form values), computes a fit-to-width zoom, shows the thumbnail strip, and triggers autosave.

**Test steps**:
1. Open the app fresh — you should see an empty landing zone, all toolbar buttons disabled.
2. Click **Upload PDF** → select any PDF → verify it renders on the canvas.
3. Verify the zoom display updates (e.g. "82%").
4. Verify thumbnail strip appears on the left.
5. Try uploading a non-PDF file → verify an alert appears ("Please select a valid PDF file").
6. Upload a multi-page PDF → verify page count shows correctly.

**Known bugs**: None.

---

## 2. Add Pages from Another PDF

**How it works**: Click **+ Add PDF** button at the bottom of the thumbnail strip (or the hidden input triggered by it). Appends all pages from each uploaded PDF to the current document. Multiple PDFs can be selected at once. Failed files are skipped with a toast. Fully undoable.

**Test steps**:
1. Load a PDF with 2 pages.
2. Scroll down the thumbnail strip → click **+ Add PDF** → select a different PDF.
3. Verify new pages are appended (page count increases).
4. Verify thumbnails appear for the new pages.
5. Press **Ctrl+Z** → verify the added pages are removed.

**Known bugs**: None.

---

## 3. Export — Full PDF

**How it works**: Click **⬇ Download** button. Builds a pdf-lib document: copies all pages, fills+flattens form fields, draws all annotations as vectors (text, shapes, images, highlights, comments, redactions), adds watermark if enabled. Pages with redaction use rasterization (see §23). Downloads as `<name>-edited.pdf`. UI dims to 40% opacity during generation.

**Test steps**:
1. Load a PDF, add a text annotation, a rectangle, and a highlight.
2. Click **⬇ Download** → verify the UI dims briefly then a file downloads.
3. Open the downloaded PDF in any viewer → verify annotations are present and positioned correctly.
4. Verify the filename is `<original>-edited.pdf`.

**Known bugs**: None currently.

---

## 4. Export — Single Page PDF

**How it works**: Click **📄 Export Page** in toolbar row 1 (exports current page), or click **⬇** on any thumbnail (exports that specific page). Creates a single-page pdf-lib document with that page's annotations. Downloads as `<name>-page<N>.pdf`. If the page has redactions, uses rasterization.

**Test steps**:
1. Load a multi-page PDF, go to page 2, add a text annotation.
2. Click **📄 Export Page** → verify a single-page PDF downloads with the annotation.
3. Alternatively, click the **⬇** icon on any thumbnail → verify that specific page downloads.

**Known bugs**: None.

---

## 5. Export — Page as PNG Image

**How it works**: Click **📷 Export Image** in toolbar row 1. Builds a single-page PDF with all annotations, then re-rasterizes it via pdf.js at **2× scale** for high resolution. Downloads as `<name>-page<N>.png`.

**Test steps**:
1. Load a PDF with some annotations on the current page.
2. Click **📷 Export Image** → verify a PNG file downloads.
3. Open the PNG → verify annotations are present and the image is high resolution (2× the canvas size).

**Known bugs**: None.

---

## 6. Export Preview

**How it works**: Click the **👁 Preview Export** button (toolbar row 1). Shows a full-screen overlay with blue dashed rectangles showing where each annotation will land in the exported PDF (after coordinate transform). Click **Confirm** to proceed with download, or **✕ Close** to cancel.

**Test steps**:
1. Load a PDF, add 2-3 different annotations (text, rectangle, highlight).
2. Click **👁 Preview Export** → verify an overlay appears showing blue dashed boxes.
3. Verify each box corresponds to an annotation's approximate position.
4. Click **Confirm** → verify the full PDF downloads.
5. Click **👁 Preview Export** again → click **✕ Close** → verify no download happens.
6. Press **Escape** → verify the overlay closes without downloading.

**Known bugs**: The ghost positions reflect the coordinate transform but may not account for all rotation cases precisely.

---

## 7. Page Navigation

**How it works**: Toolbar navigation group. Controls: **◀◀ First**, **◀ Prev**, **▶ Next**, **▶▶ Last**, page number input (type + Enter or blur). Keyboard: `Ctrl+←` / `Ctrl+→`. Page counter shows `current / total`.

**Test steps**:
1. Load a PDF with 3+ pages.
2. Click **▶ Next** → verify page advances, counter updates, thumbnail highlight moves.
3. Click **◀◀ First** → verify jumps to page 1.
4. Click **▶▶ Last** → verify jumps to last page.
5. Click the page number input, type `2`, press Enter → verify jumps to page 2.
6. On page 1, click **◀ Prev** → verify nothing happens (clamped).
7. Press `Ctrl+→` → verify next page. Press `Ctrl+←` → verify previous page.

**Known bugs**: None.

---

## 8. Page Thumbnail Panel

**How it works**: Left sidebar. Renders JPEG thumbnails (15% scale) with lazy loading and in-memory cache. Each thumbnail shows: page number, rotate CCW/CW buttons, download button (single page export), delete button (disabled at 1 page). Active page has a highlighted border.

**Test steps**:
1. Load a multi-page PDF → verify thumbnails appear for each page.
2. Click a thumbnail → verify the canvas navigates to that page.
3. Verify the active thumbnail has a highlighted border.
4. Verify the thumbnail updates after you rotate a page (see §10).

**Known bugs**: Thumbnails do not update to show annotations placed on the page (they only show the base PDF).

---

## 9. Delete Page

**How it works**: Click **×** on a thumbnail. Removes the page and all its annotations. Minimum 1 page enforced. Fully undoable (restores page and annotations at original index).

**Test steps**:
1. Load a 2-page PDF.
2. Click **×** on page 1 thumbnail → verify page is removed, page 2 becomes page 1.
3. Press **Ctrl+Z** → verify the deleted page is restored.
4. With only 1 page remaining, click **×** → verify a toast appears ("Cannot delete the only page") and nothing is deleted.

**Known bugs**: None.

---

## 10. Page Rotation

**How it works**: Click **↺ Rotate CCW** or **↻ Rotate CW** on a thumbnail. Rotates by ±90°. Compounded with source PDF intrinsic rotation. Thumbnail cache invalidated. Toast warns if annotations exist. Undoable.

**Test steps**:
1. Load any PDF, click **↺** on the current page thumbnail.
2. Verify the page rotates 90° CCW in the canvas.
3. Verify the thumbnail updates.
4. Add a text annotation, then rotate → verify the toast warning appears.
5. Press **Ctrl+Z** → verify rotation is undone.
6. Rotate 4× → verify page returns to original orientation.

**Known bugs**: Annotations do not reposition automatically after rotation — they may appear misaligned.

---

## 11. Page Reorder

**How it works**: Drag a thumbnail and drop it on another thumbnail to swap page order. Recorded as `ReorderPagesCmd` with before/after ID arrays. Fully undoable.

**Test steps**:
1. Load a 3-page PDF.
2. Drag thumbnail 3 and drop it before thumbnail 1 → verify pages reorder.
3. Verify the canvas shows the new page 1.
4. Press **Ctrl+Z** → verify the original order is restored.

**Known bugs**: None.

---

## 12. Element Controls (all annotations)

**How it works**: Every placed element (text, signature, image, highlight, comment, redaction, shape) supports:
- **Move**: drag the element body.
- **Resize**: drag bottom-right resize handle (min 50×20 px).
- **Delete**: click **×** control button, or press `Delete`/`Backspace` when selected.
- **Select**: click element; click canvas background to deselect.
- **Nudge**: Arrow keys move ±1 px; `Shift+Arrow` moves ±10 px.

**Test steps**:
1. Add any annotation (e.g. text).
2. Click it → verify it gets a selection border and control buttons.
3. Drag it to a new position → verify it moves.
4. Drag the resize handle → verify it resizes.
5. Click **×** → verify it's deleted.
6. Add another annotation, select it, press `Delete` → verify deleted.
7. Add an annotation, select it, press `Arrow Right` 5× → verify it moves 5 px right.
8. Press `Shift+Arrow Up` → verify it moves 10 px up.

**Known bugs**: None.

---

## 13. Text Tool + Formatting

**How it works**: Activate with **T Text** button or `T` key. Click anywhere on canvas to place a text box centered on click. Type inline. Formatting toolbar becomes active when text element is selected:

| Property | Control | Values |
|----------|---------|--------|
| Font family | Dropdown | Arial, Helvetica, Times New Roman, Courier New |
| Font size | Spinner + A−/A+ | 8–72 px |
| Bold | **B** button | toggle |
| Italic | **I** button | toggle |
| Color | Color picker + 6 swatches | any hex |

Empty text elements are removed automatically on deselect. Text changes debounced 500ms into undo history. Multi-line text supported (press Enter in the text box).

**Color swatches**: Black, Red, Blue, Green, Orange, White.

**Test steps**:
1. Click **T Text** or press `T` → verify cursor becomes crosshair, mode badge shows "+ TEXT".
2. Click on the PDF → verify a text box appears, focused and ready to type.
3. Type "Hello World" → verify text appears in the box.
4. Click outside → verify text element is placed and deselected.
5. Click the text element to select → verify formatting toolbar activates.
6. Change font to "Times New Roman" → verify font updates live.
7. Click **B** → verify text becomes bold. Click again → verify bold removed.
8. Click **I** → verify italic. Change font size to 24 → verify.
9. Click a red color swatch → verify text color changes to red.
10. Press `T` again → verify mode toggles off (returns to SELECT).
11. Place a text element, don't type anything, click away → verify empty element is removed.
12. Place text, type "line1\nline2" (press Enter) → verify two lines render.

**Export check**: Download PDF, verify text appears in correct position with correct styling.

**Known bugs**: None.

---

## 14. Arrow Shape

**How it works**: Activate with **→ Arrow** button or `A` key. Click-drag from start to end point. A preview arrow is shown during drag. On release, arrow is placed with arrowhead at the endpoint. Minimum 5×5 px bounding box required. Properties: stroke color + line width from toolbar row 2.

**Test steps**:
1. Click **→** or press `A` → verify mode badge shows "→ ARROW".
2. Click-drag diagonally on the PDF → verify an arrow appears with arrowhead.
3. Select the arrow → verify color/width controls activate in toolbar row 2.
4. Change stroke color to blue → verify the arrow updates.
5. Make a tiny gesture (< 5 px) → verify it's discarded (no arrow placed).
6. Press `A` again → verify mode toggles off.

**Export check**: Arrow renders as 3 lines (shaft + 2 head lines) in the exported PDF.

**Known bugs**: None.

---

## 15. Rectangle Shape

**How it works**: Activate with **□ Rect** button or `R` key. Click-drag to define the bounding box. Preview shown during drag. Minimum 5×5 px. Properties: stroke color + line width.

**Test steps**:
1. Click **□** or press `R` → verify mode badge shows "□ RECT".
2. Click-drag on the PDF → verify a rectangle outline appears.
3. Select it → change stroke color → verify it updates.
4. Change line width to 5 → verify thicker border.

**Export check**: Renders as `drawRectangle` (outline only, no fill) in PDF.

**Known bugs**: None.

---

## 16. Ellipse Shape

**How it works**: Activate with **○ Circle** button or `C` key. Click-drag to define bounding ellipse. Preview during drag. Minimum 5×5 px. Properties: stroke color + line width.

**Test steps**:
1. Click **○** or press `C` → verify mode badge shows "○ CIRCLE".
2. Click-drag on the PDF → verify an ellipse appears.
3. Drag a perfect square region → verify it creates a circle.

**Export check**: Renders as `drawEllipse` in PDF.

**Known bugs**: None.

---

## 17. Freehand Draw

**How it works**: Activate with **✏ Draw** button, `D` key, or `F` key. Hold and draw freely; points sampled every 3 px. Path glows while drawing. A **Done** pill appears at the bottom center to exit the mode (or press `Escape`). Each stroke is a separate element. Properties: stroke color + line width.

**Test steps**:
1. Click **✏** or press `D` → verify mode badge shows "✏ DRAW".
2. Verify a **Done** pill appears at the bottom center of the screen.
3. Draw a signature-like stroke → verify it appears as a freehand path.
4. Draw a second stroke → verify it's a separate element.
5. Click **Done** → verify returns to SELECT mode, pill disappears.
6. Select a freehand stroke → verify it can be moved/resized like any element.
7. Press `F` → verify it also activates freehand mode.

**Export check**: Renders as SVG path (M/L commands) in PDF.

**Known bugs**: None.

---

## 18. Eraser Tool

**How it works**: Activate with **⌫ Erase** button or `E` key. Draw a stroke over elements to erase them. For **freehand elements**: the eraser splits the path at the intersection points (surviving segments become new elements). For **all other element types**: the entire element is deleted if the eraser stroke's bounding box intersects the element's bounding box. A dashed red preview stroke is shown during drawing. Fully undoable (MacroCmd wraps all changes).

**Test steps**:
1. Draw 2 freehand strokes and place a text element.
2. Click **⌫ Erase** or press `E` → verify mode badge shows "⌫ ERASE".
3. Draw the eraser across one freehand stroke → verify it disappears or is split.
4. Draw the eraser across the text element → verify the text is deleted.
5. Press **Ctrl+Z** → verify the erased elements are restored.
6. Draw a partial erase over a freehand path (only cross the middle) → verify the path splits into 2 surviving segments.

**Known bugs**: Non-freehand elements use bounding-box intersection only — a small eraser stroke near the corner of a large text/shape element will delete the entire element even if it barely touches it.

---

## 19. Signature

**How it works**: Activate with **✍ Sign** button or `S` key. Opens a modal with a canvas pad. Draw signature with mouse or touch. Set line width (slider) and color (color picker). Click **Save** → modal closes, cursor enters placement mode. Click on PDF to place the signature. Reusable: the same signature can be placed multiple times. Click **Cancel** or press `Escape` to abort.

**Test steps**:
1. Click **✍ Sign** or press `S` → verify a modal appears with a drawing canvas.
2. Draw a signature on the canvas pad.
3. Adjust line width slider → verify stroke weight changes.
4. Change signature color → verify color changes.
5. Click **Clear** → verify the canvas is cleared.
6. Draw again, click **Save** → verify modal closes, mode badge shows "✍ SIGN".
7. Click on the PDF → verify signature image is placed.
8. Resize the signature by dragging the resize handle.
9. Click **✍ Sign** again (with existing signature) → verify modal opens for new signature.
10. Open modal, draw nothing, click **Cancel** → verify modal closes without placing anything.

**Export check**: Renders as embedded PNG image in the PDF.

**Known bugs**: Signature reuse — after placing one, re-clicking the button always opens the modal (can't place same signature twice without redrawing). This is by design.

---

## 20. Image Overlay

**How it works**: Activate with **🖼 Image** button or `I` key. System file picker opens. Accepts any image type (PNG, JPEG, GIF, WebP, etc.). After file selection: toast appears, click PDF canvas to place at 200×150 px default size. Resize via handle.

**Test steps**:
1. Click **🖼 Image** or press `I` → verify file picker opens.
2. Select a PNG image → verify a toast: "Click on the PDF to place the image".
3. Click on the PDF → verify the image appears at 200×150 px.
4. Drag the resize handle → verify the image resizes.
5. Select the image, press `Delete` → verify it's removed.
6. Try `I` key → verify file picker opens directly.

**Export check**: JPEG images embedded as JPEG; PNG/other re-encoded to PNG via canvas.

**Known bugs**: None.

---

## 21. Highlight

**How it works**: Activate with **🖊 Highlight** button or `H` key. Click-drag to draw a highlight rectangle. Semi-transparent yellow overlay shown during drag. Default color `#FFFF00`, opacity 0.3.

> ⚠️ **Color parse bug**: `highlightElement.ts:20-22` — `parseInt(hex, 16) || fallback`. Any RGB channel with value `0` is replaced by fallback. Example: red `#FF0000` becomes orange `rgba(255,220,0,0.3)`. Only the default yellow is unaffected.

**Test steps**:
1. Click **🖊 Highlight** or press `H` → verify mode badge shows "🖊 HIGHLIGHT".
2. Click-drag over a word in the PDF → verify a semi-transparent yellow box appears.
3. Place multiple highlights → verify they stack correctly.
4. Select a highlight, press `Delete` → verify removed.
5. *(Color bug check)*: Open `highlightElement.ts` and manually change default to `#FF0000` → verify it renders orange instead of red (confirms bug).

**Export check**: Renders as semi-transparent filled rectangle in PDF.

**Known bugs**: Color parse bug (`|| fallback` replaces 0-valued channels). Only affects non-yellow colors since color is not user-configurable in the UI currently.

---

## 22. Comment / Sticky Note

**How it works**: Activate with **💬 Comment** button. Click anywhere on the canvas → places a 200×120 px pastel-yellow sticky note. Type directly into the note. Resize via handle. Background color fixed at `#FFFDE7`.

**Test steps**:
1. Click **💬 Comment** → verify mode badge shows "💬 COMMENT".
2. Click on the PDF → verify a yellow sticky note appears.
3. Type some text in it → verify text appears.
4. Resize the note by dragging the handle.
5. Click outside the note → verify it deselects.
6. Reselect → verify text is preserved.

**Export check**: Renders as a filled yellow rectangle with Helvetica text (first 200 chars). Background color preserved.

**Known bugs**: Double-append risk: if `CommentElement.createDom()` is called without clearing existing DOM, elements can be duplicated in the container. (Historical bug, may be fixed.)

---

## 23. Redaction

**How it works**: Activate with **⬛ Redact** button. Click-drag to define the redaction area. Renders as a solid black box with a dashed red border (dashes hidden when not selected). Z-index 15 — above all other elements.

**Export — TRUE RASTERIZATION**: When a page contains ANY redaction element, the entire page is rasterized via pdf.js at 2× scale before embedding. Black boxes are painted onto the canvas pixels. This permanently destroys the text layer for that page — redacted content **cannot** be extracted from the exported PDF.

**Test steps**:
1. Click **⬛ Redact** → verify mode badge shows "⬛ REDACT".
2. Click-drag over a word → verify a solid black box covers it.
3. Verify the box has a dashed red border when selected, solid when deselected.
4. Download the PDF → open in any PDF viewer → try to select/copy text under the black box → verify it's not selectable.
5. Try `pdftotext` or similar tool on the exported PDF → verify redacted text does not appear.

**Known bugs**: None (P0 security issue from prior audit is now fixed by rasterization).

---

## 24. Text Search / Find

**How it works**: Activate with **🔍** button or `Ctrl+F`. Find bar appears above the canvas. Type a query (case-insensitive, live search with 300ms debounce). Match count shown. Matches highlighted as semi-transparent yellow overlays. Navigate with **◀ Prev** / **▶ Next** or Enter / Shift+Enter. **Add Highlight** creates a permanent highlight element at the current match. **✕ Close** clears overlays. Search is page-scoped (only current page).

**Test steps**:
1. Load a text-based PDF.
2. Click **🔍** or press `Ctrl+F` → verify find bar appears.
3. Type a word that appears in the PDF → verify yellow match overlays appear and counter shows "1 / N".
4. Click **▶ Next** → verify next match is highlighted differently.
5. Press Enter → verify same as Next. Press Shift+Enter → verify Previous.
6. Click **Add Highlight** → verify a permanent highlight element is created at the match position.
7. Press **Ctrl+Z** → verify the added highlight is removed.
8. Navigate to a different page → verify overlays are cleared.
9. Press **Escape** → verify find bar closes.
10. Type a word that doesn't exist → verify "0 / 0" shown.
11. Zoom in/out while find bar is open with a query → verify match overlays reposition correctly.

**Known bugs**: Search is current-page only. Navigating away resets the search.

---

## 25. Form Field Detection & Fill

**How it works**: Automatic on PDF load. If the PDF has AcroForm text fields (`Tx` type), they are detected via `page.getAnnotations()` and rendered as transparent `<input>` overlays matching the PDF field rectangles. Values are tracked per source PDF. Only text fields (`Tx`) supported — checkboxes/radios/dropdowns are silently ignored (with a one-time toast).

**Test steps** (requires a PDF with form fields):
1. Load a fillable PDF → verify input overlays appear over form fields.
2. Click a field → type some text → verify it accepts input.
3. Navigate to another page and back → verify typed values are preserved.
4. Download the PDF → open in a viewer → verify form values are baked in (flattened).
5. If the PDF has checkboxes/dropdowns → verify a toast appears mentioning unsupported fields.

**Known bugs**: Only `Tx` (text) fields supported. Checkboxes, radio buttons, and select lists are not rendered.

---

## 26. Watermark

**How it works**: Click **≋ Watermark** button. Modal with: enabled checkbox, text input, color picker, font size slider (20–120), opacity slider (10–100%), angle slider (−90°–90°). Live preview in the modal. Click **Apply** → watermark settings saved. Toast confirms.

**Export behavior**: Watermark is drawn as a **tiled repeating pattern** across every page (not just centered once). Uses Helvetica font. Does NOT appear on the canvas — export-only.

**Test steps**:
1. Click **≋ Watermark** → verify modal opens.
2. Check the **Enabled** checkbox.
3. Type "CONFIDENTIAL" in the text field → verify preview updates.
4. Adjust opacity slider → verify preview opacity changes.
5. Adjust angle slider → verify preview rotation changes.
6. Click **Apply** → verify toast: "Watermark enabled".
7. Download the PDF → verify watermark appears tiled across the page.
8. Reopen modal → uncheck Enabled → Apply → verify toast: "Watermark disabled".
9. Download again → verify watermark is gone.
10. Close modal via **Cancel** or clicking the backdrop → verify no changes applied.
11. Press **Escape** while modal is open → verify it closes.

**Known bugs**: None.

---

## 27. Zoom & View

**How it works**:

| Control | Action |
|---------|--------|
| **−** | Zoom out by 0.1 |
| **+** | Zoom in by 0.1 |
| **⊡ Fit** | Fit to container width |
| `Ctrl+Scroll` | Zoom in/out by 0.05 per tick |
| Pinch (touch) | Two-finger pinch to zoom |

Zoom range: 0.25× – 3.0×. Display shows integer percentage. On zoom: full page re-render, element positions recalculated, thumbnail cache invalidated, active search results repositioned.

**Test steps**:
1. Click **+** 3× → verify zoom increases by 30%, display updates.
2. Click **−** 3× → verify zoom decreases.
3. Click **⊡ Fit** → verify zoom resets to fit container width.
4. Hold `Ctrl` and scroll up on the canvas → verify zoom in.
5. Hold `Ctrl` and scroll down → verify zoom out.
6. Zoom to minimum (25%) then click **−** → verify clamped at 25%.
7. Zoom to maximum (300%) then click **+** → verify clamped at 300%.
8. Add annotations, zoom in → verify annotations scale correctly with the page.

**Known bugs**: None.

---

## 28. Undo / Redo

**How it works**: **↩ Undo** / **↪ Redo** buttons, or `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`. History capacity: 50 commands. Buttons disabled when respective stack is empty.

**Command types**:
| Command | Undo behaviour |
|---------|----------------|
| `AddElementCmd` | Remove element |
| `RemoveElementCmd` | Re-insert element at original index |
| `MoveResizeCmd` | Restore position/size/style before gesture |
| `TextEditCmd` | Restore previous text (500ms debounce) |
| `ClearAllCmd` | Restore all cleared elements |
| `AddPagesCmd` | Remove added pages |
| `DeletePageCmd` | Re-insert page + annotations |
| `ReorderPagesCmd` | Restore original page order |
| `RotatePageCmd` | Restore previous rotation |
| `BulkDeleteCmd` | Restore batch-deleted elements (eraser) |
| `SplitStrokeCmd` | Restore original freehand + remove splits (eraser) |
| `MacroCmd` | Atomically undo a group of commands (eraser uses this) |

**Test steps**:
1. Add 3 annotations → press `Ctrl+Z` 3× → verify all 3 are removed.
2. Press `Ctrl+Y` → verify the last annotation is restored.
3. Delete a page → press `Ctrl+Z` → verify page is restored with annotations.
4. Reorder pages → press `Ctrl+Z` → verify original order.
5. Type text in a text element → wait 500ms → press `Ctrl+Z` → verify text reverts.
6. With empty undo stack → verify **↩ Undo** button is disabled.
7. After an undo → press `Ctrl+Shift+Z` → verify redo works.

**Known bugs**: None.

---

## 29. Session Persistence & Autosave

**How it works**: Autosave to IndexedDB (`pdf-editor` db v2, `state` store, `current` key) after every edit (debounced 800ms). Saves: elements, page list, page order, watermark settings, current page index, source PDF bytes, form field values. On page load, if saved state exists, it's restored silently with toast "Session restored". Click **✕ Clear Save** to wipe the saved session.

**Test steps**:
1. Load a PDF, add some annotations, wait 1 second for autosave.
2. Close the browser tab / hard-refresh the page.
3. Verify the app restores the previous session with a "Session restored" toast.
4. Verify all annotations, page structure, and zoom are preserved.
5. Click **✕ Clear Save** → verify toast "Saved session cleared".
6. Refresh → verify the app starts blank (no session restored).
7. Open in a private/incognito window → load a PDF → verify the app works (no error shown even though IDB is unavailable).

**Known bugs**: IDB unavailable in private browsing — silently degrades (no save). Storage quota exceeded shows a specific toast warning.

---

## 30. Clear All Annotations

**How it works**: Click **✕ Clear All** button. If there are any annotations on the current document, removes ALL of them across all pages. Recorded as `ClearAllCmd` → fully undoable. Toast: "All annotations cleared — Ctrl+Z to undo". Does nothing if there are no annotations.

**Test steps**:
1. Add annotations on multiple pages.
2. Click **✕ Clear All** → verify all annotations are removed, toast appears.
3. Press `Ctrl+Z` → verify all annotations are restored.
4. With no annotations, click **✕ Clear All** → verify nothing happens (no toast, no change).

**Known bugs**: None.

---

## 31. Keyboard Shortcuts

**How it works**: Global `keydown` listener. Ignored when focus is on an input/textarea/select. `Ctrl`/`Meta` shortcuts handled separately.

| Key | Action |
|-----|--------|
| `T` | Toggle Text mode |
| `S` | Toggle Signature mode (opens modal) |
| `I` | Open Image file picker |
| `A` | Toggle Arrow mode |
| `R` | Toggle Rectangle mode |
| `C` | Toggle Circle/Ellipse mode |
| `D` or `F` | Toggle Freehand Draw mode |
| `H` | Toggle Highlight mode |
| `E` | Toggle Eraser mode |
| `?` | Toggle Help modal |
| `Escape` | Return to SELECT mode; close modals/find bar |
| `Delete` / `Backspace` | Delete selected element |
| `Arrow keys` | Nudge selected element ±1 px |
| `Shift+Arrow` | Nudge selected element ±10 px |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+F` | Open Find bar |
| `Ctrl+→` | Next page |
| `Ctrl+←` | Previous page |
| `Enter` (find bar) | Next match |
| `Shift+Enter` (find bar) | Previous match |
| `Escape` (find bar) | Close find bar |

**Test steps**:
1. Load a PDF. Press `T` → verify text mode activates. Press `T` again → verify returns to SELECT.
2. Press `A`, `R`, `C`, `D`, `H`, `E` → verify each activates its mode.
3. Press `F` → verify freehand mode activates (alias for `D`).
4. Press `Escape` → verify returns to SELECT from any mode.
5. Add an annotation, select it, press `Delete` → verify deleted.
6. Select an element, press arrow keys → verify nudges 1px. `Shift+Arrow` → verify 10px.
7. Press `Ctrl+Z` / `Ctrl+Y` → verify undo/redo.
8. Press `Ctrl+F` → verify find bar opens. Press `Escape` → verify it closes.
9. Press `Ctrl+→` / `Ctrl+←` → verify page navigation.
10. Press `?` → verify help modal opens/closes.

**Known bugs**: `E` for eraser and `F` for freehand are not listed in the help modal (see §32).

---

## 32. Help Modal

**How it works**: Click **?** button in toolbar or press `?` key. Shows a table of keyboard shortcuts. Close by clicking **×**, pressing `Escape`, or clicking the backdrop.

**Test steps**:
1. Click **?** → verify a modal appears with a shortcuts table.
2. Press `Escape` → verify modal closes.
3. Click the backdrop (outside the white box) → verify modal closes.
4. Check the shortcuts table matches what actually works.

**Known bugs**: The `E` (eraser) and `F` (freehand alt) shortcuts are not listed in the help modal table even though they work.

---

## 33. Toast Notifications

**How it works**: Bottom-right corner (top on mobile). Dark background, white text. 3 second default duration (configurable per toast). Stacks are NOT supported — a new toast immediately replaces any existing one.

**Test steps**:
1. Perform any action that triggers a toast (upload file, enable watermark, clear all, etc.).
2. Verify the toast appears, is readable, and disappears after ~3 seconds.
3. Trigger two quick actions → verify only the second toast shows (first is replaced).
4. On mobile (or narrow window): verify toast appears at top, not bottom.

**Known bugs**: No stacking — if two toasts fire in quick succession, the first is lost.

---

## 34. Mode Badge

**How it works**: A badge in the top-right area of toolbar row 1 shows the current active mode. Grey when in SELECT mode, blue when any tool mode is active.

| Mode | Badge text |
|------|-----------|
| select | `SELECT` (grey) |
| addText | `+ TEXT` (blue) |
| addSignature | `✍ SIGN` (blue) |
| addImage | `🖼 IMAGE` (blue) |
| drawArrow | `→ ARROW` (blue) |
| drawRect | `□ RECT` (blue) |
| drawEllipse | `○ CIRCLE` (blue) |
| drawFreehand | `✏ DRAW` (blue) |
| drawHighlight | `🖊 HIGHLIGHT` (blue) |
| addComment | `💬 COMMENT` (blue) |
| drawRedaction | `⬛ REDACT` (blue) |
| drawErase | `⌫ ERASE` (blue) |

**Test steps**:
1. Verify badge shows "SELECT" in grey on load.
2. Activate each tool mode → verify badge text and color update correctly.
3. Press `Escape` → verify badge returns to "SELECT" in grey.

**Known bugs**: None.

---

## 35. Done Pill (Freehand exit)

**How it works**: When Freehand mode is active, a **Done** pill button appears at the bottom center of the screen (above the soft keyboard on mobile). Clicking it exits freehand mode and returns to SELECT. Also exits via `Escape`.

**Test steps**:
1. Activate freehand mode (`D` key or button).
2. Verify the **Done** pill appears at the bottom center.
3. Draw a stroke.
4. Click **Done** → verify mode returns to SELECT, pill disappears.
5. Activate freehand again → press `Escape` → verify pill disappears and mode returns to SELECT.

**Known bugs**: None.

---

## 36. Mobile / Touch Support

**How it works**:
- `touch-action: none` during draw modes to prevent scroll interference.
- 5px movement threshold before committing to a drag (prevents accidental drags on tap).
- Pinch zoom: two-finger pinch handled in DrawingHandler; CSS transform applied during gesture, `applyZoom` called on finger lift.
- Minimum zoom 0.65× enforced on mobile.
- Touch targets are 40px minimum on mobile.
- Color swatches hidden on mobile (too wide).
- Toast moves to top of screen on mobile (keyboard covers bottom).
- First/last page buttons hidden on mobile to save space.

**Test steps** (requires mobile device or browser DevTools mobile emulation):
1. Open app in mobile DevTools (e.g. Chrome → F12 → Toggle Device Toolbar, select a phone).
2. Verify layout wraps correctly, toolbar reorganizes.
3. Tap **Upload PDF** → upload a PDF → verify it loads.
4. Pinch to zoom → verify zoom applies on finger lift.
5. Tap a tool button → draw/place an annotation with a finger.
6. Tap an existing annotation → verify it selects.
7. Drag the annotation → verify 5px threshold before move starts.
8. Verify the **Done** pill for freehand is reachable.

**Known bugs**: Pinch zoom centroid calculation may be slightly off (zoom may not anchor to the pinch center precisely).

---

## 37. PWA / Offline Support

**How it works**: `vite-plugin-pwa` with `autoUpdate`. Service worker (Workbox `generateSW`) precaches all JS/CSS/HTML/SVG. Large chunks (pdf.js worker, pdf-lib) use `CacheFirst` with 30-day TTL. Max precache file size: 6 MB. Manifest: name "PDF Fill & Sign", `standalone` display, blue theme.

> ⚠️ **H-14 Bug**: `index.html` hardcodes `<link rel="manifest" href="./manifest.json">` but vite-plugin-pwa generates `manifest.webmanifest`. Both links present in built HTML; browsers use the first (which 404s in production). PWA install prompt silently fails.

**Test steps** (requires `npm run build` + serving the built output):
1. Build: `npm run build` → serve `dist/` folder.
2. Open in Chrome → DevTools → Application → Service Workers → verify SW is registered.
3. DevTools → Application → Manifest → verify app is installable.
4. Go offline (DevTools → Network → Offline) → reload → verify app still loads.
5. Check for the PWA install banner in the browser URL bar.

**Known bugs**: PWA install prompt fails in production due to manifest URL collision (H-14).

---

## Summary

| Category | Count |
|----------|-------|
| File I/O | 6 |
| Page Management | 5 |
| Annotation Tools | 11 |
| Search & Forms | 2 |
| Document Settings | 3 |
| Session & State | 2 |
| UX & Misc | 7 |
| **Total** | **37** |

### Known bugs (pre-existing)
| # | Severity | Description |
|---|----------|-------------|
| B1 | P1 | Highlight color parse: `|| fallback` zeroes out channels → non-yellow colors render wrong |
| B2 | P2 | Eraser uses bbox intersection for non-freehand elements → large elements deleted by edge touch |
| B3 | P2 | Help modal missing `E` (eraser) and `F` (freehand alt) shortcuts |
| B4 | P2 | PWA manifest URL collision (H-14) → install prompt fails in production |
| B5 | P3 | Annotations don't reposition after page rotation |
| B6 | P3 | Thumbnails don't reflect placed annotations |
| B7 | P3 | Toast notifications don't stack (second replaces first) |
| B8 | P3 | Signature pad: can't reuse same signature without redrawing |
