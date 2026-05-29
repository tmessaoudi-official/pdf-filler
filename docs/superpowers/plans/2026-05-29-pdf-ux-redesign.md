# PDF Fill & Sign — UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single cramped toolbar with a clean two-row layout, add dynamic fit-to-width zoom, undo/redo, keyboard shortcuts, element selection with live formatting, better page navigation, localStorage auto-save, and mode/cursor feedback.

**Architecture:** All logic lives in `pdfEditorApp.js` (orchestrator). `PDFRenderer` gains a mutable `scale`. `TextElement` gains `fontFamily`/`bold`/`italic`. `InteractionHandler` calls back into the app to push undo history. No new files — all changes to existing 6 files.

**Tech Stack:** Vanilla JS ES modules, pdf.js 3.11.174 (CDN), pdf-lib 1.17.1 (dynamic import CDN), no build step.

---

## File Map

| File | What changes |
|---|---|
| `index.html` | Full toolbar replacement (two rows), new CSS classes, toast div |
| `js/pdfRenderer.js` | `scale` mutable; add `setScale(n)` + `computeFitScale(containerW)` |
| `js/pdfEditorApp.js` | Zoom, selection, formatting apply, undo/redo, keyboard, page nav, autosave, toasts, mode badge, download font support |
| `js/textElement.js` | Add `fontFamily`, `bold`, `italic` fields; update `render()`, `toJSON()` |
| `js/interactionHandler.js` | Call `app.onDragEnd()` / `app.onResizeEnd()` on mouseup |
| `js/pdfElement.js` | No changes |
| `js/signatureElement.js` | No changes |
| `js/signaturePad.js` | No changes |
| `js/main.js` | Version bump only (last task) |

---

## Task 1: Two-row toolbar HTML + CSS

**Files:**
- Modify: `index.html` (toolbar section + CSS)

- [ ] **Step 1: Replace the CSS block** — remove the old `.toolbar`, `.toolbar-group`, `.settings`, `.page-nav` rules and add the new ones. Find the `<style>` block in `index.html` and replace the relevant section (everything from `.toolbar {` through `.page-nav {`) with:

```css
.toolbar {
  padding: 7px 12px;
  background: #f8f9fa;
  display: flex;
  gap: 8px;
  align-items: center;
  overflow-x: auto;
  flex-shrink: 0;
}
.toolbar-row1 {
  border-bottom: 1px solid #e2e8f0;
}
.toolbar-row2 {
  border-bottom: 1px solid #dee2e6;
  background: #f0f4f8;
}
.toolbar-group {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}
.toolbar-sep {
  width: 1px;
  height: 22px;
  background: #dee2e6;
  flex-shrink: 0;
}
.toolbar-select {
  padding: 4px 6px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 12px;
  background: white;
  cursor: pointer;
}
.toolbar-number {
  width: 50px;
  padding: 4px 5px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}
.page-input { width: 42px; }
.page-total { font-size: 12px; color: #555; white-space: nowrap; }
.toolbar-color {
  width: 30px;
  height: 26px;
  padding: 1px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
}
.zoom-display {
  font-size: 12px;
  font-weight: 600;
  min-width: 38px;
  text-align: center;
}
.btn-icon {
  padding: 4px 8px;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  color: #333;
  cursor: pointer;
  font-size: 13px;
  min-width: 28px;
  transition: background 0.15s;
}
.btn-icon:hover:not(:disabled) { background: #e9ecef; }
.btn-icon:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-italic { font-style: italic; }
.btn-sm { padding: 4px 8px; font-size: 12px; }
.btn-active-fmt {
  background: #2563eb !important;
  color: white !important;
  border-color: #2563eb !important;
}
.mode-badge {
  margin-left: auto;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  background: #e2e8f0;
  color: #475569;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.03em;
}
.mode-badge.active {
  background: #2563eb;
  color: white;
}
#toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #1e293b;
  color: white;
  padding: 10px 18px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 9999;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: none;
}
#toast.show { opacity: 1; transform: translateY(0); }
#pdfCanvas.cursor-default { cursor: default; }
#pdfCanvas.cursor-crosshair { cursor: crosshair; }
```

Also update `.canvas-container` max-height so two toolbar rows fit:
```css
.canvas-container {
  position: relative;
  overflow: auto;
  max-height: calc(100vh - 300px);
  padding: 20px;
  background: #e9ecef;
}
```

- [ ] **Step 2: Replace the toolbar HTML** — find the `<div class="toolbar">` section (everything up to the closing `</div>` before `<div class="canvas-container">`) and replace with:

