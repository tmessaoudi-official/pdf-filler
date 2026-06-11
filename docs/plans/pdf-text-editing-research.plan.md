# PDF True Text Editing — Research + Prototype Plan (2026-06-11)

## Decisions Log
- [2026-06-11] AGREED: Task = Large — research verdict + working prototype this session
- [2026-06-11] AGREED: Research depth = web-verified (two agents; raw reports in docs/reviews/raw/)
- [2026-06-11] AGREED: Plan approved — engine + tests + verdict doc + dead-dep removal; UI wiring deferred to roadmap
- [2026-06-11] DECISION (technical): approach = content-stream operator surgery via @cantoo/pdf-lib; position-matched op location (text-matrix tracking), NOT index-alignment with pdf.js items
- [2026-06-11] DECISION (technical): deletion = blank the string operand (state-safe re line-advance ops ' and "), replacement = blank + page.drawText fallback font

- [2026-06-11] EXECUTED: all 4 plan steps complete — engine (10/10 tests), verdict doc, deps removed (392/392 + build green)
- [2026-06-11] AGREED: Phase A (UI wiring) = Large, full scope, autonomous gates
- [2026-06-11] EXECUTED: Phase A shipped — findTextOpAt + ReplaceSourcePdfBytesCmd + _applySourcePdfEdit + textEditHandler true-edit-first with overlay fallback; i18n ×3; 396/396 tests, type-check/lint/build green; awaiting user browser test

## Formal Plan
1. `tests/utils/contentStreamEditor.test.ts` — TDD red first: tokenizer round-trip, op location (Td/Tm/TJ/quote), deleteTextAt removes string from saved PDF, replaceTextAt adds new text at origin, document still parses
2. `src/utils/contentStreamEditor.ts` — tokenizer, text-op locator, deleteTextAt, replaceTextAt
3. `docs/reviews/2026-06-11-pdf-text-editing-verdict.md` — full verdict + roadmap
4. Remove dead deps `pdf-lib`, `qpdf-wasm` (npm uninstall) + full suite/type-check/lint proof

## Documented prototype limitations (roadmap items, not bugs)
- pdf.js item.transform includes CTM; ops wrapped in `cm` transforms will mismatch — Phase B
- Consecutive show-ops without repositioning share an origin — nearest-match may need occurrence hint
- Replacement font = Helvetica fallback (subset-glyph reuse = Phase B)
- XObject Form content streams not recursed; inline images (BI..EI) passed through raw
