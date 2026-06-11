# PDF → DOCX (+ multi-format) Conversion — Research + Prototype Plan (2026-06-11)

## Decisions Log
- [2026-06-11] AGREED: Task = Large — full scope: web-verified research + verdict doc + working prototype; autonomous gates (same mode as Phase A)
- [2026-06-11] DECISION (research-driven): path = DIY reconstruction — pdf.js `getTextContent` → TS FlowDoc model (porting pdf2docx's now-MIT heuristics) → `docx` npm writer (MIT). All alternatives rejected: commercial WASM ($1.8k–$220k/yr), LibreOffice WASM (50MB–1GB + Draw-frame output), Pyodide+pdf2docx (AGPL PyMuPDF), cloud APIs (violates client-only promise)
- [2026-06-11] DECISION (scope): v1 = paragraphs/headings/bold-italic/alignment/RTL → DOCX + Markdown + TXT; tables/images/columns/font-embedding = roadmap Phase 2/3; overlay annotations NOT exported in v1
- [2026-06-11] DECISION (technical): `docx` loaded via dynamic import (code-split chunk); DOCX smoke-tested via Packer base64 PK magic in jsdom

- [2026-06-11] EXECUTED: all 8 plan steps complete — research (3 raw reports), verdict doc, FlowDoc engine + DOCX/MD/TXT writers (14 new tests), UI flyout buttons, i18n ×3; 410/410 tests, type-check/lint/build green; docx is a lazy 395 KB chunk; awaiting user browser test

## Formal Plan
1. `npm i docx` (MIT, dolanmiu, v9.x — active)
2. TDD red: `tests/utils/flowDoc.test.ts` (line grouping, space insertion, paragraph split, heading inference, bold/italic sniffing, RTL, alignment) + `tests/utils/flowDocWriters.test.ts` (markdown/txt output, DOCX PK-magic smoke)
3. `src/utils/flowDoc.ts` — FlowDoc model + pure `reconstructPage()` (pdfminer.six/pdf2docx heuristics, font-size-relative tolerances)
4. `src/utils/flowDocWriters.ts` — `flowDocToMarkdown`, `flowDocToText`, `flowDocToDocx` (dynamic import('docx'); bidi props for RTL; Word-safe font mapping)
5. `src/core/pdfEditorApp.ts` — `extractFlowDoc()` over documentModel pages + `exportAsDocx()` / `exportAsMarkdown()`; empty-extraction toast guard
6. UI: `exportDocxBtn` + `exportMdBtn` in `#exportFlyout` (index.html), refs + `enableUI()` in uiController; i18n keys ×3 locales
7. `docs/reviews/2026-06-11-pdf-to-docx-verdict.md` — full senior verdict + fidelity ceiling + roadmap
8. CLAUDE.md gotcha note; full suite + type-check + lint + build proof

## Acceptance criteria
- Load a text PDF → export flyout → DOCX downloads, opens in Word/LibreOffice with flowing paragraphs, headings, bold/italic
- Markdown/TXT export produce faithful structure
- Scanned/empty PDF → warning toast, no empty file
- 400+ tests green, type-check/lint/build green, locales key-identical

## Rollback
All new files; revert = delete `src/utils/flowDoc*.ts`, writers, tests, flyout buttons, i18n keys, `npm un docx`.