```html
<div class="toolbar toolbar-row1">
  <div class="toolbar-group">
    <label for="fileInput" class="btn btn-primary">📁 Upload PDF</label>
    <input type="file" id="fileInput" accept="application/pdf">
  </div>
  <div class="toolbar-group">
    <button id="undoBtn" class="btn btn-icon" disabled title="Undo (Ctrl+Z)">↩</button>
    <button id="redoBtn" class="btn btn-icon" disabled title="Redo (Ctrl+Y)">↪</button>
  </div>
  <div class="toolbar-sep"></div>
  <div class="toolbar-group">
    <button id="addTextBtn" class="btn btn-secondary" disabled title="Add Text (T)">T Text</button>
    <button id="addSignatureBtn" class="btn btn-secondary" disabled title="Sign (S)">✍ Sign</button>
  </div>
  <div class="toolbar-sep"></div>
  <div class="toolbar-group">
    <button id="downloadBtn" class="btn btn-success" disabled>⬇ Download</button>
    <button id="clearSaveBtn" class="btn btn-icon" disabled title="Clear saved session for this file">🗑</button>
  </div>
  <div id="modeBadge" class="mode-badge">● SELECT</div>
</div>
<div class="toolbar toolbar-row2">
  <div class="toolbar-group" id="formattingGroup">
    <select id="fontFamily" class="toolbar-select" disabled>
      <option value="Arial">Arial</option>
      <option value="Helvetica">Helvetica</option>
      <option value="Times New Roman">Times New Roman</option>
      <option value="Courier New">Courier New</option>
    </select>
    <button id="boldBtn" class="btn btn-icon" disabled title="Bold"><strong>B</strong></button>
    <button id="italicBtn" class="btn btn-icon btn-italic" disabled title="Italic"><em>I</em></button>
    <input type="number" id="fontSize" value="14" min="8" max="72" class="toolbar-number" disabled>
    <input type="color" id="textColor" value="#000000" class="toolbar-color" disabled>
  </div>
  <div class="toolbar-sep"></div>
  <div class="toolbar-group">
    <button id="zoomOutBtn" class="btn btn-icon" disabled title="Zoom out">−</button>
    <span id="zoomDisplay" class="zoom-display">—</span>
    <button id="zoomInBtn" class="btn btn-icon" disabled title="Zoom in">+</button>
    <button id="fitBtn" class="btn btn-secondary btn-sm" disabled title="Fit to width">⊡ Fit</button>
  </div>
  <div class="toolbar-sep"></div>
  <div class="toolbar-group">
    <button id="firstPage" class="btn btn-icon" disabled title="First page">◀◀</button>
    <button id="prevPage" class="btn btn-icon" disabled title="Previous page (Ctrl+←)">◀</button>
    <input type="number" id="pageInput" value="1" min="1" class="toolbar-number page-input" disabled>
    <span id="pageTotal" class="page-total">/ 0</span>
    <button id="nextPage" class="btn btn-icon" disabled title="Next page (Ctrl+→)">▶</button>
    <button id="lastPage" class="btn btn-icon" disabled title="Last page">▶▶</button>
  </div>
</div>
```

- [ ] **Step 3: Add toast div** — add `<div id="toast"></div>` just before `</body>`.

