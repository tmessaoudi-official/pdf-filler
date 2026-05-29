# PDF Fill & Sign — Shapes Feature

**Date:** 2026-05-29  
**Status:** Approved

## Summary

Add 4 drawing tools to the PDF editor: Arrow, Rectangle, Circle/Ellipse, and Freehand. Users click and drag to draw shapes directly on the PDF. Shapes are selectable, movable, and exported as vector graphics in the downloaded PDF.

## Decisions

| Topic | Decision |
|---|---|
| Interaction | Click & drag to draw |
| Style | Stroke color + line width only (no fill) |
| Toolbar | Shape tools inline in Row 1; shape color+width in Row 2 |
| Mode persistence | Stay in shape mode after each draw (draw multiple) |
| Exit | Escape or clicking a different mode |

---

## Architecture

**One new file:** `js/shapeElement.js` — single `ShapeElement` class handling all 4 types. Follows the same pattern as `TextElement` and `SignatureElement`: extends `PDFElement`, stored in `app.elements[]`, rendered as a scaled SVG overlay div, participates in undo/redo/autosave/selection automatically.

**During drawing:** A temporary `<svg id="drawPreview">` is appended to `#canvasContainer` during the mousedown→mousemove→mouseup sequence. On mouseup it is removed and replaced with the final `ShapeElement` div from `renderElements()`.

**No new infrastructure needed:** InteractionHandler (drag to move), `app.pushHistory()`, `app._autosave()`, `app.selectElement()`, `app.removeElement()` all work on shapes without modification.

---

## Data Model

### `ShapeElement extends PDFElement`

```js
this.type = 'shape'
this.shapeType   // 'arrow' | 'rect' | 'ellipse' | 'freehand'
this.strokeColor // hex string, default '#ef4444'
this.strokeWidth // number in PDF pt (normalized by zoomScale), default 2

// Arrow only (in PDF units):
this.x1   // start x
this.y1   // start y
this.x2   // end x
this.y2   // end y

// Freehand only:
this.points  // Array<{x: number, y: number}> in PDF units
```

**Bounding box** (`x, y, width, height` inherited from `PDFElement`) is computed from shape data:
- Rect/Ellipse: `x,y` = drag start; `width,height` = drag delta (PDF units)
- Arrow: `x = min(x1,x2)`, `y = min(y1,y2)`, `width = |x2-x1|`, `height = |y2-y1|`
- Freehand: `x = min(all points.x)`, `y = min(all points.y)`, `width = range of x`, `height = range of y`

**Bounding box purpose:** positions the overlay div and drives the resize handle (scales the bounding box uniformly).

### `toJSON()` includes:
`shapeType, strokeColor, strokeWidth, x1, y1, x2, y2, points`

---

## Toolbar Changes

### Row 1 — new buttons (between ✍ Sign and ⬇ Download):

```
[→ Arrow]  [□ Rect]  [○ Circle]  [✏ Draw]
```

IDs: `arrowBtn`, `rectBtn`, `circleBtn`, `freehandBtn`

Mode badge: `→ ARROW` / `□ RECT` / `○ CIRCLE` / `✏ DRAWING`

### Row 2 — shape style (added after existing formatting group):

```
… [text formatting] | Shape: [■ shapeColor]  [2 ↕ shapeWidth] | Zoom …
```

IDs: `shapeColor` (color input), `shapeWidth` (number input, 1–20)  
Always visible; disabled when not in a shape mode.

### Keyboard shortcuts (added to global keydown handler):
- `A` → Arrow mode
- `R` → Rect mode  
- `C` → Circle mode
- `D` → Freehand draw mode
- (All guarded by input-focus check, same as existing shortcuts)

---

## Drawing Interaction

### State added to `PDFEditorApp`:
```js
this._drawing = false
this._drawStart = null   // {x, y} in PDF units
this._drawPoints = []    // freehand point accumulator [{x, y}]
this._previewSvg = null  // <svg> element for live preview
```

### Flow:

