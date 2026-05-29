# PDF Fill & Sign — UI/UX Redesign

**Date:** 2026-05-29  
**Status:** Approved  

## Problem

The app is unusable at first load because the PDF renders at a hardcoded 1.5× scale — too large to read. There is no zoom control, no undo, no keyboard shortcuts, and no visual feedback for the current editing mode.

## Decisions

| Topic | Decision |
|---|---|
| Layout | Enhanced single toolbar (two fixed rows) |
| Zoom control | +/− buttons (±10%) + Fit button + Ctrl+Scroll (±5%) |
| Zoom default | Fit-to-width computed on load |
| Features | All 8 (see below) |
| Toolbar org | Two rows: Row 1 actions, Row 2 formatting + zoom + page nav |

---

## Toolbar Layout

### Row 1 — Actions
```
[📁 Upload PDF]  [↩ Undo]  [↪ Redo]  │  [T Add Text]  [✍ Sign]  │  [⬇ Download]  [🗑 Clear save]     ● SELECT
```

### Row 2 — Formatting + Zoom + Navigation
```
Font: [Arial ▾]  [B]  [I]  [14 ↕]  [■ color]  │  [−]  75%  [+]  [⊡ Fit]  │  [◀◀] [◀] Page 1/4 [▶] [▶▶]
```

**Formatting controls** (font, B, I, size, color) are always rendered but disabled/grayed when no text element is selected. They activate when a text element is selected.

**Page number** is a clickable `<input type="number">` — click to edit, Enter/blur to navigate.

---

## Feature Specifications

### 1. Dynamic Zoom

**On PDF load:**
```js
scale = (containerInnerWidth - 40) / pageWidth  // fit-to-width
```

**Zoom controls:**
- `[−]` / `[+]` — ±10% per click, clamped to [25%, 300%]
- `[⊡ Fit]` — recomputes fit-to-width and re-renders
- `Ctrl+Scroll` — ±5% per wheel tick, `e.preventDefault()` blocks page scroll

After any zoom change: re-render current page, call `renderElements()` to reposition overlays.

### 2. Undo / Redo

History is a stack of `elements[]` snapshots (deep copies via `el.toJSON()`).

**Actions that push to history:**
- Add element
- Delete element  
- Move end (mouseup after drag)
- Resize end (mouseup after resize)
- Text change (debounced 500ms)

**Stacks:** `historyStack[]` (max 50), `redoStack[]`  
Any new action clears `redoStack`.

### 3. Keyboard Shortcuts

```js
document.addEventListener('keydown', (e) => {
  // Escape always works — cancel current mode
  if (e.key === 'Escape') { setMode('select'); return; }

  // All other shortcuts suppressed when focus is inside input/textarea/select
  if (e.target.matches('input, textarea, select')) return;

  switch(true) {
    case e.key === 'Delete' || e.key === 'Backspace':  deleteSelected(); break;
    case e.key === 't' || e.key === 'T':               setMode('addText'); break;
    case e.key === 's' || e.key === 'S':               setMode('addSignature'); break;
    case e.key.startsWith('Arrow'):                    nudgeSelected(e.key, e.shiftKey ? 10 : 1); break;
    case e.ctrlKey && e.key === 'z':                   undo(); break;
    case e.ctrlKey && (e.key === 'y' || (e.key === 'Z')): redo(); break;
    case e.ctrlKey && e.key === 'ArrowRight':          nextPage(); break;
    case e.ctrlKey && e.key === 'ArrowLeft':           prevPage(); break;
  }
});
```

Shift+Arrow nudges 10px instead of 1px for faster movement.

### 4. Visible Element Selection

- `app.selectedElement` — reference to the currently selected `PDFElement` (null = none)
- Clicking a placed element → calls `app.selectElement(el)`:
  - Adds `selected` CSS class (red solid border, no background tint)
  - Activates formatting toolbar if element is `TextElement`
- Clicking canvas background → `app.selectElement(null)`
- Switching pages → deselects

### 5. Text Formatting

