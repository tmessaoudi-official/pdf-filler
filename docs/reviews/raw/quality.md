# QUALITY Agent Report — PDFturbo src/

**Date**: 2026-06-11  
**Scope**: All `.ts` files under `src/` — error handling, dead/unreachable code, duplicated logic, TypeScript type quality, async/await correctness, DOM listener leaks, memory leaks, naming, magic numbers, complexity hotspots, polyfill justification.  
**Tooling**: `npx tsc --noEmit` → **clean**. `npx eslint .` → **clean**.  
**Plan files consulted**: `full-audit-2026-06-07.plan.md`, `live-audit-phase-c.plan.md`.

---

## Severity Summary

| Severity | Count |
|----------|-------|
| P0 | 0 |
| P1 | 4 |
| P2 | 7 |
| P3 | 5 |
| **Total** | **16** |

---

## Per-Defect-Class Tally

| Class | Count |
|-------|-------|
| Swallowed / incomplete error handling | 4 |
| `any` / unsafe casts | 3 |
| Async correctness (floating promise, missing reject) | 4 |
| Memory / resource leak (canvases, listeners) | 2 |
| Duplicate logic | 1 |
| Magic numbers / named constant missing | 1 |
| Naming / complexity | 1 |

---

## P1 Findings

### QUAL-01 · P1 · High confidence
**Class**: Async correctness — floating promise swallowing errors  
**File**: `src/core/pdfEditorApp.ts` lines 1662–1694 (`_insertBlankPage`)

```typescript
void (async () => {
  // ... full page init: applyZoom, thumbnailPanel.render, renderElements, _autosave ...
})();
```

**Why it's wrong**: The IIFE is `void`-ed, so any exception thrown inside (e.g., `applyZoom` rejects, `thumbnailPanel.render` fails) is silently swallowed. There is no `.catch()` and no try/catch. The user gets no toast, no error, and the UI may be left in an inconsistent state (empty state hidden, toolbar enabled, but page not rendered).

**Fix**: Wrap the `async` IIFE body in a try/catch that calls `this.showToast(...)` on failure, or `await` the IIFE at the call site (the method is synchronous, so the simplest fix is an internal try/catch inside the IIFE).

---

### QUAL-02 · P1 · High confidence
**Class**: Async correctness — image conversion promise never rejects  
**File**: `src/core/pdfEditorApp.ts` lines 1793–1807 (`_imagesToPdf`)

```typescript
return new Promise<Uint8Array>((resolve) => {  // ← no `reject` parameter
  const blob = URL.createObjectURL(file);
  const imgEl = new Image();
  imgEl.onload = () => {
    canvas.toBlob((b) => {
      if (b) b.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
      // if b is null → promise hangs forever
    }, 'image/png');
    URL.revokeObjectURL(blob);
  };
  imgEl.src = blob;
  // no imgEl.onerror handler
});
```

Two problems:
1. **No `imgEl.onerror`**: if the image fails to decode (corrupt file, unsupported format like `.bmp`), the promise never settles — `_imagesToPdf` hangs, `handleFileUpload` never exits its try block, and `_isLoading` stays `true` forever (the app deadlocks until reload).
2. **`toBlob` null case not rejected**: if `canvas.toBlob` returns `null` (privacy mode, low memory), the inner promise hangs silently. The outer `b.arrayBuffer().then(...)` floating chain also swallows any `arrayBuffer()` rejection.

**Fix**:
```typescript
return new Promise<Uint8Array>((resolve, reject) => {
  const blob = URL.createObjectURL(file);
  const imgEl = new Image();
  imgEl.onerror = () => { URL.revokeObjectURL(blob); reject(new Error(`Failed to decode: ${file.name}`)); };
  imgEl.onload = () => {
    canvas.toBlob((b) => {
      if (!b) { reject(new Error('canvas.toBlob returned null')); return; }
      b.arrayBuffer().then(ab => resolve(new Uint8Array(ab)), reject);
    }, 'image/png');
    URL.revokeObjectURL(blob);
  };
  imgEl.src = blob;
});
```

---

### QUAL-03 · P1 · High confidence
**Class**: Async correctness — floating `.then()` chain in `_rasterizePageWithRedactions`  
**File**: `src/core/pdfEditorApp.ts` line 2760

```typescript
blob.arrayBuffer().then(ab => resolve(new Uint8Array(ab)));
```

