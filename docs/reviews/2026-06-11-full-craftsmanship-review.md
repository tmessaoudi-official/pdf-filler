# PDFturbo — Full Craftsmanship Review
**Date:** 2026-06-11  
**Synthesized from:** 5 specialist agents (arch, quality, test-build, docs, security)  
**Spot-verified by:** synthesis agent (5 adversarial checks — see §Verification Appendix)

---

## Executive Summary

PDFturbo is a well-functioning single-developer PWA PDF editor with a clean data model, strong element-layer testing, and zero npm audit vulnerabilities. The codebase compiles and lints cleanly. Its primary structural liability is a 3,375-line god class (`pdfEditorApp.ts`) that hosts 23+ responsibilities and has 0% test coverage — any regression in the core application layer is undetectable by the current suite. Four async-correctness bugs can cause silent data loss or permanent app deadlock on corrupted inputs. Two orphan dependencies ship dead weight to every user. Documentation is mostly accurate but has two P1 gaps (wrong source path in CONTRIBUTING.md, three missing production packages in THIRD-PARTY-NOTICES). The codebase is in a solid v1 state; the gaps identified here represent a targeted remediation backlog rather than fundamental design failures.

---

## Scorecard

| Dimension | Grade | Justification |
|---|---|---|
| **Architecture** | C+ | 3,375-line god class with 23+ responsibilities; handlers coupled to 18 app paths; export pipeline triplicated; strong sub-systems (Command pattern, DocumentModel) save from a D |
| **Code Quality** | B− | Clean tsc/eslint; 4 P1 async bugs (promise hangs/data loss); 2 duplicate helpers; good blob/timer hygiene throughout |
| **Tests & CI** | D+ | 382 tests all pass; 18.57% coverage invisible to CI; 3,375-line core class at 0%; inline-copied coord logic creates false-green regression trap |
| **Documentation** | B− | Privacy pages excellent; i18n complete; 2 P1 gaps (wrong source path, missing THIRD-PARTY entries); QR/Fill Bucket undocumented in README |
| **Security & Deps** | B | 0 npm audit vulns; CSP correct; 2 dead orphan deps bloating bundle; latent XSS pattern from `escapeValue:false`+innerHTML; silent SW auto-reload is a UX risk |

---

## P1 Findings (Full Detail)

### P1-01 · `_imagesToPdf` promise never rejects — app deadlock on bad image input
**IDs:** QUAL-02 (quality.md) ≡ ARCH-11 (arch.md) — **MERGED** · **✓ verified** (source read, confirmed no `onerror`, no `reject` param)  
**File:line:** `src/core/pdfEditorApp.ts:1793–1807`  
**Impact:** If a user uploads a corrupted or unsupported image (`.bmp`, partial JPEG), `imgEl.onerror` is never fired, the `Promise<Uint8Array>` constructor uses only `resolve` (no `reject`), and the promise hangs forever. `handleFileUpload` never exits its try-block; `_isLoading` stays `true`; the app is deadlocked until browser reload. `canvas.toBlob` returning `null` (private browsing, low memory) causes the same hang. Blob URL is never revoked — memory leak on top of deadlock.  
**Fix:**
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
**Effort:** S

---

### P1-02 · `_rasterizePageWithRedactions` floating `.then()` — export stalls on blob GC
**ID:** QUAL-03 (quality.md)  
**File:line:** `src/core/pdfEditorApp.ts:2760`  
**Impact:** Inside `new Promise<Uint8Array>((resolve, reject) => ...)`, the chain `blob.arrayBuffer().then(ab => resolve(...))` has no `.catch(reject)`. If the blob is GC'd or detached between the microtask queuing and execution, `arrayBuffer()` rejects but the outer promise hangs forever — the export overlay stays at 40% opacity and the user must reload.  
**Fix:** `blob.arrayBuffer().then(ab => resolve(new Uint8Array(ab)), reject);`  
**Effort:** S (one character change)

---

