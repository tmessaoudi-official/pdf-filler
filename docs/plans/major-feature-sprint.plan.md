# Major Feature Sprint Plan

## Decisions Log
- [2026-06-10] AGREED: Fill tool = vector fill on ShapeElement + InkStroke.fill (canvas path), NOT raster flood-fill
- [2026-06-10] AGREED: Eraser erases only what it touches (brush-based, not whole-fill-clear)
- [2026-06-10] AGREED: PDF password = @cantoo/pdf-lib (drop-in pdf-lib fork with encryption API)
- [2026-06-10] AGREED: js/ → src/ rename + deep subdir reorganization (elements/, handlers/, core/)
- [2026-06-10] AGREED: Blank page = full page size picker (A4/Letter/A3/A5/custom), insert at beginning/end/middle, single blank page mode, exportable
- [2026-06-10] AGREED: Unified color picker always visible (remove Phase 6 hide-in-select behavior)
- [2026-06-10] AGREED: Redaction color follows unified picker; for PDF text edit, auto-detect bg color (already in textEditHandler.ts)
- [2026-06-10] AGREED: Privacy badge = auto-dismiss toast (4s) on reload + permanent lock chip in footer
- [2026-06-10] AGREED: git Co-Authored-By = never include in new commits; rewrite ALL existing commits
- [2026-06-10] AGREED: Plan location = repo (docs/plans/)
- [2026-06-10] AGREED (advisor): js/→src/ restructure moves LAST (Phase H) — do after all features land so test suite is richest and regressions are unambiguous
- [2026-06-10] AGREED (advisor): git history rewrite uses git-filter-repo --message-callback (not rebase --amend --no-edit which is a no-op)
- [2026-06-10] VERIFIED: @cantoo/pdf-lib decrypt confirmed — load(bytes, {password}) returns isEncrypted:false, pages editable, re-save works
- [2026-06-10] VERIFIED: Shape fill PDF export uses existing page.drawRectangle({color}) / drawEllipse({color}) high-level API — no PDFOperator needed

## Formal Plan

### Phase 0 — Checkpoint Commit + History Rewrite
**Goal**: Commit all 29 unstaged files as-is (no Co-Authored-By trailer), then rewrite ALL history
1. Stage all modified + untracked files
2. Commit: `feat: QR/barcode code editor, drag-to-place, proportional resize, flyout toolbar`
3. Add coverage provider to vitest.config.ts (`@vitest/coverage-v8` already installed)
4. Rewrite ALL commit history to strip Co-Authored-By trailers:
   - Create backup branch: `git branch backup/pre-rewrite-$(date +%s)`
   - Run: `git filter-repo --message-callback 'import re; return re.sub(rb"\nCo-[Aa]uthored-[Bb]y:[^\n]*", b"", message).rstrip() + b"\n"'`
   - Verify: `git log --all | grep -i "co-authored-by"` must return nothing
   - For other projects: same command, run from that project's root

### Phase A — ESLint Dedup
**Goal**: Remove duplicate ESLint config (trivial, ~30 seconds)
1. Delete `eslint.config.js` (the less complete one — missing `no-non-null-assertion`)
2. Keep `eslint.config.mjs` (has `no-non-null-assertion: 'warn'`, proper ignores pattern)
3. Run `npm run lint` to confirm no errors
4. Run full vitest suite (310 tests must pass)

### Phase B — QR Bug Fix + CSP
**Goal**: Fix CSP violation for QR code logo images
1. In `js/codeGenerator.ts → generateStyledQR()`:
   - Convert data: URI to blob: URL before assigning to `qrOpts.image`
   - `atob` → `Uint8Array` → `new Blob([bytes], {type: 'image/png'})` → `URL.createObjectURL()`
   - Track blob URL for revocation on cleanup
2. In `index.html` CSP `<meta>`: add `connect-src 'self' blob:` to the policy
3. Add tests: `tests/codeGenerator.test.ts` — blob URL generation, revocation
4. Run vitest + Playwright (test QR with logo renders without CSP error)

