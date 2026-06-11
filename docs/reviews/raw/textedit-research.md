# PDF True Text Editing in Browser JS — Research Report

**Date:** 2026-06-11  
**Scope:** As-of June 2026, all viable ways to truly edit existing PDF text (select/modify/delete — not overlay) in a browser-based, zero-backend, client-only JavaScript app.  
**Context:** pdfturbo is All Rights Reserved; AGPL unusable without commercial license. MIT/Apache/BSD only. GitHub Pages deployment = no backend.

---

## What Counts as "True Edit" vs "Overlay Hack"

True edit: the saved PDF's content stream is modified — original text operators (Tj, TJ, etc.) are removed or replaced; the change survives re-opening in any PDF reader without an extra layer.

Overlay hack: a white rectangle (or other mask) covers original text, and new text is drawn on top as a separate graphics layer or annotation. The original text operators remain in the content stream; copy-paste, search, and accessibility tools may reveal the original.

pdfturbo's current approach is the overlay hack. This report documents paths to true editing.

---

## Path 1: mupdf.js (npm `mupdf`, Artifex official WASM)

### Capability Verdict: PARTIAL — low-level surgery possible, no ergonomic text-edit API

**What it is:** Official Artifex JavaScript/TypeScript bindings wrapping the MuPDF C engine in WebAssembly. Runs in browsers, Node, Bun, Deno. Available as `npm install mupdf` (v1.x series, latest ~1.27).

**Does it expose true content editing?**  
No dedicated "replace text" or "delete text" API exists. The JS bindings expose the low-level PDF object model (`PDFObject`, `PDFPage`, `PDFDocument`) with the following write-capable primitives:

- `PDFObject.writeStream(buf)` — replaces the raw content of any PDF stream (auto-updates Length/Filter/DecodeParms). This is the key primitive.
- `PDFObject.writeRawStream(buf)` — same but for pre-compressed data.
- `PDFObject.put(key, value)` — modifies dictionary entries.
- `PDFObject.delete(key)` — removes dictionary/array entries.

A page's content stream is accessible via `page.getObject()` and navigating the PDF object tree. So in principle, you can: (1) read the raw content stream bytes, (2) decompress/decode, (3) parse and rewrite the PostScript-like operators (Tj, TJ, Tm, etc.), (4) compress and write back via `writeStream()`. This is "content stream surgery" — achievable but manually.

**What the API does NOT give you:**
- `findText()` returning editable text objects
- `replaceText(from, to)` API
- Font embedding helpers for the surgery
- Any higher-level text-edit abstraction

**Officially documented features:** render, annotate, redact (permanent), merge, split, form fill, page manipulation. Text editing in existing content is not a documented use case.