### P1-03 · `pdfEditorApp.unit.test.ts` never imports `PDFEditorApp` — 3,375 lines at 0% coverage
**ID:** TEST-01 (test-build.md) · **✓ verified** (grep across all test files finds zero `PDFEditorApp` import)  
**File:line:** `tests/core/pdfEditorApp.unit.test.ts:1–479`  
**Impact:** The 3,375-line core class has zero test coverage. All 150+ methods — `handleFileUpload`, `_restoreSession`, `downloadPDF`, `renderElements`, all tool mode logic — are invisible to the test suite. Any regression goes undetected. The test file name is actively misleading: it tests standalone element classes and inline-copied coordinate math, not the app.  
**Fix:** Option A (preferred): extract `_transformPoint`/`_inverseTransformPoint` to `src/utils/coordinateTransform.ts` (exported functions), import in both `pdfEditorApp.ts` and the test. Option B: refactor the test file to actually instantiate a minimal `PDFEditorApp` with a JSDOM-mocked DOM. Delete the inline function copies.  
**Effort:** M

---

### P1-04 · Inline-copied coordinate logic in tests — production fix won't be caught
**ID:** TEST-02 (test-build.md)  
**Files:lines:** `tests/core/pdfEditorApp.unit.test.ts:307–343`, `tests/core/exportCoords.test.ts:20–35`  
**Impact:** Both test files redefine `_transformPoint`/`_inverseTransformPoint` locally. A regression introduced in the production function at `pdfEditorApp.ts:1354` (the single most critical calculation — all element positioning and export accuracy) would leave all these tests green. A silent regression in element coordinates would reach users undetected.  
**Fix:** Same as P1-03: extract to `src/utils/coordinateTransform.ts`. Both test files and `pdfEditorApp.ts` import from there. Delete all inline copies.  
**Effort:** M (same extraction, shared fix with P1-03)

---

### P1-05 · No `test:coverage` script; 18.57% coverage invisible to CI and developers
**ID:** TEST-03 (test-build.md)  
**File:line:** `package.json` (scripts), `vitest.config.ts`  
**Impact:** `package.json` has no `test:coverage` script. CI runs only `npm run test` (bare test run). The 18.57% overall coverage figure is never surfaced. Additionally, `npx vitest run --coverage` fails on Node v27 nightly (system vitest path issue); only `node ./node_modules/.bin/vitest run --coverage` works. Coverage thresholds are configured in `vitest.config.ts` but never enforced.  
**Fix:**
```json
"test:coverage": "node ./node_modules/.bin/vitest run --coverage"
```
Add to `package.json` scripts. Add coverage thresholds to `vitest.config.ts` (starting just below current to establish a floor). Add `npm run test:coverage` to CI after `npm run test`.  
**Effort:** S

---

### P1-06 · THIRD-PARTY-NOTICES.md missing 3 production packages (incl. primary export engine)
**IDs:** DOC-01 (docs.md) ≡ SEC-04 (security.md) — **MERGED**  
**File:line:** `THIRD-PARTY-NOTICES.md`  
**Impact:** Three actively-imported production dependencies are absent from legal notices: `@cantoo/pdf-lib` v2.7.1 (MIT, the primary PDF export engine — 5 dynamic imports), `bwip-js` v4.11.1 (MIT, barcode rendering), `qr-code-styling` v1.9.2 (MIT, styled QR). All MIT licenses require copyright-notice attribution in distributions. Additionally, `pdfjs-dist` (Apache-2.0) is listed but the NOTICE file content is not included (Apache-2.0 requires the full NOTICE). The notices file also erroneously lists `pdf-lib@1.17.1` (unused orphan dep — see P2-01) as if it is shipped.  
**Fix:** Add entries for the three missing packages. Remove `pdf-lib` entry. Add pdfjs-dist NOTICE content. Consider `license-checker` or `generate-license-file` in CI to auto-generate going forward.  
**Effort:** S

---