### Phase C — Toolbar Redesign (Always-Visible)
**Goal**: Unified always-visible color picker + text format controls
1. Remove Phase 6 hide-in-select behavior: delete `formattingGroup?.classList.toggle('row2-hidden', mode === 'select')` in `js/uiController.ts`
2. Single unified color picker (one `<input type="color">`) for text/shapes/redact — all modes share same picker
3. Always-visible font family, size, bold, italic controls
4. Text tool and shapes/freehand tools grouped together in toolbar
5. Sign + Download fixed at right end of toolbar
6. Redaction color auto-follows unified picker (update redaction mode handlers)
7. Add uiController unit tests for: color picker visibility, mode-switch behavior, toolbar ordering
8. Run vitest + Playwright (test toolbar visibility across all modes, color picker in each mode)

### Phase D — Blank Page Creation
**Goal**: Create/insert blank pages with full size picker
1. Page size picker component: A4 (595×842), Letter (612×792), A3 (842×1191), A5 (420×595), custom (w×h input), "Match current page"
2. UI entry points:
   - "New blank page" button in file area + thumbnails panel
   - When no PDF loaded: show blank page as starting canvas
3. Insert position picker: beginning / end / after current page / custom index
4. Single blank page mode: open app → create blank → add annotations → export
5. Export: blank page with annotations exports via existing @cantoo/pdf-lib pipeline (blank PDFPage + annotation overlay)
6. Persist blank pages in SavedState (sourcePdfId = 'blank', special source handling)
7. Add tests: blank page model, size picker values, insert position logic, export pipeline
8. Run vitest + Playwright (test create → annotate → export flow)

### Phase E — Fill Tool
**Goal**: Vector fill on shapes + ink canvas fill, eraser handles fills naturally
1. `ShapeElement`: add `fillColor?: string` property (undefined = no fill, hex = filled)
   - `render()`: set `fill` SVG attribute (currently hardcoded `'none'`) — use fillColor or `'none'`
   - `toJSON/fromJSON`: persist `fillColor`
   - PDF export (in `pdfEditorApp.ts` shape case): pass `color: fillShapeColor` to existing
     `page.drawRectangle()` / `page.drawEllipse()` / `page.drawSvgPath()` calls — the API already accepts `color` for fill
2. `InkStroke` in `js/inkLayer.ts`: add `fill?: boolean` property
   - `renderToCanvas()`: for strokes with `fill=true`, call `ctx.fill()` before `ctx.stroke()`
   - Export: filled ink routes through existing PNG rasterization path (commit 07a4492)
3. Fill tool button in toolbar — uses unified color picker for fill color
4. Click filled shape → fill color shown in picker, editable
5. Eraser on fills: no change needed — `destination-out` compositing punches through fills
6. Add tests: ShapeElement fillColor toJSON/fromJSON, render SVG fill attr, InkStroke fill flag, PDF export fill color passthrough
7. Run vitest + Playwright (test fill → erase → export)

### Phase F — PDF Password (@cantoo/pdf-lib)
**Goal**: Lock PDF on export + unlock encrypted PDFs for editing
**CONFIRMED API** (verified by spike):
- Encrypt: `pdfDoc.encrypt({ userPassword: '...', ownerPassword: '...', permissions?: {...} })`
- Decrypt: `PDFDocument.load(bytes, { password: 'userpass' })` → returns isEncrypted:false, fully editable
- Detect encrypted: load without password throws with clear error message; catch and prompt

1. Replace `pdf-lib` imports with `@cantoo/pdf-lib` across all source files (already installed)
2. Decrypt on load:
   - Detect encrypted PDF: catch `PDFDocument.load()` throw → parse error message for "encrypted"
   - Show password prompt modal, pass password to pdfjs-dist for rendering AND to @cantoo for raw bytes
   - Store `wasEncrypted: boolean` + password in session state (not persisted to disk)
3. Lock on export:
   - Export modal: "Set password" toggle → userPassword input + confirm + ownerPassword (optional)
   - `pdfDoc.encrypt({ userPassword, ownerPassword: ownerPassword || userPassword })`