Inside a `new Promise<Uint8Array>((resolve, reject) => ...)`, the `.then()` result is not chained with `.catch(reject)`. If `arrayBuffer()` rejects (e.g., blob is detached or GC'd before the microtask runs), the outer promise hangs forever — the export PDF function stalls with the opacity overlay at `0.4` and the user must reload.

**Fix**: `blob.arrayBuffer().then(ab => resolve(new Uint8Array(ab)), reject);`

---

### QUAL-04 · P1 · High confidence
**Class**: Swallowed error — `_doAutosave` silently discards non-quota errors  
**File**: `src/core/pdfEditorApp.ts` lines 1500–1505

```typescript
} catch (err) {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    this.showToast(t('toast.storageFull'), 8000);
  }
  // Other errors (IDB unavailable in private browsing etc.) — silently skip
}
```

**Why it's wrong**: The comment says "silently skip" for other errors, but this catch block catches *all* thrown errors, including programming bugs (e.g., `saveState` called with a non-serialisable `Uint8Array` mutation) and unexpected `IDBObjectStore` transaction errors. There is no logging at all for the non-quota branch. If autosave silently fails due to a transient IDB error the session is lost on reload with no diagnostic information.

**Severity justification**: Autosave is the primary data-loss prevention mechanism. Silent failures here are a data-integrity risk, not merely a UX annoyance.

**Fix**: Add `console.warn('[_doAutosave] non-quota error:', err);` in the else branch so it is at least visible in devtools. The comment-only suppression is insufficient for production use.

---

## P2 Findings

### QUAL-05 · P2 · High confidence
**Class**: Duplicated logic — two identical base64 decode helpers  
**File**: `src/core/pdfEditorApp.ts` lines 3066–3071 vs. 3321–3328

```typescript
// _dataUrlToUint8Array (line 3066) — NO null guard:
private _dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);         // ← crashes if split(',')[1] is undefined
  ...
}

// _dataUrlToBytes (line 3321) — HAS null guard:
private _dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('Invalid data URL: no base64 payload');
  ...
}
```

Two methods with identical bodies except `_dataUrlToUint8Array` lacks the null guard that `_dataUrlToBytes` has. If ink export produces a malformed data URL, `_dataUrlToUint8Array` throws `atob(undefined)` — a confusing `InvalidCharacterError` rather than a clear message.

**Fix**: Delete `_dataUrlToUint8Array`, rename all 5 call sites to `_dataUrlToBytes`.

---

### QUAL-06 · P2 · High confidence
**Class**: `any` type — pdf-lib parameters typed as `any` throughout export path  
**File**: `src/core/pdfEditorApp.ts` lines 2677, 2681, 2683, 3134, 3276, 3302

```typescript
private async _rasterizePageWithRedactions(
  srcDoc: any, docPage: ..., elements: ...,
  pdfDoc: any,
  libs: { rgb: any; StandardFonts: any; degrees: any },
```

**Why it's wrong**: The `any` types bypass compile-time checks on the pdf-lib API surface. A rename or signature change in `@cantoo/pdf-lib` would not surface as a TS error — the first symptom would be a runtime crash during export. Since pdf-lib is a dynamic import (`await import('@cantoo/pdf-lib')`), partial types are importable via `import type { PDFDocument, PDFPage, ... }`.

**Fix**: Import `PDFDocument`, `PDFPage`, `PDFFont`, `RGB`, `StandardFonts`, `Degrees` as types from `@cantoo/pdf-lib` and replace the `any` annotations. A `PDFDocumentLib` interface wrapping the dynamic destructure can stand in for the full `typeof PDFDocument` where needed.

---

### QUAL-07 · P2 · High confidence
**Class**: Async correctness — floating promise in thumbnail lazy-load  
**File**: `src/core/pageThumbnailPanel.ts` line 71

```typescript
this.renderer.generateThumbnail(i).then(url => {
  if (url) { this._thumbCache.set(page.id, url); img.src = url; }
});
```

No `.catch()` handler. If `generateThumbnail` rejects (pdf.js error on a corrupt page, memory pressure), the rejection is unhandled — this produces a `UnhandledPromiseRejection` in Node/Deno environments and a console warning in Chrome. In the browser it is silent but leaves the thumbnail as the blank placeholder forever.

**Fix**: Add `.catch(() => { /* leave blank placeholder */ })` or a dev-mode `console.warn`.

---

### QUAL-08 · P2 · Medium confidence
**Class**: `any` cast — history command property access via `as any`  
**File**: `src/core/historyManager.ts` lines 96, 102, 117, 123

```typescript
const el = this.elements.find(e => e.id === this.elementId) as any;
if (el) el.text = this.after;
```

Used in `TextEditCmd` and `FillColorCmd`. The comment acknowledges this avoids a circular import, but `text` and `fillColor` are defined on concrete subclasses (`TextElement`, `ShapeElement`). The `as any` means mistyping the property name (e.g., `el.txt`) silently compiles.

**Fix**: Extract a minimal interface `{ text?: string }` / `{ fillColor?: string | undefined }` to an `src/types/element-traits.ts` file, eliminating the circular import while preserving type safety.

---

### QUAL-09 · P2 · High confidence
**Class**: Swallowed error — `catch { }` empty block in `_getPageCropBox`  
**File**: `src/core/pdfEditorApp.ts` line 3128

```typescript
try {
  const cb = page.getCropBox?.();
  if (cb && typeof cb.width === 'number') return { x: cb.x, y: cb.y, width: cb.width, height: cb.height };
} catch { /* no CropBox */ }
```

**Why it's wrong**: Any exception from `getCropBox()` — including programming errors like `TypeError` if the page object is malformed — is silently caught and falls through to the `getSize()` call. This masks unexpected errors during export. The comment implies it only expects a "no CropBox" result but the catch is overbroad.

**Fix**: `catch (err) { if (process.env.NODE_ENV !== 'production') console.debug('[getCropBox]', err); }` — or narrow the catch to the known exception type if pdf-lib documents one.

---

### QUAL-10 · P2 · High confidence
**Class**: Swallowed error — `catch { }` in `downloadPage` inner loop  
**File**: `src/core/pdfEditorApp.ts` line 2948

```typescript
catch { exportErrors.push(`${element.type} (id ${element.id})`); }
```

Same pattern exists in `downloadPDF` (line ~2862) and `_rasterizePageWithRedactions` (line 2711). Each swallows the actual exception object. The user toast reports which elements failed but gives no root cause — the error is thrown away. This makes debugging export failures impossible without patching the code.

**Fix**: `catch (err) { exportErrors.push(...); console.warn('[export element]', element.type, element.id, err); }`

---

### QUAL-11 · P2 · Medium confidence
**Class**: Resource leak — canvases created in `_renderInkForExport` accumulate on heavy use  
**File**: `src/core/pdfEditorApp.ts` lines 3084–3121; also `src/core/inkLayer.ts` line 85; `src/handlers/textEditHandler.ts` line 67

```typescript
const c = document.createElement('canvas');
c.width  = Math.round(W_orig * SCALE);
c.height = Math.round(H_orig * SCALE);
```

These off-screen canvases are used locally and go out of scope, which in principle makes them eligible for GC. However, in Chrome/Firefox, large canvases (2× export scale on an A3 PDF = ~4000×5600 px = ~85 MB of pixel data) can hold GPU-backed surfaces that are not immediately released when the JS reference drops. On multi-page exports with redactions, `_rasterizePageWithRedactions` creates one offscreen canvas per page. On a 20-page document this is 20× 85 MB GPU allocations — potentially 1.7 GB — held until the next GC cycle.

**Why it matters**: On mobile or low-memory desktops this triggers OOM crashes or GPU context loss. The fix is `offscreen.width = 0; offscreen.height = 0;` immediately after use (forces browser to release GPU backing store before GC).

**Note**: This is not a hard leak (references do eventually drop), but on realistic document sizes it causes measurable memory pressure.

---

## P3 Findings

### QUAL-12 · P3 · High confidence
**Class**: Magic numbers without named constants  
**File**: `src/core/pdfEditorApp.ts` lines 1638, 3169

```typescript
w = Math.round(mmH * 2.8346);   // mm → pt conversion factor
const rawAnchor = tp(te.x, te.y + te.fontSize * 0.9 + i * lineHeight);
```

`2.8346` (mm-to-points), `0.9` (baseline ascent ratio), `1.2` (line-height multiplier), `595`/`842` (A4 pt dimensions) appear inline without named constants. The comment on `0.9` is present (`// 0.9 = measured Arial fontBoundingBoxAscent/fontSize ratio`) but not on others.

**Fix**: `const MM_TO_PT = 2.8346` etc. as module-level constants. The `0.9` ascent ratio especially deserves a named constant since it embodies a measured calibration.

---

### QUAL-13 · P3 · Medium confidence
**Class**: `any` cast — `as any` used to bypass i18next's type-safe `t()` signature  
**File**: `src/utils/i18n.ts` line 17

```typescript
return String(i18next.t(key as any, opts as any));
```

**Why**: i18next's TypeScript integration expects typed key literals. The cast works but disables key-typo detection at compile time. Every call to `t('toast.nonExistentKey')` compiles without error.

**Fix**: Either configure i18next's TypeScript plugin to use the locale JSON as the type source (full fix), or type the wrapper as `key: string` explicitly so the cast documents its intent (`// untyped: i18n keys are runtime strings`).

---

### QUAL-14 · P3 · Low confidence
**Class**: Listener accumulation in `renderElements`  
**File**: `src/core/pdfEditorApp.ts` lines 2386–2406

`renderElements()` is called very frequently (every undo, redo, mode change, element add/remove). Each call does `this.ui.container.innerHTML = ...` equivalent teardown then `appendChild(div)`. Each newly created `div` gets a fresh `addEventListener('input', ...)` listener. The old `div`s are GC'd taking their listeners with them — so this is not a classic leak.

**However**: if `renderElements` is called during an active `input` event (e.g., via `_autosave` → `renderElements` called from a debounce that fires during rapid typing), the element's DOM node is destroyed mid-event. This can cause the `input` listener to reference a detached element.

**Confidence**: Low — requires a very tight timing window. Not confirmed to trigger in practice.

---

### QUAL-15 · P3 · High confidence
**Class**: `SignaturePad` listeners registered but never removed  
**File**: `src/utils/signaturePad.ts` lines 22–26

```typescript
this.canvas.addEventListener('pointerdown', (e) => this._startDrawing(e));
this.canvas.addEventListener('pointermove', (e) => this._draw(e));
// ... 3 more
```

Five anonymous arrow functions registered on `this.canvas`. No `destroy()` method exists. If the signature modal is ever reconstructed (e.g., future feature: multiple signature pads), each construction doubles the listener count. Currently there is exactly one `SignaturePad` constructed once in `PdfEditorApp`'s constructor and never recreated — so this is not an active leak, but the class has no cleanup path.

**Fix**: Store handler references and add `destroy(): void` that calls `removeEventListener` for each.

---

### QUAL-16 · P3 · High confidence
**Class**: `_dataUrlToUint8Array` lacks null guard (sub-issue of QUAL-05)  
**File**: `src/core/pdfEditorApp.ts` line 3067

```typescript
const base64 = dataUrl.split(',')[1];
const binary = atob(base64);  // throws InvalidCharacterError if base64 is undefined
```

The ink export path (`_renderInkForExport` → `_dataUrlToUint8Array`) calls this on `canvas.toDataURL()` output. If `canvas.toDataURL()` returns `'data:,'` (empty canvas on a page with no ink — but `inkLayer.getStrokes` checks `length > 0` so the guard is elsewhere), the `atob(undefined)` throws. The check above in `_renderInkForExport` prevents the empty-canvas case, but defensive coding is better than relying on all callers to guard correctly.

Already covered by QUAL-05 (delete `_dataUrlToUint8Array`, use `_dataUrlToBytes` which has the null guard). Listed separately for traceability.

---

## Polyfill Justification — `src/utils/polyfills.ts`

**Verdict: Justified.**  
The file polyfills `Math.sumPrecise` (TC39 proposal, Chrome/Edge 137+). The comment precisely states the requirement: pdfjs-dist 6.x uses `Math.sumPrecise` for ToUnicode font lookups; without it, subset-font PDFs render as garbled text on Chrome ≤136 and all Firefox versions. The Neumaier compensated summation implementation is algorithmically correct. The `interface MathWithSumPrecise` pattern avoids `as any`. No concerns.

---

## What Is GOOD

- **Blob URL hygiene is excellent**: every `createObjectURL` call site has a matching `revokeObjectURL` in the same scope or a well-structured finally/callback — no persistent blob URL leaks detected.
- **Error catch in `storage.ts`**: `loadState` and `clearState` correctly suppress all errors (IndexedDB unavailable in private mode is expected); `saveState` correctly re-throws `QuotaExceededError` while swallowing others — appropriate for a best-effort autosave.
- **Race condition guard in `_doAutosave`**: the `QuotaExceededError` toast is correctly surfaced, and `_isLoading` guards prevent concurrent file uploads during session restore (QUAL-04 is about silent logging, not the logic itself, which was fixed per the plan).
- **Timer management**: all four `setTimeout` handles are properly typed as `ReturnType<typeof setTimeout>` and cleared with `clearTimeout` before reassignment — no timer leaks.
- **`TextSearchHandler` LRU cache**: clean bounded-size Map with correct promotion-on-access and eviction pattern — no unbounded growth.
- **`_renderPdfPage` render queue**: the single-slot pending-page queue with `_pendingResolve` correctly prevents concurrent renders and resolves stale waiters — solid async coordination.
- **`focusTrap`**: the only utility that explicitly calls `removeEventListener` — well-designed cleanup contract.
- **TypeScript strict compliance**: zero `tsc --noEmit` errors, zero ESLint errors — the codebase is in clean compilable state.
- **`polyfills.ts`**: minimal, well-documented, algorithmically sound, no `any` casts — exemplary polyfill pattern.