### P1-07 · CONTRIBUTING.md references nonexistent `js/` directory
**ID:** DOC-02 (docs.md) · **✓ verified** (`grep js/ CONTRIBUTING.md` → lines 43 and 64 both reference `js/`; no `js/` directory exists — actual source is `src/`)  
**File:line:** `CONTRIBUTING.md:43,64`  
**Impact:** Any contributor following CONTRIBUTING.md to find source files will be sent to a directory that does not exist. The Project Structure section lists `js/` with the note "TypeScript source modules (one class per file)". The actual layout is `src/core/`, `src/elements/`, `src/handlers/`, `src/utils/`. Secondary issue: no CLA statement despite All Rights Reserved license — PR authors retain copyright over submitted code.  
**Fix A:** Replace all `js/` references with `src/` throughout CONTRIBUTING.md (including subdirectory listing).  
**Fix B:** Add: "By opening a pull request you agree that your contribution is assigned to Takieddine Messaoudi under the project's All Rights Reserved license."  
**Effort:** S

---

### P1-08 · `_doAutosave` silently discards non-quota errors — data-loss path with no diagnostic
**ID:** QUAL-04 (quality.md)  
**File:line:** `src/core/pdfEditorApp.ts:1500–1505`  
**Impact:** The catch block surfaces only `QuotaExceededError` as a toast. All other exceptions (IDB unavailable in private browsing, transaction errors, serialisation bugs) are silently swallowed with no logging. Since autosave is the primary data-loss prevention mechanism, a silent IDB failure leaves the user with no indication their session is not being persisted. The session is lost on page reload with no diagnostic in devtools.  
**Fix:** Add `console.warn('[_doAutosave] non-quota error:', err);` in the else branch.  
**Effort:** S (one line)

---

## P2 Findings (Compact)

### P2-01 · Orphan dep `pdf-lib@1.17.1` + orphan dep `qpdf-wasm@0.1.0` — dead weight in bundle
**IDs:** SEC-01 (security.md) + SEC-03 (security.md) · **SEC-01 ✓ verified** (zero `from 'pdf-lib'` in src/) · **SEC-03 ✓ verified** (zero `qpdf` references in src/, tests/, or index.html)  
`pdf-lib@1.17.1` is in `package.json` but never imported — all PDF work uses `@cantoo/pdf-lib`. It adds ~100KB to the bundle and will generate false `npm audit` hits. `qpdf-wasm@0.1.0` is similarly unreferenced; its WASM binary (~2MB) may enter the SW precache (6MB limit). Both should be removed. `@cantoo/pdf-lib` already handles PDF encryption (lines 1605–1607), making qpdf-wasm redundant.  
**Fix:** Remove both from `package.json`. Run `npm install`. Verify bundle size drops.  
**Effort:** S

### P2-02 · `escapeValue: false` + `innerHTML` — latent XSS pattern
**ID:** SEC-02 (security.md)  
`i18n.ts:70` disables HTML escaping globally. `pageThumbnailPanel.ts:166` writes `t(...)` output into `innerHTML`. Today's translation keys are static (safe), but the pattern is one dynamic interpolation away from stored XSS. A future key using `file.name` routed to `innerHTML` would execute `<img onerror=...>` payloads from malicious filenames.  
**Fix:** (1) Change `pageThumbnailPanel.ts:166` to `createElement`+`textContent` pattern. (2) Re-enable `escapeValue: true` in `i18n.ts`.  
**Effort:** S

### P2-03 · `QUAL-01` — `_insertBlankPage` IIFE void-ed, errors silently swallowed
**ID:** QUAL-01 (quality.md)  
`src/core/pdfEditorApp.ts:1662–1694`: `void (async () => { ... })()` with no `.catch()` or internal `try/catch`. Any rejection (from `applyZoom`, `thumbnailPanel.render`, `_autosave`) is lost; the UI is left enabled but the page may not be rendered. The user sees nothing.  
**Fix:** Add `try { ... } catch (err) { this.showToast(t('toast.errorGeneric')); console.error(err); }` inside the IIFE.  
**Effort:** S

