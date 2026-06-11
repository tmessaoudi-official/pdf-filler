# TEST-BUILD Agent Report — PDFturbo
**Date:** 2026-06-11 | **Scope:** tests/, vitest.config.ts, vite.config.ts, tsconfig.json, eslint.config.mjs, package.json scripts, .github/workflows/deploy.yml

---

## 1. REAL TEST-RUN OUTPUT

```
 Test Files  18 passed (18)
      Tests  382 passed (382)
   Start at  15:29:48
   Duration  6.72s (transform 2.05s, setup 829ms, import 6.50s, tests 2.46s, environment 50.00s)

WARNING (×5): Not implemented: HTMLCanvasElement's getContext() method:
              without installing the canvas npm package
```

---

## 2. COVERAGE REPORT (v8, run with `node ./node_modules/.bin/vitest run --coverage`)

```
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |   18.57 |    14.63 |   28.41 |   18.74 |
 src/core          |   13.26 |     8.24 |   25.31 |   12.99 |
  documentModel.ts |     100 |    95.45 |     100 |     100 |
  historyManager.ts|    81.2 |    56.75 |   87.62 |    85.2 |
  inkLayer.ts      |   96.72 |    90.9  |     100 |   96.07 |
  pageThumbnailPanel.ts |   0 |       0 |       0 |       0 |
  pdfEditorApp.ts  |       0 |       0  |       0 |       0 |
  pdfRenderer.ts   |   71.31 |    52.5  |   81.25 |   77.87 |
  storage.ts       |   84.09 |    37.5  |   76.47 |   91.66 |
  uiController.ts  |       0 |       0  |       0 |       0 |
 src/elements      |   99.33 |    96.87 |   95.45 |     100 |
 src/handlers      |    4.41 |     4.57 |    7.01 |    4.89 |
  drawingHandler.ts|       0 |       0  |       0 |       0 |
  eraserHandler.ts |       0 |       0  |       0 |       0 |
  inkLayerHandler.ts|      0 |       0  |       0 |       0 |
  interactionHandler.ts | 0  |       0  |       0 |       0 |
  textEditHandler.ts|      0 |       0  |       0 |       0 |
  textSearchHandler.ts| 88.88|      76  |   66.66 |   92.68 |
 src/utils         |   38.08 |    43.49 |   31.25 |   36.3  |
  codeGenerator.ts |   53.06 |    37.83 |   72.72 |      50 |
  elementFactory.ts|     100 |    97.91 |     100 |     100 |
  eraserGeometry.ts|   96.34 |    78.26 |     100 |     100 |
  focusTrap.ts     |       0 |       0  |       0 |       0 |
  formFieldOverlay.ts|     0 |       0  |       0 |       0 |
  i18n.ts          |    5.12 |       0  |    6.25 |    5.55 |
  polyfills.ts     |       0 |       0  |       0 |       0 |
  signaturePad.ts  |       0 |       0  |       0 |       0 |
  textLayer.ts     |       0 |       0  |       0 |       0 |
-------------------|---------|----------|---------|---------|
TOTAL              |   18.57%|   14.63% |   28.41%|  18.74% |
```

**Note:** `npx vitest run --coverage` fails when using the globally-installed vitest (Node v27 nightly cannot find `@vitest/coverage-v8`). Coverage requires `node ./node_modules/.bin/vitest run --coverage`. This is a CI-invisible failure — the `npm run test` script does not invoke coverage, so 18.57% overall coverage is never surfaced.

---

## 3. BIDIRECTIONAL SRC ↔ TEST MAPPING

### 3A. Source files (34 total, excluding main.ts)

