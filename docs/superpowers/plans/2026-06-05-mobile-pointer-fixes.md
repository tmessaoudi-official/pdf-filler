# Mobile Pointer Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two mobile interaction bugs — element drag/resize getting stuck after a browser gesture interrupt, and pinch-to-zoom jumping to the wrong position when fingers lift.

**Architecture:** Bug B (`setPointerCapture`) is the prerequisite; it stabilizes pointer ownership so Bug A's scroll-adjustment math runs on clean pointer state. Both fixes are purely in the pointer/drawing handlers — no new files, no DOM structure changes.

**Tech Stack:** TypeScript, Pointer Events API, CSS transforms — no new dependencies. Test strategy: these bugs are DOM/gesture interactions that jsdom cannot reproduce. Verification is browser-only (explicit steps below per task).

---

## File Map

| File | Change |
|---|---|
| `js/interactionHandler.ts` | Add `setPointerCapture` in `startDrag`, `startResize`, `_commitTouchDrag` |
| `js/drawingHandler.ts` | Store pinch centroid at start; set `transformOrigin` to centroid; adjust scroll after `applyZoom` |

No test files — these are DOM/pointer behaviors that jsdom cannot exercise meaningfully. Verification steps are browser-manual per task.

---

## Task 1: `setPointerCapture` for Drag and Resize (interactionHandler.ts)

**Files:**
- Modify: `js/interactionHandler.ts:83-101`

**Root cause confirmed:** Without `setPointerCapture`, when a drag starts on mobile the browser still interprets the touch as a potential pan/scroll gesture (the canvas has `touchAction: pan-x pan-y` in select mode). When the browser decides to claim the gesture it fires `pointercancel`. The `pointercancel` handler IS present (lines 169-176) and does call `_finish()` — but the race condition is: between `startDrag` and the first `pointermove`, the browser may claim the gesture and cancel our pointer BEFORE we process move events. The element stays in `isDragging = true` because the cancel fires before `_activePointerId` is set in some edge cases, or because a second finger interrupts the event sequence. `setPointerCapture` prevents the browser from treating the touch as a scroll, keeping all events routed to the dragged element.

- [ ] **Step 1: Read the current file to confirm exact content before editing**

  Open `js/interactionHandler.ts` and confirm lines 83-101 match exactly:
  ```typescript
  private startDrag(e: PointerEvent, element: PDFElement, div: HTMLDivElement): void {
    this.isDragging = true;
    this.currentElement = element;
    this._activePointerId = e.pointerId;
    this._beforeState = this._captureState(element);
    const divRect = div.getBoundingClientRect();
    this.offsetX = e.clientX - divRect.left;
    this.offsetY = e.clientY - divRect.top;
    e.preventDefault();
  }

  private startResize(e: PointerEvent, element: PDFElement): void {
    this.isResizing = true;
    this.currentElement = element;
    this._activePointerId = e.pointerId;
    this._beforeState = this._captureState(element);
    this.startX = e.clientX; this.startY = e.clientY;
    this.startWidth = element.width; this.startHeight = element.height;
    e.preventDefault(); e.stopPropagation();
  }
  ```

- [ ] **Step 2: Add `setPointerCapture` to `startDrag`**

  In `js/interactionHandler.ts`, replace `startDrag`:
  ```typescript
  private startDrag(e: PointerEvent, element: PDFElement, div: HTMLDivElement): void {
    this.isDragging = true;
    this.currentElement = element;
    this._activePointerId = e.pointerId;
    this._beforeState = this._captureState(element);
    const divRect = div.getBoundingClientRect();
    this.offsetX = e.clientX - divRect.left;
    this.offsetY = e.clientY - divRect.top;
    div.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  ```

- [ ] **Step 3: Add `setPointerCapture` to `startResize`**

  In `js/interactionHandler.ts`, replace `startResize`:
  ```typescript
  private startResize(e: PointerEvent, element: PDFElement): void {
    this.isResizing = true;
    this.currentElement = element;
    this._activePointerId = e.pointerId;
    this._beforeState = this._captureState(element);
    this.startX = e.clientX; this.startY = e.clientY;
    this.startWidth = element.width; this.startHeight = element.height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  }
  ```