- [ ] **Step 4: Verify in browser** — start `python3 -m http.server 8080`, open `http://localhost:8080`. Two toolbar rows should be visible (buttons disabled), empty state shows, no JS errors.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: two-row toolbar HTML and CSS"
```

---

## Task 2: Dynamic Zoom

**Files:**
- Modify: `js/pdfRenderer.js`
- Modify: `js/pdfEditorApp.js`

- [ ] **Step 1: Update `pdfRenderer.js`** — make `scale` mutable and add helpers. Replace the full file content:

```js
// PDFRenderer module
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export class PDFRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pdfDoc = null;
    this.currentPage = 1;
    this.scale = 1.0;
    this.isRendering = false;
    this.pendingPage = null;
  }

  setScale(scale) {
    this.scale = Math.max(0.25, Math.min(3.0, scale));
  }

  computeFitScale(containerWidth) {
    if (!this.pdfDoc) return 1.0;
    // Use cached first-page width; actual page width computed synchronously
    // Returns a promise because getPage is async
    return this.pdfDoc.getPage(this.currentPage).then(page => {
      const vp = page.getViewport({ scale: 1 });
      const availableWidth = containerWidth - 40; // 20px padding each side
      return Math.max(0.25, availableWidth / vp.width);
    });
  }

  async loadPDF(fileData) {
    const typedArray = new Uint8Array(fileData);
    this.pdfDoc = await pdfjsLib.getDocument(typedArray).promise;
    this.currentPage = 1;
    await this.renderPage(this.currentPage);
  }

  async renderPage(pageNum) {
    if (this.isRendering) {
      this.pendingPage = pageNum;
      return;
    }
    this.isRendering = true;
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });
    this.canvas.height = viewport.height;
    this.canvas.width = viewport.width;
    await page.render({ canvasContext: this.ctx, viewport }).promise;
    this.isRendering = false;
    if (this.pendingPage !== null) {
      const pending = this.pendingPage;
      this.pendingPage = null;
      await this.renderPage(pending);
    }
  }

  async nextPage() {
    if (this.currentPage < this.pdfDoc.numPages) {
      this.currentPage++;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  async prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  async goToPage(pageNum) {
    const n = Math.max(1, Math.min(this.pdfDoc.numPages, pageNum));
    if (n !== this.currentPage) {
      this.currentPage = n;
      await this.renderPage(this.currentPage);
      return true;
    }
    return false;
  }

  getPageInfo() {
    return {
      current: this.currentPage,
      total: this.pdfDoc ? this.pdfDoc.numPages : 0
    };
  }
}
```

- [ ] **Step 2: Add zoom state + wiring to `pdfEditorApp.js`** — in the constructor, add:

```js
this.zoomScale = 1.0;   // after this.mode = 'select';
```

In `initUI()`, add these new UI refs inside `this.ui = { ... }`:

```js
zoomOutBtn: document.getElementById('zoomOutBtn'),
zoomInBtn: document.getElementById('zoomInBtn'),
zoomDisplay: document.getElementById('zoomDisplay'),
fitBtn: document.getElementById('fitBtn'),
undoBtn: document.getElementById('undoBtn'),
redoBtn: document.getElementById('redoBtn'),
fontFamily: document.getElementById('fontFamily'),
boldBtn: document.getElementById('boldBtn'),
italicBtn: document.getElementById('italicBtn'),
modeBadge: document.getElementById('modeBadge'),
clearSaveBtn: document.getElementById('clearSaveBtn'),
firstPage: document.getElementById('firstPage'),
lastPage: document.getElementById('lastPage'),
pageInput: document.getElementById('pageInput'),
pageTotal: document.getElementById('pageTotal'),
toast: document.getElementById('toast'),
```

Remove the old `pageInfo` ref (it no longer exists in HTML).

- [ ] **Step 3: Add zoom methods to `pdfEditorApp.js`**:

```js
async applyZoom(newScale) {
  this.zoomScale = Math.max(0.25, Math.min(3.0, newScale));
  this.renderer.setScale(this.zoomScale);
  this.ui.zoomDisplay.textContent = Math.round(this.zoomScale * 100) + '%';
  await this.renderer.renderPage(this.renderer.currentPage);
  this.renderElements();
}

async fitToWidth() {
  const scale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
  await this.applyZoom(scale);
}
```

- [ ] **Step 4: Wire zoom controls in `setupEventListeners()`**:

```js
this.ui.zoomInBtn.addEventListener('click', () =>
  this.applyZoom(this.zoomScale + 0.1));
this.ui.zoomOutBtn.addEventListener('click', () =>
  this.applyZoom(this.zoomScale - 0.1));
this.ui.fitBtn.addEventListener('click', () => this.fitToWidth());

this.ui.container.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  this.applyZoom(this.zoomScale + (e.deltaY < 0 ? 0.05 : -0.05));
}, { passive: false });
```

- [ ] **Step 5: Use fit-to-width on PDF load** — in `handleFileUpload`, after `await this.renderer.loadPDF(...)`, replace the line before `this.enableUI()` with:

```js
this.elements = [];
document.getElementById('emptyState').style.display = 'none';
const fitScale = await this.renderer.computeFitScale(this.ui.container.clientWidth);
await this.applyZoom(fitScale);
this.enableUI();
this.updatePageInfo();
this.renderElements();
```

Remove the separate `await this.renderer.loadPDF` line (already called above) — make sure `loadPDF` is still called first before `computeFitScale`.

- [ ] **Step 6: Enable zoom buttons in `enableUI()`**:

```js
enableUI() {
  this.ui.addTextBtn.disabled = false;
  this.ui.addSignatureBtn.disabled = false;
  this.ui.downloadBtn.disabled = false;
  this.ui.prevPageBtn.disabled = false;
  this.ui.nextPageBtn.disabled = false;
  this.ui.zoomInBtn.disabled = false;
  this.ui.zoomOutBtn.disabled = false;
  this.ui.fitBtn.disabled = false;
  this.ui.firstPage.disabled = false;
  this.ui.lastPage.disabled = false;
  this.ui.pageInput.disabled = false;
}
```

Note: `this.ui.prevPageBtn` is still `document.getElementById('prevPage')` — keep that ref name.

- [ ] **Step 7: Update `updatePageInfo()`** — replace old `pageInfo.textContent` with:

```js
updatePageInfo() {
  const info = this.renderer.getPageInfo();
  this.ui.pageInput.value = info.current;
  this.ui.pageInput.max = info.total;
  this.ui.pageTotal.textContent = `/ ${info.total}`;
}
```

- [ ] **Step 8: Verify** — upload a PDF. It should now fit to width (no more oversized rendering). Zoom +/− buttons and Ctrl+Scroll should work. Zoom percentage shows correctly.

- [ ] **Step 9: Commit**

```bash
git add js/pdfRenderer.js js/pdfEditorApp.js
git commit -m "feat: dynamic zoom with fit-to-width default"
```

---

## Task 3: Selection Model

**Files:**
- Modify: `js/pdfEditorApp.js`
- Modify: `js/interactionHandler.js`

- [ ] **Step 1: Add `selectedElement` to constructor** in `pdfEditorApp.js`:

```js
this.selectedElement = null;   // after this.zoomScale = 1.0;
```

- [ ] **Step 2: Add `selectElement()` method**:

```js
selectElement(element) {
  this.selectedElement = element;
  this.renderElements();
  this._updateFormattingToolbar();
}

_updateFormattingToolbar() {
  const el = this.selectedElement;
  const isText = el && el.type === 'text';
  this.ui.fontFamily.disabled = !isText;
  this.ui.boldBtn.disabled = !isText;
  this.ui.italicBtn.disabled = !isText;
  this.ui.fontSizeInput.disabled = !isText;
  this.ui.textColorInput.disabled = !isText;
  if (isText) {
    this.ui.fontFamily.value = el.fontFamily || 'Arial';
    this.ui.boldBtn.classList.toggle('btn-active-fmt', !!el.bold);
    this.ui.italicBtn.classList.toggle('btn-active-fmt', !!el.italic);
    this.ui.fontSizeInput.value = el.fontSize;
    this.ui.textColorInput.value = el.color;
  } else {
    this.ui.boldBtn.classList.remove('btn-active-fmt');
    this.ui.italicBtn.classList.remove('btn-active-fmt');
  }
}
```

Note: `this.ui.fontSizeInput` = `document.getElementById('fontSize')` — add this ref in `initUI()`.  
Note: `this.ui.textColorInput` = `document.getElementById('textColor')` — add this ref in `initUI()`.

- [ ] **Step 3: Update `renderElements()`** — apply `selected` class and add click-to-select:

```js
renderElements() {
  this.ui.container.querySelectorAll('.pdf-element').forEach(el => el.remove());
  const canvasOffset = {
    left: this.ui.canvas.offsetLeft,
    top: this.ui.canvas.offsetTop
  };
  const currentPageElements = this.elements.filter(
    el => el.page === this.renderer.currentPage
  );
  currentPageElements.forEach(element => {
    const div = element.render(this.ui.container, canvasOffset);
    if (this.selectedElement && this.selectedElement.id === element.id) {
      div.classList.add('selected');
    }
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectElement(element);
    });
    div.addEventListener('mousedown', (e) => {
      this.interactionHandler.handleMouseDown(e, element, div);
    });
    this.ui.container.appendChild(div);
  });
}
```

- [ ] **Step 4: Deselect on canvas click** — update `handleCanvasClick()`:

```js
handleCanvasClick(e) {
  if (this.mode === 'addText') {
    this.addTextAtPosition(e);
    this.setMode('select');
  } else if (this.mode === 'addSignature' && this.currentSignature) {
    this.addSignatureAtPosition(e);
    this.mode = 'select';
    this.ui.addSignatureBtn.classList.remove('active');
    this.currentSignature = null;
  } else {
    this.selectElement(null);
  }
}
```

- [ ] **Step 5: Deselect on page change** — add `this.selectElement(null);` at the start of `prevPage()` and `nextPage()` before the `await`.

- [ ] **Step 6: Verify** — place a text element, click it → red border appears, formatting toolbar activates (controls enabled). Click canvas → border disappears, formatting toolbar grays out.

- [ ] **Step 7: Commit**

```bash
git add js/pdfEditorApp.js
git commit -m "feat: element selection model with formatting toolbar activation"
```

---

## Task 4: Text Formatting

**Files:**
- Modify: `js/textElement.js`
- Modify: `js/pdfEditorApp.js`

- [ ] **Step 1: Update `TextElement`** — replace full file:

```js
// TextElement module
import { PDFElement } from './pdfElement.js?v=2';

