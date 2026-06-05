# PDF Editor UX Enhancements — Design Spec

**Date:** 2026-06-05  
**Status:** Approved for implementation planning  
**Scope:** 5 feature areas — text export accuracy, path eraser, continuous pen mode, tool toggle model, mobile pointer bugs

---

## North Star

> **Zero mode switching.** The default state is always select/drag. Every tool is a temporary toggle. The user never gets trapped in a mode — they activate a tool, use it, and the editor returns to neutral. The only exception is freehand, which stays loaded across strokes until explicitly exited.

Every future feature must answer to this principle: does it add a mode, or does it enable a direct action?

---

## 1. Text Export Position Fix + PDF Ghost Preview

### Problem

Text annotations placed on the PDF canvas are slightly misplaced in the exported PDF. The precise type of misplacement has not been measured yet — it may be a coordinate baseline mismatch (PDF anchors text at baseline, screen space anchors at top-left) or a de-scaling error in the screen-to-PDF coordinate transform.

### Measurement First

Before any fix, a test must be performed:
1. Place a text annotation at a known position at zoom 1.0 and export.
2. Measure the actual PDF position against the expected position.
3. Repeat at zoom 2.0 and zoom 0.5.
4. If the offset is constant across zooms → baseline vs. top-left mismatch.
5. If the offset scales with zoom → de-scaling error in `anchor` calculation.

### Fix Direction

**Baseline mismatch:** Add `te.fontSize * font.heightAtSize(te.fontSize) * ascenderRatio` to the y-coordinate in the export path (`pdfEditorApp.ts` around line 1501).

**De-scaling error:** The screen coordinate must be divided by `zoomScale` before being passed to the PDF coordinate transform. Verify the `anchor` calculation in `downloadPDF()` / `downloadPage()`.

### PDF Ghost Preview Overlay (Differentiating Feature)

Before exporting, show a "ghost" overlay on top of the rendered PDF canvas:
- Each annotation renders as a semi-transparent (40% opacity) duplicate at its exact computed PDF-space position.
- Ghost positions are calculated using the same transform pipeline as the export function — they ARE the export coordinates, reprojected back to screen space.
- A top banner says: "This is where your annotations will appear in the exported PDF. Click Export to confirm."
- A "Close Preview" button exits without exporting.
- This feature is triggered by a separate "Preview Export" button, not the main Download button.

**Why it's unique:** No existing PDF editor shows exact pre-export position verification. It makes the hidden coordinate transform visible and user-controllable.

---

## 2. Path Eraser Tool

### Behavior

A new toolbar button: **Eraser** (rubber icon). Activates erase mode (follows the tool toggle model — see Section 4).

While in erase mode:
- The user draws a freehand "erase stroke" across the canvas.
- As they draw, a dashed red preview stroke follows the pointer.
- On pointer-up, the erase stroke is intersected against all elements on the current page:
  - **Geometric shapes, text, images, comments, signatures, highlights, redactions:** if the erase stroke intersects the element's axis-aligned bounding box → entire element is deleted. (Intersection is box-based, not fill-region-based — an erase stroke through the empty center of an ellipse still deletes the ellipse.)
  - **Freehand strokes:** if the erase stroke crosses a freehand stroke's path, the freehand stroke is split at the intersection point(s). Segments fully enclosed between two erase crossings are deleted. Segments outside are kept as new independent strokes.
- The erase operation is undoable (added to history stack via `DeleteElementCmd` / `SplitStrokeCmd`).

### Stroke Splitting Algorithm (Freehand)

The freehand stroke is stored as an array of `{x, y}` points. Splitting:
1. Iterate the freehand point array and find all indices where the line segment `[points[i], points[i+1]]` intersects any segment of the erase stroke.
2. At each intersection, insert the intersection point into both strokes' point arrays.
3. Partition the freehand points into segments separated by intersection points.
4. Delete segments whose midpoint falls within the erased region (inside the erase stroke polygon, or between two crossing points).
5. Each surviving segment becomes a new independent `ShapeElement` with type `freehand`.

---

## 3. Continuous Pen Mode (Freehand)

### Current Problem

After completing a freehand stroke and releasing the pointer, the new element auto-selects (bounding box appears). The next touch on the canvas grabs the old element instead of starting a new stroke. This breaks the mental model of drawing.

### New Behavior