- [ ] **Step 4: Add `setPointerCapture` to `_commitTouchDrag`**

  In `js/interactionHandler.ts`, replace `_commitTouchDrag`:
  ```typescript
  private _commitTouchDrag(e: PointerEvent): void {
    const p = this._pendingTouchDrag;
    if (!p) return;
    this.isDragging = true;
    this.currentElement = p.element;
    this._activePointerId = p.pointerId;
    this._beforeState = this._captureState(p.element);
    this.offsetX = p.offsetX;
    this.offsetY = p.offsetY;
    p.div.setPointerCapture(p.pointerId);
    this._pendingTouchDrag = null;
    this.drag(e);
  }
  ```

- [ ] **Step 5: Browser verification**

  Run `npm run dev`, open on a mobile device (or Chrome DevTools → mobile emulation with a touch device profile).
  1. Load a PDF with at least one text or shape annotation.
  2. Drag the element slowly — element should follow finger smoothly and stop cleanly on lift.
  3. Drag the element, then touch a second finger anywhere — drag should cancel cleanly (element snaps back if moved less than intended, or stays where released).
  4. Use the resize handle on an element — resize should track without getting stuck.
  5. Rapidly alternate between drag and pinch-zoom ×5 — no stuck state.
  Expected: element never stays "in drag" after finger lifts.

- [ ] **Step 6: Commit**

  ```bash
  git add js/interactionHandler.ts
  git commit -m "fix: setPointerCapture on drag/resize — prevent browser gesture steal on mobile"
  ```

---

## Task 2: Centroid-Based Pinch-to-Zoom Fix (drawingHandler.ts)

**Files:**
- Modify: `js/drawingHandler.ts:7-17` (new instance fields), `:33-41` (pinch start), `:73-80` (pinch move), `:97-110` (pinch end)

**Root cause confirmed by user:** During pinch, `canvas.style.transform = scale(ratio)` with `transformOrigin = 'center center'`. On finger lift, `applyZoom(newScale)` re-renders the canvas at the new scale without adjusting the scroll container's `scrollLeft/scrollTop`. If the pinch centroid was NOT at the visible center of the scroll container, the canvas content appears to jump to a different position after re-render.

**Fix approach:**
1. At pinch-start: record the centroid in viewport coordinates AND in document-space coordinates (unscaled canvas coords).
2. During move: set `transformOrigin` to the centroid in canvas-pixel space so the live preview scales around the correct point.
3. At pinch-end: after `applyZoom`, adjust `container.scrollLeft/scrollTop` so the centroid document-space point appears at the same viewport position as before.

- [ ] **Step 1: Add new instance fields to `DrawingHandler`**

  In `js/drawingHandler.ts`, after the existing private fields (after `_lastPinchDist` at line ~16), add:
  ```typescript
  private _pinchCentroidDoc: { x: number; y: number } | null = null;
  private _pinchCentroidViewport: { x: number; y: number } | null = null;
  ```

- [ ] **Step 2: Capture centroid at pinch start**

  In `js/drawingHandler.ts`, in `handlePointerDown`, replace the pinch-start block (lines ~33-41):
  ```typescript
  if (this._pinchPointers.size >= 2) {
    this.cancel();
    if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }
    this._pinchStartDist = this._getPinchDist();
    this._pinchStartZoom = this.app.zoomScale;
    this._lastPinchDist  = this._pinchStartDist;

    // Capture centroid for scroll correction after applyZoom
    const pts = [...this._pinchPointers.values()];
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    this._pinchCentroidViewport = { x: cx, y: cy };
    const container = this.app.ui.container;
    const cRect = container.getBoundingClientRect();
    const canvas = this.app.ui.canvas;
    this._pinchCentroidDoc = {
      x: (cx - cRect.left + container.scrollLeft - canvas.offsetLeft) / this.app.zoomScale,
      y: (cy - cRect.top  + container.scrollTop  - canvas.offsetTop)  / this.app.zoomScale,
    };

    e.preventDefault();
    return;
  }
  ```

