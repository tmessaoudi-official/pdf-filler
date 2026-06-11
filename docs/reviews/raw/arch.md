# ARCH Agent Report — pdfEditorApp.ts Architecture Review
**Generated:** 2026-06-11  
**Agent:** ARCH (structural & design-level review)  
**File under review:** `src/core/pdfEditorApp.ts` (3,375 lines)

---

## 1. Responsibility Map of `pdfEditorApp.ts`

The class `PDFEditorApp` hosts **at least 23 distinct responsibilities**, enumerated below with approximate line ranges.

| # | Responsibility | Approx. Lines |
|---|---------------|---------------|
| 1 | Class fields / state declaration (≥ 50 fields) | 44–102 |
| 2 | Constructor: orchestrate collaborator wiring | 105–135 |
| 3 | `PageThumbnailPanel` initialization (duplicated 3 times) | 137–150, 1671–1685, 1892–1905 |
| 4 | Privacy toast on session start | 152–157 |
| 5 | **Event listener registration — 684 lines** covering all toolbar buttons, flyout menus, keyboard shortcuts, modals, canvas, document events | 159–842 |
| 6 | Watermark preview & modal open/close/apply | 844–941 |
| 7 | Text search / find bar (open, close, search, navigate matches, highlight, overlay rendering) | 943–1069 |
| 8 | Image file select, placement at click / drag | 1071–1215 |
| 9 | Multi-page structure: add PDF upload, page delete, page reorder, page rotation | 1217–1349 |
| 10 | Coordinate transform math (`_transformPoint`, `_inverseTransformPoint`, `_transformCanvasPoint`, `_rotateElementSnapshot`) | 1351–1417 |
| 11 | Page structure change callback / render trigger | 1419–1433 |
| 12 | Undo / redo orchestration | 1435–1477 |
| 13 | Autosave / IndexedDB persistence | 1479–1506 |
| 14 | Session restore dialog + async restore | 1508–1597 |
| 15 | Document close / clear-save flow | 1599–1780 |
| 16 | Image→PDF conversion helper | 1782–1818 |
| 17 | File upload (PDF + multi-image routing, password loop) | 1820–1929 |
| 18 | UI enable/disable helpers, mode / i18n refresh | 1931–1990 |
| 19 | Tool mode switching + placement ghost overlay | 1955–1989, 3348–3375 |
| 20 | Signature modal open/close/save | 1993–2026 |
| 21 | Code/QR-barcode modal open/close/save/preview | 2028–2189 |
| 22 | Element selection, rendering (DOM diffing), ink-layer rendering | 2191–2452 |
| 23 | Navigation (page navigation, zoom, fit-to-width) | 2454–2552 |
| 24 | Export preview overlay open/close | 2554–2636 |
| 25 | **PDF export pipeline × 3**: `downloadPDF`, `downloadPage`, `downloadPageAsImage` (nearly-identical 70–141-line bodies) | 2770–3064 |
| 26 | Geometry helpers (`_ptSegDist`, `_ptInPolygon`, `_hitTestShape`) | 2280–2312 |
| 27 | Coordinate and color utilities (`hexToRgbValues`, `_getStandardFont`, `_dataUrlToBytes`, `_dataUrlToUint8Array`, `_getPageCropBox`, `_embedImage`) | 3066–3329 |
| 28 | Watermark drawing on canvas AND on pdf-lib page | 867–888, 2606–2628, 3274–3299 |
| 29 | Redaction rasterization pipeline | 2675–2767 |

**Unique public members** accessed by handlers from outside the class: 18 distinct paths (`app.elements`, `app.mode`, `app.historyManager`, `app.renderer`, `app.ui`, `app.zoomScale`, `app.documentModel`, `app.inkLayer`, `app.renderElements`, `app.renderInkLayer`, `app.renderInkLayerWithLive`, `app.selectElement`, `app.selectedElement`, `app.setMode`, `app.onPlacementDragComplete`, `app.applyZoom`, `app._autosave`, `app.effectiveFillColor`).