**During freehand mode:**
- On `handlePointerUp` in `drawingHandler.ts`: commit the stroke to history, then **clear selection state entirely** — do not auto-select the newly created element.
- The tool remains in freehand mode. The next pointer-down on the canvas starts a new stroke immediately.
- No bounding box appears on completed strokes while in freehand mode (they're visible and selectable only after switching back to select mode).

**Exiting freehand mode:**
- Press **Escape** key → exits freehand mode, returns to select/drag.
- Click the **Freehand toolbar button** again (it's active/highlighted) → toggle off, returns to select/drag.
- A **floating "Done" pill** (small button, bottom-center of canvas) appears while freehand mode is active → tap it to exit. Position: fixed, 24px above bottom edge, centered. Style: white pill with shadow, "Done drawing" label, checkmark icon.

**No bounding box on selection of freehand strokes (separate concern):**
- When a freehand stroke is selected (in select mode), instead of a rectangular bounding box with corner handles, show a stroke highlight: the stroke re-renders 2px wider with a blue/primary-color tint, and a single delete handle appears at the stroke's midpoint (a small circle with an X).
- Resizing freehand strokes via handles is removed (meaningless for organic paths). Only move (drag the stroke) and delete are supported for freehand elements.

---

## 4. Tool Toggle Model

### Principle

All toolbar tools behave as **toggles**:
- Clicking an inactive tool → activates it (button gets highlighted state: elevated background + colored left border or underline).
- Clicking the active tool again → deactivates it, returns to select/drag mode.
- Pressing **Escape** → always deactivates the active tool, returns to select/drag.
- Activating any tool while another is active → silently deactivates the previous tool first (one active at a time, enforced).

### Default State

When no tool is active: the editor is in **select/drag** mode. The cursor is the default arrow/pointer. No toolbar button is highlighted.

### Visual Active State

Two signals for the active tool:
1. **Button highlight:** Active tool button gets a distinct visual state — elevated background, primary-color left border (3px), slightly larger icon. Works on all screen sizes.
2. **Cursor change (desktop only):** Pen cursor for freehand, crosshair for shapes/highlight/redaction, text cursor for text tool, eraser cursor for eraser mode, default pointer for select mode.

### Tool Activation Feedback

On every tool switch: a **1.5-second toast** appears at the bottom of the screen (centered, 16px above bottom edge) showing the activated tool name. Example: "Freehand pen — tap Done or press Esc to exit." Toast uses the same design as existing toasts. No toast when deactivating (returning to select mode is silent).

### Mode Badge

The existing mode badge is kept everywhere (desktop + mobile). Provides a persistent secondary signal. Updated to reflect exact tool name in active state, "Select" when in default state.

### Keyboard Shortcuts

- **T** → activates Text tool (if inactive); does nothing if already active (Esc to deactivate).
- **F** / **P** → activates Freehand tool.
- **Escape** → always deactivates the active tool. This is the only keyboard deactivation path (tool letter keys do NOT toggle off).

### Help Modal Documentation

The Help modal must document the tool toggle behavior explicitly:
- "Every tool is a toggle. Click to activate, click again or press Esc to deactivate."
- "Default state (no tool selected) = select and drag mode."
- "In freehand mode, draw multiple strokes freely. Tap Done or press Esc when finished."

---

## 5. Mobile Pointer Bug Fixes

### Bug A: Pinch-to-Zoom Final Position Jump

**Root cause (confirmed by user):** During pinch, a CSS `transform: scale(ratio)` is applied to the canvas container as a visual preview. The scale origin defaults to the container's geometric center. On pointer-up, `applyZoom()` re-renders the canvas at the new scale and clears the CSS transform. If the pinch centroid is not at the container's center, the visual during pinch differs from the final rendered position, causing a visible jump.

**Fix:**
1. Calculate the pinch centroid in screen coordinates: `centroid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }`.
2. During pinch: set `transform-origin` to the centroid position (in `%` or `px` relative to container).
3. After `applyZoom()`: adjust `scrollLeft/scrollTop` of the scroll container to keep the centroid at the same screen position after re-render. Formula: `newScroll = centroid * newScale - centroidScreenPos`.
4. Clear the CSS transform only after scroll adjustment is applied.

**Prerequisite:** `setPointerCapture()` must be implemented first (see Bug B) — stale pointer state from a previous pinch can corrupt the starting scale for the next pinch.

### Bug B: Element Drag / Resize Gets Stuck

**Root cause (preliminary — requires stress testing):** The browser can fire `pointercancel` during a drag (when it decides to handle a native gesture like scroll or pull-to-refresh). Without `setPointerCapture`, pointer events route to the browser instead of the element. Without a `pointercancel` handler in `interactionHandler.ts`, drag/resize state is never cleaned up — the element stays in "dragging" state with no active pointer.

**Fix:**
1. On drag/resize start in `interactionHandler.ts`: call `element.setPointerCapture(event.pointerId)`. This routes all subsequent pointer events for that ID to the element, preventing browser gesture takeover.
2. Add a `pointercancel` handler in `interactionHandler.ts` that clears all drag state: `_activePointerId = null`, `_pendingTouchDrag = false`, `_isDragging = false`, resets element position to pre-drag state.
3. Apply same fix to resize handle interaction.
4. Same fix applies to pinch pointers in `drawingHandler.ts` (already has `pointercancel` handler per comment BUG-32 — verify it fully clears state).

**Stress test to confirm trigger:** Rapidly alternate between pinch-zoom and element drag. Also test: drag element while another finger rests on screen (two-pointer state during single-finger drag).

---

## Sequencing (Implementation Order)

Per advisor recommendation — correctness prerequisites must come first:

1. **Mobile pointer fix (Bug B — setPointerCapture + pointercancel)** — unblocks all mobile interactions. Resize stuck and drag stuck are the same fix.
2. **Mobile pinch zoom fix (Bug A)** — depends on pointer capture being stable.
3. **Tool toggle model** — no mobile dependency, can start after Bug B.
4. **Continuous pen mode** — builds on toggle model.
5. **Freehand selection (no bounding box, stroke highlight)** — part of pen mode work.
6. **Path eraser** — new tool, builds on toggle model. Stroke splitting is the complex part.
7. **Text export position measurement + fix** — diagnostic first, then fix.
8. **PDF ghost preview overlay** — builds on the confirmed export pipeline.

---

## Out of Scope

- Partial erase of non-freehand elements (only full-element deletion for shapes/text/images)
- Stylus pressure sensitivity
- Annotation layers / groups
- AI-assisted features