4. Re-lock option: if `wasEncrypted`, offer to re-lock with same or new password at export
5. Password UI: eye toggle for show/hide, strength indicator (length-based: weak/ok/strong)
6. Add tests: encryption wrapper unit tests (encrypt options, password prompt state machine)
7. Run vitest + Playwright (test encrypt → download → re-open flow)

### Phase G — Privacy Badge
**Goal**: Non-intrusive local-processing badge on each page reload
1. Auto-dismiss toast: slides in from bottom-right on page load, auto-fades after 4s, dismissable with ✕
   - Text: "Your files never leave your browser — all processing is 100% local"
   - Keyed on `sessionStorage` — shows once per tab session (new tab/reload = new session)
2. Permanent lock chip: small lock icon + "Private" text in toolbar footer, tooltip on hover
3. No blocking modals, no aggressive overlays
4. Add tests: sessionStorage key logic, toast visibility/dismissal state
5. Run Playwright (verify toast appears on reload, dismisses cleanly, chip always visible)

### Phase H — js/ → src/ Restructure (LAST)
**Goal**: Rename js/ → src/ with deep subdir reorganization after all features land
**Why last**: restructuring before features = ambiguous regressions (feature bug or broken import?).
Done last = richest test suite, bisect-clean, all imports stabilized.
1. Create `src/` directory structure:
   - `src/elements/` — textElement, imageElement, shapeElement, commentElement, highlightElement, redactionElement, signatureElement, codeElement, pdfElement
   - `src/handlers/` — drawingHandler, eraserHandler, inkLayerHandler, interactionHandler, textEditHandler, textSearchHandler
   - `src/core/` — pdfEditorApp, documentModel, historyManager, inkLayer, pdfRenderer, storage, uiController, pageThumbnailPanel
   - `src/utils/` — i18n, polyfills, focusTrap, formFieldOverlay, textLayer, elementFactory, signaturePad, codeGenerator, pdf-worker-shim
2. Move all .ts files to appropriate subdirs using `git mv` (preserves history)
3. Update all import paths (~45 in source, 18 test files, vite.config.ts, index.html, main.ts)
4. Fix obvious best-practice/SOLID violations found during review
5. Run full vitest suite (all tests must pass — richer suite now covers new features)
6. Run Playwright browser tests

---

## Coverage Strategy

**Current baseline** (verified: `npm run test -- --coverage`):
- Statements: 66.66% | Branches: 61.29% | Functions: 69.49% | Lines: 68.34%

**Priority coverage gaps** (files NOT in coverage = 0%):
- `pdfEditorApp.ts` (+458 lines modified) — unit tests for export pipeline, shape fill export
- `uiController.ts` (+113 lines modified) — color picker state, toolbar visibility
- `drawingHandler.ts` (+71 lines modified) — shape creation logic

**Files reachable in vitest/jsdom (target 90%+)**:
- ShapeElement (currently 10.3%) — render, fillColor, toJSON/fromJSON
- CodeElement (currently 20.58%) — all model methods
- HistoryManager (currently 62.83%) — all command types
- InkLayer (currently 58.18%) — fill stroke, renderToCanvas path

**Cannot reach 100% — honest ceiling:**
| Area | Reason |
|------|--------|
| Canvas pixel sampling (textEditHandler bg detection) | jsdom has no 2D context pixels |
| pdfRenderer canvas operations | HTMLCanvasElement.getContext() not implemented in jsdom |
| EyeDropper API | Not available in jsdom |
| i18n browser detection | Requires navigator.language, DOM events |
| Playwright tests cover | All of the above — these are covered by browser tests, not unit coverage numbers |

**Realistic final target**: 82-87% statements. 100% is impossible due to browser-only APIs.
Coverage command: `npm run test -- --coverage` (requires `@vitest/coverage-v8` — already installed)

---

## Verification
After each phase: `npm test` (vitest) + Playwright browser tests
Coverage tracked: `npm run test -- --coverage` after each phase
Final: full manual test of all 8 features end-to-end