### P2-04 · Two duplicate `_dataUrlToUint8Array` / `_dataUrlToBytes` helpers; unsafe one lacks null guard
**ID:** QUAL-05 + QUAL-16 (quality.md)  
`src/core/pdfEditorApp.ts:3066` (`_dataUrlToUint8Array`) and `3321` (`_dataUrlToBytes`) are near-identical. The first lacks the null guard on `split(',')[1]`, throwing `atob(undefined)` as a confusing `InvalidCharacterError` rather than a clear message.  
**Fix:** Delete `_dataUrlToUint8Array`. Rename 5 call sites to `_dataUrlToBytes`.  
**Effort:** S

### P2-05 · Silent mid-session SW auto-reload — user loses in-progress work
**ID:** SEC-05 (security.md)  
`vite.config.ts:12` uses `registerType: 'autoUpdate'`. The built `sw.js` confirms `skipWaiting`+`clientsClaim`. A new deployment silently reloads the user's tab mid-session with no warning. The 800ms autosave debounce window + any mid-stroke state means data loss is possible, and the surprise reload erodes trust for a tool handling sensitive documents.  
**Fix:** Switch to `registerType: 'prompt'`, implement `onNeedRefresh` handler showing a dismissable toast "A new version is available — reload when ready".  
**Effort:** S

### P2-06 · CI has no `pull_request` trigger — tests never gate pre-merge
**ID:** TEST-04 (test-build.md)  
`.github/workflows/deploy.yml:3–6` triggers only on `push: master` and `workflow_dispatch`. No `pull_request` trigger exists. `concurrency: cancel-in-progress: true` means rapid pushes can skip CI entirely.  
**Fix:** Add `pull_request: branches: [master]` to workflow triggers.  
**Effort:** S (3 lines of YAML)

### P2-07 · No `npm audit` step in CI; coverage thresholds never enforced
**ID:** TEST-05 (test-build.md)  
CI never runs `npm audit` — known CVEs in dependencies would silently ship. No coverage gate exists (TEST-03 fix provides the script; this finding tracks the CI wiring).  
**Fix:** Add `npm audit --audit-level=high` and `npm run test:coverage` to the CI job once TEST-03 is fixed.  
**Effort:** S

### P2-08 · README.md eraser description wrong + 2 implemented features missing
**IDs:** DOC-03 + DOC-04 (docs.md)  
README claims eraser "deletes any element by brushing over it" — false, it only erases canvas ink strokes. QR/Barcode tool and Fill Bucket tool are fully implemented (keyboard shortcuts Q and B, covered in FEATURES.md §39–40) but absent from README.  
**Fix:** Correct eraser description. Add two bullet points for QR/Barcode and Fill Bucket.  
**Effort:** S

### P2-09 · History commands hold live array reference — latent silent undo/redo failure
**ID:** ARCH-13 (arch.md)  
`historyManager.ts` commands hold `private elements: PDFElement[]` — the live reference. `handleFileUpload` and `_closeDocument` replace the array (`this.elements = []`), then call `historyManager.clear()`. If `clear()` is ever skipped or reordered, stale commands silently do nothing on undo/redo. Not currently broken, but the pattern is fragile.  
**Fix:** Replace `this.elements = []` with `this.elements.splice(0)` to mutate in-place, preserving the reference held by commands.  
**Effort:** S

### P2-10 · `pageThumbnailPanel.ts` (187 lines) and `uiController.ts` (477 lines) have 0% coverage
**ID:** TEST-10 partial (test-build.md)  
UIController maps 477 lines of DOM ID references — a renamed `id` in `index.html` silently produces `undefined` refs that crash the app. A single smoke test with JSDOM + `index.html` would catch this class of regression. `pageThumbnailPanel` is called on every page operation with zero coverage.  
**Fix:** Add `UIController` smoke test (JSDOM instantiation). Add basic `PageThumbnailPanel` render tests.  
**Effort:** M

### P2-11 · `floating thumbnail lazy-load promise; `textSearchHandler` missing 4 coverage branches
**IDs:** QUAL-07 + TEST-09 (quality.md + test-build.md)  
`pageThumbnailPanel.ts:71` floating `.then()` with no `.catch()` — `generateThumbnail` rejection is unhandled. `textSearchHandler.ts`: `caseSensitive`, `useRegex`, `clearCache`, and `invalidatePage` code paths have zero tests.  
**Fix:** Add `.catch(() => { /* blank placeholder */ })` to thumbnail. Add 4 test cases to `textSearchHandler.test.ts`.  
**Effort:** S