export class TextElement extends PDFElement {
  constructor(x, y, page, options = {}) {
    super('text', x, y,
      options.width || 200,
      options.height || 30,
      page);
    this.text = '';
    this.fontSize = options.fontSize || 14;
    this.color = options.color || '#000000';
    this.fontFamily = options.fontFamily || 'Arial';
    this.bold = options.bold || false;
    this.italic = options.italic || false;
    this.multiline = options.multiline || false;
  }

  render(container, canvasOffset) {
    const div = document.createElement('div');
    div.className = 'pdf-element text-element';
    div.dataset.id = this.id;
    this.applyStyles(div, canvasOffset);

    const input = this.multiline
      ? document.createElement('textarea')
      : document.createElement('input');
    if (!this.multiline) input.type = 'text';
    input.value = this.text;
    this._applyInputFormatting(input);
    input.addEventListener('input', (e) => { this.text = e.target.value; });

    const controls = this.createControls();
    const resizeHandle = this.createResizeHandle();
    div.appendChild(input);
    div.appendChild(controls);
    div.appendChild(resizeHandle);
    return div;
  }

  _applyInputFormatting(input) {
    input.style.fontSize = this.fontSize + 'px';
    input.style.color = this.color;
    input.style.fontFamily = this.fontFamily;
    input.style.fontWeight = this.bold ? 'bold' : 'normal';
    input.style.fontStyle = this.italic ? 'italic' : 'normal';
  }

  applyStyles(div, canvasOffset) {
    div.style.left = (canvasOffset.left + this.x) + 'px';
    div.style.top = (canvasOffset.top + this.y) + 'px';
    div.style.width = this.width + 'px';
    div.style.height = this.height + 'px';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      text: this.text,
      fontSize: this.fontSize,
      color: this.color,
      fontFamily: this.fontFamily,
      bold: this.bold,
      italic: this.italic,
      multiline: this.multiline
    };
  }
}
```

- [ ] **Step 2: Wire formatting toolbar controls in `pdfEditorApp.js`** — add in `setupEventListeners()`:

```js
this.ui.fontFamily.addEventListener('change', (e) => {
  if (!this.selectedElement || this.selectedElement.type !== 'text') return;
  this.selectedElement.fontFamily = e.target.value;
  this.renderElements();
  this._autosave();
});

this.ui.boldBtn.addEventListener('click', () => {
  if (!this.selectedElement || this.selectedElement.type !== 'text') return;
  this.selectedElement.bold = !this.selectedElement.bold;
  this.ui.boldBtn.classList.toggle('btn-active-fmt', this.selectedElement.bold);
  this.renderElements();
  this._autosave();
});

this.ui.italicBtn.addEventListener('click', () => {
  if (!this.selectedElement || this.selectedElement.type !== 'text') return;
  this.selectedElement.italic = !this.selectedElement.italic;
  this.ui.italicBtn.classList.toggle('btn-active-fmt', this.selectedElement.italic);
  this.renderElements();
  this._autosave();
});

this.ui.fontSizeInput.addEventListener('change', (e) => {
  const size = Math.max(8, Math.min(72, parseInt(e.target.value) || 14));
  if (this.selectedElement && this.selectedElement.type === 'text') {
    this.selectedElement.fontSize = size;
    this.renderElements();
    this._autosave();
  }
});