| src file | Lines | Dedicated test file | Coverage | Notes |
|---|---|---|---|---|
| core/documentModel.ts | 137 | documentModel.test.ts + documentModelExtended.test.ts | **100%** | Well covered |
| core/historyManager.ts | 428 | historyManager.test.ts + historyManagerCommands.test.ts + rotation.test.ts | 81.2% | Missing: MacroCmd interactions, RotatePageCmd edges |
| core/inkLayer.ts | 110 | inkLayer.test.ts | 96.7% | Missing: lines 71-72 (empty stroke guard) |
| core/pageThumbnailPanel.ts | 187 | **NONE** | **0%** | 187 lines, zero test coverage |
| core/pdfEditorApp.ts | 3375 | pdfEditorApp.unit.test.ts | **0%** | See TEST-01 — tests don't import PDFEditorApp |
| core/pdfRenderer.ts | 196 | pdfRenderer.test.ts | 71.3% | Missing: lines 66-170 (renderPdfPage internals), 177-178 |
| core/storage.ts | 78 | storage.test.ts | 84.1% | Missing: lines 45-46 (IDB error paths), 62 |
| core/uiController.ts | 477 | **NONE** | **0%** | 477 lines, zero test coverage |
| elements/codeElement.ts | 82 | codeElement.test.ts | ~95% | Good |
| elements/commentElement.ts | 75 | elements.render.test.ts | ~100% | Good |
| elements/highlightElement.ts | 45 | highlightElement.test.ts + elements.render.test.ts | ~100% | Good |
| elements/imageElement.ts | 51 | elements.render.test.ts | ~100% | Good |
| elements/pdfElement.ts | 79 | elements.render.test.ts + pdfEditorApp.unit.test.ts | ~100% | Good |
| elements/redactionElement.ts | 44 | elements.render.test.ts + drawingHandlerFixes.test.ts | ~100% | Good |
| elements/shapeElement.ts | 140 | elements.render.test.ts + drawingHandlerFixes.test.ts | ~100% | Good |
| elements/signatureElement.ts | 37 | elements.render.test.ts | ~100% | Good |
| elements/textElement.ts | 75 | elements.render.test.ts + pdfEditorApp.unit.test.ts | ~97% | Good |
| handlers/drawingHandler.ts | 447 | drawingHandlerFixes.test.ts | **0%** | Tests simulate behavior without importing |
| handlers/eraserHandler.ts | 156 | **NONE** | **0%** | Zero coverage |
| handlers/inkLayerHandler.ts | 90 | **NONE** | **0%** | Zero coverage |
| handlers/interactionHandler.ts | 251 | **NONE** | **0%** | Zero coverage |
| handlers/textEditHandler.ts | 167 | **NONE** | **0%** | Zero coverage |
| handlers/textSearchHandler.ts | 97 | textSearchHandler.test.ts | 88.9% | Missing: caseSensitive/useRegex opts, clearCache, invalidatePage |
| utils/codeGenerator.ts | 141 | codeGenerator.test.ts | 53.1% | Missing: generateStyledQR, dataUriToBlobUrl paths |
| utils/elementFactory.ts | 83 | elementFactory.test.ts | **100%** | Excellent |
| utils/eraserGeometry.ts | 112 | eraserGeometry.test.ts | 96.3% | Missing: edge-case crossing geometry branches |
| utils/focusTrap.ts | 33 | **NONE** | **0%** | Zero coverage |
| utils/formFieldOverlay.ts | 76 | **NONE** | **0%** | Zero coverage |
| utils/i18n.ts | 99 | **NONE** | 5.1% | Effectively zero — only module init covered |
| utils/pdf-worker-shim.ts | 3 | **NONE** | 0% | Trivial |
| utils/polyfills.ts | 18 | **NONE** | **0%** | Zero coverage |
| utils/signaturePad.ts | 63 | **NONE** | **0%** | Zero coverage |
| utils/textLayer.ts | 126 | **NONE** | **0%** | Zero coverage |
| main.ts | 64 | **NONE** | **0%** | Entry point — expected |

### 3B. Summary

- **34 src files** (excluding main.ts)
- **14 files with no test file at all** (pageThumbnailPanel, uiController, eraserHandler, inkLayerHandler, interactionHandler, textEditHandler, focusTrap, formFieldOverlay, i18n, pdf-worker-shim, polyfills, signaturePad, textLayer + main.ts)
- **5 handlers: 4 at 0% coverage** (only textSearchHandler has tests)
- **The 18 test files map to only ~20 src files** meaningfully; the rest are untested