---

## P3 Findings (One-liners)

| ID | Origin | Finding |
|---|---|---|
| P3-01 | ARCH-01 | 3,375-line god class — extract ExportManager, SessionManager, FindBarController, ModalController, PageStructureManager, coordinate math module |
| P3-02 | ARCH-02 | Handlers coupled to 18 PDFEditorApp paths; replace with `AppContext` interface in handlers constructors |
| P3-03 | ARCH-03 | Export pipeline triplicated (~170 lines); extract `_buildPagePdf()` shared helper |
| P3-04 | ARCH-04 | `setupEventListeners()` is 684 lines — split into 6 thematic `_wire*()` sub-methods |
| P3-05 | ARCH-05 | `PageThumbnailPanel` constructed 3 times with identical 14-line config; extract `_createThumbnailPanel()` factory |
| P3-06 | ARCH-06 | `PDFElement._nextId` mutated directly from pdfEditorApp; add `PDFElement.allocateId()` |
| P3-07 | ARCH-07 | `setMode('addSignature')` has hidden side effect of opening signature modal; move to explicit call sites |
| P3-08 | ARCH-09 | `renderElements()` full teardown+rebuild every call — focus loss, double-listener risk; introduce keyed rendering with `Map<id, HTMLDivElement>` |
| P3-09 | ARCH-10 / QUAL-06 | Export pipeline uses `any` for pdf-lib types; add typed stubs in `src/utils/pdfLibTypes.ts` |
| P3-10 | ARCH-12 | `_pendingModeAfterBlankPage` typed as `string` not `ToolMode | null`; not cleared on modal cancel |
| P3-11 | QUAL-03 (ARCH-09 sub) | `renderElements()` text-input listener re-attached every call; keyed render (P3-08) fixes this |
| P3-12 | QUAL-08 | `historyManager.ts:96,102,117,123` uses `as any` for element property access; extract `element-traits.ts` interfaces |
| P3-13 | QUAL-09 | `_getPageCropBox` catch block is overbroad — silently swallows all exceptions including TypeErrors |
| P3-14 | QUAL-10 | Export element error loops discard the exception object; add `console.warn` for debuggability |
| P3-15 | QUAL-11 | Offscreen canvases for export not explicitly released (`width=0`) — potential GPU memory pressure on 20+ page exports |
| P3-16 | QUAL-12 | `2.8346`, `0.9`, `595`/`842` magic numbers; extract `MM_TO_PT`, `BASELINE_ASCENT_RATIO`, `A4_PT_*` constants |
| P3-17 | QUAL-13 | `i18n.ts:17` uses `key as any` to bypass i18next type-safe `t()` — key typos undetectable |
| P3-18 | QUAL-15 | `SignaturePad` has no `destroy()` method — 5 anonymous listeners never removed; safe today, latent if ever re-constructed |
| P3-19 | TEST-04 | CI `concurrency: cancel-in-progress: true` can skip intermediate commits entirely |
| P3-20 | TEST-06 | `pdfEditorApp.unit.test.ts` tests both "old buggy" and "fixed" inline copies — confusing meta-tests; delete buggy copies |
| P3-21 | TEST-07 | No `.nvmrc` or `engines` field; CI uses Node 24, local uses Node 27 nightly; coverage toolchain breaks |
| P3-22 | TEST-08 | `elements.render.test.ts:199,215,247` use `toBeTruthy()` for style properties — won't catch wrong color values |
| P3-23 | TEST-11 | `tsconfig.json` missing `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` |
| P3-24 | TEST-13 | `CacheFirst` runtime cache for JS chunks conflicts with `autoUpdate` SW — stale JS up to 30 days |
| P3-25 | TEST-14 | PWA icon uses deprecated `"any maskable"` combined purpose — should be two separate entries |
| P3-26 | TEST-15 | `tests/setup.ts` DOMMatrix stub assumes identity-only — misleading for future canvas math tests |
| P3-27 | DOC-05 | VISION.md lists QR code + 2 enhancements as future work — all already shipped |
| P3-28 | DOC-06 | CODE_REVIEW.md all `js/` paths invalid post-rename; archive to `docs/reviews/archive/` |
| P3-29 | DOC-07 | `locales/ar.json` orphan `_note` developer comment key — remove before production |
| P3-30 | DOC-08 | 13 dead i18n keys (colors.* ×10, toolbar.commentLabel, toolbar.highlightLabel, formatting.shapeLabel) |
| P3-31 | DOC-09 | FEATURES.md §29 uses obsolete "✕ Clear Save" — actual button is "↺ Reset Session" |
| P3-32 | DOC-10 | CODE_OF_CONDUCT.md directs harassment reports to public GitHub issues — should be private email |
| P3-33 | DOC-12 | FEATURES.md (internal QA checklist) named as if it's a user feature list — rename or add header |
| P3-34 | DOC-13 | 5 completed plans not archived in `docs/plans/archive/` |
| P3-35 | SEC-06 | GitHub Actions pinned by tag not SHA — supply chain risk |
| P3-36 | SEC-07 | No Dependabot/Renovate — security patches require manual `npm update` |
| P3-37 | SEC-08 | `style-src: 'unsafe-inline'` in meta-CSP — architecturally unavoidable on GitHub Pages; document the constraint |
| P3-38 | SEC-09 | `window.app` exposes full app object including `_exportPassword` and raw PDF bytes in production builds |
| P3-39 | SEC-10 | User-supplied regex search has no complexity guard — catastrophic backtracking can freeze the browser tab |

