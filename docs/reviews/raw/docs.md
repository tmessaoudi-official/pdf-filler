# PDFturbo — Documentation Adversarial Review
**Agent**: DOCS (exclusive ownership: all documentation artifacts)
**Date**: 2026-06-11
**Scope**: All .md root files, .github/ templates, public/*.html legal pages, locales/*.json, docs/plans/ (staleness), docs/superpowers/

---

## Inventory A — Features Claimed in README.md + FEATURES.md (28 features)

From README.md bullet list + FEATURES.md table of contents:

1. Upload any PDF / Open PDF
2. Text tool — editable text boxes with font/size/bold/italic/color
3. Edit PDF text — overlay edit in place (Edit Text tool)
4. Shapes — arrow, rectangle, ellipse
5. Freehand draw
6. Highlight
7. Eraser — erase freehand strokes or delete any element by brushing over it *(caveat: see DOC-03)*
8. Signature pad — draw + place
9. Image overlay — PNG/JPEG/WebP
10. Comment / sticky note
11. Redaction — permanent black-box via full page rasterization
12. Watermark — tiled, configurable text/opacity/angle/density
13. Text search — find with highlighted matches and Add Highlight action
14. Form field fill — AcroForm Tx type detection + fill
15. Page management — add pages from another PDF, delete, reorder, rotate
16. Undo / Redo — 50-command history (Ctrl+Z / Ctrl+Y)
17. Session persistence — auto-saves to IndexedDB, restores on reload
18. Export options — full PDF, single page PDF, page as PNG image
19. Export preview — annotation positions before downloading
20. Pinch-to-zoom (mobile) / Ctrl+Wheel (desktop)
21. Keyboard shortcuts for all major tools
22. PWA: installable, works offline for app shell
23. Full EN / FR / AR (RTL) localisation
24. Element controls — move, resize, delete, nudge (all annotations)
25. Session clear / reset
26. Help modal
27. Toast notifications / Mode badge

**Missing from README (implemented but undocumented):**
- QR code / Barcode tool (addCode mode — fully implemented)
- Fill Bucket tool (fillBucket mode — fully implemented)

**Total README/FEATURES claimed**: 27 explicit features (+ 2 undocumented = 29 total implemented)

---

## Inventory B — Features Actually Implemented (derived from src/)

ToolMode type (src/core/pdfEditorApp.ts:42):
```
'select' | 'addText' | 'addSignature' | 'addImage' | 'addCode' | 'drawArrow' | 'drawRect' |
'drawEllipse' | 'drawFreehand' | 'drawHighlight' | 'addComment' | 'drawRedaction' | 'drawErase' |
'editText' | 'fillBucket'
```

**Implemented tool modes** (15):
1. select (pointer / select mode)
2. addText
3. addSignature
4. addImage
5. addCode (QR code + barcode generator) ← NOT in README
6. drawArrow
7. drawRect
8. drawEllipse
9. drawFreehand
10. drawHighlight
11. addComment
12. drawRedaction
13. drawErase
14. editText
15. fillBucket ← NOT in README

**Other implemented features** (verified in FEATURES.md audit + src/):
- Page navigation, thumbnail panel, delete page, page rotation, page reorder
- Zoom in/out/fit, pinch-to-zoom
- Undo/redo (50 commands)
- Session persistence (IndexedDB)
- Clear all annotations
- Export: full PDF, single page PDF, page as PNG
- Export preview
- Watermark (tiled)
- Text search with highlight add
- Form field fill (Tx type only)
- Help modal
- Language switcher EN/FR/AR with RTL
- PWA/offline
- Keyboard shortcuts
- Toast notifications, mode badge, done pill
- Copy/paste elements (Ctrl+C/V)

**Total implemented**: 15 tool modes + ~20 other features = ~35 distinct features

---

## Cross-Check: Claimed vs Implemented

### Claimed-but-needs-caveat (2):
- **Eraser** — README: "delete any element by brushing over it" — FALSE. Eraser only affects freehand canvas ink. FEATURES.md correctly documents this; README does not.
- **Form field fill** — README says "auto-detect and fill AcroForm text fields (Tx type)" — accurate (Tx only), but no disclosure of what's NOT supported (checkboxes, radio, combo, list, buttons).

### Implemented-but-undocumented in README (2):
- QR Code / Barcode tool (`addCode` mode, feature §40)
- Fill Bucket tool (`fillBucket` mode, feature §39)

---

## Locale Key Analysis (exact 3-way diff)

**Key counts**: EN=282, FR=282, AR=283

**EN vs FR diff**: Zero — EN and FR are perfectly in sync.

**EN vs AR diff**:
- AR has 1 extra key not in EN: `_note` (value: `"Arabic UI labels — needs native-speaker review before production"`)
- EN has 0 keys missing from AR.

**Summary**: The only divergence is a development-comment key `_note` in ar.json that should be removed before production. No functional missing translations.

**i18n usage cross-check** (used in src/ + index.html vs en.json):
- All dotted i18n keys used in source code ARE present in en.json. Zero runtime missing-key errors.
- "Dead" keys analysis: 63 keys in en.json appear not referenced by simple static analysis — however, investigation confirms they are ALL legitimately used via:
  - Dynamic key map lookup (badgeKeys, modeHintKeys in uiController.ts:361-369 and pdfEditorApp.ts:1968-1976)
  - Pluralization suffixes (`toast.filesAdded_one`, `toast.filesAdded_other` called via `t('toast.filesAdded', {count})`)
  - HTML attribute handlers (`data-i18n-aria`, `data-i18n-label`, `data-i18n-alt` in i18n.ts:29-40)
  - `colors.*` and `toolbar.commentLabel/highlightLabel/formatting.shapeLabel` — NOT found in any source. These appear genuinely dead.

**Confirmed dead keys** (not used anywhere in src/ or index.html):
- `colors.black`, `colors.blue`, `colors.gray`, `colors.green`, `colors.orange`, `colors.purple`, `colors.red`, `colors.teal`, `colors.white`, `colors.yellow` (10 keys)
- `toolbar.commentLabel`, `toolbar.highlightLabel`, `formatting.shapeLabel` (3 keys)
- **Total confirmed dead**: 13 keys across all 3 locales (since all 3 are in sync)

**AR spot-check for English placeholders**:
- `app.title`: `"PDFturbo"` — product name, intentionally English. Acceptable.
- `modal.code.contentPlaceholder`: `"https://example.com"` — URL example, acceptable.
- `_note`: English developer comment — remove before production.
- All other AR values contain Arabic characters. No suspect English placeholders in functional keys.

---

## Findings

---

### DOC-01 · P1 · THIRD-PARTY-NOTICES.md missing 3 production dependencies

**File**: `THIRD-PARTY-NOTICES.md`
**Confidence**: High — verified by reading package.json and grep-ing src/

**Problem**: Three production npm dependencies are actively used in source code but not listed in THIRD-PARTY-NOTICES.md:

| Package | License | Usage |
|---|---|---|
| `@cantoo/pdf-lib` v2.7.1 | MIT | Used in 5+ `import()` calls in pdfEditorApp.ts — the primary PDF export engine |
| `bwip-js` v4.11.1 | MIT | Used in codeElement.ts, codeGenerator.ts for barcode rendering |
| `qr-code-styling` v1.9.2 | MIT | Used in codeGenerator.ts for styled QR code generation |

Additionally, `qpdf-wasm` v0.1.0 (Apache-2.0) is listed in package.json but does not appear in any src/ import. It may be a dead dependency.

Also: `vite` and `vite-plugin-pwa` are listed as devDependencies (build tools), not bundled into the output. Their inclusion in user-facing notices is cosmetically harmless but not strictly required. The `@cantoo/pdf-lib` omission is the most serious — it is the primary export library, replacing the original `pdf-lib` for most operations.

**Fix**: Add entries for `@cantoo/pdf-lib`, `bwip-js`, and `qr-code-styling`. Audit whether `qpdf-wasm` is actually used or can be removed from package.json.

---

### DOC-02 · P1 · CONTRIBUTING.md has wrong source directory path and legal CLA gap

**File**: `CONTRIBUTING.md`
**Confidence**: High — verified by ls /stack/projects/prsnl/pdfturbo/

**Problem A — Wrong source directory**: CONTRIBUTING.md Project Structure section says:
```
js/               TypeScript source modules (one class per file)
```
The actual source directory is `src/` (with subdirectories `core/`, `elements/`, `handlers/`, `utils/`). No `js/` directory exists. This will cause confusion for any contributor trying to find source files. The Tech Stack section also says "all source in `js/`" — same error.

**Problem B — Legal CLA gap**: LICENSE is All Rights Reserved (no contribution rights whatsoever). CONTRIBUTING.md invites PRs with instructions for forking and contributing. Without a Contributor License Agreement (CLA) or explicit license grant in CONTRIBUTING.md, the ownership of any submitted PR is legally ambiguous. Under copyright law, a contributor retains copyright to their code unless they explicitly assign it. A PR merge without a CLA does not transfer intellectual property to the author. For a proprietary All Rights Reserved repository, either:
- Add a CLA statement (e.g., "By submitting a PR you assign copyright to Takieddine Messaoudi")
- Or change the tone: acknowledge this is primarily a solo project and PRs may be reviewed but not guaranteed to be accepted without explicit IP assignment

**Fix A**: Change `js/` to `src/` (and subdirectories) throughout CONTRIBUTING.md.
**Fix B**: Add a contribution IP notice: "By opening a pull request you agree that your contribution is assigned to Takieddine Messaoudi under the project's All Rights Reserved license."

---

### DOC-03 · P2 · README.md eraser description is inaccurate

**File**: `README.md`, line in Features section
**Confidence**: High — verified by reading FEATURES.md §18 and src/

**Problem**: README states:
> **Eraser** — erase freehand strokes or delete any element by brushing over it

The eraser does NOT delete annotation elements (text boxes, shapes, images, comments, highlights). It only erases freehand canvas ink strokes. FEATURES.md §18 documents this correctly with an explicit "Scope" note. The README is misleading — a user expecting to erase/brush-delete text boxes will be confused.

**Fix**: Change to: "**Eraser** — erase freehand canvas strokes (brush over ink to remove it; use Delete key to remove annotation elements)"

---

### DOC-04 · P2 · README.md missing two implemented features (QR/barcode and Fill Bucket)

**File**: `README.md`, Features section
**Confidence**: High — verified by ToolMode type and FEATURES.md §39/§40

**Problem**: Two fully implemented and documented tool modes are absent from README.md's feature list:
1. **QR Code / Barcode tool** — generates QR codes and 1D barcodes (Code 128, Code 39, EAN-13, EAN-8, UPC etc.), styled QR with custom colors/logo. Key shortcut: `Q`.
2. **Fill Bucket tool** — fills shapes and freehand ink strokes with a color. Key shortcut: `B`.

Both are in FEATURES.md (§39, §40) and fully i18n-covered. README is the primary user-facing document and lists other tools in detail.

**Fix**: Add two bullet points to the README Features section.

---

### DOC-05 · P2 · VISION.md "New Feature Ideas" table lists QR code as future work — already shipped

**File**: `VISION.md`
**Confidence**: High — verified by FEATURES.md §40 and src/utils/codeGenerator.ts

**Problem**: The "New Feature Ideas" table in VISION.md lists:
> `| **QR code insertion** | Generate + embed a QR code for a URL |`

This feature is fully implemented (QR + barcode, not just QR). The VISION.md was last updated for the "Parked" section but the new-feature table was not pruned.

Additionally, the "Enhancements to Existing Features" section still lists:
- "Comment / Sticky Note — Per-Note Delete" — FIXED (delete button exists on all elements)
- "Watermark — Tiled / Repeated Pattern" — FIXED (density-based tiling added in fb87e8b)

These stale entries in VISION.md make the roadmap appear incorrect.

**Fix**: Mark QR code insertion as DONE (or remove from table). Mark the two "Enhancements" items as completed.

---

### DOC-06 · P2 · CODE_REVIEW.md is a stale historical document with wrong file paths

**File**: `CODE_REVIEW.md`
**Confidence**: High — verified by ls src/ and the file's own header

**Problem**: CODE_REVIEW.md already declares itself a "Historical document — reflects codebase state as of 2026-06-02." However it contains 16 file path references to `js/pdfEditorApp.ts`, `js/drawingHandler.ts`, etc. The source directory was renamed from `js/` to `src/` (with subdirectory restructure) as of the major-feature-sprint.plan.md decision on 2026-06-10. None of these paths are valid anymore.

Additionally, the Static Gate Results table shows TypeScript errors and ESLint errors that may or may not still exist (the file cannot self-update). The P0-1 redaction finding is marked as fixed, but several P1/P2 findings (P1-4 arrow nudge, P1-5 pinch zoom, P2-1 through P2-7) have no resolution status.

**Assessment**: This file is development scaffolding, not user-facing documentation. It has no value to a public contributor who cannot follow the file paths. It should either be archived in `docs/reviews/` or prefixed with a more prominent "ARCHIVED — all paths invalid after 2026-06-10 js→src rename" notice.

**Fix**: Move to `docs/reviews/archive/code-review-2026-06-02.md` and add a redirect note, OR update all `js/` paths to `src/core/`, `src/elements/`, etc. and mark each P-level finding with its current status.

---

### DOC-07 · P2 · ar.json has orphan `_note` key that must be removed before production

**File**: `locales/ar.json`
**Confidence**: High — confirmed by jq key extraction

**Problem**: `ar.json` contains a top-level key `_note` with value `"Arabic UI labels — needs native-speaker review before production"`. This is a developer comment, not a translation key. i18next will silently ignore it but it:
1. Causes the AR key count to diverge from EN/FR (283 vs 282)
2. Is a developer-only flag that should not ship to production
3. Implies the AR translations need native-speaker review before launch — this is a launch blocker if true

**Fix**: Remove `_note` from ar.json. If native-speaker review is genuinely needed, track it as a GitHub issue, not an in-file key.

---

### DOC-08 · P2 · 13 dead i18n keys in all three locale files

**Files**: `locales/en.json`, `locales/fr.json`, `locales/ar.json`
**Confidence**: Medium — static analysis; may be used in code paths not reached by grep

**Problem**: 13 keys are present in all three locale files but cannot be found referenced anywhere in src/ or index.html:
- `colors.black`, `colors.blue`, `colors.gray`, `colors.green`, `colors.orange`, `colors.purple`, `colors.red`, `colors.teal`, `colors.white`, `colors.yellow`
- `toolbar.commentLabel`, `toolbar.highlightLabel`, `formatting.shapeLabel`

These appear to be planned keys for a color-name feature (e.g. accessible color labels) or label text that was never wired up. Dead keys cause unnecessary translation maintenance burden across all three languages.

**Fix**: Verify these keys are unused, then remove them from all three locale files.

---

### DOC-09 · P2 · FEATURES.md §29 uses obsolete button name "✕ Clear Save"

**File**: `FEATURES.md`, line ~642 and ~649
**Confidence**: High — verified by index.html and locales/en.json

**Problem**: FEATURES.md §29 Session Persistence says:
> "Click **✕ Clear Save** to wipe the saved session"
> "Click **✕ Clear Save** → verify toast 'Saved session cleared'"

The actual button is labeled "↺ Reset Session" (confirmed in index.html `fileMenuResetSession` button, en.json `toolbar.resetSession: "↺ Reset Session"`). This is a stale name from before the UI was redesigned.

**Fix**: Replace "✕ Clear Save" with "↺ Reset Session" in §29 of FEATURES.md.

---

### DOC-10 · P3 · CODE_OF_CONDUCT.md recommends public GitHub issues for harassment reports

**File**: `CODE_OF_CONDUCT.md`
**Confidence**: High — verified by reading the file

**Problem**: The enforcement section says:
> "may be reported by opening a GitHub issue or contacting the project maintainer directly"

Reporting harassment via a PUBLIC GitHub issue is inappropriate — it exposes the reporter and potentially the accused before any investigation. Standard Contributor Covenant practice is a private email channel (the original CoC template uses `[INSERT EMAIL ADDRESS]`). The project maintainer's email is public (in LICENSE), so a simple fix is available.

**Fix**: Replace "opening a GitHub issue" with just "contacting the project maintainer directly at takieddine.messaoudi.official@gmail.com".

---

### DOC-11 · P3 · SECURITY.md SLA promises may not be achievable for a solo developer

**File**: `SECURITY.md`
**Confidence**: Inferred — no observable evidence of timeline

**Problem**: SECURITY.md commits to:
> "acknowledgment within 48 hours and a resolution within 14 days for confirmed issues"

These are reasonable enterprise SLAs but aggressive for a solo developer. If the author is unavailable (vacation, illness), both timelines will be missed — and the policy is now a public contract. The GitHub advisory mechanism is correctly used (private reporting — good), but the timeline commitment creates implicit liability if not met.

**Fix**: Soften to "best-effort" language: "I'll aim to acknowledge within a few days and work toward resolution as soon as possible." Or keep hard timelines only if the author is confident they can maintain them.

---

### DOC-12 · P3 · FEATURES.md is a developer-internal QA checklist, not a user-facing feature guide

**File**: `FEATURES.md`
**Confidence**: High — document content analysis

**Problem**: FEATURES.md is titled "Feature Test Checklist" and contains internal QA steps ("Test steps: 1. Open the app fresh..."), confirmed bug lists, and audit status tables. It is 48KB of developer tooling. If linked from README or visible to external contributors, it exposes internal development status, bug lists, and unresolved P1 issues. Currently README does NOT link to FEATURES.md, but the file is at repo root.

**Assessment**: Not harmful if the intent is to keep it as an internal reference. But it is misnamed — "FEATURES.md" sounds like a user feature list. A public visitor who reads it will see "CONFIRMED BUGS", "BUG-01 (P1)", etc.

**Fix**: Either rename to `docs/QA-CHECKLIST.md` (moving it out of root visibility), or add a prominent "Internal QA document — not the public feature list" header.

---

### DOC-13 · P3 · docs/plans/ contains completed and obsolete plans that should be archived

**Files**: `docs/plans/*.plan.md`
**Confidence**: High — status verified by reading plan files

**Assessment of each plan**:

| Plan | Status | Recommendation |
|---|---|---|
| `pdfturbo-v1-publish.plan.md` | All 5 stages ✅ DONE | Archive — completed sprint. Has the TODO contact email note (now resolved — email is in mentions-legales.html). [KNOWN] |
| `full-audit-2026-06-07.plan.md` | Audit complete; open bugs documented | Keep as living bug reference OR archive since bugs are now tracked in FEATURES.md |
| `major-feature-sprint.plan.md` | All phases ✅ COMPLETE | Archive |
| `toolbar-consolidation.plan.md` | All phases ✅ COMPLETE | Archive |
| `live-audit-phase-c.plan.md` | Audit complete (Phase A/B confirmed) | Archive |
| `pdf-editor-improvements.plan.md` | "SPEC COMPLETE — awaiting brainstorm" | Keep if brainstorm is upcoming; otherwise archive |
| `full-craftsmanship-review-2026-06-11.plan.md` | Ongoing (today's review) | Keep |

**Recommendation**: Move all completed plans to `docs/plans/archive/`. The root `docs/plans/` should contain only active work.

---

### DOC-14 · P3 · mentions-legales TODO from publish plan — RESOLVED [KNOWN]

**Context**: pdfturbo-v1-publish.plan.md flagged a TODO for contact email in Mentions légales. This was an open blocker in the plan.

**Resolution confirmed**: `public/mentions-legales.html` contains `takieddine.messaoudi.official@gmail.com` as the contact in all three languages. The TODO is resolved.

**Action**: None needed for the legal page. Plan should be archived (see DOC-13).

---

### DOC-15 · P3 · privacy.html "Reset Session" label confirmed correct; FEATURES.md name is stale

**Cross-reference with DOC-09**: privacy.html correctly says "Reset Session" button in the File menu. FEATURES.md uses the old name "Clear Save." The privacy page is correct.

---

## Adversarial Questions — Answered

### Does CONTRIBUTING.md make legal sense for an All Rights Reserved repo?

**Answer**: Partially. The setup and workflow instructions are fine. The IP issue is real: PRs submitted to an All Rights Reserved repo do not automatically transfer copyright. Without an explicit CLA statement, the author could be in a legally ambiguous position if a contributor later claims rights to merged code. See DOC-02B.

The GitHub issue/PR templates themselves (bug_report.md, feature_request.md, PULL_REQUEST_TEMPLATE.md) are well-structured and appropriate for a solo project. They do not overclaim.

### Does SECURITY.md have a real contact/process?

**Answer**: Yes, partially. The GitHub private advisory mechanism is the correct channel — this is better than many open-source projects. The 48h/14d SLA commitment is the weak point (see DOC-11). No email fallback is provided if the advisory system is unavailable.

### Is CODE_REVIEW.md current or stale debris?

**Answer**: Stale debris. It is date-stamped 2026-06-02, all `js/` paths are invalid after the 2026-06-10 rename, and the static gate results are from 9+ days ago. Its value is historical only. It should be archived (see DOC-06).

### Does THIRD-PARTY-NOTICES.md list ALL production deps?

**Answer**: No. Three actively-used production dependencies are missing: `@cantoo/pdf-lib` (the primary export engine), `bwip-js` (barcode renderer), and `qr-code-styling` (QR generator). All are MIT. See DOC-01. `qpdf-wasm` is in package.json but appears unused in src/ — a dead dependency. The devDependencies `vite` and `vite-plugin-pwa` are included in notices (unusual but harmless).

### Do privacy.html claims match code reality?

**Answer**: Yes. Verified by grep across all src/ — zero `fetch()` calls, zero `XMLHttpRequest`, zero analytics/tracking library imports. The privacy claims ("nothing uploaded, nothing tracked") are accurate. The IndexedDB disclosure is correctly present and technically accurate (PDF content + annotations, dismissed via Reset Session button). The localStorage disclosure correctly lists both `i18nextLng` and `pdfturbo_storage_notice`. No discrepancy detected.

### Does mentions-legales.html still contain the TODO contact email?

**Answer**: No — the TODO is resolved. The email `takieddine.messaoudi.official@gmail.com` is present in all three language sections. [KNOWN — from pdfturbo-v1-publish.plan.md]

### Are README run/deploy instructions accurate?

**Answer**: Yes. `npm run dev` (vite), `npm run build`, `npm run preview` all match package.json scripts. The URL `http://localhost:5173/pdfturbo/` is correct (Vite default port 5173, base='/pdfturbo/' in vite.config.ts). The GitHub Actions workflow correctly runs `type-check → lint → test → build` as stated in README. Deploy target `https://YOUR_USERNAME.github.io/pdfturbo/` is consistent with base path.

---

## What is GOOD

1. **Privacy pages are excellent** — all three languages, technically accurate, correct IndexedDB/localStorage disclosure, no tracking claims are truthful, no dark patterns.
2. **i18n coverage is complete** — EN/FR in perfect sync (282 keys each), AR nearly perfect (1 orphan comment key). All dynamic keys (badgeKeys, modeHintKeys, plural forms) are correctly covered.
3. **LICENSE is unambiguous** — "All Rights Reserved" is crystal clear; includes licensing inquiry email.
4. **SECURITY.md uses the right channel** — GitHub private advisory is the professional approach.
5. **GitHub templates are high quality** — bug_report.md, feature_request.md, and PULL_REQUEST_TEMPLATE.md are well-structured, ask for the right information, and have no extraneous boilerplate.
6. **FEATURES.md is detailed and accurate** — the QA checklist is comprehensive, every known limitation is documented, known bugs reference correct IDs.
7. **mentions-legales.html is legally complete** — publisher identity, hosting provider (GitHub Inc. with address), contact email, three languages, no outstanding TODOs.
8. **README run instructions are 100% accurate** — script names, URLs, and deploy instructions all verified against package.json and vite.config.ts.
9. **VISION.md is honest about limitations** — explicitly calls out which form field types are not supported, marks completed dependency upgrades as done.
10. **AR legal pages contain real Arabic text** — spot-checked privacy.html and mentions-legales.html; Arabic characters are present and appear to be genuine Arabic prose (not romanized transliteration).

---

## Summary Table

| ID | Severity | File | Issue |
|---|---|---|---|
| DOC-01 | P1 | THIRD-PARTY-NOTICES.md | Missing @cantoo/pdf-lib, bwip-js, qr-code-styling (all MIT, all used in prod) |
| DOC-02 | P1 | CONTRIBUTING.md | Wrong source dir `js/` (should be `src/`); no CLA for All Rights Reserved repo |
| DOC-03 | P2 | README.md | Eraser claimed to "delete any element by brushing" — FALSE, canvas ink only |
| DOC-04 | P2 | README.md | QR/barcode tool and Fill Bucket tool not mentioned (both fully implemented) |
| DOC-05 | P2 | VISION.md | QR code + 2 enhancements listed as future/open — all already shipped |
| DOC-06 | P2 | CODE_REVIEW.md | Stale historical doc; all `js/` file paths invalid after 2026-06-10 rename |
| DOC-07 | P2 | locales/ar.json | Orphan `_note` developer comment key in production locale file |
| DOC-08 | P2 | locales/*.json | 13 dead keys (colors.* × 10, toolbar.commentLabel/highlightLabel, formatting.shapeLabel) |
| DOC-09 | P2 | FEATURES.md | §29 uses obsolete "✕ Clear Save" — actual button is "↺ Reset Session" |
| DOC-10 | P3 | CODE_OF_CONDUCT.md | Harassment reports directed to public GitHub issues — should be private contact |
| DOC-11 | P3 | SECURITY.md | 48h/14d SLA commitment may be unrealistic for solo developer |
| DOC-12 | P3 | FEATURES.md | QA checklist at repo root named FEATURES.md — exposes internal bug status to public |
| DOC-13 | P3 | docs/plans/*.plan.md | 5+ completed plans not archived; clutter and confusion |
| DOC-14 | P3 | docs/plans/ | mentions-legales TODO from publish plan — RESOLVED [KNOWN] |
| DOC-15 | P3 | (cross-ref) | privacy.html Reset Session label correct; FEATURES.md name stale — covered by DOC-09 |