- [ ] **Step 3: Use centroid as transform-origin during move**

  In `js/drawingHandler.ts`, in `handlePointerMove`, replace the pinch-move block (lines ~73-80):
  ```typescript
  if (this._pinchPointers.size >= 2 && this._pinchStartDist) {
    const dist = this._getPinchDist();
    this._lastPinchDist = dist;
    const ratio = dist / this._pinchStartDist;

    if (this._pinchCentroidDoc && this._pinchCentroidViewport) {
      const canvas = this.app.ui.canvas;
      const originX = this._pinchCentroidDoc.x * this.app.zoomScale + canvas.offsetLeft
                      - (this.app.ui.container.scrollLeft - this.app.ui.container.scrollLeft); // keep origin in canvas-local px
      // transformOrigin is in canvas-local pixel space (before scale transform)
      const tlX = this._pinchCentroidDoc.x * this.app.zoomScale;
      const tlY = this._pinchCentroidDoc.y * this.app.zoomScale;
      canvas.style.transformOrigin = `${tlX}px ${tlY}px`;
    } else {
      this.app.ui.canvas.style.transformOrigin = 'center center';
    }
    this.app.ui.canvas.style.transform = `scale(${ratio})`;
    return;
  }
  ```

- [ ] **Step 4: Adjust scroll after `applyZoom` at pinch end**

  In `js/drawingHandler.ts`, make `handlePointerUp` async and replace the pinch-end block (lines ~100-110):
  ```typescript
  async handlePointerUp(e: PointerEvent): Promise<void> {
    this._pinchPointers.delete(e.pointerId);

    if (this._pinchStartDist !== null && this._pinchStartZoom !== null && this._pinchPointers.size < 2) {
      const finalDist = this._lastPinchDist ?? this._pinchStartDist;
      const newScale = this._pinchStartZoom * finalDist / this._pinchStartDist;
      const centroidDoc = this._pinchCentroidDoc;
      const centroidViewport = this._pinchCentroidViewport;

      this.app.ui.canvas.style.transform       = '';
      this.app.ui.canvas.style.transformOrigin = '';
      this._pinchStartDist = null;
      this._pinchStartZoom = null;
      this._lastPinchDist  = null;
      this._pinchCentroidDoc = null;
      this._pinchCentroidViewport = null;

      await this.app.applyZoom(newScale);

      // Correct scroll so the pinch centroid stays at the same viewport position
      if (centroidDoc && centroidViewport) {
        const container = this.app.ui.container;
        const cRect = container.getBoundingClientRect();
        const canvas = this.app.ui.canvas;
        container.scrollLeft = centroidDoc.x * this.app.zoomScale + canvas.offsetLeft
                               - (centroidViewport.x - cRect.left);
        container.scrollTop  = centroidDoc.y * this.app.zoomScale + canvas.offsetTop
                               - (centroidViewport.y - cRect.top);
      }
      return;
    }

    if (!this._drawing) return;
    if (e.pointerId !== this._activeDrawPointerId) return;
    this._drawing             = false;
    this._activeDrawPointerId = null;

    if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }

    const rect = this.app.ui.canvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / this.app.zoomScale;
    const endY = (e.clientY - rect.top)  / this.app.zoomScale;
    const col    = this.app.ui.shapeColor.value;
    const sw     = parseInt(this.app.ui.shapeWidth.value) || 2;
    const opts   = { strokeColor: col, strokeWidth: sw };
    const start  = this._drawStart;
    const pageId = this.app.documentModel.currentPage?.id ?? '';
    let shape: ShapeElement | null = null;

    if (!start || !pageId) { this._drawPoints = []; return; }

    if (this.app.mode === 'drawArrow') {
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement('arrow', x, y, w, h, pageId, {
        ...opts, x1: start.x, y1: start.y, x2: endX, y2: endY
      });

    } else if (this.app.mode === 'drawRect' || this.app.mode === 'drawEllipse') {
      const st = this.app.mode === 'drawRect' ? 'rect' : 'ellipse';
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement(st as 'rect' | 'ellipse', x, y, w, h, pageId, opts);

    } else if (this.app.mode === 'drawHighlight') {
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      const hlEl = new HighlightElement(x, y, w, h, pageId);
      this._drawStart = null;
      this._drawPoints = [];
      this.app.historyManager.execute(new AddElementCmd(this.app.elements, hlEl));
      this.app._autosave();
      this.app.renderElements();
      return;

    } else if (this.app.mode === 'drawFreehand') {
      this._drawPoints.push({ x: endX, y: endY });
      if (this._drawPoints.length < 2) { this._drawStart = null; this._drawPoints = []; return; }
      const xs = this._drawPoints.map(p => p.x);
      const ys = this._drawPoints.map(p => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      shape = new ShapeElement('freehand', x, y, w, h, pageId,
        { ...opts, points: [...this._drawPoints] });

    } else if (this.app.mode === 'drawRedaction') {
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      const w = Math.abs(endX - start.x);
      const h = Math.abs(endY - start.y);
      if (w < 5 && h < 5) { this._drawStart = null; this._drawPoints = []; return; }
      const redEl = new RedactionElement(x, y, w, h, pageId);
      this._drawStart = null;
      this._drawPoints = [];
      this.app.historyManager.execute(new AddElementCmd(this.app.elements, redEl));
      this.app._autosave();
      this.app.renderElements();
      return;
    }

    this._drawStart  = null;
    this._drawPoints = [];

    if (shape) {
      this.app.historyManager.execute(new AddElementCmd(this.app.elements, shape));
      this.app._autosave();
      this.app.renderElements();
    }
  }
  ```