---

## 2. Module Dependency Sketch

```
main.ts
  └── PDFEditorApp (core/pdfEditorApp.ts)
        ├── UIController (core/uiController.ts)   [DOM refs + display logic]
        ├── DocumentModel (core/documentModel.ts)  [pages, sourcepdfs, watermark]
        ├── PDFRenderer (core/pdfRenderer.ts)      [canvas rendering of PDF pages]
        ├── HistoryManager + all Commands (core/historyManager.ts)
        ├── InkLayer (core/inkLayer.ts)
        ├── PageThumbnailPanel (core/pageThumbnailPanel.ts)
        ├── storage.ts                             [IndexedDB save/load/clear]
        ├── handlers/* (5 handlers)  ←── ALL take PDFEditorApp as constructor arg
        │     ├── InteractionHandler
        │     ├── DrawingHandler
        │     ├── EraserHandler
        │     ├── InkLayerHandler
        │     └── TextEditHandler
        ├── elements/* (8 element types)
        └── utils/* (i18n, signaturePad, textLayer, formFieldOverlay, elementFactory, ...)

Dependency direction violation:
  handlers/* → PDFEditorApp (import type — TYPE ONLY, no circular runtime import)
  core/pdfEditorApp.ts → handlers/* (construction + method calls)

  This is a "downward type reference" pattern, not a true circular import at runtime
  since handlers import only `type PDFEditorApp` (erased at compile time).
  However architecturally, handlers reach UP into the app's internals freely.
```

---

## 3. Findings

---

