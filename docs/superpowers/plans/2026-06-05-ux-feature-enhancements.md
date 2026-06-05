# UX Feature Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Zero Mode Switching" north star across 7 feature areas: tool toggle model (all tools toggle on/off), continuous pen mode (freehand stays armed across strokes), freehand selection highlight (stroke glow instead of bounding box), path eraser tool with geometric stroke splitting, text export position fix, and PDF ghost preview overlay.

**Architecture:** Three layers of change — (1) pure-logic modules that are unit-testable (`js/eraserGeometry.ts`), (2) UI wiring that is browser-verified only (tool toggle, pen mode, Done pill), (3) export pipeline that is both unit-tested and browser-verified (coordinate transform, ghost preview). Test strategy: unit tests for pure geometry and coordinate transforms; explicit browser verification steps for all DOM/pointer/canvas behavior (jsdom cannot exercise these).

**Tech Stack:** TypeScript, Vitest (jsdom), pdf-lib, SVG overlay. Prerequisite: Plan 1 (mobile pointer fixes) MUST be merged first.

---

## File Map

| File | Change |
|---|---|
| `js/pdfEditorApp.ts` | Tool toggle in button handlers; setMode activation toast; 'drawErase' mode type; keyboard shortcut 'F'/'E'; freehand no-auto-select; eraser handler wiring; ghost preview method |
| `js/drawingHandler.ts` | Remove `selectElement` call after freehand stroke commit |
| `js/uiController.ts` | Add `eraserBtn`/`donePill` to UIRefs; update `updateModeButtons` for eraser + Done pill |
| `js/shapeElement.ts` | Skip `createResizeHandle()` for freehand; CSS glow class when freehand selected |
| `js/eraserGeometry.ts` | **CREATE** — pure functions: `segmentsIntersect`, `bboxIntersectsPolyline`, `splitFreehandAtErase` |
| `js/eraserHandler.ts` | **CREATE** — eraser draw/preview/commit (mirrors drawingHandler pattern) |
| `js/historyManager.ts` | Add `SplitStrokeCmd`, `BulkDeleteCmd` commands |
| `tests/eraserGeometry.test.ts` | **CREATE** — TDD unit tests for all geometry functions |
| `index.html` | Add eraser button, Done pill element, ghost preview button; update help text; CSS for Done pill + freehand glow |

---

## Task 1: Tool Toggle Model + Activation Toast

**Files:**
- Modify: `js/pdfEditorApp.ts:104-182` (button event listeners), `:894-900` (setMode), `:304-362` (keyboard handler)
- Modify: `js/uiController.ts:194-220` (updateModeButtons — CSS active state is already wired via `.active` class; no change needed there)

**Context:** Currently every button click directly calls `setMode('drawXxx')`. There is no toggle — clicking an already-active button calls `setMode` again with the same mode. The fix: each button handler checks `this.mode === targetMode` before calling `setMode`; if already active, calls `setMode('select')` instead. The `setMode` method itself gets a toast notification on every non-select mode activation.