**License:** AGPL v3 for open source; commercial license required for proprietary products.  
**Commercial pricing:** [Unverified exact figure; indicative range from Teqnamo/G2 data] $1,500–$50,000+ one-time depending on deployment scale; consumer-facing products $20,000–$50,000+. Annual support packages $2,000–$10,000/yr. Every deal is custom — contact Artifex.  
[Evidence: https://artifex.com/licensing, https://teqnamo.com/solutions/prices/pdf-software-prices/mupdf/]

**Bundle size:** [Unverified exact number — npm 403 blocked fetch.] The package bundles both the JS wrapper and WASM binary. Community reports suggest ~20–30 MB unpacked (WASM is the bulk). Use `npm pack` and inspect to verify.

**Maturity:** Production-grade C engine (decades old); the JS bindings (mupdf.js) reached 1.0 in 2024 and are actively maintained by Artifex.

**Key finding:** The `writeStream()` primitive technically enables content stream surgery, but there is no text-level abstraction. A developer must implement PDF content stream parsing and font handling from scratch on top of it.

**Evidence URLs:**
- https://github.com/ArtifexSoftware/mupdf.js/
- https://mupdf.readthedocs.io/en/1.27.0/reference/javascript/types/PDFObject.html
- https://artifex.com/blog/introducing-the-mupdf.js-api

---

## Path 2: PDFium WASM Wrappers

### Capability Verdict: NO (as-shipped JS wrappers) — PDFium C API supports it but JS wrappers don't expose write APIs

**What PDFium is:** Open-source C++ PDF library used in Google Chrome. License: BSD-3-Clause (the library itself). Original co-developed by Foxit Software and Google; now Google-maintained.

**PDFium's C API — what it can do:**  
PDFium exposes full content editing at the C level:
- `FPDFPageObj_CreateTextObj(doc, font, font_size)` — creates a new text page object
- `FPDFText_SetText(text_obj, text)` — sets the text string on an object
- `FPDFPage_InsertObject(page, obj)` — inserts the new object into the page
- `FPDFPage_GenerateContent(page)` — regenerates the content stream

Combined, this allows deleting old text objects and inserting new ones — true content editing. The C API also has `FPDFPageObj_Destroy` for deletion.

**JavaScript wrappers available (2026):**

| Package | Maintained | Write/Edit APIs Exposed? | License |
|---------|-----------|--------------------------|---------|
| `@hyzyla/pdfium` (v2.1.x, updated ~days ago) | Yes — actively | Text extraction only; no write API | BSD-3 |
| `@embedpdf/pdfium` | Yes | Text extraction only (`FPDFText_LoadPage`, `FPDFText_GetText`, etc.); no `FPDFPageObj_CreateTextObj` | BSD-3 |
| `pdfium.js` (Jaewoook) | Moderate | Render-only subset; explicitly states "doesn't provide full PDFium API yet" | MIT |
| `GoodNotes/pdfium-js` | Low (internal tool) | Render-focused; examples show PNG export only | MIT |
| `urish/pdfium-wasm` | Unmaintained (2018) | Proof-of-concept only | — |

**The gap:** Every current JS wrapper only exposes PDFium's read/render surface. The text object creation APIs (`FPDFPageObj_CreateTextObj`, `FPDFText_SetText`) are present in the PDFium WASM binary but simply not yet wrapped for JavaScript.

**Can you close the gap?** Yes, in principle — PDFium compiles to WASM via Emscripten, so you can call exported C functions directly from JS using Emscripten bindings. This is a significant engineering effort (build toolchain, font loading, content regeneration logic).

**Bundle size:** PDFium WASM binary is large — typically 7–15 MB compressed (the full Chrome PDF engine). Exact figure varies by build configuration.

**Key finding (most surprising):** PDFium's C API fully supports true text editing, but in June 2026 no JS wrapper has yet exposed those write APIs. The gap is at the wrapper layer, not the engine layer.

**Evidence URLs:**
- https://github.com/klokantech/pdfium/blob/master/public/fpdf_edit.h
- https://www.embedpdf.com/docs/pdfium/introduction
- https://pdfium.js.org/
- https://github.com/hyzyla/pdfium

---

## Path 3: Commercial SDKs

### 3A. Apryse WebViewer

**Capability Verdict: TRUE EDIT** (confirmed by docs; content editing is a primary feature)

WebViewer v10.3 (2024) introduced WYSIWYG PDF content editing — editing text and images directly within content streams. As of v10.7, an architectural overhaul improved robustness. The implementation uses WebAssembly (PDFNet engine, Apryse's own C++ core) loaded client-side. No backend required for content editing.

Specific evidence of true (not overlay) editing: PDFNet page writing API is used; content editor operates at the "text streams, fonts, and annotations" level per Apryse's own description. When entering content edit mode, WASM files are loaded. Changes are saved back into the PDF document structure.

**Font handling:** Supports CJK/IME input; font substitution when needed; full font embedding capability via PDFNet.

**License:** Proprietary. "Content Editing" is a separate add-on beyond the base WebViewer license.  
**Pricing:** [Unverified exact tier; indicative] Entry-level starts ~$1,500/yr for simple use cases. Web-only licenses with content editing typically $10,000+/yr. Custom quotes required; 15–30% negotiation headroom common.  
[Evidence: https://apryse.com/pricing, Vendr market data]

**Bundle size:** [Unverified.] WebViewer ships a large WASM bundle; community reports range 10–30 MB for the core + content-edit module. Exact figure requires inspecting the npm package.

**Maturity:** Production-grade, actively developed, wide adoption.

**Evidence URLs:**
- https://docs.apryse.com/web/guides/edit/text-edit
- https://apryse.com/blog/advanced-pdf-editing-with-webviewer-api-features
- https://apryse.com/blog/webviewer/webviewer-8-8-new-javascript-pdf-editng-ux-bookmarks-outline-editing

---

### 3B. Nutrient Web SDK (formerly PSPDFKit for Web)

**Capability Verdict: TRUE EDIT** (confirmed — "Content Editor" component modifies existing text directly)

Nutrient explicitly states: "Text editing — Modify existing text directly within the PDF, adjusting font styles, sizes, and colors." The Content Editor runs entirely in-browser (no plugin). Available as an add-on component in the Web SDK.

**License:** Proprietary. Component-based — pay only for what you need (viewer, annotations, content editor are separate billing units).  
**Pricing:** [Unverified exact figure.] Pricing is custom-quote only. Indicative market data: $2,500 minimum; enterprise deployments range $25,000–$200,000+/yr. The Content Editor component adds to the base Web SDK cost.

**Bundle size:** [Unverified.] The pspdfkit npm package is large; WASM + JS typically 15–25 MB based on community reports. Exact: `npm pack pspdfkit` and inspect.

**Maturity:** Production-grade, long-established market leader (PSPDFKit was founded 2013), actively developed.

**Evidence URLs:**
- https://www.nutrient.io/sdk/solutions/editing/
- https://www.nutrient.io/sdk/pricing/

---

### 3C. ComPDFKit Web

**Capability Verdict: TRUE EDIT** (stated capability — "enables the adjustment of the original text layer")

ComPDFKit Web SDK explicitly includes a "Content Editor" component that can "add, modify, and remove content" and targets "the original text layer in any text-based PDF document." Free 30-day trial available.

**License:** Proprietary.  
**Pricing:** [Unverified.] Custom quote only; no public tier table. Capterra/G2 list it as not offering a free version but offering a free trial. Likely cheaper than Apryse/Nutrient based on market positioning.

**Bundle size:** [Unverified.]

**Maturity:** Newer entrant (ComPDFKit established ~2020); growing platform; less community validation than Apryse/Nutrient.

**Evidence URLs:**
- https://www.compdf.com/pdf-sdk/web/content-editor
- https://www.compdf.com/

---

### 3D. Foxit Web PDF SDK

**Capability Verdict: PARTIAL** — Foxit PDF SDK has web capabilities, but the JS/browser-specific "content editing of text streams" is not clearly documented in the 2025/2026 search results. Foxit's strength is their desktop/server SDK; the web layer is less prominently positioned than Apryse or Nutrient.

**Pricing:** [Unverified.] Market sources cite starting at $9/month for some tiers; but SDK pricing for enterprise web deployment would be custom quote.

**Maturity:** Foxit is the original PDFium co-developer (pre-2010) with deep PDF engine expertise.

**Evidence URLs:**
- https://developers.foxit.com/products/pdf-sdk/

---

## Path 4: Pure Open-Source Content-Stream Surgery in JS

### Capability Verdict: PARTIAL — technically achievable, no maintained library does it end-to-end

**The approach:** Parse the PDF content stream byte-by-byte, locate text operators (`Tj`, `TJ`, `"`, `'`), remove/replace them, and write the modified bytes back. Requires:
1. A PDF parser that exposes content stream bytes (pdf-lib / @cantoo/pdf-lib can do this via `decodePDFRawStream()` + pako for decompression)
2. A content stream parser for PDF operators
3. Font/glyph resolution to determine if the replacement text can be rendered with the existing font
4. Writing the modified stream back

**Available building blocks (all MIT/Apache/BSD):**

| Tool | Role | Limitation |
|------|------|-----------|
| `@cantoo/pdf-lib` (MIT, actively maintained fork of pdf-lib) | PDF structure read/write; `decodePDFRawStream()`, content stream bytes | No text-edit API; no content stream parser; subset font handling manual |
| `pdfjs-dist` (Apache 2.0) | Content stream parsing / `getTextContent()` | Read-only; no write API |
| `pako` | Zlib compression/decompression for content streams | General purpose |
| `fontkit` (MIT) | Font glyph resolution | Used internally by pdf-lib |

**Known prior art:**
- `replace-text-pdf` (Crystal CLI, July 2024, 17 stars): command-line only, not JS, TJ-aware, requires uncompressed PDF input, replaces same-line text only. Demonstrates the approach is viable but is not usable in a browser.
- Various pdf-lib GitHub issues (#564, #827, #1247, #1627): extensive community discussion; no merged solution as of June 2026. Workarounds exist (decode stream, inject form fields at coordinates) but are fragile and PDF-source-specific.
- `pdfme/pdf-lib` fork: archived original + new pdfme; still no content-stream text-edit API.

**The Subset Font Problem — documented solutions:**

This is the hardest part of content-stream surgery. When a PDF uses a subset font (e.g., `ABCDEF+ArialMT`), only glyphs for characters originally in the document are embedded. If replacement text uses characters not in the subset, rendering fails or shows tofu.

Known solutions used by professional editors:
1. **Check if glyphs exist:** Use fontkit to probe the font's CFF/TrueType glyph table. If replacement uses only glyphs already in the subset — safe to write directly.
2. **Replace with a full font:** Drop the subset, embed a complete font. Works but may change visual appearance (metrics differ from original font).
3. **Extend the subset:** Re-embed the font with additional glyphs. Requires the original TTF/OTF file (not available from the PDF alone — subset fonts are stripped).
4. **Fallback to standard fonts:** Courier, Helvetica, Times — always fully available in PDF viewers, but appearance changes.
5. **The delete-and-annotate pattern:** Delete the text operator, add a FreeText annotation with flattening. This is the overlay hack in disguise but saves into the PDF structure.

**Practical state in 2026:** No maintained, MIT/Apache-licensed JS library does end-to-end content-stream text surgery with font handling. Rolling your own with @cantoo/pdf-lib + pdfjs-dist + fontkit is the open-source path, but it is a meaningful engineering effort (~weeks), fragile against unusual PDFs, and incomplete for subset fonts without source font files.

**Evidence URLs:**
- https://github.com/Hopding/pdf-lib/discussions/1627
- https://github.com/Hopding/pdf-lib/issues/564
- https://github.com/cantoo-scribe/pdf-lib
- https://github.com/rdp/replace-text-pdf
- https://kbpdfstudio.qoppa.com/text-content-editing-with-subsetted-fonts/

---

## Path 5: New 2024–2026 WASM PDF Engines / Notable Finds

### 5A. Adobe Acrobat on the Web (WebAssembly)
Adobe ported their mobile PDF C++ library to WASM for acrobat.com (~2021, production 2022+). As of 2026, it powers the acrobat.com web editor with full text editing. **Not available as an embeddable SDK.** Proprietary, Adobe-only deployment.  
Evidence: https://blog.developer.adobe.com/acrobat-on-the-web-powered-by-webassembly-782385e4947e

### 5B. Document Solutions PDF Viewer (DsPdfViewer / @mescius/dspdfviewer)
GrapeCity/Mescius's viewer introduced a WASM-based Support API (v7.2, 2024) for client-side PDF editing without a backend. Requires "Professional License." Editing features are primarily annotation/form-based; "content editing" (text stream modification) is not prominently confirmed. The WASM module is their own C# → WASM compilation. Pricing not public. [Unverified whether it exposes true content stream text editing vs form/annotation only.]  
Evidence: https://developer.mescius.com/blogs/new-webassembly-based-pdf-viewer-edit-pdfs-in-web-apps

### 5C. Stirling PDF 2.0 (December 2025)
Server-hosted open-source PDF toolkit. v2.0 added "text editing (alpha)" for paying users ($99/mo or $1,000/yr server license). Architecture: React frontend + Spring Boot backend; uses PDF-LIB.js client-side, Apache PDFBox server-side. The text editing feature appears to be **server-side (PDFBox)**, not client-only WASM. Not usable for pdfturbo's zero-backend requirement.  
Evidence: https://www.opensourceforu.com/2025/12/stirling-pdf-2-0-brings-text-editing-and-enterprise-tools-to-open-source/

### 5D. Syncfusion JavaScript PDF Library (2025 Volume 4, Jan 2026)
New Syncfusion JS library for browser-based PDF creation and modification without a backend. Confirmed capabilities: form fields, annotations, redaction, digital signatures. **True content-stream text editing not confirmed** — documentation focuses on creation and form-filling workflows.  
License: Proprietary (Essential Studio subscription).  
Evidence: https://www.syncfusion.com/blogs/post/create-edit-and-sign-pdfs-in-javascript

### 5E. No browser-native PDF editing API in sight
No W3C/WHATWG proposal for a browser-native PDF editing API was found in 2024–2026. PDF editing remains entirely in user-space.

---

## Comparison Matrix

| Path | True Edit? | License | Est. Bundle Weight | Pricing | Maturity | Key Risk |
|------|-----------|---------|-------------------|---------|----------|----------|
| **mupdf.js** (Artifex WASM) | PARTIAL (surgery via writeStream) | AGPL / commercial | ~20–30 MB [Unverified] | $1,500–$50K+ one-time [Indicative] | Production | AGPL blocks use without commercial license; no text API |
| **PDFium WASM wrappers** | NO (JS wrappers render-only) | BSD-3 | 7–15 MB [Unverified] | Free (BSD-3) | Moderate | Write APIs not wrapped; engineering effort to expose them |
| **Apryse WebViewer** | TRUE EDIT | Proprietary | ~10–30 MB [Unverified] | $10K+/yr typical; $1.5K entry [Indicative] | Production | Cost; content editing is add-on |
| **Nutrient Web SDK** | TRUE EDIT | Proprietary | ~15–25 MB [Unverified] | $25K–$200K/yr enterprise [Indicative] | Production | Cost; minimum ~$2,500; no public tiers |
| **ComPDFKit Web** | TRUE EDIT (stated) | Proprietary | [Unverified] | Custom quote [Unverified] | Growing | Less community validation; pricing unknown |
| **Foxit Web PDF SDK** | PARTIAL (unconfirmed for browser text edit) | Proprietary | [Unverified] | Custom quote | Production | Web text editing capability unclear |
| **Content-stream surgery (DIY)** | TRUE EDIT (if done correctly) | MIT/Apache (building blocks) | 0 added (uses existing pdf-lib) | Free | Low — no maintained library | Weeks of engineering; subset fonts unsolved for new chars; fragile |
| **Adobe Acrobat Web WASM** | TRUE EDIT | Proprietary / not licensable | N/A | Not embeddable | Production | Not available as SDK |
| **DsPdfViewer WASM** | PARTIAL (unconfirmed true text edit) | Proprietary | [Unverified] | Custom quote | Moderate | Unclear if true content edit |
| **Stirling PDF 2.0** | TRUE EDIT (server-side via PDFBox) | AGPL + paid tier | N/A | $99/mo | Growing | Requires backend; not client-only |

---

## Summary Assessment for pdfturbo

**Hard constraint recap:** Zero-backend, client-only, GitHub Pages, proprietary (All Rights Reserved) — AGPL unusable, commercial license required for mupdf.js.

**Viable paths in priority order:**

1. **Apryse WebViewer** — Only proven, client-side, truly-edits-text-streams commercial SDK with clear content-editing documentation and active browser deployment. Content editing is an add-on. Cost is the barrier: expect $10K+/yr.

2. **Nutrient (PSPDFKit) Web SDK** — Equally capable, similar pricing tier (enterprise). Contact sales for web-only client-side quote.

3. **ComPDFKit Web** — Potentially lower cost; stated capabilities match; less community validation. Worth a free trial evaluation.

4. **DIY content-stream surgery** — Free, uses existing @cantoo/pdf-lib dependency. Feasible for PDFs where replacement text uses only characters already in the font subset (common for simple corrections). Infeasible for introducing new characters without the original font file. Engineering effort ~2–4 weeks for a robust implementation.

5. **mupdf.js (commercial license)** — Full engine power including `writeStream()`, but requires buying a commercial license from Artifex. Cheapest entry ~$1,500 but likely higher for a deployed product.

6. **PDFium WASM (DIY wrapper extension)** — Technically cleanest path (FPDFText_SetText exists in the C API) but requires significant WASM build engineering to expose write APIs. Not a near-term option.

---

*All bundle sizes marked [Unverified] — fetch from npm unpacked size or bundlephobia for current values before making architectural decisions.*