### ARCH-01: God Class — PDFEditorApp has 23+ responsibilities in 3,375 lines
**Severity:** P1 (High)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:1–3375`

**Fence:** The file started as a simple app entry-point and accreted responsibilities incrementally as features were added (watermark, find, code/QR, rotation, export formats). In a single-developer PWA this is a pragmatic growth pattern — there is no team friction that forces decomposition.

**Verdict:** Pragmatic for v1 solo development, but the class has crossed the maintainability threshold. The growth pattern is unambiguous from the git log (commit series adds password, lock, QR, fill-bucket, etc. all wired into the same class). Each new feature requires understanding the entire 3,375-line class, and bugs in one responsibility (e.g. the session restore race) can interact silently with unrelated ones (file upload).

**Remediation:**  
Extract six bounded slices:
1. `ExportManager` — `downloadPDF`, `downloadPage`, `downloadPageAsImage`, `_rasterizePageWithRedactions`, `_drawElementOnPage`, `_drawWatermark`, `_renderInkForExport`, `_getPageCropBox`, `_embedImage`, `_getStandardFont`, `hexToRgbValues`, `_dataUrlToBytes`, `_dataUrlToUint8Array` (~600 lines)
2. `SessionManager` — `_restoreSession`, `_autosave`, `_doAutosave`, `_askRestoreSession`, `_clearSave`, `_closeDocument` (~200 lines)
3. `FindBarController` — `_openFindBar`, `_closeFindBar`, `_search`, `_nextMatch`, `_prevMatch`, `_highlightCurrentMatch`, `_showSearchMatches`, `_clearSearchMatches`, `_updateFindCount` (~130 lines)
4. `ModalController` — watermark modal, signature modal, code modal, blank-page modal, password modal, lock modal (~300 lines)
5. `PageStructureManager` — `_handleAddPdfUpload`, `_deletePage`, `_reorderPages`, `_rotatePage`, `_insertBlankPage`, `_onPageStructureChange` (~200 lines)
6. Coordinate math module — `_transformPoint`, `_inverseTransformPoint`, `_transformCanvasPoint`, `_rotateElementSnapshot` (~70 lines, pure functions, zero side effects — extract first, highest ROI)

**Effort:** L (large — but each slice is independently extractable in sequence)

---

### ARCH-02: Handlers coupled to full PDFEditorApp surface (18 public paths)
**Severity:** P1 (High)  
**Confidence:** High  
**File:line:** `src/handlers/drawingHandler.ts:1`, `src/handlers/interactionHandler.ts:1`, `src/handlers/eraserHandler.ts:1`, `src/handlers/inkLayerHandler.ts:1`

**Fence:** All handlers take `PDFEditorApp` as their constructor argument. This is a classic "pass the world" object pattern. The reason is historical: handlers were extracted from `pdfEditorApp.ts` to reduce file size, but the extraction was structural (move code to a new file) not architectural (define a minimal interface). The `import type` qualifier avoids a circular runtime import, but this is a thin protection — all 18 public paths are freely accessible.

**Verdict:** The handler extraction improved file size but not coupling. `DrawingHandler` directly mutates `app.selectedElement` (line 257), reads `app.effectiveFillColor`, calls `app.onPlacementDragComplete`, and fires `app.renderElements`. Any change to these app properties or their semantics must be tracked across all five handlers. This is high fan-in on a god-object.

**Remediation:**  
Define an `AppContext` interface exposing only what handlers actually need (the 18 paths), replacing the concrete `PDFEditorApp` dependency in handler constructors. This makes the coupling explicit and bounded, enabling handlers to be tested independently.

```typescript
// src/core/appContext.ts
export interface AppContext {
  readonly documentModel: DocumentModel;
  readonly elements: PDFElement[];
  readonly historyManager: HistoryManager;
  readonly inkLayer: InkLayer;
  readonly renderer: PDFRenderer;
  readonly ui: UIRefs;
  mode: ToolMode;
  zoomScale: number;
  selectedElement: PDFElement | null;
  readonly effectiveFillColor: string | undefined;
  renderElements(): void;
  renderInkLayer(): void;
  renderInkLayerWithLive(points: Array<{x:number;y:number}>, type: 'ink' | 'erase'): void;
  selectElement(el: PDFElement | null): void;
  setMode(mode: ToolMode): void;
  onPlacementDragComplete(...): void;
  applyZoom(scale: number): Promise<void>;
  _autosave(): void;
}
```

`PDFEditorApp implements AppContext`. Handlers receive `AppContext`, not the concrete class.

**Effort:** M (medium — mechanical substitution once the interface is drafted)

---

### ARCH-03: Export pipeline triplicated — ~170 lines of near-identical code
**Severity:** P2 (Moderate)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:2770` (`downloadPDF`), `2913` (`downloadPage`), `2985` (`downloadPageAsImage`)

**Fence:** Three separate download entry-points were added as distinct features over time. The page-level exports (`downloadPage`, `downloadPageAsImage`) are variations on the same algorithm (load source → copy page → apply rotation → draw elements → draw watermark → draw ink → export).

**Verdict:** The three methods share the crop-box extraction block (`_getPageCropBox`, `w_eff`, `h_eff` pattern), the element drawing loop (calls to `_drawElementOnPage`), the watermark conditional, and the ink overlay conditional. A `diff` of the vector sections of `downloadPDF` and `downloadPage` shows ~85% identical code. A future change to how rotation is applied to elements (e.g., to fix residual rotation bugs) must be applied in all three places. One of those places will be missed.

**Remediation:**  
Extract a `_buildPagePdf(docPage, pdfDoc, srcDoc, libs) => Promise<PDFPage>` helper that centralizes: rotation, cropbox, element drawing, watermark, ink. The three public methods become thin wrappers that build a `PDFDocument`, call `_buildPagePdf`, then save + trigger download.

**Effort:** M

---