- [ ] **Step 1: Add activation toast to `setMode`**

  In `js/pdfEditorApp.ts`, replace `setMode` (lines 894-900):
  ```typescript
  setMode(mode: ToolMode) {
    this.drawingHandler.cancel();
    this.mode = mode;
    this.uiController.updateModeButtons(mode);
    this._formFieldOverlay.setPointerEvents(mode === 'select');
    if (mode === 'addSignature') this.openSignatureModal();

    const toastLabels: Partial<Record<ToolMode, string>> = {
      addText:       'Text tool — click to place. Press Esc to cancel.',
      addSignature:  'Signature — draw then click to place. Press Esc to cancel.',
      addImage:      'Image tool — click to place. Press Esc to cancel.',
      drawArrow:     'Arrow tool — drag to draw. Press Esc to exit.',
      drawRect:      'Rectangle tool — drag to draw. Press Esc to exit.',
      drawEllipse:   'Circle tool — drag to draw. Press Esc to exit.',
      drawFreehand:  'Freehand pen — draw freely. Tap Done or press Esc to exit.',
      drawHighlight: 'Highlight tool — drag to mark. Press Esc to exit.',
      addComment:    'Comment tool — click to place. Press Esc to cancel.',
      drawRedaction: 'Redact tool — drag to black out. Press Esc to exit.',
      drawErase:     'Eraser — swipe to erase elements. Press Esc to exit.',
    };
    const label = toastLabels[mode];
    if (label) this.uiController.showToast(label, 1500);
  }
  ```

  Note: `ToolMode` does not yet include `'drawErase'` — that is added in Task 5. For now, the `toastLabels` entry for `drawErase` is harmless (TypeScript will flag it when the type doesn't include it yet; add it simultaneously in Task 5).

- [ ] **Step 2: Add toggle behavior to shape tool buttons**

  In `js/pdfEditorApp.ts`, in `setupEventListeners()`, replace lines 179-182:
  ```typescript
  this.ui.arrowBtn.addEventListener('click',    () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'drawArrow' ? 'select' : 'drawArrow');
  });
  this.ui.rectBtn.addEventListener('click',     () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'drawRect' ? 'select' : 'drawRect');
  });
  this.ui.circleBtn.addEventListener('click',   () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'drawEllipse' ? 'select' : 'drawEllipse');
  });
  this.ui.freehandBtn.addEventListener('click', () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'drawFreehand' ? 'select' : 'drawFreehand');
  });
  ```

- [ ] **Step 3: Add toggle behavior to other tool buttons**

  In `js/pdfEditorApp.ts`, in `setupEventListeners()`, replace lines 104-115:
  ```typescript
  this.ui.addTextBtn.addEventListener('click', () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'addText' ? 'select' : 'addText');
  });
  this.ui.addSignatureBtn.addEventListener('click', () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'addSignature' ? 'select' : 'addSignature');
  });
  this.ui.addImageBtn.addEventListener('click', () => {
    if (!this.documentModel.pageCount) return;
    if (this.mode === 'addImage') { this.setMode('select'); return; }
    this.ui.addImageInput.click();
  });
  this.ui.highlightBtn.addEventListener('click', () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'drawHighlight' ? 'select' : 'drawHighlight');
  });
  this.ui.commentBtn.addEventListener('click', () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'addComment' ? 'select' : 'addComment');
  });
  this.ui.redactBtn.addEventListener('click', () => {
    if (!this.documentModel.pageCount) return;
    this.setMode(this.mode === 'drawRedaction' ? 'select' : 'drawRedaction');
  });
  ```

- [ ] **Step 4: Update keyboard shortcuts to use toggle logic and add F key for freehand**

  In `js/pdfEditorApp.ts`, update the keyboard switch block (lines 334-341). Replace those cases:
  ```typescript
  case 't': case 'T':
    if (this.documentModel.pageCount) this.setMode(this.mode === 'addText' ? 'select' : 'addText');
    break;
  case 's': case 'S':
    if (this.documentModel.pageCount) this.setMode(this.mode === 'addSignature' ? 'select' : 'addSignature');
    break;
  case 'a': case 'A':
    if (this.documentModel.pageCount) this.setMode(this.mode === 'drawArrow' ? 'select' : 'drawArrow');
    break;
  case 'r': case 'R':
    if (this.documentModel.pageCount) this.setMode(this.mode === 'drawRect' ? 'select' : 'drawRect');
    break;
  case 'c': case 'C':
    if (this.documentModel.pageCount) this.setMode(this.mode === 'drawEllipse' ? 'select' : 'drawEllipse');
    break;
  case 'd': case 'D':
  case 'f': case 'F':
    if (this.documentModel.pageCount) this.setMode(this.mode === 'drawFreehand' ? 'select' : 'drawFreehand');
    break;
  case 'h': case 'H':
    if (this.documentModel.pageCount) this.setMode(this.mode === 'drawHighlight' ? 'select' : 'drawHighlight');
    break;
  ```

  Note: the `'i'`/`'I'` case stays as-is (file input click, no toggle needed). Esc already calls `setMode('select')` at line 309.

- [ ] **Step 5: Run type-check**

  ```bash
  cd /stack/projects/prsnl/pdf && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 6: Browser verification**

  Run `npm run dev`, load a PDF.
  1. Click the Arrow button → button highlighted, toast "Arrow tool — drag to draw. Press Esc to exit." visible for ~1.5s, mode badge shows `→ ARROW`.
  2. Click the Arrow button again → button un-highlighted, mode badge shows `SELECT`, no toast.
  3. Click Freehand → highlighted. Click Freehand again → back to select mode.
  4. Press `Esc` while Freehand is active → back to select mode.
  5. Click Text, then click Arrow without pressing Esc — Text button un-highlights, Arrow button highlights (one active at a time).
  6. Press `F` key → Freehand activates. Press `F` again → deactivates.
  Expected: all tools toggle cleanly, Esc always deactivates, toast fires on activation, no toast on deactivation.

- [ ] **Step 7: Commit**

  ```bash
  git add js/pdfEditorApp.ts
  git commit -m "feat: tool toggle model — all tools toggle on/off + activation toast (1.5s)"
  ```

---

## Task 2: Continuous Pen Mode + Done Pill

**Files:**
- Modify: `js/drawingHandler.ts:164-173` (freehand pointer-up — remove auto-select)
- Modify: `js/uiController.ts:6-81` (UIRefs — add `donePill`), `:194-220` (updateModeButtons — show/hide pill)
- Modify: `index.html:~817` (add Done pill element), `<style>` section (Done pill CSS)
- Modify: `js/pdfEditorApp.ts` (wire Done pill click → setMode('select'))

**Context:** After committing a freehand stroke in `drawingHandler.ts::handlePointerUp`, the code currently calls `this.app.renderElements()` which triggers `selectElement` on the new element. The fix: don't select the element after stroke commit in freehand mode — just render. The tool stays in `drawFreehand` mode, ready for the next stroke.

- [ ] **Step 1: Remove auto-select after freehand stroke in `drawingHandler.ts`**

  In `js/drawingHandler.ts`, in `handlePointerUp`, find the freehand branch (around line 164-173). The current code creates a `ShapeElement` and then calls:
  ```typescript
  this.app.historyManager.execute(new AddElementCmd(this.app.elements, shape));
  this.app._autosave();
  this.app.renderElements();
  ```

  The issue: `renderElements()` calls `selectElement(null)` internally (it de-selects but doesn't select the new element). Actually, the auto-select comes from some other code path. Check `renderElements()` to confirm.

  Looking at the existing flow: after `AddElementCmd.execute()`, the new element is in `app.elements`. `renderElements()` re-renders all elements. No `selectElement(new element)` is called.

  The REAL auto-select problem is: after drawing, the mode stays as `drawFreehand`, but any subsequent tap on the canvas (in `handlePointerDown`) will try to start a new stroke — however the user might actually tap an existing element, which triggers `interactionHandler.handlePointerDown`. The perception of "auto-select" is that the bounding box of the freehand element appears immediately after drawing.

  The bounding box appears because `ShapeElement.render()` appends `createControls()` and `createResizeHandle()` to every element, including freehand. When any element is on the canvas, it gets the bounding-box div wrapper.

  The fix is in Task 3 (remove bounding box/resize for freehand). However, for the "next stroke starts immediately" behavior, we need to ensure that after a freehand stroke is committed in freehand mode, `selectedElement` is cleared:

  In `js/pdfEditorApp.ts`, in `handlePointerDown` on canvas (or in drawingHandler after shape creation), ensure `app.selectedElement = null` after freehand stroke commit. Add this after `this.app.renderElements()` in the freehand branch of `drawingHandler.ts::handlePointerUp`:
  ```typescript
  if (shape) {
    this.app.historyManager.execute(new AddElementCmd(this.app.elements, shape));
    this.app._autosave();
    // In freehand mode: don't select the new stroke — keep tool armed for next stroke
    if (this.app.mode === 'drawFreehand') {
      this.app.selectedElement = null;
    }
    this.app.renderElements();
  }
  ```

- [ ] **Step 2: Add Done pill HTML element and CSS**

  In `index.html`, just before `<div id="toast"></div>` (line ~817):
  ```html
  <button id="donePill" class="done-pill" style="display:none">✓ Done drawing</button>
  ```

  In the `<style>` section of `index.html`, add CSS for the Done pill (find a logical place near the `#toast` rules):
  ```css
  .done-pill {
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 900;
    background: #fff;
    color: #1d4ed8;
    border: 1.5px solid #1d4ed8;
    border-radius: 999px;
    padding: 10px 24px;
    font-size: 15px;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .done-pill:active { background: #eff6ff; }
  ```

- [ ] **Step 3: Add `donePill` to `UIRefs` in `uiController.ts`**

  In `js/uiController.ts`, in the `UIRefs` interface (after line 80, before `}`), add:
  ```typescript
  donePill: HTMLButtonElement;
  ```

  In the `UIController` constructor (after `exportPageBtn` assignment), add:
  ```typescript
  donePill: document.getElementById('donePill') as HTMLButtonElement,
  ```

- [ ] **Step 4: Show/hide Done pill in `updateModeButtons`**

  In `js/uiController.ts`, in `updateModeButtons`, after the `r.canvas.className = ...` line, add:
  ```typescript
  r.donePill.style.display = mode === 'drawFreehand' ? '' : 'none';
  ```

- [ ] **Step 5: Wire Done pill click in `pdfEditorApp.ts`**

  In `js/pdfEditorApp.ts`, in `setupEventListeners()`, after the freehandBtn listener, add:
  ```typescript
  this.ui.donePill.addEventListener('click', () => this.setMode('select'));
  ```

- [ ] **Step 6: Run type-check**

  ```bash
  cd /stack/projects/prsnl/pdf && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 7: Browser verification**

  Run `npm run dev`, load a PDF.
  1. Click Freehand → Done pill appears at bottom-center.
  2. Draw a stroke → stroke renders, tool remains in freehand mode (button still highlighted, done pill still visible).
  3. Draw a second stroke immediately → starts a new stroke without touching anything else. Pen is truly continuous.
  4. Tap Done pill → mode returns to Select, pill disappears, button un-highlights.
  5. Press Esc while in freehand → same result as Done pill.
  6. In select mode, click a completed freehand stroke → element selects (bounding box — this is Task 3's area).

- [ ] **Step 8: Commit**

  ```bash
  git add js/drawingHandler.ts js/uiController.ts js/pdfEditorApp.ts index.html
  git commit -m "feat: continuous pen mode — freehand stays armed across strokes + Done pill exit"
  ```

---

## Task 3: Freehand Selection Highlight (No Bounding Box)

**Files:**
- Modify: `js/shapeElement.ts:32-61` (render method — skip resize handle for freehand)
- Modify: `index.html` `<style>` section — add freehand glow CSS

**Context:** When a freehand element is selected (in select mode), it currently shows a bounding-box div with resize and delete handles — same as all other elements. The design calls for: no resize handle (freehand strokes can't be meaningfully resized via corner handles), and a glow/highlight effect on the stroke instead of the box border. The delete handle stays (via `createControls()`).

- [ ] **Step 1: Skip `createResizeHandle()` for freehand strokes in `shapeElement.ts`**

  In `js/shapeElement.ts`, replace the `render` method (lines 32-61):
  ```typescript
  render(_container: HTMLElement, canvasOffset: { left: number; top: number }, scale = 1): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'pdf-element shape-element';
    if (this.shapeType === 'freehand') div.classList.add('freehand-element');
    div.dataset.id = String(this.id);
    this.applyStyles(div, canvasOffset, scale);

    const w = Math.max(1, this.width * scale);
    const h = Math.max(1, this.height * scale);
    const sw = this.strokeWidth * scale;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.overflow = 'visible';
    svg.style.position = 'absolute';
    svg.style.top = '0'; svg.style.left = '0';
    svg.style.pointerEvents = 'none';

    switch (this.shapeType) {
      case 'rect':     this._renderRect(svg, w, h, sw);     break;
      case 'ellipse':  this._renderEllipse(svg, w, h, sw);  break;
      case 'arrow':    this._renderArrow(svg, scale, sw);   break;
      case 'freehand': this._renderFreehand(svg, scale, sw); break;
    }

    div.appendChild(svg);
    div.appendChild(this.createControls());
    if (this.shapeType !== 'freehand') div.appendChild(this.createResizeHandle());
    return div;
  }
  ```

- [ ] **Step 2: Add glow CSS for selected freehand elements**

  In `index.html` `<style>` section, add after the existing `.pdf-element.selected` rules (find them with the selector `.selected`):
  ```css
  .freehand-element.selected {
    outline: none !important;
    box-shadow: none !important;
    filter: drop-shadow(0 0 4px #2563eb) drop-shadow(0 0 2px #2563eb);
  }
  ```

  This applies a blue glow to the SVG contents of the freehand element when selected, without showing the box border.

- [ ] **Step 3: Run type-check**

  ```bash
  cd /stack/projects/prsnl/pdf && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 4: Browser verification**

  Run `npm run dev`, load a PDF.
  1. Draw a freehand stroke.
  2. Press Esc to exit freehand mode (returns to select).
  3. Click the stroke → stroke gets a blue glow outline, NO resize handle appears at the corner.
  4. Drag the stroke → moves correctly.
  5. Press Delete → stroke is removed.
  6. Draw a Rectangle → click it in select mode → resize handle appears (freehand change did not affect other shapes).

- [ ] **Step 5: Commit**

  ```bash
  git add js/shapeElement.ts index.html
  git commit -m "feat: freehand selection — stroke glow instead of bounding box, no resize handle"
  ```

---

## Task 4: Eraser Geometry Module (TDD — Unit Tests First)

**Files:**
- Create: `js/eraserGeometry.ts` — pure functions, no DOM
- Create: `tests/eraserGeometry.test.ts` — unit tests (Vitest)

**Context:** The eraser needs three pure geometric operations:
1. `segmentsIntersect(a1, a2, b1, b2)` — does segment A cross segment B? Returns `{intersects: bool, point?: {x,y}}`.
2. `bboxIntersectsPolyline(bbox, polyline)` — does the eraser stroke's bounding box overlap any segment of `polyline`? Used for deleting non-freehand elements.
3. `splitFreehandAtErase(strokePoints, erasePoints)` — partition a freehand stroke's point array into surviving sub-strokes after the erase stroke crosses it.

These are pure math — testable in jsdom without any DOM setup.

- [ ] **Step 1: Write failing tests for `segmentsIntersect`**

  Create `tests/eraserGeometry.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import {
    segmentsIntersect,
    bboxIntersectsPolyline,
    splitFreehandAtErase,
  } from '../js/eraserGeometry';

  describe('segmentsIntersect', () => {
    it('detects a simple crossing', () => {
      // Horizontal and vertical lines crossing at (5,5)
      const r = segmentsIntersect({x:0,y:5},{x:10,y:5}, {x:5,y:0},{x:5,y:10});
      expect(r.intersects).toBe(true);
      expect(r.point!.x).toBeCloseTo(5);
      expect(r.point!.y).toBeCloseTo(5);
    });

    it('returns false for parallel segments', () => {
      const r = segmentsIntersect({x:0,y:0},{x:10,y:0}, {x:0,y:5},{x:10,y:5});
      expect(r.intersects).toBe(false);
    });

    it('returns false when segments are collinear but non-overlapping', () => {
      const r = segmentsIntersect({x:0,y:0},{x:3,y:0}, {x:5,y:0},{x:10,y:0});
      expect(r.intersects).toBe(false);
    });

    it('returns false when segments cross on extensions but not within bounds', () => {
      // T-shape: segments would cross if extended, but endpoints don't overlap
      const r = segmentsIntersect({x:0,y:0},{x:2,y:0}, {x:5,y:-1},{x:5,y:1});
      expect(r.intersects).toBe(false);
    });
  });

  describe('bboxIntersectsPolyline', () => {
    const polyline = [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]; // square path

    it('detects overlap when polyline passes through bbox', () => {
      // bbox covers the middle of the top edge of the polyline
      const result = bboxIntersectsPolyline({x:4,y:-2,w:4,h:4}, polyline);
      expect(result).toBe(true);
    });

    it('returns false when bbox is entirely outside', () => {
      const result = bboxIntersectsPolyline({x:20,y:20,w:5,h:5}, polyline);
      expect(result).toBe(false);
    });
  });

  describe('splitFreehandAtErase', () => {
    it('returns original stroke when erase does not cross it', () => {
      const stroke = [{x:0,y:0},{x:10,y:0},{x:20,y:0}];
      const erase  = [{x:0,y:10},{x:20,y:10}]; // parallel, does not cross
      const result = splitFreehandAtErase(stroke, erase);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(3);
    });

    it('splits stroke at one crossing into two sub-strokes', () => {
      // Horizontal stroke from x=0 to x=20 at y=0
      // Vertical erase from y=-5 to y=5 at x=10 — crosses at (10,0)
      const stroke = [{x:0,y:0},{x:10,y:0},{x:20,y:0}];
      const erase  = [{x:10,y:-5},{x:10,y:5}];
      const result = splitFreehandAtErase(stroke, erase);
      // Two sub-strokes: [0,0]→[10,0] and [10,0]→[20,0]
      expect(result).toHaveLength(2);
      // Each sub-stroke has at least 2 points
      expect(result[0].length).toBeGreaterThanOrEqual(2);
      expect(result[1].length).toBeGreaterThanOrEqual(2);
    });

    it('deletes a segment fully enclosed between two crossings', () => {
      // Stroke: (0,0)→(30,0) horizontal
      // Erase: zigzag that crosses at x=5 and x=25
      // Expected: two surviving stubs, middle section deleted
      const stroke = Array.from({length:31}, (_,i) => ({x:i, y:0}));
      const erase = [{x:5,y:-5},{x:5,y:5},{x:25,y:5},{x:25,y:-5}];
      // erase polygon crosses the stroke at x=5 (going down) and x=25 (going up)
      const result = splitFreehandAtErase(stroke, erase);
      // Should have 2 surviving segments: left (0..5) and right (25..30)
      expect(result.length).toBeGreaterThanOrEqual(1);
      // The surviving point x-values should not include the range 6..24
      const allX = result.flatMap(s => s.map(p => p.x));
      const hasMiddle = allX.some(x => x > 5.5 && x < 24.5);
      expect(hasMiddle).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run tests — verify they all FAIL**

  ```bash
  cd /stack/projects/prsnl/pdf && npm test -- tests/eraserGeometry.test.ts
  ```
  Expected: `Cannot find module '../js/eraserGeometry'` or similar — the module doesn't exist yet.

- [ ] **Step 3: Implement `js/eraserGeometry.ts`**

  Create `js/eraserGeometry.ts`:
  ```typescript
  export type Point = { x: number; y: number };
  export type Bbox  = { x: number; y: number; w: number; h: number };

  export function segmentsIntersect(
    a1: Point, a2: Point,
    b1: Point, b2: Point,
  ): { intersects: boolean; point?: Point } {
    const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
    const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-10) return { intersects: false }; // parallel

    const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
    const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        intersects: true,
        point: { x: a1.x + t * dx1, y: a1.y + t * dy1 },
      };
    }
    return { intersects: false };
  }

  export function bboxIntersectsPolyline(bbox: Bbox, polyline: Point[]): boolean {
    if (polyline.length < 2) return false;
    const { x, y, w, h } = bbox;
    // Four edges of the bbox
    const edges: [Point, Point][] = [
      [{x, y},     {x: x+w, y}    ],
      [{x: x+w, y},{x: x+w, y: y+h}],
      [{x: x+w, y: y+h},{x, y: y+h}],
      [{x, y: y+h},{x, y}          ],
    ];
    for (let i = 0; i < polyline.length - 1; i++) {
      for (const [e1, e2] of edges) {
        if (segmentsIntersect(polyline[i], polyline[i+1], e1, e2).intersects) return true;
      }
    }
    // Also check if any polyline point is fully inside the bbox
    return polyline.some(p => p.x >= x && p.x <= x+w && p.y >= y && p.y <= y+h);
  }

  export function splitFreehandAtErase(
    strokePoints: Point[],
    erasePoints:  Point[],
  ): Point[][] {
    if (strokePoints.length < 2 || erasePoints.length < 2) return [strokePoints];

    // Find all intersection t-values along the stroke
    type Crossing = { tStroke: number; point: Point };
    const crossings: Crossing[] = [];

    for (let i = 0; i < strokePoints.length - 1; i++) {
      const a1 = strokePoints[i], a2 = strokePoints[i + 1];
      for (let j = 0; j < erasePoints.length - 1; j++) {
        const b1 = erasePoints[j], b2 = erasePoints[j + 1];
        const r = segmentsIntersect(a1, a2, b1, b2);
        if (r.intersects && r.point) {
          // t-value along the full stroke (0 = start of segment i, normalized to overall index)
          crossings.push({ tStroke: i + 0 /* segment start index */, point: r.point });
        }
      }
    }

    if (crossings.length === 0) return [strokePoints];

    // Insert intersection points into the stroke and mark crossing indices
    const augmented: Array<Point & { isCrossing?: boolean }> = [];
    const crossingSet = new Set<number>();

    let ci = 0;
    const sorted = crossings.slice().sort((a, b) => a.tStroke - b.tStroke);
    // Build augmented array: original points + inserted crossing points
    for (let i = 0; i < strokePoints.length - 1; i++) {
      augmented.push(strokePoints[i]);
      while (ci < sorted.length && Math.floor(sorted[ci].tStroke) === i) {
        const idx = augmented.length;
        augmented.push({ ...sorted[ci].point, isCrossing: true });
        crossingSet.add(idx);
        ci++;
      }
    }
    augmented.push(strokePoints[strokePoints.length - 1]);

    // Partition augmented array at crossing points
    const segments: Point[][] = [];
    let current: Point[] = [];
    for (let k = 0; k < augmented.length; k++) {
      current.push({ x: augmented[k].x, y: augmented[k].y });
      if (crossingSet.has(k) && k > 0) {
        if (current.length >= 2) segments.push(current);
        current = [{ x: augmented[k].x, y: augmented[k].y }];
      }
    }
    if (current.length >= 2) segments.push(current);

    // Discard segments whose midpoint falls inside the erase stroke bounding box
    if (segments.length <= 1) return segments;
    const eraseBbox = _polylineBbox(erasePoints);
    const surviving = segments.filter(seg => {
      const mid = seg[Math.floor(seg.length / 2)];
      return !_pointInBbox(mid, eraseBbox);
    });

    return surviving.length > 0 ? surviving : [strokePoints];
  }

  function _polylineBbox(pts: Point[]): Bbox {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  function _pointInBbox(p: Point, bb: Bbox): boolean {
    return p.x >= bb.x && p.x <= bb.x + bb.w && p.y >= bb.y && p.y <= bb.y + bb.h;
  }
  ```

- [ ] **Step 4: Run tests — verify they all PASS**

  ```bash
  cd /stack/projects/prsnl/pdf && npm test -- tests/eraserGeometry.test.ts
  ```
  Expected output:
  ```
  ✓ tests/eraserGeometry.test.ts (9)
    ✓ segmentsIntersect (4)
    ✓ bboxIntersectsPolyline (2)
    ✓ splitFreehandAtErase (3)
  Test Files  1 passed (1)
  Tests  9 passed (9)
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add js/eraserGeometry.ts tests/eraserGeometry.test.ts
  git commit -m "feat: eraser geometry module — segmentsIntersect, bboxIntersectsPolyline, splitFreehandAtErase (TDD)"
  ```

---

## Task 5: Eraser Tool — History Commands + Handler + UI

**Files:**
- Modify: `js/historyManager.ts` — add `BulkDeleteCmd`, `SplitStrokeCmd`
- Create: `js/eraserHandler.ts` — eraser draw/preview/apply
- Modify: `js/pdfEditorApp.ts` — add `'drawErase'` to `ToolMode`; wire eraser button + handler; add `eraserBtn` to UIRefs
- Modify: `js/uiController.ts` — add `eraserBtn` to UIRefs; `updateModeButtons` eraser case
- Modify: `index.html` — add eraser button in toolbar; disable in `enableUI()`

- [ ] **Step 1: Add `BulkDeleteCmd` and `SplitStrokeCmd` to `historyManager.ts`**

  In `js/historyManager.ts`, after the existing commands (find the end of the file or after `DeletePageCmd`), add:
  ```typescript
  export class BulkDeleteCmd {
    private _deleted: PDFElement[];
    constructor(private arr: PDFElement[], private elements: PDFElement[]) {
      this._deleted = [...elements];
    }
    execute(): void {
      this._deleted.forEach(el => {
        const i = this.arr.indexOf(el);
        if (i !== -1) this.arr.splice(i, 1);
      });
    }
    undo(): void {
      this.arr.push(...this._deleted);
    }
  }
  ```

  Note: `SplitStrokeCmd` encapsulates removing one freehand stroke and adding N replacement strokes:
  ```typescript
  export class SplitStrokeCmd {
    constructor(
      private arr: PDFElement[],
      private original: PDFElement,
      private replacements: PDFElement[],
    ) {}
    execute(): void {
      const i = this.arr.indexOf(this.original);
      if (i !== -1) this.arr.splice(i, 1, ...this.replacements);
    }
    undo(): void {
      const i = this.arr.indexOf(this.replacements[0]);
      if (i !== -1) this.arr.splice(i, this.replacements.length, this.original);
    }
  }
  ```

  Also add the `PDFElement` import at the top of `historyManager.ts` if not already present (check the import list).

- [ ] **Step 2: Create `js/eraserHandler.ts`**

  ```typescript
  import type { PDFEditorApp } from './pdfEditorApp';
  import type { PDFElement } from './pdfElement';
  import { ShapeElement } from './shapeElement';
  import { BulkDeleteCmd, SplitStrokeCmd } from './historyManager';
  import { bboxIntersectsPolyline, splitFreehandAtErase } from './eraserGeometry';
  import type { Point } from './eraserGeometry';

  export class EraserHandler {
    private _drawing = false;
    private _points: Point[] = [];
    private _previewSvg: SVGSVGElement | null = null;
    private _activePointerId: number | null = null;

    constructor(private app: PDFEditorApp) {}

    cancel(): void {
      if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }
      this._drawing = false;
      this._points = [];
      this._activePointerId = null;
    }

    handlePointerDown(e: PointerEvent): void {
      if (this.app.mode !== 'drawErase') return;
      if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }

      const rect = this.app.ui.canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top  || e.clientY > rect.bottom) return;

      const x = (e.clientX - rect.left) / this.app.zoomScale;
      const y = (e.clientY - rect.top)  / this.app.zoomScale;
      this._drawing = true;
      this._activePointerId = e.pointerId;
      this._points = [{ x, y }];

      this._previewSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this._previewSvg.id = 'eraserPreview';
      Object.assign(this._previewSvg.style, {
        position: 'absolute', top: '0', left: '0',
        width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'visible', zIndex: '11'
      });
      this.app.ui.container.appendChild(this._previewSvg);
      e.preventDefault();
    }

    handlePointerMove(e: PointerEvent): void {
      if (!this._drawing || e.pointerId !== this._activePointerId) return;
      const rect = this.app.ui.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / this.app.zoomScale;
      const y = (e.clientY - rect.top)  / this.app.zoomScale;
      const last = this._points[this._points.length - 1];
      if (Math.hypot(x - last.x, y - last.y) > 3 / this.app.zoomScale) {
        this._points.push({ x, y });
      }
      this._updatePreview();
    }

    handlePointerUp(e: PointerEvent): void {
      if (!this._drawing || e.pointerId !== this._activePointerId) return;
      this._drawing = false;
      this._activePointerId = null;
      if (this._previewSvg) { this._previewSvg.remove(); this._previewSvg = null; }

      if (this._points.length < 2) { this._points = []; return; }

      const erasePoints = this._points;
      this._points = [];
      this._applyErase(erasePoints);
    }

    private _applyErase(erasePoints: Point[]): void {
      const pageId = this.app.documentModel.currentPage?.id;
      if (!pageId) return;

      const pageElements = this.app.elements.filter(el => el.pageId === pageId);
      const eraseBbox = this._polylineBbox(erasePoints);

      const toDelete: PDFElement[] = [];
      const splits: Array<{ original: ShapeElement; replacements: ShapeElement[] }> = [];

      for (const el of pageElements) {
        if ((el as ShapeElement).shapeType === 'freehand') {
          const s = el as ShapeElement;
          if (s.points.length < 2) { toDelete.push(el); continue; }

          const surviving = splitFreehandAtErase(s.points, erasePoints);
          if (surviving.length === 0) {
            toDelete.push(el);
          } else if (surviving.length === 1 && surviving[0].length === s.points.length) {
            // unchanged
          } else {
            const pageId2 = el.pageId;
            const opts = { strokeColor: s.strokeColor, strokeWidth: s.strokeWidth };
            const replacements = surviving.map(pts => {
              const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
              const x = Math.min(...xs), y = Math.min(...ys);
              const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
              return new ShapeElement('freehand', x, y, Math.max(1, w), Math.max(1, h), pageId2, { ...opts, points: pts });
            });
            splits.push({ original: s, replacements });
          }
        } else {
          // For non-freehand elements, delete if erase stroke intersects their bounding box
          const elBbox = { x: el.x, y: el.y, w: el.width, h: el.height };
          const elOutline: Point[] = [
            {x: elBbox.x,            y: elBbox.y},
            {x: elBbox.x + elBbox.w, y: elBbox.y},
            {x: elBbox.x + elBbox.w, y: elBbox.y + elBbox.h},
            {x: elBbox.x,            y: elBbox.y + elBbox.h},
            {x: elBbox.x,            y: elBbox.y},
          ];
          // Quick bbox-vs-bbox check first
          if (eraseBbox.x < elBbox.x + elBbox.w && eraseBbox.x + eraseBbox.w > elBbox.x &&
              eraseBbox.y < elBbox.y + elBbox.h && eraseBbox.y + eraseBbox.h > elBbox.y) {
            if (bboxIntersectsPolyline(elBbox, erasePoints)) {
              toDelete.push(el);
            }
          }
        }
      }

      if (toDelete.length === 0 && splits.length === 0) return;

      // Apply all deletions as one undoable command, then splits as individual commands
      if (toDelete.length > 0) {
        this.app.historyManager.execute(new BulkDeleteCmd(this.app.elements, toDelete));
      }
      for (const { original, replacements } of splits) {
        this.app.historyManager.execute(new SplitStrokeCmd(this.app.elements, original, replacements));
      }

      this.app._autosave();
      this.app.renderElements();
    }

    private _updatePreview(): void {
      if (!this._previewSvg || this._points.length < 2) return;
      while (this._previewSvg.firstChild) this._previewSvg.firstChild.remove();

      const s = this.app.zoomScale;
      const ox = this.app.ui.canvas.offsetLeft;
      const oy = this.app.ui.canvas.offsetTop;
      const pts = this._points.map(p => `${p.x * s + ox},${p.y * s + oy}`).join(' ');

      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('points', pts);
      pl.setAttribute('fill', 'none');
      pl.setAttribute('stroke', 'rgba(220,38,38,0.7)');
      pl.setAttribute('stroke-width', String(10 * s));
      pl.setAttribute('stroke-linecap', 'round');
      pl.setAttribute('stroke-linejoin', 'round');
      pl.setAttribute('stroke-dasharray', `${6 * s},${3 * s}`);
      this._previewSvg.appendChild(pl);
    }

    private _polylineBbox(pts: Point[]): { x: number; y: number; w: number; h: number } {
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
  }
  ```

- [ ] **Step 3: Add `'drawErase'` to `ToolMode` in `pdfEditorApp.ts`**

  In `js/pdfEditorApp.ts`, line 27, replace the `ToolMode` type:
  ```typescript
  export type ToolMode = 'select' | 'addText' | 'addSignature' | 'addImage' | 'drawArrow' | 'drawRect' | 'drawEllipse' | 'drawFreehand' | 'drawHighlight' | 'addComment' | 'drawRedaction' | 'drawErase';
  ```

- [ ] **Step 4: Add `eraserHandler` field and wire it in `pdfEditorApp.ts`**

  In `js/pdfEditorApp.ts`:

  1. Add import at top (after DrawingHandler import):
     ```typescript
     import { EraserHandler } from './eraserHandler';
     ```

  2. Add field declaration (after `drawingHandler` field):
     ```typescript
     eraserHandler!: EraserHandler;
     ```

  3. In constructor (after `this.drawingHandler = new DrawingHandler(this);`):
     ```typescript
     this.eraserHandler = new EraserHandler(this);
     ```

  4. In `setupEventListeners()`, add eraser handler calls alongside the existing document-level pointer listeners (lines 160-171):
     ```typescript
     document.addEventListener('pointermove', (e) => {
       this.interactionHandler.handlePointerMove(e);
       this.drawingHandler.handlePointerMove(e);
       this.eraserHandler.handlePointerMove(e);
     });
     document.addEventListener('pointerup', (e) => {
       this.interactionHandler.handlePointerUp(e);
       this.drawingHandler.handlePointerUp(e);
       this.eraserHandler.handlePointerUp(e);
     });
     document.addEventListener('pointercancel', (e) => {
       this.interactionHandler.handlePointerCancel(e);
       this.drawingHandler.handlePointerCancel(e);
       this.eraserHandler.cancel();
     });
     ```

  5. Add canvas pointerdown for eraser (after the existing `this.ui.canvas.addEventListener('pointerdown', ...)` line):
     ```typescript
     this.ui.canvas.addEventListener('pointerdown', (e) => this.eraserHandler.handlePointerDown(e));
     ```

  6. Wire eraser button click in `setupEventListeners()` (after freehandBtn listener):
     ```typescript
     this.ui.eraserBtn.addEventListener('click', () => {
       if (!this.documentModel.pageCount) return;
       this.setMode(this.mode === 'drawErase' ? 'select' : 'drawErase');
     });
     ```

  7. In `setMode`, also cancel the eraser handler:
     ```typescript
     setMode(mode: ToolMode) {
       this.drawingHandler.cancel();
       this.eraserHandler.cancel();
       // ... rest unchanged
     ```

- [ ] **Step 5: Add `eraserBtn` to `UIRefs` in `uiController.ts`**

  In `js/uiController.ts`, in `UIRefs` interface (after `exportPageBtn`), add:
  ```typescript
  eraserBtn: HTMLButtonElement;
  ```

  In the constructor (after `exportPageBtn` assignment), add:
  ```typescript
  eraserBtn: document.getElementById('eraserBtn') as HTMLButtonElement,
  ```

  In `enableUI()`, add:
  ```typescript
  r.eraserBtn.disabled = false;
  ```

  In `updateModeButtons()`, add:
  ```typescript
  r.eraserBtn.classList.toggle('active', mode === 'drawErase');
  ```

  In the `badges` map:
  ```typescript
  drawErase: '⌫ ERASE',
  ```

- [ ] **Step 6: Add eraser button to `index.html`**

  In `index.html`, in the shapes toolbar group (after the `freehandBtn` line):
  ```html
  <button id="eraserBtn" class="btn btn-icon" disabled title="Eraser — swipe to erase (E)">⌫</button>
  ```

  Also add keyboard shortcut 'E' in `pdfEditorApp.ts` keyboard handler:
  ```typescript
  case 'e': case 'E':
    if (this.documentModel.pageCount) this.setMode(this.mode === 'drawErase' ? 'select' : 'drawErase');
    break;
  ```

- [ ] **Step 7: Run type-check**

  ```bash
  cd /stack/projects/prsnl/pdf && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 8: Run full test suite**

  ```bash
  cd /stack/projects/prsnl/pdf && npm test
  ```
  Expected: all tests pass (including `eraserGeometry.test.ts`).

- [ ] **Step 9: Browser verification**

  Run `npm run dev`, load a PDF with several annotations (text, shapes, freehand strokes).
  1. Click the Eraser button (⌫) → button highlights, toast "Eraser — swipe to erase elements. Press Esc to exit."
  2. Swipe across a text element → dashed red preview stroke appears; on finger lift, text element is deleted.
  3. Undo (Ctrl+Z) → text element reappears.
  4. Swipe across a freehand stroke → stroke is split at the crossing; parts before and after the erase remain as separate strokes.
  5. Swipe across a rectangle → rectangle is deleted.
  6. Press Esc → returns to select mode, eraser button un-highlights.

- [ ] **Step 10: Commit**

  ```bash
  git add js/eraserHandler.ts js/historyManager.ts js/pdfEditorApp.ts js/uiController.ts index.html
  git commit -m "feat: path eraser tool — swipe to erase/split elements, fully undoable"
  ```

---

## Task 6: Text Export Position Diagnostic

**Files:** No code changes — this is a measurement task.

**Context:** Text placed on the canvas is slightly misplaced in the exported PDF. The root cause has two candidates: (A) PDF uses text-baseline origin while screen uses top-left origin → constant offset per font size, (B) the `zoomScale` was not fully de-scaled in the transform → offset scales with zoom. We need to measure before fixing.

- [ ] **Step 1: Perform the measurement**

  Run `npm run dev`, load any PDF.
  1. Set zoom to exactly 100% (click fit or type 100 in zoom display).
  2. Place a text annotation reading "X" at a visually identifiable position (e.g., the top-left corner of the PDF, offset 50px from each edge).
  3. Note the pixel position of the text's top-left corner in the canvas (`x_screen=50, y_screen=50` at zoom 1.0).
  4. Export the PDF (Download button).
  5. Open the exported PDF in a PDF viewer (Firefox, Acrobat, or Preview).
  6. Measure the text position in the PDF. The PDF canvas dimensions are shown in the browser (`renderer.canvas.width/height` divided by `zoomScale` = natural PDF points).
  7. Compare measured PDF position vs. expected position (`x_expected = 50 pt, y_expected = height - 50 pt` since PDF uses bottom-left origin).
  8. Repeat at zoom 200%. If the offset in PDF coordinates is the same absolute value → baseline mismatch (A). If the offset is doubled → de-scaling error (B).

- [ ] **Step 2: Record the measurement result**

  Write the result as a comment in `js/pdfEditorApp.ts` just above `_drawElementOnPage` (line 1484):
  ```typescript
  // TEXT EXPORT MEASUREMENT: (fill in after running diagnostic)
  // Offset at zoom 1.0: dx=_, dy=_  (PDF points)
  // Offset at zoom 2.0: dx=_, dy=_  (PDF points)
  // Root cause: A (baseline mismatch) | B (de-scaling error)
  ```

  Then proceed to Task 7 with the measured values.

---

## Task 7: Text Export Position Fix

**Files:**
- Modify: `js/pdfEditorApp.ts:1492-1502` (`_drawElementOnPage`, text branch)

**This task has two branches depending on the Task 6 measurement result.**

### Branch A: Baseline mismatch (constant offset)

The fix: subtract `fontSize` from the `te.y` coordinate in the export path so the top-left screen position maps to the baseline PDF position.

In `_drawElementOnPage`, replace line ~1500:
```typescript
const anchor = tp(te.x, te.y + te.fontSize + i * lineHeight);
```

Change to:
```typescript
const anchor = tp(te.x, te.y + te.fontSize * 0.85 + i * lineHeight);
```

`0.85` is the typical ascender ratio (baseline ≈ 85% of fontSize from top). Measure the actual value from Task 6 and refine.

### Branch B: De-scaling error

The fix: confirm that `te.x` and `te.y` are already in unscaled canvas coordinates. Look at `addTextAtPosition` — does it divide by `zoomScale` before storing? If not, add the division there. If yes, the bug is in `tp()` receiving screen-scaled coordinates. In that case, divide by `zoomScale` before passing to `tp()`:
```typescript
const anchor = tp(te.x / this.zoomScale, (te.y + te.fontSize + i * lineHeight) / this.zoomScale);
```

- [ ] **Step 1: Apply the correct branch fix**

  Based on Task 6 measurement, apply Branch A or Branch B.

- [ ] **Step 2: Verify the fix**

  Repeat the Task 6 measurement steps. At zoom 1.0 and 2.0, text should appear at the correct position in the exported PDF (within 2pt tolerance).

- [ ] **Step 3: Remove the diagnostic comment from `pdfEditorApp.ts`** (replace with a one-line comment documenting the root cause and fix).

- [ ] **Step 4: Commit**

  ```bash
  git add js/pdfEditorApp.ts
  git commit -m "fix: text export position — correct baseline offset in PDF coordinate transform"
  ```

---

## Task 8: PDF Ghost Preview Overlay

**Files:**
- Modify: `js/pdfEditorApp.ts` — add `_showExportPreview()` method, wire preview button
- Modify: `js/uiController.ts` — add `previewExportBtn` to UIRefs
- Modify: `index.html` — add preview export button, preview overlay HTML, CSS

**Context:** The ghost preview renders each annotation as a semi-transparent duplicate at its exact PDF-export position, reprojected back to screen coordinates. It reuses `_transformPoint` (the same function used in `_drawElementOnPage`) to compute where each element would land in the exported PDF, then reverses the transform to display it on the canvas. This guarantees the preview matches export exactly.

- [ ] **Step 1: Add ghost preview HTML in `index.html`**

  After `<div id="toast"></div>`, add:
  ```html
  <div id="exportPreviewOverlay" class="export-preview-overlay" style="display:none">
    <div class="export-preview-banner">
      This is where your annotations will appear in the exported PDF.
      <button id="exportPreviewConfirm" class="btn btn-success">Export PDF</button>
      <button id="exportPreviewClose" class="btn">Close Preview</button>
    </div>
    <div id="exportPreviewGhost"></div>
  </div>
  ```

  Add CSS in `<style>`:
  ```css
  .export-preview-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    pointer-events: none;
    z-index: 500;
  }
  .export-preview-overlay .export-preview-banner {
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(30,30,30,0.92);
    color: #fff;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: all;
    z-index: 501;
  }
  #exportPreviewGhost {
    position: absolute;
    top: 0; left: 0;
    pointer-events: none;
    opacity: 0.4;
  }
  ```

  Add preview export button in the toolbar (after `exportPageBtn`):
  ```html
  <button id="previewExportBtn" class="btn btn-icon" disabled title="Preview export positions">👁</button>
  ```

- [ ] **Step 2: Add to `UIRefs` in `uiController.ts`**

  In `UIRefs` interface, add:
  ```typescript
  previewExportBtn:    HTMLButtonElement;
  exportPreviewOverlay: HTMLElement;
  exportPreviewGhost:   HTMLElement;
  exportPreviewConfirm: HTMLButtonElement;
  exportPreviewClose:   HTMLButtonElement;
  ```

  In constructor, add:
  ```typescript
  previewExportBtn:     document.getElementById('previewExportBtn')     as HTMLButtonElement,
  exportPreviewOverlay: document.getElementById('exportPreviewOverlay') as HTMLElement,
  exportPreviewGhost:   document.getElementById('exportPreviewGhost')   as HTMLElement,
  exportPreviewConfirm: document.getElementById('exportPreviewConfirm') as HTMLButtonElement,
  exportPreviewClose:   document.getElementById('exportPreviewClose')   as HTMLButtonElement,
  ```

  In `enableUI()`:
  ```typescript
  r.previewExportBtn.disabled = false;
  ```

- [ ] **Step 3: Implement `_showExportPreview()` in `pdfEditorApp.ts`**

  Add this method to `PDFEditorApp` (place after `fitToWidth()`):
  ```typescript
  private _showExportPreview(): void {
    const page = this.documentModel.currentPage;
    if (!page) return;

    const pageEl = this.documentModel.getPagePdfObject(page.id);
    if (!pageEl) return;

    const { width: Wraw, height: Hraw } = pageEl.getSize?.() ?? { width: this.renderer.canvas.width / this.zoomScale, height: this.renderer.canvas.height / this.zoomScale };
    const angle = pageEl.getRotation?.().angle ?? 0;
    const W = (angle === 90 || angle === 270) ? Hraw : Wraw;
    const H = (angle === 90 || angle === 270) ? Wraw : Hraw;

    const canvasW = this.renderer.canvas.width;
    const canvasH = this.renderer.canvas.height;
    const scaleX = canvasW / W;
    const scaleY = canvasH / H;

    const ghost = this.ui.exportPreviewGhost;
    ghost.innerHTML = '';
    ghost.style.width  = canvasW + 'px';
    ghost.style.height = canvasH + 'px';
    ghost.style.left   = this.ui.canvas.offsetLeft + 'px';
    ghost.style.top    = this.ui.canvas.offsetTop  + 'px';

    const pageElements = this.elements.filter(el => el.pageId === page.id);
    for (const el of pageElements) {
      // Compute where this element lands in PDF coords using the same transform as export
      const pdfPt = this._transformPoint(el.x, el.y + el.height, W, H, angle);
      // Back-project from PDF coords to screen pixels
      const screenX = pdfPt.x * scaleX;
      const screenY = (H - pdfPt.y) * scaleY; // PDF y-up → screen y-down
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.left = screenX + 'px';
      div.style.top  = screenY + 'px';
      div.style.width  = el.width  * scaleX + 'px';
      div.style.height = el.height * scaleY + 'px';
      div.style.border = '2px dashed rgba(37,99,235,0.7)';
      div.style.background = 'rgba(37,99,235,0.12)';
      div.style.boxSizing = 'border-box';
      ghost.appendChild(div);
    }

    this.ui.exportPreviewOverlay.style.display = '';
  }

  private _hideExportPreview(): void {
    this.ui.exportPreviewOverlay.style.display = 'none';
    this.ui.exportPreviewGhost.innerHTML = '';
  }
  ```

- [ ] **Step 4: Wire preview button and overlay controls in `setupEventListeners()`**

  Add (after `exportPageBtn` listener):
  ```typescript
  this.ui.previewExportBtn.addEventListener('click', () => {
    if (this.documentModel.currentPage) this._showExportPreview();
  });
  this.ui.exportPreviewClose.addEventListener('click', () => this._hideExportPreview());
  this.ui.exportPreviewConfirm.addEventListener('click', () => {
    this._hideExportPreview();
    this.downloadPDF();
  });
  ```

- [ ] **Step 5: Run type-check**

  ```bash
  cd /stack/projects/prsnl/pdf && npm run type-check
  ```
  Expected: no errors. If `getPagePdfObject` doesn't exist on `documentModel`, use available API (check `documentModel.ts` for how to get the raw pdf-lib page object, or derive W/H from `renderer.canvas` at zoom 1.0 = `canvas.width / zoomScale`).

- [ ] **Step 6: Browser verification**

  Run `npm run dev`, load a PDF with several annotations.
  1. Click the 👁 button → banner appears at top of canvas: "This is where your annotations will appear in the exported PDF."
  2. Semi-transparent blue dashed boxes appear at each annotation's export position.
  3. Place a text annotation, click 👁 again → the ghost reflects the new text position.
  4. Click "Export PDF" in the banner → preview closes, PDF downloads.
  5. Open the downloaded PDF → text/shapes should be at the same positions as the ghost boxes showed.
  6. Click "Close Preview" → overlay disappears, canvas returns to normal.

- [ ] **Step 7: Commit**

  ```bash
  git add js/pdfEditorApp.ts js/uiController.ts index.html
  git commit -m "feat: PDF ghost preview — show exact export positions before downloading"
  ```

---

## Verification Summary

| Feature | Unit test | Browser check |
|---|---|---|
| Tool toggle (all tools) | — | Click tool twice, check deactivates |
| Activation toast | — | Toast appears 1.5s on activation, not on deactivation |
| Esc deactivates | — | Press Esc, mode returns to Select |
| F/D key for freehand | — | Key activates; press again to deactivate |
| Continuous pen mode | — | Draw → draw again without mode change |
| Done pill | — | Appears in freehand, tap exits, Esc exits |
| Freehand selection glow | — | Select a freehand stroke → glow, no resize handle |
| Eraser geometry | `npm test -- tests/eraserGeometry.test.ts` → 9 tests pass | — |
| Eraser tool | — | Swipe across element → deleted; across freehand → split; Ctrl+Z undoes |
| Text export position | — | Place text, export, measure offset < 2pt at zoom 1.0 AND 2.0 |
| Ghost preview | — | 👁 button shows dashed boxes at export positions |
| Full test suite | `npm test` → all tests pass | — |