this.ui.textColorInput.addEventListener('change', (e) => {
  if (this.selectedElement && this.selectedElement.type === 'text') {
    this.selectedElement.color = e.target.value;
    this.renderElements();
    this._autosave();
  }
});
```

Note: `_autosave()` is added in Task 8. For now, add a stub: `_autosave() {}`.

- [ ] **Step 3: Update `importState()` in `pdfEditorApp.js`** — add new fields when restoring text elements:

```js
importState(stateJSON) {
  const state = JSON.parse(stateJSON);
  this.elements = state.elements.map(data => {
    if (data.type === 'text') {
      const el = new TextElement(data.x, data.y, data.page, {
        width: data.width,
        height: data.height,
        fontSize: data.fontSize,
        color: data.color,
        fontFamily: data.fontFamily || 'Arial',
        bold: data.bold || false,
        italic: data.italic || false,
        multiline: data.multiline
      });
      el.text = data.text;
      return el;
    } else if (data.type === 'signature') {
      return new SignatureElement(
        data.x, data.y, data.page, data.data,
        { width: data.width, height: data.height }
      );
    }
  }).filter(Boolean);
  this.renderElements();
}
```

- [ ] **Step 4: Verify** — place a text element, click it, change font to "Times New Roman" → text in overlay updates. Toggle Bold → text goes bold. Change color → color updates. All changes are live, no recreate needed.

- [ ] **Step 5: Commit**

```bash
git add js/textElement.js js/pdfEditorApp.js
git commit -m "feat: text formatting (font family, bold, italic, size, color on selected element)"
```

---

## Task 5: Undo / Redo

**Files:**
- Modify: `js/pdfEditorApp.js`
- Modify: `js/interactionHandler.js`

- [ ] **Step 1: Add history state to constructor** in `pdfEditorApp.js`:

```js
this.historyStack = [];   // after this.selectedElement = null;
this.redoStack = [];
```

- [ ] **Step 2: Add history methods**:

```js
_snapshotElements() {
  return this.elements.map(el => el.toJSON());
}

pushHistory() {
  this.historyStack.push(this._snapshotElements());
  if (this.historyStack.length > 50) this.historyStack.shift();
  this.redoStack = [];
  this._updateUndoRedoBtns();
}

undo() {
  if (!this.historyStack.length) return;
  this.redoStack.push(this._snapshotElements());
  const snapshot = this.historyStack.pop();
  this._restoreSnapshot(snapshot);
  this._updateUndoRedoBtns();
}

redo() {
  if (!this.redoStack.length) return;
  this.historyStack.push(this._snapshotElements());
  const snapshot = this.redoStack.pop();
  this._restoreSnapshot(snapshot);
  this._updateUndoRedoBtns();
}

_restoreSnapshot(snapshot) {
  this.elements = snapshot.map(data => {
    if (data.type === 'text') {
      const el = new TextElement(data.x, data.y, data.page, {
        width: data.width, height: data.height,
        fontSize: data.fontSize, color: data.color,
        fontFamily: data.fontFamily || 'Arial',
        bold: data.bold || false, italic: data.italic || false,
        multiline: data.multiline
      });
      el.text = data.text;
      return el;
    } else if (data.type === 'signature') {
      return new SignatureElement(
        data.x, data.y, data.page, data.data,
        { width: data.width, height: data.height }
      );
    }
  }).filter(Boolean);
  this.selectedElement = null;
  this.renderElements();
  this._updateFormattingToolbar();
  this._autosave();
}

_updateUndoRedoBtns() {
  this.ui.undoBtn.disabled = this.historyStack.length === 0;
  this.ui.redoBtn.disabled = this.redoStack.length === 0;
}
```

- [ ] **Step 3: Push history on add/delete** — in `addTextAtPosition()`, add `this.pushHistory();` BEFORE pushing to `this.elements`. Same in `addSignatureAtPosition()`. Replace `removeElement()` entirely with:

```js
removeElement(id) {
  this.pushHistory();
  this.elements = this.elements.filter(el => el.id !== id);
  if (this.selectedElement && this.selectedElement.id === id) {
    this.selectedElement = null;
    this._updateFormattingToolbar();
  }
  this.renderElements();
  this._autosave();
}
```

- [ ] **Step 4: Push history on drag/resize end** — update `interactionHandler.js`. Add a `_dragStartSnapshot` and `_resizeStartSnapshot` to capture state before drag/resize, then call `app.pushHistory()` on completion. Replace the file:

```js
// InteractionHandler module
export class InteractionHandler {
  constructor(app) {
    this.app = app;
    this.isDragging = false;
    this.isResizing = false;
    this.currentElement = null;
    this.offsetX = 0;
    this.offsetY = 0;
    this.startX = 0;
    this.startY = 0;
    this.startWidth = 0;
    this.startHeight = 0;
    this._startElementX = 0;
    this._startElementY = 0;
  }

  handleMouseDown(e, element, div) {
    if (e.target.classList.contains('control-btn')) return;
    if (e.target.classList.contains('resize-handle')) {
      this._startElementX = element.x;
      this._startElementY = element.y;
      this.startResize(e, element);
    } else if (!e.target.matches('input, textarea')) {
      this._startElementX = element.x;
      this._startElementY = element.y;
      this.startDrag(e, element, div);
    }
  }

  startDrag(e, element, div) {
    this.isDragging = true;
    this.currentElement = element;
    const divRect = div.getBoundingClientRect();
    this.offsetX = e.clientX - divRect.left;
    this.offsetY = e.clientY - divRect.top;
    e.preventDefault();
  }

  startResize(e, element) {
    this.isResizing = true;
    this.currentElement = element;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startWidth = element.width;
    this.startHeight = element.height;
    e.preventDefault();
    e.stopPropagation();
  }

  handleMouseMove(e) {
    if (this.isDragging && this.currentElement) this.drag(e);
    else if (this.isResizing && this.currentElement) this.resize(e);
  }

  drag(e) {
    const canvas = this.app.renderer.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const newX = e.clientX - canvasRect.left - this.offsetX;
    const newY = e.clientY - canvasRect.top - this.offsetY;
    this.currentElement.x = Math.max(0, Math.min(canvas.width - this.currentElement.width, newX));
    this.currentElement.y = Math.max(0, Math.min(canvas.height - this.currentElement.height, newY));
    this.app.renderElements();
  }

