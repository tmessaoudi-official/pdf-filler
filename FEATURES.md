# PDF Fill & Sign — Feature Documentation

**Version**: 1.0.0  
**Build**: Vite 5 / TypeScript / PWA  
**Base URL**: `/pdf-filler/`  
**Tested**: 2026-06-03 (Playwright live sweep + static analysis, all 22 surfaces verified; 2 confirmed bugs)

---

## Table of Contents

1. [File Management](#1-file-management)
2. [Page Management](#2-page-management)
3. [Annotation Tools](#3-annotation-tools)
4. [Text Formatting](#4-text-formatting)
5. [Drawing & Shapes](#5-drawing--shapes)
6. [Signature](#6-signature)
7. [Image Overlay](#7-image-overlay)
8. [Highlight](#8-highlight)
9. [Comment / Sticky Note](#9-comment--sticky-note)
10. [Redaction](#10-redaction)
11. [Form Field Detection & Fill](#11-form-field-detection--fill)
12. [Text Search / Find](#12-text-search--find)
13. [Watermark](#13-watermark)
14. [Zoom & View](#14-zoom--view)
15. [Undo / Redo](#15-undo--redo)
16. [Export — Full PDF](#16-export--full-pdf)
17. [Export — Single Page PDF (Split)](#17-export--single-page-pdf-split)
18. [Export — Page as PNG Image](#18-export--page-as-png-image)
19. [Session Persistence](#19-session-persistence)
20. [Keyboard Shortcuts](#20-keyboard-shortcuts)
21. [Mobile / Touch Support](#21-mobile--touch-support)
22. [PWA / Offline Support](#22-pwa--offline-support)

---

## 1. File Management

### 1.1 Open PDF

**Trigger**: Click **📁 Upload PDF** button (toolbar row 1) or the empty-state landing zone.  
**Accepts**: `application/pdf` only. Non-PDF files produce an `alert()` with an error message.  
**Behaviour**:
- Resets all state (elements, history, form values, document model).
- Computes a fit-to-width zoom scale automatically.
- On mobile (viewport ≤ 640 px), enforces a minimum zoom of 0.65 for readability.
- Reveals the page thumbnail strip and enables all toolbar buttons.
- Triggers autosave to IndexedDB after load.

**Internal path**: `PDFEditorApp.handleFileUpload()` → `DocumentModel.addSourcePdf()` → `DocumentModel.addPagesFrom()` → `PDFRenderer.renderPageAtIndex()`.

---

## 2. Page Management

### 2.1 Page Navigation

| Control | Action |
|---------|--------|
| **◀◀ First** | Jump to page 1 |
| **◀ Prev** | Previous page (clamped at 0) |
| **▶ Next** | Next page (clamped at last) |
| **▶▶ Last** | Jump to last page |
| **Page input** | Type page number + Enter or blur to jump |
| `Ctrl+←` / `Ctrl+→` | Previous / Next page (keyboard) |

Page counter shows `current / total` and syncs with the thumbnail strip.

### 2.2 Page Thumbnail Panel

The left sidebar renders thumbnail images of all pages. Each thumbnail shows:
- Lazy-generated JPEG thumbnail (15% scale) with in-memory cache.
- Page number label.
- **Rotate CCW ↺** — rotates page by +90° (CCW in PDF convention).
- **Rotate CW ↻** — rotates page by −90°.
- **⬇ Download** — exports this single page as a PDF (see §17).
- **× Delete** — removes the page (disabled when only 1 page remains).
- **Active indicator** — highlighted border on the current page.

**Drag-and-drop reorder**: Drag a thumbnail and drop it on another to change page order. Fully undoable.

### 2.3 Add Pages from Another PDF

**Trigger**: **+ Add PDF** button at the end of the thumbnail strip, or via the `addPdfInput` hidden file input.  
**Behaviour**: Appends all pages from each uploaded PDF to the current document. Supports uploading multiple PDFs at once. Failed files are skipped with a toast notification. Fully undoable.

### 2.4 Delete Page

Removes a page and all its annotations. Enforces a minimum of 1 page. Undoable (re-inserts page and its annotations at the original index; also restores the source PDF entry if it was garbage-collected).

### 2.5 Page Rotation

Rotates a page by ±90° increments. The rotation is compounded with the source PDF's intrinsic rotation to produce the correct effective orientation. Rotation is reflected in the thumbnail cache (cache is invalidated on rotate). A toast warns when annotations exist on the page ("existing annotations may shift in export after rotation"). Undoable.

### 2.6 Page Reorder

Drag thumbnails to reorder. The `ReorderPagesCmd` records before/after ID arrays for precise undo.

---

## 3. Annotation Tools

All annotation types are created on the **current page** and saved with their `pageId`. When switching pages, only the current page's annotations are rendered. Annotations on other pages are preserved and rendered when navigating back.

**Element types**: `text`, `signature`, `image`, `highlight`, `comment`, `redaction`, `shape` (arrow/rect/ellipse/freehand).

### 3.1 Element Controls

Every placed element has:
- **Move**: Drag the element body.
- **Resize**: Drag the resize handle (bottom-right corner). Minimum 50×20 px.
- **Delete**: Click the **×** control button, or press `Delete`/`Backspace` when selected.
- **Select**: Click element to select; click canvas background to deselect.
- **Nudge**: Arrow keys move the selected element by 1 px (10 px with Shift).

---

## 4. Text

**Trigger**: **T Text** button or keyboard `T`.

**Placement**: Click anywhere on the PDF canvas. A text input appears centred on the click point.

**Properties** (all changeable while element is selected):

| Property | Control | Range/Values |
|----------|---------|--------------|
| Content | Inline input | Any text |
| Font family | Dropdown | Arial, Helvetica, Times New Roman, Courier New |
| Font size | Spinner + A−/A+ buttons | 8–72 px |
| Bold | **B** toggle | on/off |
| Italic | *I* toggle | on/off |
| Color | Color picker + 6 quick swatches | Any hex color |

Color swatches: Black, Red, Blue, Green, Orange, White.

Text changes are debounced into the undo history (500 ms snapshot window). An empty text element is removed automatically when deselected.

**Export**: Rendered as a vector `Tj` text operator in the exported PDF using a mapped Standard Font (Arial → Helvetica, Times New Roman → TimesRoman, Courier New → Courier). Bold/italic map to the appropriate Standard Font variant.

---

## 5. Drawing & Shapes

**Trigger**: Toolbar row 2 shape buttons or keyboard shortcuts.

All drawing uses pointer events with a preview SVG overlay during drag.

| Shape | Button | Key | Description |
|-------|--------|-----|-------------|
| Arrow | **→** | `A` | Click-drag from start to end; arrowhead auto-drawn at endpoint |
| Rectangle | **□** | `R` | Click-drag to define bounding box |
| Ellipse | **○** | `C` | Click-drag to define bounding ellipse |
| Freehand | **✏** | `D` | Hold and draw; points sampled every 3 px of screen movement |

**Shape properties** (shape color and line width in toolbar row 2):
- **Stroke color**: Color picker (default red `#ef4444`).
- **Line width**: Spinner, 1–∞ px (default 2).

Minimum bounding box to commit a shape: 5×5 px. Smaller gestures are discarded.

**Export**: Arrow → 3 `drawLine` calls; Rect → `drawRectangle`; Ellipse → `drawEllipse`; Freehand → `drawSvgPath` with M/L commands. All respect page rotation via coordinate transform.

---

## 6. Signature

**Trigger**: **✍ Sign** button or keyboard `S`.

**Workflow**:
1. A modal appears with a canvas pad.
2. Draw the signature with mouse or touch.
3. Configure **line width** (slider) and **color** (color picker).
4. Click **Save** — the modal closes and cursor enters placement mode.
5. Click anywhere on the PDF to place the signature as an image.
6. Click **Cancel** or press `Escape` to abort.

The signature is captured as a PNG data URL. Placed as a resizable image overlay on the page.

**Export**: Embedded as a PNG image in the PDF via `embedPng`.

---

## 7. Image Overlay

**Trigger**: **🖼 Image** button or keyboard `I`.

**Workflow**:
1. System file picker opens (accepts any image type).
2. Image loads as a data URL.
3. Toast appears: "Click on the PDF to place the image".
4. Click the PDF canvas to place the image at 200×150 px default size.
5. Resize by dragging the resize handle.

**Export**: JPEG images → `embedJpg`. PNG and other formats → canvas re-encoded to PNG → `embedPng`.

---

## 8. Highlight

**Trigger**: **🖊 Highlight** button or keyboard `H`.

**Placement**: Click-drag to draw a highlight rectangle (preview shown during drag with semi-transparent yellow overlay).

**Properties**: Default color `#FFFF00`, opacity 0.3. Color not currently editable via UI after placement.

> ⚠️ **Bug**: `highlightElement.ts:20-22` uses `parseInt(hex, 16) || fallback` to parse RGB channels. Any channel with value `0` is replaced by the fallback (r→255, g→220, b→0). Example: red `#FF0000` renders as `rgba(255, 220, 0, 0.3)` (orange), black `#000000` renders as `rgba(255, 220, 0, 0.3)`. Only affects non-default colors (default yellow `#FFFF00` is unaffected). Fix: replace `|| fallback` with `isNaN(v) ? fallback : v`.

**Export**: Rendered as a semi-transparent filled rectangle (`drawRectangle` with `opacity`).

**Search integration**: The Find bar's **Add Highlight** button creates a highlight element at the current search match position (see §12).

---

## 9. Comment / Sticky Note

**Trigger**: **💬 Comment** button.

**Placement**: Click anywhere on the canvas. A 200×120 px sticky note appears.

**Properties**:
- Background color: Pastel yellow `#FFFDE7` (not user-configurable via UI).
- Text: Inline `<textarea>` inside the note. Type directly to add content.
- Resize via the resize handle.

**Export**: Rendered as a filled rectangle with Helvetica text (first 200 characters). Background color is preserved.

---

## 10. Redaction

**Trigger**: **⬛ Redact** button.

**Placement**: Click-drag to define the redaction area.

**Visual**: Solid black box with a dashed red border (dashes hidden in non-selected state). Renders at `z-index: 15` above all other elements.

**Export**: Renders as a solid black filled rectangle (`rgb(0, 0, 0)`, no border).

> ⚠️ **Important limitation**: See [CODE_REVIEW.md §P0-1](CODE_REVIEW.md) for a critical security note about the export behaviour.

---

## 11. Form Field Detection & Fill

**Automatic on PDF load**: If the source PDF contains AcroForm text fields (`fieldType: 'Tx'`), they are detected via `page.getAnnotations()` and rendered as transparent HTML `<input>` overlays positioned to match the PDF field rectangles.

**Behaviour**:
- Field values are tracked per `sourcePdfId` (fields survive page navigation).
- Values persist in session storage (saved to IndexedDB autosave).
- Form field inputs are disabled in non-select modes (pointer-events off) to avoid accidental editing while drawing shapes.

**Limitations**: Only text fields (`Tx`) are supported. Checkboxes (`Btn`), radio buttons, and dropdown lists (`Ch`) are silently ignored.

**Export**: Before exporting, each source PDF's form is filled with saved values and flattened (`form.flatten()`) so the text is baked into the page content.

---

## 12. Text Search / Find

**Trigger**: **🔍** button or `Ctrl+F`.

**Find bar controls**:
| Control | Action |
|---------|--------|
| Text input | Type query (case-insensitive, live search) |
| **◀ Prev** | Previous match |
| **▶ Next** | Next match |
| **Add Highlight** | Create highlight element at current match |
| **✕ Close** | Close bar and clear match overlays |
| Enter | Next match |
| Shift+Enter | Previous match |
| Escape | Close bar |

**Behaviour**: Searches the current page only. Match count shown as `current / total`. Match positions are displayed as semi-transparent yellow overlays. Overlays reposition correctly on zoom change. Search results are cleared when navigating to a different page.

**Technical**: Uses `page.getTextContent()` via pdf.js, builds a per-page index cached by `pageId`. Match coordinates are transformed from PDF user space to canvas pixel space via the viewport transform matrix.

---

## 13. Watermark

**Trigger**: **≋** (Watermark) button.

**Modal controls**:
| Setting | Control | Default |
|---------|---------|---------|
| Enabled | Checkbox | Off |
| Text | Text input | `WATERMARK` |
| Color | Color picker | `#888888` |
| Font size | Slider (20–120) | 60 |
| Opacity | Slider (10–100%) | 25% |
| Angle | Slider (−90°–90°) | −45° |

A live **preview** updates in the modal as settings change (scaled-down representation).

**Apply**: Saves settings to `DocumentModel.watermark`. Closes modal. Shows toast.

**Export**: Rendered on every page using the Helvetica standard font, centered on the page content dimensions. Rotation uses `degrees()` from pdf-lib. Opacity via pdf-lib's opacity parameter. Does NOT appear in the canvas view (export-only).

---

## 14. Zoom & View

| Control | Action |
|---------|--------|
| **−** | Zoom out by 0.1 |
| **+** | Zoom in by 0.1 |
| **⊡ Fit** | Fit to container width (responsive) |
| `Ctrl+Scroll` | Zoom in/out by 0.05 per wheel tick |
| Pinch (touch) | Two-finger pinch to zoom (mobile) |

**Zoom range**: 0.25× – 3.0×. Displayed as integer percentage.

**Fit to width**: Computes scale as `(containerWidth − 40) / pageWidth`. Uses the first page of the primary PDF document.

**On zoom**: Full page re-render, all element overlay positions recalculated, thumbnail cache invalidated, active search results repositioned.

---

## 15. Undo / Redo

**Triggers**: **↩ Undo** / **↪ Redo** buttons, or `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`.

**History capacity**: 50 commands.

**Command types**:
| Command | Undo behaviour |
|---------|----------------|
| `AddElementCmd` | Remove element by ID |
| `RemoveElementCmd` | Re-insert element at original index |
| `MoveResizeCmd` | Restore position/size before gesture |
| `SnapshotCmd` | Full element-array snapshot for text edits (500 ms debounce) |
| `ClearAllCmd` | Restore all cleared elements |
| `AddPagesCmd` | Remove added pages |
| `DeletePageCmd` | Re-insert page + annotations at original index; restore source PDF if GC'd |
| `ReorderPagesCmd` | Restore original page order |
| `RotatePageCmd` | Restore previous rotation exactly |

Undo/redo buttons are disabled when the respective stack is empty.

---

## 16. Export — Full PDF

**Trigger**: **⬇ Download** button.

**Process**:
1. Empty text elements cleaned up.
2. Each source PDF loaded once via pdf-lib.
3. Form fields filled and flattened (if user-entered values exist).
4. All needed pages pre-copied in a single `copyPages()` call per source (avoids redundant copies).
5. Pages added to output document in display order.
6. User page rotation applied on top of source rotation.
7. Each annotation drawn as a vector element (see per-type export notes above).
8. Watermark drawn on every page (if enabled).
9. PDF saved and downloaded. Filename: `<original-name>-edited.pdf`.

UI opacity is reduced to 0.4 during generation to indicate processing.

---

## 17. Export — Single Page PDF (Split)

**Trigger**: **📄** (Export Page) button in toolbar row 1 (exports the current page), or the **⬇** button on any individual page thumbnail.

Exports the selected page (with its annotations and watermark if enabled) as a standalone PDF. Filename: `<original-name>-page<N>.pdf`.

---

## 18. Export — Page as PNG Image

**Trigger**: **📷** (Export Image) button in toolbar row 1.

**Process**:
1. Builds a single-page PDF with all annotations rendered (same pipeline as full export).
2. Re-rasterizes via pdf.js at **2× scale** for high resolution.
3. Renders to an off-screen canvas.
4. Downloads as `image/png`. Filename: `<original-name>-page<N>.png`.

---

## 19. Session Persistence

**Storage**: IndexedDB, database `pdf-editor` v2, store `state`, key `current`.

**Saved state**:
- All annotation elements (serialized via `toJSON()`)
- Page list and page order
- Watermark settings
- Current page index
- Source PDF bytes (full `Uint8Array` per source)
- Form field values (per source PDF)

**Autosave**: Triggered (debounced 800 ms) after every edit, page change, or structure change.

**Restore**: On page load, if saved state exists, it is restored silently. Toast: "Session restored".

**Clear**: **✕** (Clear Save) button in toolbar removes the saved session. Toast: "Saved session cleared".

> Note: IDB is unavailable in private/incognito mode; silently degrades (saves are no-ops, no error shown to user).

---

## 20. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `T` | Text mode |
| `S` | Signature mode |
| `I` | Image picker |
| `A` | Arrow mode |
| `R` | Rectangle mode |
| `C` | Circle/Ellipse mode |
| `D` | Freehand draw mode |
| `H` | Highlight mode |
| `?` | Toggle help modal |
| `Escape` | Return to Select mode; close modals/find bar |
| `Delete` / `Backspace` | Delete selected element |
| `Arrow keys` | Nudge selected element ±1 px |
| `Shift+Arrow` | Nudge selected element ±10 px |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+F` | Open Find bar |
| `Ctrl+→` | Next page |
| `Ctrl+←` | Previous page |
| Enter (in find bar) | Next match |
| Shift+Enter (in find bar) | Previous match |

Help modal accessible via **?** button (toolbar) or `?` key.

---

## 21. Mobile / Touch Support

- **Touch action**: Canvas uses `pan-x pan-y` in select mode; switches to `none` during draw modes to prevent scroll interference.
- **Touch drag**: Elements on touch devices use a 5 px movement threshold before committing to a drag (prevents accidental drags during tap-to-edit).
- **Pinch zoom**: Two-finger pinch gesture handled in `DrawingHandler`. CSS transform applied during gesture for visual feedback; `applyZoom` called on finger lift for actual re-render.
- **Signature pad**: Touch events dispatched as MouseEvents internally (legacy compatibility).
- **Minimum zoom**: 0.65× enforced on mobile to maintain readability.
- **PWA**: Installable on mobile home screen (see §22).

---

## 22. PWA / Offline Support

- `vite-plugin-pwa` with `autoUpdate` strategy.
- Service worker (Workbox `generateSW`) precaches all JS/CSS/HTML/SVG assets.
- Large chunks (pdf.js worker, pdf-lib) cached via `CacheFirst` runtime caching with 30-day TTL.
- Max precache file size: 6 MB (accommodates the pdf.js build).
- Manifest: `PDF Fill & Sign`, `standalone` display, blue theme (`#2563eb`).
- App icon: SVG (192×192 and 512×512).

> Note: In development mode, the manifest.json route returns a syntax error (Vite serves a JS-based manifest; the JSON endpoint is only available after `vite build`). This does not affect functionality.
>
> ⚠️ **H-14 Bug**: `index.html` hardcodes `<link rel="manifest" href="./manifest.json">` but vite-plugin-pwa generates `manifest.webmanifest`. Both links are present in the built `index.html`; browsers use the first (which 404s). PWA install prompt silently fails in production. Fix: remove the hardcoded manifest link from `index.html`.