**`mousedown` on canvas (shape mode active):**
1. Compute PDF-unit position: `const rect = canvas.getBoundingClientRect(); _drawStart = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }`
2. Set `_drawing = true`
3. Create `_previewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')` and append to `#canvasContainer`
4. For freehand: initialize `_drawPoints = [_drawStart]`

**`mousemove` (while `_drawing`):**
1. Compute current PDF-unit position
2. Update `_previewSvg` with the current shape (line+arrowhead / rect / ellipse / path)
3. For freehand: append point if distance from last point > 3px (noise threshold)

**`mouseup`:**
1. Set `_drawing = false`
2. Remove `_previewSvg` from DOM
3. Create `ShapeElement` from collected data
4. `pushHistory()`, `elements.push(shape)`, `_autosave()`, `renderElements()`
5. **Stay in shape mode** (user can draw another immediately)

**Minimum draw size check:** if the bounding box is < 5×5 PDF units (accidental click), discard without creating an element.

---

## Rendering (`ShapeElement.render()`)

Returns a div containing an SVG that fills the bounding box:

```html
<div class="pdf-element shape-element" data-id="...">
  <svg width="{width*scale}" height="{height*scale}"
       style="overflow:visible; position:absolute; top:0; left:0;">
    <!-- Arrow: <line> + <polygon> arrowhead -->
    <!-- Rect:  <rect> -->
    <!-- Ellipse: <ellipse> -->
    <!-- Freehand: <polyline> or <path> -->
  </svg>
  <!-- .element-controls (delete button, from PDFElement base) -->
  <!-- .resize-handle (from PDFElement base) -->
</div>
```

**Arrow arrowhead:** a small `<polygon>` (filled triangle, 8px) rotated to face the endpoint direction.

**Stroke width in SVG overlay:** `stroke-width = element.strokeWidth * scale` so the stroke appears proportional at any zoom level.

**Freehand rendering:** `<polyline points="...">` built from the scaled points array.

The `applyStyles()` method positions the div using `x * scale`, `y * scale` (same pattern as TextElement).

---

## PDF Export (`downloadPDF()`)

Shape elements are drawn using pdf-lib vector methods after the raster page image:

```js
if (element.type === 'shape') {
  const { r, g, b } = this.hexToRgbValues(element.strokeColor);
  const color = rgb(r, g, b);
  const lw = element.strokeWidth;

  switch (element.shapeType) {
    case 'rect':
      page.drawRectangle({
        x: element.x, y: origVp.height - element.y - element.height,
        width: element.width, height: element.height,
        borderColor: color, borderWidth: lw
      });
      break;
    case 'ellipse':
      page.drawEllipse({
        x: element.x + element.width / 2,
        y: origVp.height - element.y - element.height / 2,
        xScale: element.width / 2, yScale: element.height / 2,
        borderColor: color, borderWidth: lw
      });
      break;
    case 'arrow':
      // Line from (x1, y1) to (x2, y2)
      page.drawLine({
        start: { x: element.x1, y: origVp.height - element.y1 },
        end:   { x: element.x2, y: origVp.height - element.y2 },
        thickness: lw, color
      });
      // Arrowhead: filled triangle at endpoint
      // (computed from angle of the line)
      break;
    case 'freehand':
      // Build SVG path string from element.points
      // page.drawSvgPath(pathString, { x:0, y:0, borderColor: color, borderWidth: lw })
      break;
  }
}
```

---

## Files Changed

| File | Change |
|---|---|
| `js/shapeElement.js` | **New** — ShapeElement class (all 4 types) |
| `index.html` | Add 4 shape buttons to Row 1; shapeColor + shapeWidth to Row 2 |
| `js/pdfEditorApp.js` | Import ShapeElement; add shape mode handling; add draw mousedown/mousemove/mouseup; add A/R/C/D keyboard shortcuts; render shapes in downloadPDF(); add _drawing/_drawStart/_drawPoints/_previewSvg state |

`pdfRenderer.js`, `textElement.js`, `signatureElement.js`, `pdfElement.js`, `interactionHandler.js` — **no changes**.

---

## Out of Scope

- Fill color for shapes
- Dashed/dotted line styles
- Multi-point polygon tool
- Editing individual freehand points after drawing
- Shape resize with aspect-ratio lock