### ARCH-04: `setupEventListeners()` is 684 lines — an untestable monolith
**Severity:** P2 (Moderate)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:159–842`

**Fence:** All event wiring is collected in one method. This matches a common "wire everything in init" pattern that is familiar and avoids scattered `addEventListener` calls.

**Verdict:** The 684-line method handles toolbar buttons, flyout menus, keyboard shortcuts, modal triggers, canvas events, drag events, color pickers, watermark sliders, QR modal events, signature modal, blank-page modal, password modal, lock modal, and find bar — with interleaved logic (e.g., watermark preview listeners are initialized inside `setupEventListeners` via `_setupWatermarkPreviewListeners` but the actual watermark modal open/close/apply logic is in separate methods). There is no logical grouping: the font-size buttons are at line 706, the file menu is at 362, keyboard shortcuts are at 742. The method has no structure that would let a reviewer quickly find where the "add PDF" event is wired. More importantly, `setupEventListeners` creates closures over `this`, making it impossible to dispose individual listeners (e.g., when tearing down a sub-view).

**Remediation:**  
Split into thematic groups, each a private method: `_wireToolbarEvents()`, `_wireKeyboardShortcuts()`, `_wireModalEvents()`, `_wireFlyoutMenus()`, `_wireCanvasEvents()`, `_wireFormattingToolbar()`. Each is called from `setupEventListeners` as a delegation chain. This does not remove code but makes it navigable and testable.

**Effort:** S–M (mostly mechanical splitting)

---

### ARCH-05: `PageThumbnailPanel` constructed 3 times with identical config
**Severity:** P2 (Moderate)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:138` (constructor), `1673` (`_insertBlankPage` first-page path), `1893` (`handleFileUpload`)

**Fence:** The panel is rebuilt on document open and on first blank-page insert because a new `DocumentModel` is created. The constructor creates the initial panel (before any document is loaded) as a side-effect of `_initThumbnailPanel`. This is likely an early design where the thumbnail panel could exist before a document was loaded.

**Verdict:** Three identical 14-line construction blocks with the same callback config. Any new callback (e.g., a future `onDuplicate` operation) must be added in all three places. One of those places will be missed, causing silent inconsistency between document-open and blank-page-insert states.

**Remediation:**  
Extract `_createThumbnailPanel(): PageThumbnailPanel` that returns a panel with the canonical callback set. The three construction sites become single-line calls. Additionally, the panel should be re-initialized (not re-created) on new document; accept a model setter rather than requiring a full reconstruction.

**Effort:** S

---

### ARCH-06: Mutable global static `PDFElement._nextId` mutated from `pdfEditorApp.ts`
**Severity:** P2 (Moderate)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:2655`, `src/elements/pdfElement.ts:18`

**Fence:** `_nextId` is a static counter used as the ID allocator for all element instances. The `_pasteElement` method in `pdfEditorApp.ts` directly increments it: `clone.id = PDFElement._nextId++`. This is the only place outside `PDFElement` itself (and `ElementFactory.syncIdCounter`) that writes to this counter.

**Verdict:** Leaking the responsibility of ID allocation out of the class that owns it. `_nextId` is already public (`static _nextId`) by necessity. The pattern works but is fragile: a second call site that wants to create an element and assign an ID directly has no way to know it must also increment `_nextId`. The clean pattern would be a static `PDFElement.allocateId(): number` factory method, or alternatively use `ElementFactory.fromJSON` + `syncIdCounter` consistently.

**Remediation:**  
Add `static allocateId(): number { return PDFElement._nextId++; }` to `PDFElement`. Replace `clone.id = PDFElement._nextId++` with `clone.id = PDFElement.allocateId()`.

**Effort:** S

---

### ARCH-07: `setMode()` has a hidden side effect — opens signature modal
**Severity:** P2 (Moderate)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:1966`

**Fence:** The signature flow requires the modal to open when `addSignature` mode is activated. Wiring this inside `setMode` is pragmatically convenient — it ensures the modal always opens regardless of which code path activates the mode.