  resize(e) {
    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;
    const newWidth = Math.max(50, this.startWidth + deltaX);
    const newHeight = Math.max(20, this.startHeight + deltaY);
    const canvas = this.app.renderer.canvas;
    this.currentElement.width = Math.min(newWidth, canvas.width - this.currentElement.x);
    this.currentElement.height = Math.min(newHeight, canvas.height - this.currentElement.y);
    this.app.renderElements();
  }

  handleMouseUp() {
    const wasDragging = this.isDragging;
    const wasResizing = this.isResizing;
    const movedEl = this.currentElement;

    this.isDragging = false;
    this.isResizing = false;
    this.currentElement = null;

    if (movedEl && (wasDragging || wasResizing)) {
      const movedX = movedEl.x !== this._startElementX;
      const movedY = movedEl.y !== this._startElementY;
      const resized = wasResizing && (movedEl.width !== this.startWidth || movedEl.height !== this.startHeight);
      if (movedX || movedY || resized) {
        this.app.pushHistory();
        this.app._autosave();
      }
    }
  }
}
```

- [ ] **Step 5: Wire Undo/Redo buttons** in `setupEventListeners()`:

```js
this.ui.undoBtn.addEventListener('click', () => this.undo());
this.ui.redoBtn.addEventListener('click', () => this.redo());
```

- [ ] **Step 6: Verify** — add two text elements. Undo button becomes active. Click Undo → last element disappears. Click Undo again → first element disappears. Click Redo → first element reappears. Drag an element → Undo reverts position.

- [ ] **Step 7: Commit**

```bash
git add js/pdfEditorApp.js js/interactionHandler.js
git commit -m "feat: undo/redo with 50-step history"
```

---

## Task 6: Keyboard Shortcuts

**Files:**
- Modify: `js/pdfEditorApp.js`

- [ ] **Step 1: Add text-change debounce timer to constructor**:

```js
this._textChangeTimer = null;   // after this.redoStack = [];
```

- [ ] **Step 2: Update text input listener in `addTextAtPosition()`** — after `new TextElement(...)`, the element is pushed and rendered. In `renderElements()`, the input gets an `input` event listener. Add a debounced history push by updating the `input` listener in `TextElement.render()` — wait, that lives in `textElement.js`. Instead, after `renderElements()` in `addTextAtPosition`, do nothing special — the text change history push is handled via debounce in `renderElements`. 

Actually the cleanest approach: add a `data-element-id` listener in `renderElements()` for text change debounce. In `renderElements()` inside the forEach, after the element div click listener, add:

```js
if (element.type === 'text') {
  const input = div.querySelector('input, textarea');
  input.addEventListener('input', () => {
    clearTimeout(this._textChangeTimer);
    this._textChangeTimer = setTimeout(() => {
      this.pushHistory();
      this._autosave();
    }, 500);
  });
}
```

- [ ] **Step 3: Add global keyboard listener in `setupEventListeners()`**:

```js
document.addEventListener('keydown', (e) => {
  // Escape always works
  if (e.key === 'Escape') {
    this.setMode('select');
    this.selectElement(null);
    return;
  }

  // All other shortcuts blocked when typing in an input
  if (e.target.matches('input, textarea, select')) return;

  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'z':
        e.preventDefault();
        if (e.shiftKey) this.redo(); else this.undo();
        break;
      case 'y':
        e.preventDefault();
        this.redo();
        break;
      case 'arrowright':
        e.preventDefault();
        this.nextPage();
        break;
      case 'arrowleft':
        e.preventDefault();
        this.prevPage();
        break;
    }
    return;
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      if (this.selectedElement) {
        e.preventDefault();
        this.removeElement(this.selectedElement.id);
        this.selectedElement = null;
        this._updateFormattingToolbar();
      }
      break;
    case 't':
    case 'T':
      if (this.renderer.pdfDoc) this.setMode('addText');
      break;
    case 's':
    case 'S':
      if (this.renderer.pdfDoc) this.setMode('addSignature');
      break;
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      if (this.selectedElement) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowUp') this.selectedElement.y -= step;
        if (e.key === 'ArrowDown') this.selectedElement.y += step;
        if (e.key === 'ArrowLeft') this.selectedElement.x -= step;
        if (e.key === 'ArrowRight') this.selectedElement.x += step;
        this.renderElements();
      }
      break;
  }
});
```

- [ ] **Step 4: Verify** — place a text element, press Escape → mode resets, element deselected. Press T → cursor is crosshair, add text mode active. Click to place, then press Delete → element removed. Ctrl+Z → undo. Arrow keys nudge selected element.

- [ ] **Step 5: Commit**

```bash
git add js/pdfEditorApp.js
git commit -m "feat: keyboard shortcuts (Delete, T, S, arrows, Escape, Ctrl+Z/Y)"
```

---

## Task 7: Better Page Navigation

**Files:**
- Modify: `js/pdfEditorApp.js`

- [ ] **Step 1: Wire first/last page buttons and editable page input in `setupEventListeners()`**:

```js
this.ui.firstPage.addEventListener('click', () => this._goToPage(1));
this.ui.lastPage.addEventListener('click', () =>
  this._goToPage(this.renderer.pdfDoc?.numPages || 1));

this.ui.pageInput.addEventListener('change', (e) => {
  this._goToPage(parseInt(e.target.value) || 1);
});
this.ui.pageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.target.blur();
    this._goToPage(parseInt(e.target.value) || 1);
  }
});
```

- [ ] **Step 2: Add `_goToPage()` method**:

```js
async _goToPage(n) {
  const changed = await this.renderer.goToPage(n);
  if (changed) {
    this.selectElement(null);
    this.updatePageInfo();
    this.renderElements();
  } else {
    this.updatePageInfo(); // reset input if out of range
  }
}
```

- [ ] **Step 3: Update `prevPage()` and `nextPage()`** to use `_goToPage`:

```js
async prevPage() {
  await this._goToPage(this.renderer.currentPage - 1);
}

