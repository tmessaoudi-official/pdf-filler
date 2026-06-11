# PDF True Text Editing — Library Review & Senior Verdict (2026-06-11)

> Raw web-verified research: `raw/deps-research.md` (dependency audit) and
> `raw/textedit-research.md` (12 candidate paths for true text editing).
> Prototype: `src/utils/contentStreamEditor.ts` + `tests/utils/contentStreamEditor.test.ts` (10 tests).

## Executive verdict

**There is no MIT/Apache JavaScript library that edits existing PDF text out of the box —
and there will not be one soon.** The capability exists in exactly three forms: commercial
SDKs (Apryse, Nutrient, ComPDFKit — $10K–$200K/yr), AGPL engines (mupdf.js — unusable in a
proprietary app without a paid Artifex license), and **do-it-yourself content-stream
surgery**, which is the path this project has now proven with a working, tested engine.
The current overlay approach (`textEditHandler`) is the industry-standard workaround —
but pdfturbo can now do better than the workaround.

## Dependency review (web-verified, June 2026)

| Dependency | Verdict | Why |
|---|---|---|
| @cantoo/pdf-lib 2.7.1 | **KEEP** | Active fork (commit 2026-05-27), MIT, at latest; upstream pdf-lib still abandoned |
| pdf-lib 1.17.1 | **REMOVED** ✅ | Abandoned ~2021, zero imports — uninstalled this session, suite + build green |
| qpdf-wasm 0.1.0 | **REMOVED** ✅ | Prototype-grade (6 commits), zero imports — uninstalled this session |
| pdfjs-dist ^6.0.0 | **KEEP** | Current major (6.0.227, 2026-05-30); v5 EOL'd April 2026 |
| bwip-js 4.11.1 | **KEEP** | At latest, actively maintained, best-in-class, no credible alternative |
| qr-code-styling 1.9.2 | **WATCH** | At latest but ~1yr since publish; no equivalent for styled QR; fall back to `qrcode` only if styling is dropped |
| i18next 26.3.1 (+ languagedetector) | **KEEP** | Current, active (published days ago) |
| vite 8 / vitest 4 / TS 6 / eslint 10 | **KEEP** | All on current majors; TS 7 beta (Go rewrite) announced 2026-04 — watch, don't adopt |

**Watch item:** `@pdfme/pdf-lib` (MIT, active) is the only realistic future alternative to
@cantoo/pdf-lib if the Cantoo fork stalls.

## The 12 paths to true text editing — comparison

| Path | True edit? | License/cost | Verdict for pdfturbo |
|---|---|---|---|
| DIY content-stream surgery (@cantoo/pdf-lib) | **YES** (fallback-font fidelity) | MIT, free | ✅ **CHOSEN — prototype working** |
| mupdf.js (Artifex WASM) | Partial (byte-level stream API, no text abstraction) | AGPL / $1.5K–$50K+ | ❌ License-incompatible |
| PDFium WASM wrappers | Engine yes, wrappers NO | BSD-3 | ❌ No wrapper exposes `FPDFText_SetText` (2026); viable only if we compile our own WASM — Phase C option |
| Apryse WebViewer | YES (since v10.3, add-on) | ~$10K+/yr | ❌ Economically absurd for a free app |
| Nutrient (PSPDFKit) Web | YES | $25K–$200K/yr | ❌ Same |
| ComPDFKit Web | YES (claimed) | Custom quote | ❌ Same, opaque pricing |
| Foxit Web SDK | Unverified for content streams | Proprietary | ❌ |
| Adobe Acrobat Web | YES (proof the architecture works) | Not licensable | — existence proof only |
| Stirling PDF 2.0 | YES but server-side Java | AGPL/$99mo | ❌ Requires backend |
| Syncfusion JS PDF | NO (forms/annotations only) | Proprietary | ❌ |
| DsPdfViewer | Unverified | Proprietary | ❌ |
| replace-text-pdf (Crystal CLI) | YES, CLI-only | OSS | — algorithm prior art only |

## What was built (the innovation)

`src/utils/contentStreamEditor.ts` — a position-matched operator-surgery engine:

1. **Tokenizer** for PDF content streams (literal/hex strings, names, arrays, dicts,
   comments, inline images passed through raw) — round-trip safe.
2. **Text-state walker**: tracks `BT/Tf/TL/Td/TD/Tm/T*` and computes the exact baseline
   origin of every `Tj`/`TJ`/`'`/`"` show-operator. **Matching is by position, not by
   index** — immune to pdf.js item merging, and requires no font decoding to delete.
3. **`deleteTextAt(doc, page, {x,y})`** — blanks the matched operator's string payload
   in place (state-safe: line-advance side effects of `'`/`"` are preserved), rewrites
   the content stream. The text is GONE from the PDF — not covered, gone.
4. **`replaceTextAt(doc, page, {x,y}, newText)`** — delete + redraw at the identical
   baseline origin with the detected font size (Helvetica fallback).

**Proof (10/10 tests):** generated 3-string PDF → delete at (50,300) → saved PDF's decoded
content stream no longer contains the string, neighbors intact, document re-parses; replace
→ new text present at the same origin with the same size. Full suite 392/392 green.

## Honest fidelity limits (the part vendors don't tell you)

- **The subset-font problem is fundamental**: embedded fonts are subset to only the glyphs
  the document uses. Writing NEW characters requires either a fallback font (visual
  mismatch with surrounding text) or glyphs that happen to exist in the subset. No library
  — including the $200K/yr ones — can recover glyphs that were never embedded; commercial
  SDKs ship font-matching heuristics, not magic.
- No text reflow: editing one word does not re-wrap the paragraph (same as Acrobat's
  per-block behavior).
- Prototype scope: ops inside `cm`-transformed blocks and Form XObjects not yet handled;
  consecutive show-ops sharing an origin need an occurrence hint. All tracked below.

## Roadmap to shipping "true edit" in the UI

| Phase | Work | Effort |
|---|---|---|
| **A — wire it in** ✅ **DONE 2026-06-11** | `textEditHandler` tries a true edit first: click word → pdf.js origin → `findTextOpAt` pre-check → inline floating input → `replaceTextAt`/`deleteTextAt` → `_applySourcePdfEdit` swaps bytes + pdfjs doc → re-render. Overlay is the automatic fallback (no match / encrypted PDF). Undo via `ReplaceSourcePdfBytesCmd`. | shipped |
| **B — fidelity** | Reuse the embedded subset when all needed glyphs exist (parse `ToUnicode` CMap to build the unicode→code map); font-matching fallback (serif/sans/mono + bold/italic from the font descriptor); width-compensating TJ kerning so same-line neighbors don't shift. | 3–5 days |
| **C — coverage** | `cm` matrix composition, Form XObject recursion, rotated pages, RTL. Optional moonshot: compile PDFium to WASM exposing `FPDFText_SetText` — would leapfrog every OSS wrapper in existence. | 1–2 weeks |

**Recommendation:** ship Phase A behind the existing edit-text UI as a progressive
enhancement (true edit when matchable, overlay as automatic fallback). That combination —
free, client-only, license-clean — is something none of the OSS competition currently has.