---

## 4. FINDINGS

---

### TEST-01 — P1 — pdfEditorApp.unit.test.ts does not test PDFEditorApp at all

**File:** `tests/core/pdfEditorApp.unit.test.ts` (479 lines, 0 imports from pdfEditorApp.ts)
**Coverage:** `src/core/pdfEditorApp.ts` = **0% (0/3375 lines)**

**What happens:** The file is named `pdfEditorApp.unit.test.ts` and described as covering the app's largest module, but it never imports `PDFEditorApp`. All 479 lines test:
- Inline copies of `_transformPoint` / `_inverseTransformPoint` (extracted and redefined locally)
- Standalone logic extracted as local helper functions
- `PDFElement`, `TextElement`, `HistoryManager` — which are already covered by their own test files

The actual `PDFEditorApp` class (3,375 lines, ~150 methods including `_restoreSession`, `handleFileUpload`, `exportPDF`, `_drawElementOnPage`, `renderElements`, `_rasterizePageWithRedactions`, all tool handlers) has **zero test coverage**.

**Failure it permits:** Any regression in the core app class goes undetected. BUG-09 (session restore race), export bugs, PDF rendering bugs, tool mode bugs — all invisible to the test suite.

**Fix:** The issue is that `_transformPoint` is `private`. Two options:
1. Extract `_transformPoint` and `_inverseTransformPoint` as exported standalone pure functions in a new `src/utils/coordinateTransform.ts` — then both the production code and the tests import them. This also removes the inline copy drift risk.
2. For the app class itself, either use the `as unknown as ...` pattern to access private methods in tests, or refactor the class to extract testable pure-function logic.

**Confidence:** Verified — `grep "import.*pdfEditorApp\|PDFEditorApp" tests/` returns zero results from any test file.

---

### TEST-02 — P1 — Inline-copied production functions in tests break regression detection

**Files:**
- `tests/core/pdfEditorApp.unit.test.ts:307-343` — defines `correctTransformPoint` and `correctInverseTransformPoint` as local copies
- `tests/core/exportCoords.test.ts:20-35` — defines `_transformPoint` and `tp` as local copies
- `tests/core/exportCoords.test.ts:376` — defines `buggy_tp` (old broken formula)

**What happens:** These tests verify the *inlined copy* of the coordinate transform logic, not the production function at `pdfEditorApp.ts:1354`. If someone modifies `_transformPoint` in production (e.g., introduces a new off-by-one in the 270° case), all these tests still pass because they test their local definition, not the imported one.

The comment at line 307 acknowledges this: *"Extracted from pdfEditorApp.ts — any change to the production function must be reflected here."* That manual synchronization requirement is a maintenance trap: it will be forgotten.

**Failure it permits:** Silent regression in `_transformPoint` math — the single most critical calculation in the app (affects all element positioning and export). Tests would green while users see wrong element positions.

**Fix:** Extract `_transformPoint` / `_inverseTransformPoint` as exported functions in a dedicated `src/utils/coordinateTransform.ts`. Both `pdfEditorApp.ts` and the tests import from there. Delete the inline copies.

**Confidence:** Verified by reading both files.

---

### TEST-03 — P1 — Coverage script missing; 18.57% coverage is never surfaced

**File:** `package.json` (scripts section), `vitest.config.ts`

**What happens:** There is no `test:coverage` or `coverage` script in `package.json`. The `vitest.config.ts` has the coverage provider configured (`provider: 'v8'`) but there is no way to invoke it via `npm run`. CI only runs `npm run test` (bare vitest run). Developers and CI never see the 18.57% overall coverage figure.