**Verdict:** `setMode` is called from at least 15 places (toolbar click handlers, keyboard shortcut handler, `_pendingModeAfterBlankPage`, handler callbacks). A caller invoking `setMode('addSignature')` triggers a modal open as a non-obvious side effect. This makes testing `setMode` impossible without a DOM environment, and makes the function's contract non-obvious. Any future mode that requires a modal (e.g., a hypothetical `addStickyNote` mode) creates pressure to add more side effects into `setMode`.

**Remediation:**  
Remove the `openSignatureModal()` call from `setMode`. Add it back at the specific call sites that should trigger the modal (toolbar click handler and keyboard shortcut). This makes `setMode` a pure state-transition function.

**Effort:** S

---

### ARCH-08: `_noFill` is UI-widget state stored on the app object
**Severity:** P3 (Stylistic/Low)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:74`

**Fence:** The fill toggle (None vs Color) needs to know its state to decide whether `effectiveFillColor` is `undefined` or the picker value. Storing it as an app field is the quickest implementation.

**Verdict:** `_noFill` is purely derived from the fill-toggle button's state and the selected element's `fillColor`. It is not part of the document model, not part of the tool mode, and not persisted. It belongs in `UIController` or in a micro-state object alongside `ui.fillColorInput.value`. Its current location on `PDFEditorApp` increases the apparent surface of the app's state.

**Remediation:**  
Move `_noFill` to `UIController` alongside the fill-related refs, or compute it on demand from the current element's `fillColor` when `effectiveFillColor` is called (the field exists only to avoid reading the input value every frame). Either approach keeps the app's state model cleaner.

**Effort:** S

---

### ARCH-09: `renderElements()` DOM-diffing by full teardown + rebuild on every call
**Severity:** P2 (Moderate)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:2357`

**Fence:** The "remove all, re-render all" approach is maximally simple and correct by construction. The complexity of a proper virtual-DOM diff (handling element reuse, focus preservation, event re-attachment) was consciously avoided. The comment at line 2337 (re-query input after `renderElements`) confirms the author is aware of the re-creation cost.

**Verdict:** The teardown-and-rebuild approach causes:
1. **Focus loss** — every `renderElements()` call destroys and recreates the active `<textarea>`. The code works around this by double-focusing (lines 2330–2341 and 2337–2341), but this is an architecturally fragile workaround rather than a fix.
2. **Performance** — for a page with 50+ elements (e.g. a watermark-heavy annotation pass), every keypress, move event, or zoom triggers full DOM reconstruction.
3. **Re-attachment of event listeners** — the `input` event listener for text recording (lines 2386–2406) is re-attached on every `renderElements` call. If two renders occur in rapid succession, the old listener is attached to the now-destroyed DOM node, which is GC'd correctly — but a future refactor that doesn't destroy DOM nodes would create double-listener bugs.

The correct fix is keyed rendering: keep elements in the DOM, update only changed properties. This is a medium-lift refactor.

**Remediation:**  
Introduce keyed rendering: maintain a `Map<number, HTMLDivElement>` from element ID to DOM node. On `renderElements`, compare against the current elements array: add missing nodes, update changed properties (position, rotation, selected class), remove stale nodes. Event listeners are attached once at creation.

**Effort:** M

---

### ARCH-10: Export pipeline uses `any` pervasively for pdf-lib types
**Severity:** P3 (Stylistic)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:2677–2684`, `3134`, `3276`, `3302`

**Fence:** `@cantoo/pdf-lib` is a dynamic import; the types are not statically available at the call sites in this file. The `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments confirm the author is aware.

**Verdict:** Six method signatures and four inline casts use `any` for pdf-lib types (`pdfDoc`, `page`, `libs`). This is a pragmatic trade-off for a dynamic import, but it means the export pipeline has zero type safety for its most complex parameter. A bug in the `libs` object (passing the wrong `rgb` function) is not caught by the compiler.