---

## [KNOWN] Items (tracked in docs/plans/full-audit-2026-06-07.plan.md)

The following were previously identified and tracked:

- **BUG-09 (`_restoreSession` race)** — `full-audit-2026-06-07.plan.md §GAP-3` — marked DONE in Phase A. ARCH agent notes the `_isLoading` guard with `finally` block is now in place; no new finding.
- **BUG-01 (element visual distortion on rotation)** — tracked in Phase B, marked DONE (commit 77d34e5). Current review found no regression.
- **GAP-1 (redaction security)** — confirmed RESOLVED in plan. SEC agent re-confirmed: rasterization approach is architecturally sound.
- **BUG-05 (export preview toggle)** — Phase A DONE.
- **P1-01 (`_imagesToPdf` no `onerror`)** — **NOT previously tracked** in the plan. New finding.

---

## What Is Genuinely Good

**Architecture and design**
- `HistoryManager` command pattern is the best-designed subsystem: clean `Command` interface, correct `execute`/`undo`, `MacroCmd` composition, 50-command stack limit. `TransformAnnotationsCmd`, `InkFillColorCmd`, `RotateElementCmd` show the pattern scaling well.
- `DocumentModel` is pure data — no DOM, no events, no async. Clean value object. `_gcSourcePdf` prevents PDF byte arrays accumulating on page delete. `reorderPages` pre-validates all IDs before committing.
- Element hierarchy is flat and composable: all elements extend `PDFElement` with minimal base. `toJSON`/`ElementFactory.fromJSON` is a clean serialization boundary. No cross-element dependencies.
- `UIController` is a proper presentation layer — 478 lines cleanly separated; contains no application logic. `UIRefs` as a structural type is clean.
- Redaction security is architecturally sound: full 2× page rasterization eliminates the original text layer at PDF structure level. No vector path for content extraction.
- Coordinate math (`_transformPoint`/`_inverseTransformPoint`) correctly handles all four rotations with proper geometric case handling.