Additionally, `npx vitest run --coverage` fails when using a globally-installed vitest because `@vitest/coverage-v8` resolves from the wrong node_modules (Node v27 nightly path). Only `node ./node_modules/.bin/vitest run --coverage` works. This means even a developer who tries to run coverage manually gets a confusing error.

**Failure it permits:** No coverage enforcement. The codebase can regress toward zero coverage with no CI signal.

**Fix:**
1. Add `"test:coverage": "node ./node_modules/.bin/vitest run --coverage"` to `package.json` scripts.
2. Add a coverage threshold to `vitest.config.ts`:
   ```ts
   coverage: {
     provider: 'v8',
     include: ['src/**/*.ts'],
     exclude: ['src/**/*.d.ts'],
     thresholds: { statements: 15, branches: 12, functions: 25, lines: 15 }
   }
   ```
   (Set to just below current to establish a floor, then ratchet up.)
3. Optionally add `npm run test:coverage` to CI after `npm run test`.

**Confidence:** Verified — `grep "coverage" package.json` returns only the devDependency line, not a script.

---

### TEST-04 — P2 — CI has no pull_request trigger — tests never gate pre-merge

**File:** `.github/workflows/deploy.yml:3-6`

```yaml
on:
  push:
    branches: [master]
  workflow_dispatch:
```

**What happens:** CI only runs on push to `master` (and manual dispatch). There is no `pull_request:` trigger. This means:
- If the repo ever uses PRs (or a collaborator submits one), the test/build/type-check pipeline never runs before merge.
- The `concurrency: cancel-in-progress: true` setting means if two pushes arrive quickly, the first job is cancelled — tests may not run at all on intermediate commits.

**Failure it permits:** Broken code merged without CI signal.

**Fix:**
```yaml
on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  workflow_dispatch:
```

**Confidence:** Verified by reading deploy.yml.

---

### TEST-05 — P2 — No `test:coverage` in CI; no `npm audit` step

**File:** `.github/workflows/deploy.yml`

**What happens:**
1. CI runs `npm run test` (bare test, no coverage). Coverage thresholds are never enforced.
2. There is no `npm audit` step. Supply chain vulnerabilities (known CVEs in dependencies) are never surfaced in CI.
3. There is no separate `deploy` job for safety — the deploy job has no environment protection rules other than a `needs: build` dependency.

**Failure it permits:** Known vulnerable dependencies ship to production silently. Coverage regressions silently accepted.

**Fix:** Add to `build` job:
```yaml
- run: npm audit --audit-level=high
- run: npm run test:coverage  # once TEST-03 fix adds the script
```

**Confidence:** Verified by reading deploy.yml.

---

### TEST-06 — P2 — `pdfEditorApp.unit.test.ts` tests some "old buggy" code (meta-testing anti-pattern)

**File:** `tests/core/pdfEditorApp.unit.test.ts:69-79, 242-248, 310-360`

**What happens:** Several describe blocks define both the "old buggy" implementation and the "fixed" implementation inline, then assert that the old one produces wrong results and the new one produces correct results. Example:

```ts
const oldBehavior = (input, focused) => input && input === focused;
const newBehavior = (input, focused) => input ? input === focused : true;
expect(oldBehavior(null, null)).toBeFalsy();   // tests the bug
expect(newBehavior(null, null)).toBe(true);    // tests a local copy of the fix
```

This pattern (a) tests a local copy of the fix rather than the production function, and (b) permanently includes the old buggy implementation in the test file where it could confuse future maintainers.

**Failure it permits:** The production fix could be silently reverted and these tests would still pass (they test local definitions). Additionally, the tests for the "buggy" path create ongoing maintenance confusion.