- [ ] **Step 5: Clear centroid fields in `handlePointerCancel`**

  In `js/drawingHandler.ts`, in `handlePointerCancel`, after the existing clear lines (after `this._lastPinchDist = null`), add:
  ```typescript
  this._pinchCentroidDoc = null;
  this._pinchCentroidViewport = null;
  ```

- [ ] **Step 6: Type-check**

  ```bash
  cd /stack/projects/prsnl/pdf && npm run type-check
  ```
  Expected: no errors. If errors appear, they will be in `drawingHandler.ts` due to the return type change from `void` to `Promise<void>`. The document event listener accepts both — TypeScript will accept an async function as an event handler.

- [ ] **Step 7: Browser verification**

  Run `npm run dev`, open on mobile or Chrome DevTools touch simulation.
  1. Load a PDF.
  2. Pinch-zoom at the TOP-LEFT corner of the PDF (centroid far from container center). Check: after releasing, the view should show the top-left area — not jump to the center of the PDF.
  3. Pinch-zoom at the BOTTOM-RIGHT corner. Same check — view stays near bottom-right.
  4. Pinch-zoom at the center. Behavior should be same as before (no regression).
  5. Pinch in, then immediately pinch out from a different corner — no jump each time.
  Expected: the point under the pinch centroid stays at the same screen position before and after releasing fingers.

- [ ] **Step 8: Commit**

  ```bash
  git add js/drawingHandler.ts
  git commit -m "fix: centroid-based pinch zoom — eliminate position jump on finger lift"
  ```

---

## Verification Summary

| Check | Expected |
|---|---|
| Element drag on mobile — single finger | Tracks smoothly, releases cleanly |
| Element drag + second finger touch | Drag cancels cleanly, no stuck state |
| Resize handle on mobile | Tracks without getting stuck |
| Pinch-zoom off-center | Canvas stays anchored at pinch centroid on release |
| `npm run type-check` | No errors |
| Existing tests pass | `npm test` — all tests pass (no logic changed, only pointer handling) |