async nextPage() {
  await this._goToPage(this.renderer.currentPage + 1);
}
```

- [ ] **Step 4: Enable first/last in `enableUI()`** — already done in Task 2. Confirm `firstPage` and `lastPage` buttons are in the `enableUI()` call.

- [ ] **Step 5: Verify** — on a 4-page PDF, click ◀◀ → jumps to page 1. Click ▶▶ → jumps to page 4. Click page number input, type 2, press Enter → jumps to page 2.

- [ ] **Step 6: Commit**

```bash
git add js/pdfEditorApp.js
git commit -m "feat: first/last page buttons and editable page number input"
```

---

## Task 8: Auto-save (localStorage)

**Files:**
- Modify: `js/pdfEditorApp.js`

- [ ] **Step 1: Add `currentFilename` to constructor**:

```js
this.currentFilename = null;   // after this._textChangeTimer = null;
```

- [ ] **Step 2: Implement `_autosave()` and restore methods**:

```js
_autosave() {
  if (!this.currentFilename) return;
  const key = `pdf-fill-sign:${this.currentFilename}`;
  const data = this.elements.map(el => el.toJSON());
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (_) {}
}

_loadSaved() {
  if (!this.currentFilename) return;
  const key = `pdf-fill-sign:${this.currentFilename}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!data.length) return;
    this.importState(JSON.stringify({ elements: data }));
    this.showToast(`Restored ${data.length} element${data.length > 1 ? 's' : ''} from last session`);
  } catch (_) {}
}

_clearSave() {
  if (!this.currentFilename) return;
  localStorage.removeItem(`pdf-fill-sign:${this.currentFilename}`);
  this.showToast('Saved session cleared');
}
```

- [ ] **Step 3: Call `_loadSaved()` on file upload** — in `handleFileUpload`, after `this.enableUI()` and `this.updatePageInfo()`, add:

```js
this.currentFilename = file.name;
this.ui.clearSaveBtn.disabled = false;
this._loadSaved();
```

Pass `file` variable to the `reader.onload` closure (it's in scope already as the outer `file` variable).

- [ ] **Step 4: Wire `clearSaveBtn`** in `setupEventListeners()`:

```js
this.ui.clearSaveBtn.addEventListener('click', () => this._clearSave());
```

- [ ] **Step 5: Replace the `_autosave() {}` stub** — find the line `_autosave() {}` that was added as a stub in Task 4 and replace it with the full implementation from Step 2 above. Then add `this._autosave()` calls after:
  - `this.elements.push(textElement)` in `addTextAtPosition()`
  - `this.elements.push(signatureElement)` in `addSignatureAtPosition()`
  - `this.elements = this.elements.filter(...)` in `removeElement()`

- [ ] **Step 6: Verify** — upload a PDF, add text "Hello". Refresh the page, upload the same PDF → toast appears: "Restored 1 element from last session". Element is back. Click 🗑 button → toast "Saved session cleared". Refresh + re-upload → no restore.

- [ ] **Step 7: Commit**

```bash
git add js/pdfEditorApp.js
git commit -m "feat: localStorage auto-save and restore with toast notification"
```

---

## Task 9: Mode Badge + Smart Cursor + Toasts

**Files:**
- Modify: `js/pdfEditorApp.js`

- [ ] **Step 1: Add `showToast()` method** (if not already added in Task 8):

```js
showToast(msg, duration = 3000) {
  this.ui.toast.textContent = msg;
  this.ui.toast.classList.add('show');
  clearTimeout(this._toastTimer);
  this._toastTimer = setTimeout(() => {
    this.ui.toast.classList.remove('show');
  }, duration);
}
```

Add `this._toastTimer = null;` to the constructor.

- [ ] **Step 2: Update `setMode()` to update badge + canvas cursor**:

```js
setMode(mode) {
  this.mode = mode;
  this.ui.addTextBtn.classList.toggle('active', mode === 'addText');
  this.ui.addSignatureBtn.classList.toggle('active', mode === 'addSignature');

  // Mode badge
  const badges = {
    select: '● SELECT',
    addText: '✚ ADD TEXT',
    addSignature: '✍ SIGNING'
  };
  this.ui.modeBadge.textContent = badges[mode] || '● SELECT';
  this.ui.modeBadge.classList.toggle('active', mode !== 'select');

  // Canvas cursor
  this.ui.canvas.className = mode === 'select'
    ? 'cursor-default'
    : 'cursor-crosshair';

  if (mode === 'addSignature') this.openSignatureModal();
}
```

- [ ] **Step 3: Add "PDF downloaded!" toast** — at the end of `downloadPDF()`, inside the `finally` block after `this.renderElements()`, add:

```js
if (!error) this.showToast('PDF downloaded!');
```

But since `finally` doesn't know about errors naturally in this context, instead add a success flag:

In the `try` block of `downloadPDF()`, right before `URL.revokeObjectURL(url)`, add:
```js
this.showToast('PDF downloaded!');
```

- [ ] **Step 4: Hover cursor on elements** — in `renderElements()` inside the forEach, after creating the div, add:

```js
div.addEventListener('mouseenter', () => {
  if (this.mode === 'select') this.ui.canvas.style.cursor = '';
});
div.addEventListener('mouseleave', () => {
  this.ui.canvas.style.cursor = '';
  // Let setMode restore the right cursor class
  this.ui.canvas.className = this.mode === 'select' ? 'cursor-default' : 'cursor-crosshair';
});
```

Actually, since `.pdf-element` already has `cursor: move` in CSS, the canvas cursor handling via class is sufficient. The element itself has the right cursor. Remove the mouseenter/mouseleave approach — it's unnecessary. The CSS `cursor: move` on `.pdf-element` takes care of it.

So Step 4 is: **no change needed** — `.pdf-element { cursor: move; }` already in CSS.

- [ ] **Step 5: Verify** — switch to Add Text mode → badge shows "✚ ADD TEXT" in blue. Switch back → "● SELECT" in gray. Download PDF → toast "PDF downloaded!" appears. Auto-save restore → toast appears.

- [ ] **Step 6: Commit**

```bash
git add js/pdfEditorApp.js
git commit -m "feat: mode badge, canvas cursor, and toast notifications"
```

---

## Task 10: Update Download for Font Family + Bold/Italic

**Files:**
- Modify: `js/pdfEditorApp.js`

- [ ] **Step 1: Import `StandardFonts` from pdf-lib** — in `downloadPDF()`, update the dynamic import:

```js
const { PDFDocument, rgb, StandardFonts } = await import(
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm'
);
```

- [ ] **Step 2: Add font mapper helper method**:

```js
_getStandardFont(fontFamily, bold, italic) {
  const f = (fontFamily || 'Arial').toLowerCase();
  if (f.includes('times')) {
    if (bold && italic) return 'TimesRomanBoldItalic';
    if (bold)           return 'TimesRomanBold';
    if (italic)         return 'TimesRomanItalic';
    return 'TimesRoman';
  }
  if (f.includes('courier')) {
    if (bold && italic) return 'CourierBoldOblique';
    if (bold)           return 'CourierBold';
    if (italic)         return 'CourierOblique';
    return 'Courier';
  }
  // Arial / Helvetica
  if (bold && italic) return 'HelveticaBoldOblique';
  if (bold)           return 'HelveticaBold';
  if (italic)         return 'HelveticaOblique';
  return 'Helvetica';
}
```

- [ ] **Step 3: Use font mapper in `downloadPDF()`** — replace the text drawing block:

```js
if (element.type === 'text' && element.text) {
  const { r, g, b } = this.hexToRgbValues(element.color);
  const fontName = this._getStandardFont(
    element.fontFamily, element.bold, element.italic
  );
  const font = await pdfDoc.embedFont(StandardFonts[fontName]);
  page.drawText(element.text, {
    x: element.x / s,
    y: origVp.height - element.y / s - element.fontSize / s,
    size: element.fontSize / s,
    font,
    color: rgb(r, g, b)
  });
}
```

- [ ] **Step 4: Verify** — add text "Hello bold", set Bold on. Download PDF. Open in a PDF viewer → text should appear bold with Helvetica Bold font.

- [ ] **Step 5: Commit**

```bash
git add js/pdfEditorApp.js
git commit -m "feat: embed correct StandardFont in PDF for bold/italic/font-family"
```

---

## Task 11: Cache-Bust Version Bump

**Files:**
- Modify: `index.html`, `js/main.js`, `js/pdfEditorApp.js`, `js/textElement.js`, `js/signatureElement.js`

All ES module imports currently end in `?v=2`. Bump to `?v=3` everywhere so the browser loads the updated modules.

- [ ] **Step 1: In `index.html`** change:
```html
<script type="module" src="./js/main.js?v=2"></script>
```
to:
```html
<script type="module" src="./js/main.js?v=3"></script>
```

- [ ] **Step 2: In `js/main.js`** change `?v=2` to `?v=3` in the import.

- [ ] **Step 3: In `js/pdfEditorApp.js`** change all five `?v=2` imports to `?v=3`.

- [ ] **Step 4: In `js/textElement.js`** change `?v=2` to `?v=3`.

- [ ] **Step 5: In `js/signatureElement.js`** change `?v=2` to `?v=3`.

- [ ] **Step 6: Full end-to-end test**
  - Start `python3 -m http.server 8080`, open `http://localhost:8080`
  - Upload `constat-amiable.pdf` → PDF fits the window (no oversized rendering)
  - Two toolbar rows visible, mode badge shows "● SELECT"
  - Add text element → cursor is crosshair → click → text box appears
  - Click the text box border → formatting toolbar activates, shows element values
  - Change font to Times New Roman → text updates live
  - Toggle Bold → text goes bold
  - Press Escape → mode resets
  - Press T → add text mode
  - Press Delete on selected element → element removed
  - Ctrl+Z → element restored
  - Ctrl+Scroll → zoom changes
  - Click ◀◀ → jumps to page 1
  - Type "2" in page input, press Enter → jumps to page 2
  - Add elements, reload page, re-upload same file → restore toast appears, elements back
  - Click Download → "PDF downloaded!" toast, file appears in downloads
  - Zero console errors (other than favicon 404)

- [ ] **Step 7: Commit**

```bash
git add index.html js/main.js js/pdfEditorApp.js js/textElement.js js/signatureElement.js
git commit -m "chore: bump module version to v3 for cache busting"
```

---

## Final state

All features from `docs/superpowers/specs/2026-05-29-pdf-ux-redesign-design.md` implemented:

| Feature | Task |
|---|---|
| Two-row toolbar layout | Task 1 |
| Dynamic zoom (fit-to-width default, +/−, Ctrl+Scroll) | Task 2 |
| Element selection with formatting activation | Task 3 |
| Text formatting (font, bold, italic, size, color) | Task 4 |
| Undo / Redo (50 steps) | Task 5 |
| Keyboard shortcuts | Task 6 |
| First/last page + editable page input | Task 7 |
| localStorage auto-save and restore | Task 8 |
| Mode badge + canvas cursor + toasts | Task 9 |
| Font embedding in downloaded PDF | Task 10 |
| Cache-bust version bump | Task 11 |