**Fix:** Remove the `oldBehavior`/`buggy` implementations entirely. Replace the test with: import the actual production function (once it's exported — see TEST-01/TEST-02) and verify it produces correct output for the edge cases only.

**Confidence:** Verified by reading the test file.

---

### TEST-07 — P2 — No `.nvmrc` or `engines` field; CI pins node 24, local uses node 27 nightly

**Files:** `package.json` (no `engines` field), project root (no `.nvmrc`), `deploy.yml:24` (`node-version: 24`)

**What happens:** CI uses Node 24 (LTS). The local developer environment (this machine) uses Node v27.0.0-nightly. There is no `.nvmrc` or `engines: { "node": ">=22" }` to communicate the intended version. This caused the coverage toolchain failure (TEST-03): `@vitest/coverage-v8` resolution breaks under the nightly node path.

**Failure it permits:** Version mismatch bugs that only appear on one environment. Coverage toolchain failure for any developer on a non-LTS node.

**Fix:**
1. Add `.nvmrc` containing `24` (matching CI).
2. Add to `package.json`: `"engines": { "node": ">=22.0.0" }`.

**Confidence:** Verified — `ls .nvmrc` returns "NO .nvmrc"; `grep engines package.json` returns nothing.

---

### TEST-08 — P2 — Weak `toBeTruthy()` assertions on style properties

**File:** `tests/elements/elements.render.test.ts:199,215,247-248`

```ts
expect(div.style.background).toBeTruthy();               // line 199
expect(div.style.background || div.style.backgroundColor).toBeTruthy();  // line 215
expect(bg).toBeTruthy();                                 // line 248
```

**What happens:** These assertions pass for any non-empty string — including `" "` (a space) or even a wrong color value. They verify that *some* background style exists but not *what value* it has. The `HighlightElement` test at line 199 does not verify the rgba color or opacity, making the test useless for catching a hex-parse regression (which was a real bug — BUG-02 tracked in the plan).

By contrast, `tests/elements/highlightElement.test.ts` correctly uses `expect(bg).toMatch(/rgba\(255,\s*0,\s*0/)`. The elements.render.test.ts version is weaker.

**Failure it permits:** A broken hex-to-rgba parser in HighlightElement that returns an empty/wrong value would not be caught.

**Fix:** Replace the three `toBeTruthy()` style assertions with specific value checks:
- Line 199: `expect(div.style.background).toMatch(/rgba\(255,\s*255,\s*0/)` (yellow default)
- Line 215: `expect(div.style.background || div.style.backgroundColor).toMatch(/rgb/)` (any rgb value)
- Line 248: `expect(bg).toMatch(/rgb\(255,\s*255,\s*0\)/)` (yellow from CommentElement test)

**Confidence:** Verified by reading both the test and the HighlightElement source.

---

### TEST-09 — P2 — `textSearchHandler.ts` missing test coverage: caseSensitive, useRegex, clearCache, invalidatePage

**File:** `tests/handlers/textSearchHandler.test.ts` | **Coverage:** 88.9% stmts, **76% branches**

**What happens:** The `TextSearchHandler.search()` method accepts `caseSensitive?: boolean` and `useRegex?: boolean` parameters (lines 57-58 in textSearchHandler.ts). No test exercises these code paths (line 59 is uncovered). Additionally, `clearCache()` and `invalidatePage()` (lines 91-95) have zero test coverage.

These are meaningful public API behaviors:
- `useRegex: true` with an invalid regex would hit the `catch { return [] }` path (line 59) — untested
- `clearCache()` is called by the app on page delete — if it breaks, search state becomes stale

**Failure it permits:** A regression in case-sensitive search, regex search, or cache invalidation goes undetected.

**Fix:** Add to `textSearchHandler.test.ts`:
- Test with `{ caseSensitive: true }` — verify exact-case match
- Test with `{ useRegex: true, query: '[invalid' }` — verify returns `[]` without throw
- Test `clearCache()` — after populating cache, clear it, verify `_cache.size === 0`
- Test `invalidatePage()` — verify single page removed, others retained

**Confidence:** Verified — `grep "caseSensitive\|useRegex\|clearCache\|invalidatePage" tests/handlers/textSearchHandler.test.ts` returns zero results.

---

### TEST-10 — P2 — 14 src files (1,714 lines) have zero test coverage [KNOWN partially]

**Files:** `pageThumbnailPanel.ts` (187), `uiController.ts` (477), `eraserHandler.ts` (156), `inkLayerHandler.ts` (90), `interactionHandler.ts` (251), `textEditHandler.ts` (167), `focusTrap.ts` (33), `formFieldOverlay.ts` (76), `i18n.ts` (99), `pdf-worker-shim.ts` (3), `polyfills.ts` (18), `signaturePad.ts` (63), `textLayer.ts` (126), `main.ts` (64)

**What happens:** The entire handler layer (except textSearchHandler) — drawingHandler, eraserHandler, inkLayerHandler, interactionHandler, textEditHandler — has 0% coverage. While some of these are DOM-event-heavy and require jsdom integration tests, others like focusTrap (pure DOM), i18n (pure config), signaturePad (canvas-drawing state machine), and textLayer (pdfjs text layer config) have testable pure-function or state-machine components that are currently untested.

`uiController.ts` at 477 lines maps DOM element IDs — if a DOM ID is renamed in index.html, uiController silently produces undefined refs that crash the app. A single smoke test that calls `UIController.init()` with a properly constructed JSDOM would catch this class of bug.

**Failure it permits:** UI controller/handler regressions, i18n missing-key regressions, focus trap bugs in accessibility flows — all silent.

**Fix (prioritized):**
1. `focusTrap.ts` (33 lines) — pure DOM, highly testable: add 5 tests
2. `i18n.ts` (99 lines) — add tests for missing-key fallback, locale loading
3. `signaturePad.ts` (63 lines) — add state machine tests (start/draw/stop, clear)
4. `uiController.ts` (477 lines) — smoke test with full JSDOM + index.html to catch ID mismatches

**Confidence:** Verified by coverage report showing 0% for all listed files.

---

### TEST-11 — P3 — `tsconfig.json` missing strict-mode completeness flags

**File:** `tsconfig.json`

**What happens:** `strict: true` is set, which enables the core strict flags (`strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`). However, the following additional hardening flags are absent:

| Flag | Effect | Risk if absent |
|---|---|---|
| `noUncheckedIndexedAccess` | Array/map indexing returns `T \| undefined` | Silent `undefined` from array access (e.g., `elements[0]` returns `PDFElement \| undefined`) |
| `noImplicitOverride` | Subclass methods must use `override` keyword | Accidental method shadowing in element subclasses |
| `exactOptionalPropertyTypes` | `undefined` assignments to optional props are flagged | Stale optional fields set to `undefined` instead of deleted |
| `noUnusedParameters` | Currently explicitly set to `false` | Dead parameters accumulate without warning |

`noUnusedParameters: false` is explicitly disabled. This permits dead function parameters to accumulate in the 3,375-line `pdfEditorApp.ts` without warning.

**Failure it permits:** Type-unsound index access (e.g., `this.elements[0]` when `elements` is empty returns undefined but is typed as `PDFElement`), accidental method shadowing in element subclasses.

**Fix:** Add to `tsconfig.json`:
```json
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true,
"noUnusedParameters": true
```
Note: `noUncheckedIndexedAccess` may require adding non-null assertions or bounds checks at 50+ call sites in pdfEditorApp.ts — plan a migration pass.

**Confidence:** Verified by reading tsconfig.json.

---

### TEST-12 — P3 — ESLint does not cover test files for TypeScript rules; `any` is only a warning

**File:** `eslint.config.mjs`

**What happens:**
1. The eslint config applies `tseslint.configs.recommended` to all files matching default globs. Since no explicit `files` pattern is specified, it applies globally — but there's no verification that `.test.ts` files in `tests/` are covered.
2. `@typescript-eslint/no-explicit-any` is `warn` not `error`. In `tests/core/historyManager.test.ts:97`, there's `const arr: any[] = []`. With `warn`, this accumulates silently.
3. `@typescript-eslint/no-non-null-assertion` is `warn`. Non-null assertions in tests like `detail!.id` at `elements.render.test.ts:283` are accepted without error.

**Failure it permits:** `any` type leakage into tests bypasses TypeScript's safety net, potentially making assertions that can't fail (asserting `any` is always valid).

**Fix:**
- Change both `warn` rules to `error` in test files (or add a separate override for `tests/**/*.ts`)
- Verify `eslint .` output includes test files by running `eslint --debug . 2>&1 | grep test` to confirm

**Confidence:** Verified by reading eslint.config.mjs.

---

### TEST-13 — P3 — `vite.config.ts`: CacheFirst for all same-origin JS/MJS conflicts with autoUpdate PWA

**File:** `vite.config.ts:20-26`

```ts
handler: 'CacheFirst',
options: {
  cacheName: 'pdf-chunks',
  expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
}
```

**What happens:** `registerType: 'autoUpdate'` causes workbox to skip-waiting and activate the new service worker immediately. However, the `runtimeCaching` rule with `CacheFirst` for all `*.js`/`*.mjs` on the same origin means that after activation, the runtime cache still serves old JS chunks (until the 30-day expiry or the entry count exceeds 20). If workbox's precache handles the same files (glob `**/*.{js,mjs,...}`), this creates a conflict: precache uses revision-based invalidation (correct), but the runtime cache entry for the same URL persists (wrong).

In practice: non-precached JS files (e.g., a dynamically imported chunk not in the glob) will be served from CacheFirst indefinitely.

The `self.location.origin` reference in `urlPattern` is valid in a service worker context (workbox runs in SW scope) — not a bug, just worth noting.

**Failure it permits:** Users may receive stale application JS for up to 30 days after a deployment if they're in the CacheFirst runtime cache path.

**Fix:** Change `CacheFirst` to `StaleWhileRevalidate` for application JS chunks to allow background updates. Keep `CacheFirst` only for truly static vendor chunks (pdf.js worker, which rarely changes):
```ts
handler: 'StaleWhileRevalidate',
```
Or scope the runtime rule more narrowly to only the large vendor chunks by filename pattern.

**Confidence:** Inferred from workbox documentation behavior — partially unverifiable without a live SW inspection.

---

### TEST-14 — P3 — PWA icon uses combined `"any maskable"` purpose (deprecated)

**File:** `vite.config.ts:40`

```ts
{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
```

**What happens:** The W3C Web App Manifest spec (and Chrome 96+) recommends separate icon entries for `"any"` and `"maskable"` purposes rather than the combined `"any maskable"` space-separated form. Using a single SVG as `maskable` assumes the entire icon is safe zone (no important content in the outer 10%), which may not be true for icon.svg.

**Failure it permits:** On Android devices using adaptive icons, the icon may be cropped in unexpected ways.

**Fix:** Replace with two icon entries:
```ts
{ src: 'icon.svg', sizes: '192x192 512x512', type: 'image/svg+xml', purpose: 'any' },
{ src: 'icon-maskable.svg', sizes: '192x192 512x512', type: 'image/svg+xml', purpose: 'maskable' },
```
Or verify that icon.svg has sufficient safe-zone padding and keep the combined form with a comment explaining why.

**Confidence:** Inferred from PWA spec; unverified without a Lighthouse PWA audit.

---

### TEST-15 — P3 — `setup.ts` DOMMatrix stub passes all matrix methods; misleading stub names

**File:** `tests/setup.ts`

**What happens:** The DOMMatrix stub at `tests/setup.ts:11-51` implements all matrix methods as no-ops returning `this`. This is correct for preventing module-load crashes (pdfjs-dist evaluates `new DOMMatrix()` at the top level). However:

1. `rotateSelf()` and `rotate()` return `this` with no transformation — any test that creates a PDFRenderer and calls a method that internally uses `DOMMatrix.rotate()` for its canvas context will silently get back an identity matrix. Tests asserting canvas output positions would pass with wrong values.
2. `transformPoint()` returns `{ x: p.x ?? 0, y: p.y ?? 0 }` — this is a pass-through, not a real identity matrix (which would apply the matrix transform). This is correct for the identity case but wrong for any non-identity DOMMatrix usage.

The stub is safe for the current test suite because `HTMLCanvasElement.getContext()` is also not implemented in jsdom (the 5 warnings per run prove this). But as more tests are added that need canvas math, the stub will silently produce wrong transforms.

**Fix:** Add a comment to `setup.ts` documenting that the DOMMatrix stub assumes identity-only usage and that any test needing real matrix math must stub `getContext` to inject a real canvas context (or install the `canvas` npm package).

**Confidence:** Verified by reading setup.ts.

---

## 5. WHAT IS GOOD

The test suite has several genuine strengths worth preserving:

1. **elements/ coverage is excellent (99.3% statements)** — Every element type has DOM render tests, toJSON tests, event dispatch tests, and edge-case (minimum size, invalid input) coverage. This is the most reusable and regression-prone layer and it's well protected.

2. **historyManager commands are deeply tested** — `historyManagerCommands.test.ts` (640 lines) covers RemoveElementCmd, MoveResizeCmd, BulkDeleteCmd, SplitStrokeCmd, MacroCmd, RotateElementCmd, InkStrokeCmd, and their undo/redo cycles. Undo/redo correctness is critical for UX and this file guards it well.

3. **InkLayer at 96.7%** — `inkLayer.test.ts` (384 lines) covers strokes, page isolation, JSON round-trips, rendering via mocked canvas context, toDataURL, fill-bucket detection, and boundary proximity tests. The mocked canvas context pattern is clean and reusable.

4. **storage.ts uses `fake-indexeddb`** — Real IndexedDB-over-fake implementation, not a hand-rolled mock. This means the storage round-trip tests actually exercise the IDB API semantics (transactions, versioning) rather than a simplified stub. A genuine architectural strength.

5. **exportCoords.test.ts is thorough on coordinate math** — Even though it uses an inline copy (TEST-02), the 434-line file covers rotation=0/90/180/270/360/-90, CropBox offset addition, fallback for missing CropBox, and round-trip identity. Once the inline-copy issue is fixed (extract to utils), this test file becomes a proper regression guard for the most critical math in the app.

6. **Setup file is well-documented** — The `tests/setup.ts` DOMMatrix stub is commented, explaining exactly why it exists (pdfjs module-level evaluation) and what it doesn't provide.

7. **CI pipeline is comprehensive for a single-branch solo project** — type-check + lint + test + build in sequence, with npm cache. For a personal project on a single master branch, this is appropriate and runs reliably.

---

## 6. SEVERITY SUMMARY

| Severity | Count | IDs |
|---|---|---|
| P0 | 0 | — |
| P1 | 3 | TEST-01, TEST-02, TEST-03 |
| P2 | 5 | TEST-04, TEST-05, TEST-06, TEST-07, TEST-08, TEST-09, TEST-10 |
| P3 | 5 | TEST-11, TEST-12, TEST-13, TEST-14, TEST-15 |

*(TEST-10 is P2 for the handlers/uiController gap; partially acknowledged in the plan as architectural debt.)*

---

## 7. TOP 5 ONE-LINERS

1. **TEST-01 (P1):** `pdfEditorApp.unit.test.ts` never imports `PDFEditorApp` — pdfEditorApp.ts is 0% covered despite being 3,375 lines and the core of the application.
2. **TEST-02 (P1):** `_transformPoint` is inlined in two test files instead of imported — a fix to the production function won't be caught by these tests.
3. **TEST-03 (P1):** No `test:coverage` script and `@vitest/coverage-v8` fails with the system vitest — 18.57% coverage is completely invisible to CI and developers.
4. **TEST-04 (P2):** CI triggers only on `push: master`, never on `pull_request` — tests never gate anything pre-merge.
5. **TEST-10 (P2):** 5 handler files (1,111 lines) and 2 core files (664 lines) have 0% coverage — the entire interaction/drawing/editing layer is untested.