**Remediation:**  
Create a `src/utils/pdfLibTypes.ts` file that re-exports typed stubs for the subset of pdf-lib API used (`PDFDocument`, `PDFPage`, `rgb`, `degrees`, `StandardFonts`). Use these types in the export method signatures. This does not require eliminating the dynamic import.

**Effort:** S

---

### ARCH-11: `_imagesToPdf` has a URL object leak on `imgEl.onerror`
**Severity:** P2 (Moderate)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:1793–1808`

**Fence:** The blob URL is created to render an image for canvas re-encoding. `URL.revokeObjectURL` is called inside `imgEl.onload` at line 1804. This pattern is correct for the success path.

**Verdict:** The `onerror` path is not implemented (no `imgEl.onerror` handler). If an image fails to load (corrupted file, unsupported format), the `Promise` returned by the IIFE never resolves or rejects, and the blob URL is never revoked. This causes a permanent memory leak and an uncancellable pending promise. In the context of multi-image PDF conversion (iterates over multiple files), one bad file silently hangs the entire conversion.

**Remediation:**  
Add `imgEl.onerror = () => { URL.revokeObjectURL(blob); reject(new Error('Image load failed')); };` immediately after `imgEl.onload`.

**Effort:** S

---

### ARCH-12: `_pendingModeAfterBlankPage` is a deferred-side-effect flag
**Severity:** P3 (Stylistic)  
**Confidence:** High  
**File:line:** `src/core/pdfEditorApp.ts:99`, `342`, `1691`

**Fence:** When freehand mode is activated with no document open, the app needs to open the blank-page modal first, then activate the mode after the page is inserted. The flag stores the intended mode across the modal lifecycle.

**Verdict:** The pattern works but is fragile: the flag is a string (`'drawFreehand'`), not typed as `ToolMode`. If the modal is cancelled (user dismisses it), the flag is never cleared — it remains set until the next blank-page insert, at which point it will activate the wrong mode. There is also no handling for the case where another mode is selected while the modal is open.

**Remediation:**  
Type the field as `ToolMode | null`. In `_openBlankPageModal`, clear the flag if the modal's cancel button is clicked. In `_insertBlankPage`, check the flag before clearing and activating — only activate if the flag matches a pending tool intent. Alternatively, replace the flag pattern with a `Promise`-based flow where `_openBlankPageModal` returns a Promise that resolves when the modal is confirmed or rejected.

**Effort:** S

---

### ARCH-13: History commands hold direct array reference, not a copy
**Severity:** P2 (Moderate)  
**Confidence:** High  
**File:line:** `src/core/historyManager.ts:11–58`

**Fence:** The commands (`AddElementCmd`, `RemoveElementCmd`, `ClearAllCmd`, `MoveResizeCmd`) hold `private elements: PDFElement[]` — a direct reference to the app's live `elements` array. This is intentional: commands need to operate on the live array.

**Verdict:** The design is correct but creates a subtle invariant: the same `elements` array must be used throughout the app's lifetime. In `handleFileUpload` (line 1881) and `_closeDocument` (line 1751), `this.elements = []` replaces the array reference entirely, then `this.historyManager.clear()` is called immediately after. The ordering is safe: if `clear()` were forgotten, old commands in the history would hold a reference to the dead array and silently do nothing on undo/redo. This is a latent bug rather than an active one.

**Remediation:**  
Replace array replacement (`this.elements = []`) with array mutation (`this.elements.splice(0)`). This preserves the reference that commands hold, making the history manager's operation safe even if `clear()` is accidentally omitted. This is also more idiomatic for the command pattern.

**Effort:** S

---

## 4. What Is GOOD

**Command / undo pattern (historyManager.ts):** The `Command` interface is clean, the `execute`/`undo` separation is correct, `MacroCmd` composes atomic operations properly, and the stack size limit (50) prevents unbounded memory growth. The recent addition of `TransformAnnotationsCmd`, `InkFillColorCmd`, and `RotateElementCmd` shows the pattern scaling well. This is the best-designed subsystem in the codebase.

**DocumentModel is pure data.** `DocumentModel` has no DOM dependencies, no event listeners, and no async behavior. It is a clean value object. The GC logic for sourcePdfs (`_gcSourcePdf`) is a nice touch that prevents PDF byte arrays from accumulating when pages are deleted. The `reorderPages` validation (checking all IDs present before committing) is defensive and correct.

**Handler coupling is `import type` only.** All five handlers import `PDFEditorApp` with `import type`, which means the import is erased at compile time. There is no circular runtime dependency between `core/` and `handlers/`. This is the right pattern even if the coupling surface is still wide.

**`_restoreSession` race condition was already fixed.** The `_isLoading` guard added to `_restoreSession` (after BUG-09 identification in the audit) correctly prevents concurrent execution with `handleFileUpload`. The `finally` block ensures the flag is always cleared.

**Coordinate math is correct and well-tested.** The `_transformPoint` / `_inverseTransformPoint` pair with proper case handling for all four rotations (0/90/180/270), plus the element snapshot logic that distinguishes geometric elements (arrows, freehand) from box elements (text, image) for rotation, is non-trivial and correctly implemented.

**Element hierarchy is flat and composable.** All elements extend `PDFElement` with a minimal base (id, x, y, w, h, pageId, rotation). No deep inheritance chains. `toJSON` / `ElementFactory.fromJSON` is a clean serialization boundary. The absence of cross-element dependencies keeps the `elements/` layer cleanly isolated.

**`UIController` acts as a proper presentation layer.** Its 478 lines cleanly separate DOM ref acquisition (constructor) from state-driven UI updates (`updateModeButtons`, `updateFormattingToolbar`, `showToast`). Importantly, it contains no application logic — it only reacts to data passed to it. The `UIRefs` interface as a structural type is clean.

**Redaction security is architecturally sound.** The `_rasterizePageWithRedactions` approach (full 2× raster of page + all non-redaction elements, then draw solid boxes, then embed as PNG) eliminates the original text layer at the PDF structure level. There is no vector path that would let a reader extract the redacted content. This is a good security-by-design decision.

---

## 5. Summary Table

| ID | Severity | Confidence | One-liner |
|----|----------|------------|-----------|
| ARCH-01 | P1 | High | 3,375-line god class with 23+ responsibilities; needs 6 bounded extractions |
| ARCH-02 | P1 | High | Handlers reference 18 public app paths — wide fan-in on a god object; fix with AppContext interface |
| ARCH-03 | P2 | High | Export pipeline triplicated; ~170 lines of near-identical code across 3 download methods |
| ARCH-04 | P2 | High | 684-line `setupEventListeners` is untestable and ungrouped; split into 6 thematic sub-methods |
| ARCH-05 | P2 | High | `PageThumbnailPanel` constructed 3 times with identical 14-line config; extract factory method |
| ARCH-06 | P2 | High | `PDFElement._nextId` mutated directly from `pdfEditorApp.ts`; add `PDFElement.allocateId()` |
| ARCH-07 | P2 | High | `setMode('addSignature')` has hidden side effect of opening signature modal; make it explicit |
| ARCH-08 | P3 | High | `_noFill` is UI-widget state on the app object; belongs in UIController |
| ARCH-09 | P2 | High | `renderElements()` full teardown+rebuild on every call; causes focus loss and double-listener risk |
| ARCH-10 | P3 | High | Export pipeline uses `any` for pdf-lib types; add typed stubs in `pdfLibTypes.ts` |
| ARCH-11 | P2 | High | `_imagesToPdf` blob URL leaked on `imgEl.onerror` — silent promise hang + memory leak |
| ARCH-12 | P3 | High | `_pendingModeAfterBlankPage` flag untyped as `string`, not cleared on modal cancel |
| ARCH-13 | P2 | High | History commands hold live array ref; `this.elements = []` replaces it — latent undo/redo silent failure risk |
