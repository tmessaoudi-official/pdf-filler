# PDF→DOCX in the Browser — Feasibility Research (Raw Report)

**Date**: 2026-06-11
**Context**: pdfturbo — 100% client-side PDF editor (TypeScript + Vite, pdfjs-dist v6.0.227, @cantoo/pdf-lib). Requirement: PDF→DOCX conversion running entirely in the browser, free, MIT-compatible licensing.
**Method**: Web verification (GitHub, npm, official docs, press) + direct source inspection of the locally installed `pdfjs-dist@6.0.227` (`node_modules/pdfjs-dist/build/pdf.mjs`, `build/pdf.worker.mjs`, `types/src/display/api.d.ts`).
**Legend**: Each claim carries an evidence grade — [Verified: …] / [Inferred: …] / [Unverified: …].

---

## 1. LibreOffice in the browser — ZetaJS / ZetaOffice (allotropia)

| Aspect | Finding |
|---|---|
| What it is | JS wrapper (`zetajs`) controlling a WASM build of LibreOffice ("ZetaOffice") via UNO API; supports headless background document conversion. [Verified: README, https://github.com/allotropia/zetajs] |
| License | `zetajs` wrapper: **MIT**. [Verified: repo license, https://github.com/allotropia/zetajs] The Register reports allotropia's code is MIT and upstreamed to LibreOffice; the LibreOffice core itself remains MPL-2.0. [Verified: https://www.theregister.com/2025/02/13/libreoffice_wasm_zetaoffice/ for MIT/upstreaming; Inferred for MPL-2.0 core — standard LibreOffice licensing, not restated in the article] |
| Status (2026) | Open beta; latest zetajs release v1.2.0 (June 2025); npm package active. [Verified: GitHub releases page + npm] |
| Bundle size | **Massive.** The Register: "Opening a document in a web page can pull in a gigabyte or so of code, and the memory footprint is a bit more than that"; modularization in progress. [Verified: The Register article above] An HN commenter measured ~50 MB initial download for the demo. [Verified: https://news.ycombinator.com/item?id=42249746 — single anecdote; the two figures likely measure different things (compressed initial fetch vs. total resident code/memory)] |
| WASM assets | Fetched from ZetaOffice CDN by default; self-hosting possible; CDN pricing not disclosed on the pages fetched. [Verified: zetajs README; Unverified: pricing — zetaoffice.net commercial pages not fetched] |
| PDF→DOCX viability | **Poor by architecture.** LibreOffice imports PDFs into **Draw** (fixed-layout graphic model), not Writer; there is no direct Draw→DOCX path, and PDF→Writer conversion is known to produce broken formatting. [Verified: search-confirmed LibreOffice behavior, e.g. https://pdf.wondershare.com/how-to/import-pdf-to-libreoffice.html; Inferred: headless `--convert-to docx` on a PDF routes through the same Draw import and yields low-quality output — consistent with all documented LibreOffice behavior, not benchmarked here] |

**Verdict**: Not production-viable for pdfturbo. Even ignoring the ~50 MB–1 GB asset weight (vs. pdfturbo's current lightweight PWA), the conversion quality ceiling is low because LibreOffice's PDF import is Draw-based. License itself would be acceptable (MIT wrapper + MPL-2.0 core — both MIT-compatible for use).

---

## 2. Pyodide route — pdf2docx under Pyodide

| Aspect | Finding |
|---|---|
| pdf2docx ownership/license | Transferred to **ArtifexSoftware** and **relicensed under MIT** "so that the community can freely use, fork, and maintain the project"; latest release 0.5.13 (May 1, 2026); **no longer actively maintained by Artifex** (community PRs welcome). [Verified: https://github.com/ArtifexSoftware/pdf2docx README] |
| PyMuPDF dependency | pdf2docx is built on PyMuPDF (fitz) — and **PyMuPDF is AGPL-3.0** (dual-licensed commercially by Artifex). [Verified: https://artifex.com/licensing and https://pypi.org/project/pdf2docx/ — pdf2docx PyPI lists PyMuPDF as its core engine; Inferred: MIT relicense of pdf2docx does NOT cure the stack because the AGPL dependency dominates the combined work] |
| Does PyMuPDF load in Pyodide? | **Yes, experimentally.** Official PyMuPDF docs ship a Pyodide build: "currently experimental". `micropip.install()` does NOT work (shared-library use); the wheel must be loaded via `pyodide_js.loadPackage(url)` from a CORS-enabled host. [Verified: https://pymupdf.readthedocs.io/en/latest/pyodide.html] |
| Proof it works end-to-end | **@bentopdf/pymupdf-wasm** (github.com/alam00000/bentopdf-pymupdf-wasm): PyMuPDF + pdf2docx running in-browser via Pyodide, published on npm/jsDelivr. License: **AGPL-3.0**. Small project (9 stars, 40 commits), TypeScript wrapper, Docker rebuild, optional Ghostscript-WASM CDN dependency. [Verified: repo README + npm listing] |
| Weight | Pyodide runtime + PyMuPDF wheel + python-docx + pdf2docx — tens of MB before first conversion. [Inferred: Pyodide core alone is ~10+ MB and the PyMuPDF wheel is a large native build; exact total not measured — Unverified: precise byte sizes] |

**Verdict**: Technically feasible and **proven by prior art** (bentopdf), but **license-blocked**: PyMuPDF's AGPL-3.0 is incompatible with pdfturbo's MIT-compatible requirement, and the whole route carries a heavy Pyodide payload plus "experimental" status from PyMuPDF upstream. The MIT relicense of pdf2docx itself is still valuable: its **layout-reconstruction algorithms can be legally ported/reimplemented in TypeScript** (MIT code reading/porting is fine; only the PyMuPDF dependency is AGPL).

---

## 3. Other WASM engines

| Engine | PDF→DOCX? | License | Notes |
|---|---|---|---|
| **mupdf.js** (ArtifexSoftware) | **No.** `mutool convert` output formats are: CBZ/PNG/PNM/PGM/PPM/PAM/PBM (raster), PCL/PCLM/PS/PWG (print), PDF/SVG (vector), HTML/XHTML/TEXT/**STEXT** (text). No DOCX, no ODT — checked docs for 1.24.0, 1.26.3 and 1.27.1. [Verified: https://mupdf.readthedocs.io/en/1.24.0/mutool-convert.html and /en/1.26.3/tools/mutool-convert.html] | **AGPL-3.0** (or commercial from Artifex) [Verified: https://artifex.com/licensing, npm `mupdf` package] | Its STEXT (structured text with positions/fonts) would be a good extraction source, but AGPL blocks it anyway. "mutool convert docx" **does not exist in any version**. |
| **PDFium WASM** (`@embedpdf/pdfium`, pdfium.js) | **No conversion API.** Exposes `FPDFText_*` char-level text extraction (text, char boxes, fonts); no structure/document export. [Verified: https://www.embedpdf.com/docs/pdfium/introduction + extract-text example] | PDFium: BSD-3-Clause / Apache-2.0 [Inferred: standard Chromium PDFium licensing; wrapper licenses vary per package — Unverified per-wrapper] | Equivalent in capability to what pdf.js already gives pdfturbo — no added value since pdf.js is already integrated. |
| **Aspose.PDF for JavaScript via C++** | **Yes — real.** PDF→DOC/DOCX in-browser via WASM, officially supported. [Verified: https://products.aspose.com/pdf/javascript-cpp/ and https://docs.aspose.com/pdf/javascript-cpp/key-features/] | **Commercial/proprietary.** From ~$1,175 (Developer Small Business). [Verified: https://www.componentsource.com/product/aspose-pdf-for-javascript-via-cpp/prices] | Disqualified: paid + proprietary. WASM size not published (their Node sibling is known-heavy). [Unverified: bundle size] |
| **pdf2htmlEX WASM** | No port exists. Project itself "no longer under active development, new maintainers wanted". [Verified: https://github.com/pdf2htmlEX/pdf2htmlEX; no WASM port surfaced in searches] | GPLv3+ anyway | Dead end. |
| **pdfplumber-wasm** | Extraction only (text/words/chars/tables), not DOCX. [Verified: npm listing exists; capabilities per listing — Unverified in depth] | Unverified | Could inform table detection heuristics only. |

**Verdict**: **No MIT-compatible WASM engine performs PDF→DOCX.** The only real WASM converters are AGPL (PyMuPDF/pdf2docx stack) or commercial (Aspose).

---

## 4. JS DOCX writers (foundation for a DIY converter)

### `docx` (dolanmiu/docx) — the clear winner

- **License**: MIT. [Verified: https://github.com/dolanmiu/docx]
- **Maintenance 2026**: Active — v9.7.1 published ~2 weeks before research date; docs indexed Feb 2026. [Verified: npm page]
- **Browser support**: first-class (works in Node and browser; `Packer` outputs Blob/ArrayBuffer/base64). [Verified: README]
- **Floating/absolutely-positioned text**: supported via **Text Frames** (`w:framePr` with absolute x/y anchor) — exactly the primitive needed for positional PDF reconstruction. **Caveat**: Google Docs and LibreOffice 7 render `w:framePr` poorly (they expect `w:drawing` shapes); Word renders it correctly. [Verified: https://github.com/dolanmiu/docx/issues/866]
- **Tables, images, headers/footers, section page size/margins, tabs**: all supported (core feature set). [Verified: README/docs feature list; individual APIs not re-tested here — Inferred for completeness of each]
- **Font embedding**: **YES** — `new Document({ fonts: [{ name, data, characterSet? }] })`; TTF/OTF accepted (TTF recommended); fonts stored as obfuscated `fontN.odttf` in the package. Browser usage requires font bytes as Buffer/ArrayBuffer. Earlier bugs (font names with spaces corrupting files; some fonts not rendering in Word 365/macOS — issue #2521) were addressed via PR #2800. [Verified: https://raw.githubusercontent.com/dolanmiu/docx/master/docs/usage/fonts.md + issue #2521]

### Alternatives (all rejected)

| Library | Status | Why rejected |
|---|---|---|
| `officegen` | Last publish 0.6.5, **5+ years ago** (abandoned). MIT. [Verified: npm] | Dead; weaker API. |
| `html-docx-js` | Last publish **10 years ago**. [Verified: npm] | Dead. Also altChunk-based (HTML blob inside DOCX), not real OOXML. |
| `@turbodocx/html-to-docx` | Actively maintained fork by TurboDocx. [Verified: npm/GitHub] | HTML→DOCX only — would force a lossy PDF→HTML intermediate; positioning fidelity poor. |
| `docxtemplater` | Active; core MIT but **templating engine only** (fills placeholders in an existing .docx template; paid modules for images/HTML). [Verified: well-documented model; Inferred: unsuitable — generation from scratch is not its job] | Wrong tool class. |

---

## 5. Prior art — PDF→structured-document reconstruction in JS, and what pdf.js exposes

### Prior art
- **No mature MIT/pure-JS PDF→DOCX project exists.** GitHub sweep found only toy/student projects: `KCH6937/pdf-to-docx` (thin Node lib), `raj-bhanderi/pdf-to-word-converter-frontend` (React UI, conversion likely not client-side). [Verified: search results; Inferred: neither is a usable foundation]
- **bentopdf-pymupdf-wasm** (§2) is the only verified fully-in-browser PDF→DOCX — via Python/AGPL, not JS. [Verified: §2]
- **pdf2docx (MIT since the Artifex transfer)** is the best **algorithmic reference**: its layout pipeline (text-block clustering, table detection from ruling lines + cell merging, float/image placement) is now legally portable to TypeScript. [Verified: MIT license per §2; Inferred: porting effort is substantial — multi-week]

### What pdf.js v6 actually exposes (verified directly in `pdfjs-dist@6.0.227` local source)

- **`page.getTextContent()`** → `TextContent { items, styles, lang }`; each `TextItem = { str, dir ('ttb'|'ltr'|'rtl'), transform (matrix), width, height, fontName, hasEOL }`. `styles` maps fontName → `TextStyle { ascent, descent, vertical, fontFamily… }`. Options: `includeMarkedContent`, `disableNormalization`. [Verified: `types/src/display/api.d.ts` lines 273–345]
- **`page.getStructTree()`** (Tagged-PDF API) → `StructTreeNode { role, children }` tree (root role `"Root"`), leaves are `StructTreeContent { type: "content"|"object", id }` where `id` maps to text-layer items — giving real paragraph/heading/table semantics **when the PDF is tagged**. Returns null/empty for untagged PDFs (the majority in the wild). [Verified: `api.d.ts` lines 515–545 for the shape; Inferred: untagged-PDF prevalence — common knowledge, not measured]
- **Font objects via `page.commonObjs.get(fontName)`** → main-thread font object exposes: `name`, `loadedName`, **`fallbackName`** — computed in the worker as `"monospace" | "serif" | "sans-serif"` (or a basename match), i.e. **serif-ness IS derivable** without touching internals; plus booleans **`bold`, `italic`, `black`**, `isType3Font`, `missingFile`, `vertical`; metrics `ascent`, `descent`, `bbox`, `fontMatrix`, `defaultWidth`; `cssFontInfo { fontFamily, fontWeight, italicAngle }`, `systemFontInfo { css, baseFontName, … }`; and **`data` — the raw embedded font program bytes**. [Verified: `build/pdf.mjs` lines 7993–8232 (FontFaceObject getters + FONT_INFO field lists: bools `["black","bold","disableFontFace","fontExtraProperties","isInvalidPDFjsFont","isType3Font","italic","missingFile","remeasure","vertical"]`, strings `["fallbackName","loadedName","mimetype","name"]`); `build/pdf.worker.mjs` lines 26940–26978 (`isSerifFont` from `FontFlags.Serif` → `fallbackName = "serif"|"sans-serif"|"monospace"`)]
- Note: `isSerifFont` itself stays worker-side; the main thread sees its result through `fallbackName`. [Verified: grep of `build/pdf.mjs` shows no `isSerifFont`; worker computes it]
- `getDocument({ fontExtraProperties: true })` keeps extra font data alive for inspection. [Verified: `api.d.ts` line 159]

**Implication [Inferred]**: pdf.js already supplies everything a DIY converter needs — positioned glyph runs with per-run font identity, bold/italic/serif classification, raw font bytes (for optional DOCX font embedding), plus a semantic structure tree for the tagged-PDF subset. The missing piece is the layout-analysis middle layer (line/paragraph/column/table reconstruction) — which is exactly what MIT-licensed pdf2docx models.

---

## 6. DOCX font story

- **OOXML supports font embedding natively**: `word/fontTable.xml` + embedded **obfuscated TTF (`.odttf`)** parts (ECMA-376 font embedding; obfuscation XORs the first 32 bytes with the GUID key). [Verified: docx lib stores fonts as `fontN.odttf`, per its fonts.md; Inferred: ECMA-376 mechanism details — standard spec knowledge]
- **`docx` npm supports it** (§4): `Document({ fonts: [{ name, data, characterSet }] })`. [Verified: official docs]
- **Caveats**: (a) PDF-embedded fonts are frequently **subset** (e.g. `ABCDEF+Times`) — re-embedding subsets into DOCX yields fonts unusable for further editing beyond the original glyph set; (b) PDF font licenses may not permit re-embedding in an editable document; (c) earlier Word/macOS rendering bugs with docx-lib-embedded fonts (issue #2521, fixed by PR #2800). [Inferred: (a),(b) from how PDF subsetting works; Verified: (c) per issue thread]
- **Standard practice** (what commercial converters do): **font-name mapping** — map PDF font names/flags to Word-safe families (Times New Roman / Arial / Courier New / Calibri) using the serif/sans/mono classification + bold/italic flags, and only optionally embed. pdf.js's `fallbackName` + `cssFontInfo.fontWeight`/`italicAngle` provide exactly the needed signals. [Inferred: industry practice; signals Verified per §5]

---

## Synthesis — the only viable route

| Route | In-browser? | Quality ceiling | License | Weight | Verdict |
|---|---|---|---|---|---|
| ZetaOffice/zetajs | Yes | Low (Draw-based PDF import) | MIT wrapper / MPL2 core | 50 MB–~1 GB | **Reject** |
| Pyodide + pdf2docx/PyMuPDF | Yes (proven) | Good | **AGPL (PyMuPDF)** | Tens of MB | **Reject (license)** |
| mupdf.js | Yes | n/a — no DOCX output at all | AGPL | ~5–10 MB | **Reject** |
| PDFium WASM | Yes | n/a — extraction only | BSD | ~5 MB | No value over pdf.js |
| Aspose.PDF JS via C++ | Yes | Good | Commercial, ~$1,175+ | Unpublished (large) | **Reject (paid)** |
| **DIY: pdf.js extraction → layout analysis (port pdf2docx algorithms, MIT) → `docx` writer** | Yes | Medium-good (text/paragraph/table; tagged PDFs better) | **All MIT** | ~+0.3–0.5 MB (docx lib) on top of existing pdf.js | **Only viable route** |

DIY architecture sketch [Speculative — design judgment]:
1. `getStructTree()` first — if tagged, use semantic roles for paragraphs/headings/tables/reading order.
2. Else `getTextContent()` → cluster items into lines (y-band + transform), lines into paragraphs (leading/indent heuristics), detect columns; table detection from ruling lines via `getOperatorList()` or pdf2docx's border-strategy port.
3. Map fonts: `commonObjs` font → Word-safe family via `fallbackName` + bold/italic; optional `.odttf` embedding of `font.data` for exotic fonts (subset caveat applies).
4. Emit via `docx`: sections with PDF page size/margins; flowing paragraphs where reconstruction is confident, absolutely-positioned Text Frames (`w:framePr`) as fallback — accepting the Google-Docs/LibreOffice rendering caveat.
5. Images: render non-text content per-region to PNG via existing pdf.js canvas → `ImageRun`.

**Effort**: the layout-analysis middle layer is the hard part — pdf2docx took years to mature; a TS port of its core heuristics is a multi-week effort. [Inferred: from pdf2docx codebase scope]

---

## Source URLs (verification trail)

- https://github.com/allotropia/zetajs (+ README, releases)
- https://www.theregister.com/2025/02/13/libreoffice_wasm_zetaoffice/
- https://news.ycombinator.com/item?id=42249746
- https://zetaoffice.net/ (demos)
- https://github.com/ArtifexSoftware/pdf2docx (MIT relicense, v0.5.13 May 2026, unmaintained-by-Artifex notice)
- https://pypi.org/project/pdf2docx/
- https://pymupdf.readthedocs.io/en/latest/pyodide.html (experimental; micropip broken)
- https://github.com/alam00000/bentopdf-pymupdf-wasm (AGPL-3.0; pdf2docx in browser)
- https://mupdf.readthedocs.io/en/1.24.0/mutool-convert.html, https://mupdf.readthedocs.io/en/1.26.3/tools/mutool-convert.html (no DOCX output)
- https://artifex.com/licensing (MuPDF/PyMuPDF AGPL + commercial)
- https://www.embedpdf.com/docs/pdfium/introduction (PDFium WASM text API)
- https://products.aspose.com/pdf/javascript-cpp/, https://docs.aspose.com/pdf/javascript-cpp/key-features/, https://www.componentsource.com/product/aspose-pdf-for-javascript-via-cpp/prices
- https://github.com/pdf2htmlEX/pdf2htmlEX (unmaintained; no WASM port)
- https://github.com/dolanmiu/docx (+ npm, v9.7.1), https://raw.githubusercontent.com/dolanmiu/docx/master/docs/usage/fonts.md, issues #866, #2521, #239, #2667
- https://www.npmjs.com/package/officegen (5 yrs stale), https://www.npmjs.com/package/html-docx-js (10 yrs stale), https://www.npmjs.com/package/@turbodocx/html-to-docx
- Local source: `node_modules/pdfjs-dist@6.0.227` — `build/pdf.mjs` (FontFaceObject, FONT_INFO), `build/pdf.worker.mjs` (isSerifFont/fallbackName), `types/src/display/api.d.ts` (TextItem, TextContent, StructTreeNode/Content, fontExtraProperties)
