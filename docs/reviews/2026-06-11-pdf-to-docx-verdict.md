# PDF → DOCX (+ Multi-Format) Conversion — Research & Senior Verdict (2026-06-11)

> Raw web-verified research: `raw/pdf2docx-landscape.md` (commercial/OSS landscape),
> `raw/pdf2docx-browser-feasibility.md` (WASM/browser options), `raw/pdf2docx-algorithms.md`
> (layout-reconstruction algorithms with pseudo-code).
> Prototype shipped this session: `src/utils/flowDoc.ts` + `src/utils/flowDocWriters.ts`
> (+ 14 tests), wired into the export flyout (DOCX / MD buttons, beta).

## Executive verdict

**"100% true conversion" of PDF→DOCX is physically impossible — for everyone, including
Adobe.** PDF is a fixed-layout format: glyphs painted at coordinates with **no** paragraph,
table, column, or reading-order semantics (unless the PDF is tagged — only ~15.5% of real
PDFs are). Every converter on earth performs *reconstruction by inference*, and quality is
bimodal: excellent on born-digital reports/letters/books, degraded-to-poor on magazines,
forms, and scans. Adobe's own exporter is licensed Solid Documents technology (since
Acrobat X) running heavy heuristics server-side/desktop — and it still produces imperfect
Word files on complex layouts.

**For a free, MIT-licensed, 100%-client-side app, there is exactly one viable path** —
the one now implemented: pdf.js text extraction → TypeScript layout reconstruction
(porting pdf2docx's heuristics, MIT since v0.5.13) → the `docx` npm writer (MIT, active).
Everything else fails on license, cost, size, or architecture:

| Path | True in-browser PDF→DOCX? | Why rejected |
|---|---|---|
| Nutrient/PSPDFKit Web (WASM) | YES | ~$2.5k–$220k/yr (avg ~$76k) — economically absurd for a free app |
| Aspose.PDF for JavaScript (WASM) | YES | ~$1,797/yr/developer, proprietary |
| Apryse "Structured Output" | NO — server/desktop only despite WASM viewer | architecture + cost |
| Solid Documents (Adobe's engine) | NO — .NET only | platform + unpublished pricing |
| LibreOffice WASM (ZetaJS) | technically, badly | 50 MB–1 GB assets; imports PDF as Draw text frames → DOCX of text boxes, not paragraphs |
| Pyodide + pdf2docx | almost | hard dependency on PyMuPDF = **AGPL** + experimental WASM build |
| mupdf.js | NO (no DOCX output in any mutool version) | AGPL anyway |
| Cloud APIs (Adobe $0.05/doc, CloudConvert, ConvertAPI) | n/a | requires a backend; violates "nothing uploaded" |
| **DIY: pdf.js → FlowDoc → `docx` npm** | **YES (text-fidelity tier)** | ✅ **CHOSEN — shipped as beta** |

## What was built (Phase 1, this session)

A pandoc-style **shared intermediate model** (`FlowDoc`) so every flow format is one
writer away — this is the "flexible for other formats" architecture:

```
PDF (pdf.js getTextContent, per page)
  └─> reconstructPage()         src/utils/flowDoc.ts
        baseline clustering → lines (tol 0.5×font-size, pdfminer.six recipe)
        gap analysis → word spacing (0.15×size) and paragraph breaks (1.6×size)
        font-name sniffing → bold/italic; styles map → serif/sans/mono
        document-wide size clustering → H1–H3 vs body (pymupdf4llm recipe)
        center/right alignment inference; per-run + per-paragraph RTL (bidi)
  └─> FlowDoc ──> flowDocToDocxBlob()   docx npm (MIT), lazy chunk ~395 KB, Word page size,
       │                                headings, alignment, w:bidi/w:rtl for Arabic
       ├──────> flowDocToMarkdown()     #/##/### headings, **bold**, *italic*
       └──────> flowDocToText()         plain text
```

UI: export flyout (▾ next to Download) → **DOCX** / **MD** buttons (beta-labeled,
i18n ×3). Scanned PDFs (no text layer) get a warning toast instead of an empty file.
The `docx` library is dynamically imported — zero impact on initial bundle.

## Honest fidelity statement (what "beta" means)

**Recovered today**: flowing paragraphs, heading levels, bold/italic, font-size, serif/
sans/mono mapping (Times New Roman / Arial / Courier New), center/right alignment,
Arabic/RTL bidi flags, per-page Word sections at true page size.

**Not yet** (roadmap below): tables, images, multi-column reading order, lists,
exact font matching/embedding, overlay annotations made in pdfturbo, scanned PDFs (OCR).

**Never (by anyone)**: pixel-identical round-trip. Subset-embedded fonts cannot be
re-embedded for new text; un-tagged PDFs force heuristic structure inference; editing
flow ≠ painted layout. The $200k/yr SDKs ship better heuristics, not magic.

## Roadmap

| Phase | Work | Effort |
|---|---|---|
| **1 — text fidelity** ✅ DONE 2026-06-11 | FlowDoc model + DOCX/MD/TXT writers + UI (beta) | shipped |
| **2 — structure** | Images (`getOperatorList` OPS.paintImageXObject → inline DOCX images); lattice tables (vector rulings via OPS.constructPath → cell grid — pdf2docx/pdfplumber method); 2-column via recursive XY-cut; list detection (bullet/number sniffing) | 1–2 weeks |
| **3 — polish** | Font-name matching beyond 3 families; optional font embedding (`docx` supports it; subset caveat); RTL logical reorder + presentation-form normalization; HTML/EPUB writers off the same FlowDoc; tagged-PDF fast path via `getStructTree()` | 1–2 weeks |
| **Out of scope** | OCR for scanned PDFs (tesseract.js exists but is a separate product decision); PPTX/XLSX (wrong document model); stream-mode (unruled) table detection (chronic false positives) | — |

**Recommendation:** keep DOCX/MD labeled *beta*, gather real-document feedback, then
prioritize Phase 2 images+tables — that's where the largest perceived-quality jump lives.