**Code quality**
- Blob URL hygiene is excellent: every `createObjectURL` has a matching `revokeObjectURL` in the same scope.
- Timer management: all four `setTimeout` handles typed as `ReturnType<typeof setTimeout>` and cleared before reassignment.
- `TextSearchHandler` LRU cache: bounded size with correct promotion-on-access and eviction.
- `_renderPdfPage` render queue: single-slot pending-page queue with `_pendingResolve` correctly prevents concurrent renders.
- `polyfills.ts`: `Math.sumPrecise` implementation is algorithmically correct (Neumaier compensated summation), well-documented, no `any` casts. Exemplary polyfill pattern.
- TypeScript: zero `tsc --noEmit` errors, zero ESLint errors — clean compilable state.

**Tests**
- `src/elements/` coverage: 99.3% statements — every element type has DOM render, `toJSON`, event dispatch, and edge-case tests.
- `historyManager` command tests: 640 lines covering all command types and undo/redo cycles. Critical UX path well guarded.
- `inkLayer.test.ts`: 96.7% coverage, mocked canvas context pattern is clean and reusable.
- `storage.ts` uses `fake-indexeddb` — real IDB semantics (transactions, versioning), not a hand-rolled mock.
- `exportCoords.test.ts`: thorough coordinate math coverage for all rotation cases (0/90/180/270/360/−90) with CropBox offset tests.
- CI pipeline: type-check → lint → test → build in sequence with npm cache. Appropriate for a single-branch solo project.

**Documentation and security**
- Privacy pages are excellent: technically accurate, correct IndexedDB/localStorage disclosure, no tracking claims are truthful, present in all three languages.
- i18n coverage complete: EN/FR perfectly in sync (282 keys each); AR nearly perfect. All dynamic key patterns (badgeKeys, plural forms, HTML attributes) correctly covered.
- `npm audit: 0 vulnerabilities` (both prod-only and full). CSP is meaningful: `script-src 'self' 'wasm-unsafe-eval'` (not `unsafe-eval`), `object-src 'none'`.
- No network calls: zero `fetch`, `XMLHttpRequest`, `sendBeacon`, or `WebSocket` in `src/`. Privacy claim ("nothing uploaded") is fully backed by code.
- Passwords not persisted: `_exportPassword` is runtime-only, not included in `SavedState`.
- GitHub templates (bug_report, feature_request, PR template) are well-structured and appropriate.
- `mentions-legales.html` is legally complete: publisher identity, hosting provider, contact email, three languages.

---

## Prioritized Action Roadmap

### (a) Quick Wins — < 1 hour each

| Priority | ID | Action |
|---|---|---|
| 1 | P1-01 | Add `onerror`/`reject` to `_imagesToPdf` promise — fixes app deadlock on bad image |
| 2 | P1-02 | Add `reject` to `.then()` chain in `_rasterizePageWithRedactions` — fixes export stall |
| 3 | P1-08 | Add `console.warn` for non-quota autosave errors — restores data-loss observability |
| 4 | P1-05 | Add `test:coverage` script to `package.json` — surfaces 18.57% figure in CI |
| 5 | P1-06 | Update THIRD-PARTY-NOTICES.md — add 3 packages, remove orphan pdf-lib entry |
| 6 | P1-07 | Fix `js/` → `src/` in CONTRIBUTING.md; add CLA statement |
| 7 | P2-01 | Remove `pdf-lib@1.17.1` and `qpdf-wasm@0.1.0` from package.json — reduces bundle ~2MB+ |
| 8 | P2-03 | Add try/catch inside `_insertBlankPage` IIFE |
| 9 | P2-04 | Delete `_dataUrlToUint8Array`, rename 5 call sites to `_dataUrlToBytes` |
| 10 | P2-06 | Add `pull_request` trigger to CI workflow |
| 11 | P2-07 | Add `npm audit --audit-level=high` to CI job |
| 12 | P2-08 | Fix README eraser description; add QR/Barcode and Fill Bucket bullets |
| 13 | P2-09 | Replace `this.elements = []` with `this.elements.splice(0)` — prevents latent undo silent failure |
| 14 | P2-11 | Add `.catch()` to thumbnail lazy-load; add 4 `textSearchHandler` test cases |
| 15 | P3-29 | Remove `_note` key from `locales/ar.json` before production |
| 16 | P3-30 | Remove 13 dead i18n keys from all 3 locale files |
| 17 | P3-27/28/31 | Fix stale VISION.md entries; archive CODE_REVIEW.md; fix FEATURES.md "Clear Save" name |