`TextElement` gains new properties: `fontFamily`, `bold`, `italic`.

```js
// Defaults
this.fontFamily = options.fontFamily || 'Arial';
this.bold = options.bold || false;
this.italic = options.italic || false;
```

The overlay input's style reflects these:
```js
input.style.fontFamily = this.fontFamily;
input.style.fontWeight = this.bold ? 'bold' : 'normal';
input.style.fontStyle  = this.italic ? 'italic' : 'normal';
```

Formatting toolbar controls update `selectedElement` properties and call `renderElements()`.

**In downloadPDF:** font size and font family are passed to pdf-lib's `drawText`. For bold/italic, pdf-lib's `StandardFonts` includes bold variants (e.g. `HelveticaBold`, `TimesRomanBoldItalic`) — the download function maps `fontFamily + bold + italic` to the closest StandardFont enum value.

### 6. Better Page Navigation

- First/last page buttons (`[◀◀]` / `[▶▶]`) — jump to page 1 / last page
- Page display is an `<input type="number">` — click to type, Enter/blur validates and navigates
- Ctrl+→ / Ctrl+← for next/prev page (keyboard section above)

### 7. Auto-save (localStorage)

**Key format:** `pdf-fill-sign:${file.name}`

**Save trigger:** after every change (add, delete, move, resize, text-change, formatting change).

**Restore on upload:**
1. Match `file.name` against localStorage keys
2. If found and `elements.length > 0`: restore elements, show toast: *"Restored N elements from your last session"*
3. `[🗑 Clear save]` button next to Download deletes the localStorage key for the current file

### 8. Smart Cursor + Mode Indicator

**Mode badge** (right end of Row 1):
```
SELECT mode  → "● SELECT"  (gray pill)
ADD TEXT     → "✚ ADD TEXT" (blue pill)  
SIGNING      → "✍ SIGNING" (blue pill)
```

**Cursor:**
- Canvas, select mode: `default`
- Canvas, add/sign mode: `crosshair`
- Hovering placed element: `move` (set on mouseenter/mouseleave of element div)
- Resize handle: `nwse-resize` (already implemented)

**Toast notifications** (fixed bottom-right, auto-dismiss 3s):
- "Restored N elements from last session" — on localStorage restore
- "PDF downloaded!" — on successful download

Toast is a simple `<div id="toast">` appended to body, shown/hidden via CSS class.

---

## Data Model Changes

### `TextElement` (new fields)
```js
fontFamily: string   // 'Arial' | 'Helvetica' | 'Times New Roman' | 'Courier New'
bold:       boolean
italic:     boolean
```

### `PDFEditorApp` (new fields)
```js
selectedElement: PDFElement | null
historyStack:    Array<ElementSnapshot[]>   // max 50
redoStack:       Array<ElementSnapshot[]>
currentFilename: string                     // for localStorage key
zoomScale:       number                     // replaces hardcoded renderer.scale
```

### `PDFRenderer` (change)
```js
// scale becomes dynamic — set by PDFEditorApp, no longer hardcoded 1.5
scale: number  // mutable, set via setScale(n)
```

---

## Files Changed

| File | Change |
|---|---|
| `index.html` | Two-row toolbar HTML + CSS (zoom, formatting, page nav, toast, mode badge) |
| `js/pdfRenderer.js` | `scale` becomes dynamic; expose `setScale(n)` |
| `js/pdfEditorApp.js` | Zoom logic, undo/redo stacks, keyboard listener, selection, auto-save, toasts, mode badge, formatting apply |
| `js/textElement.js` | `fontFamily`, `bold`, `italic` properties; `applyStyles` updated |
| `js/pdfElement.js` | `selected` state (CSS class helper) |
| `js/interactionHandler.js` | Cursor changes on hover; push to history on drag/resize end |

`signaturePad.js`, `signatureElement.js`, `main.js` — no changes.

---

## Out of Scope

- Image upload (add images to PDF)
- Multi-page thumbnail panel
- Cloud save / export to email
- Mobile touch gestures beyond existing signature pad