### (b) Medium Items — ~1 day each

| Priority | ID | Action |
|---|---|---|
| 1 | P1-03+P1-04 | Extract `_transformPoint`/`_inverseTransformPoint` to `src/utils/coordinateTransform.ts` — fixes 0% pdfEditorApp coverage entry point + test inline-copy trap (shared fix) |
| 2 | P2-02 | Change `escapeValue: true` in i18n.ts; convert pageThumbnailPanel `innerHTML` to `createElement` |
| 3 | P2-05 | Switch PWA to `registerType: 'prompt'` with user-visible reload toast |
| 4 | P2-10 | Add `UIController` smoke test (JSDOM + index.html) + basic `PageThumbnailPanel` tests |
| 5 | P3-09 | Add `src/utils/pdfLibTypes.ts` typed stubs — remove `any` from export pipeline signatures |
| 6 | P3-21 | Add `.nvmrc` (node 24) and `"engines"` field to package.json |
| 7 | P3-22 | Replace 3 `toBeTruthy()` style assertions with specific color-value matchers |
| 8 | P3-38 | Wrap `window.app` in `if (import.meta.env.DEV)` — hide full app object in production |
| 9 | P3-35/36 | SHA-pin GitHub Actions; add `dependabot.yml` |

### (c) Structural Items — Multi-day

| Priority | ID | Action |
|---|---|---|
| 1 | P3-01 | Extract 6 bounded slices from `pdfEditorApp.ts`: coordinate math (zero deps — do first), `ExportManager`, `SessionManager`, `FindBarController`, `ModalController`, `PageStructureManager` |
| 2 | P3-02 | Define `AppContext` interface; replace `PDFEditorApp` constructor arg in all 5 handlers |
| 3 | P3-03+P3-04 | Extract `_buildPagePdf()` from triplicated export methods; split `setupEventListeners()` into 6 `_wire*()` groups |
| 4 | P3-08 | Introduce keyed rendering (`Map<id, HTMLDivElement>`) in `renderElements()` — fixes focus loss, listener reattach, and performance |
| 5 | P3-23 | Enable `noUncheckedIndexedAccess` + `noImplicitOverride` in tsconfig (requires migration pass) |

---

## Verification Appendix — Spot-Check Results

| Check | Claim | Result |
|---|---|---|
| **TEST-01** | `pdfEditorApp.unit.test.ts` never imports `PDFEditorApp` | **✓ TRUE** — grep across all test files: zero `PDFEditorApp` import, zero `from.*pdfEditorApp` (only one comment line referencing the filename) |
| **SEC-01** | `pdf-lib` (non-@cantoo) imported nowhere in src/ | **✓ TRUE** — `grep -rn "from 'pdf-lib'"` across `src/`: no results |
| **SEC-03** | `qpdf-wasm` imported nowhere in src/ or tests/ | **✓ TRUE** — `grep -rn "qpdf"` across `src/`, `tests/`, `index.html`: no results |
| **DOC-02** | CONTRIBUTING.md references nonexistent `js/` directory | **✓ TRUE** — lines 43 and 64 both contain `js/`; no `js/` directory exists in project root |
| **QUAL-02 ≡ ARCH-11** | Same `_imagesToPdf` defect described by both agents | **✓ TRUE — MERGED as P1-01** — Source at `pdfEditorApp.ts:1793–1807` confirms: `new Promise<Uint8Array>((resolve) =>` (no reject param), no `imgEl.onerror`, `toBlob` null case not rejected |

---

## Appendix — Raw Agent Reports

- Architecture: [docs/reviews/raw/arch.md](raw/arch.md)
- Code Quality: [docs/reviews/raw/quality.md](raw/quality.md)
- Tests & CI: [docs/reviews/raw/test-build.md](raw/test-build.md)
- Documentation: [docs/reviews/raw/docs.md](raw/docs.md)
- Security & Deps: [docs/reviews/raw/security.md](raw/security.md)
