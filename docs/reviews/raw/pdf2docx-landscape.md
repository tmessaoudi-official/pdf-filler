# PDF→DOCX Conversion Landscape — Raw Research Report

**Date**: 2026-06-11
**Context**: Due diligence for pdfturbo (100% client-side, browser-only, MIT-style free PDF editor; TypeScript + Vite; pdfjs-dist v6 rendering, @cantoo/pdf-lib writing). Question: can we add PDF→DOCX (and other formats), who can actually do it, how well, at what cost/license?
**Method**: WebSearch + WebFetch against official vendor docs/pricing pages, GitHub repos and the GitHub API, npm, and independent sources. Every claim carries a URL. Claims that could not be confirmed on a primary source are explicitly marked **[could not verify]**.

---

## 1. Executive verdict (one paragraph)

True in-browser (WASM, no server) PDF→DOCX exists but is **commercial-only**: Nutrient/PSPDFKit Web SDK and Aspose.PDF for JavaScript via C++ are the only two engines verified to convert PDF→DOCX fully client-side; both are proprietary, quote-based or ~$1.8k+/yr, and incompatible with a free MIT-style product's economics. Apryse's Structured Output module — despite WebViewer being WASM — is **explicitly server/desktop only**. The flagship fidelity engine (Solid Documents, the technology inside Adobe Acrobat's PDF→Word since Acrobat X) is a .NET SDK with no browser story. On the OSS side there is **no browser-capable engine at all**: pdf2docx (now MIT, but unmaintained, and hard-dependent on AGPL PyMuPDF) and LibreOffice (imports PDF into Draw as positioned text frames, not flowing Writer text) are Python/native server-side tools. The deeper problem is structural: a PDF is a list of absolutely-positioned glyph/path/image operators with no paragraph, table, column, or reading-order semantics unless it is a Tagged PDF — and only ~15% of real-world PDFs carry tags (≈3% of scholarly PDFs pass full accessibility checks). Every converter therefore *infers* structure heuristically, and output quality is fundamentally probabilistic, which is why even Adobe licenses a third-party specialist engine rather than doing it in-house.

---

## 2. Commercial engines

### 2.1 Summary table

| Vendor / engine | PDF→DOCX in browser (WASM)? | Where it runs | License / pricing (verified where possible) | Notes |
|---|---|---|---|---|
| **Solid Documents (Solid Framework)** | **No** | .NET SDK, Windows-centric server/desktop | 3 editions (Tools / Professional / Professional+OCR); pricing undisclosed, usage/volume-based, "from $250/yr" per Capterra-era data | The engine inside Adobe Acrobat's PDF→Word — claim **verified** (licensed since Acrobat X, 2010, continued in Acrobat DC) |
| **Apryse (PDFTron) Structured Output** | **No — explicitly** | Server/Desktop only (Win/Linux/Mac; C#, C++, Go, Java, server-JS/Node, PHP, Python, Ruby, VB) | Commercial, quote-based; optional add-on module download | Docs explicitly: "Only available on Desktop and Server". WebViewer (WASM) does viewing/editing/DOCX→PDF client-side, but **not** PDF→DOCX |
| **Nutrient (ex-PSPDFKit) Web SDK** | **Yes — verified claim** | Browser standalone (WASM), own engine (no LibreOffice/MS Office) | Commercial, quote-based annual subscription; market data: ~$2.5k min, ~$76k average, up to ~$220k/yr; 3-year lock-in complaints | The only major vendor explicitly documenting client-side, serverless PDF→DOCX/XLSX/PPTX in the browser |
| **Aspose.PDF for JavaScript via C++** | **Yes** | Browser (WASM build of Aspose.PDF C++ "Lightweight" engine) | Commercial; Developer SBL ≈ **US$1,797/yr** (1 dev), ~$11,980/yr w/ 50 deployments tier | `AsposePdfToDocX()` exists; distributed via GitHub/npm; WASM payload size **[could not verify]** but Aspose WASM builds are typically tens of MB |
| **iText pdf2Data** | **No** | Java/.NET SDK + CLI, server | Commercial (iText Core + pdf2Data licenses); volume-based pricing | **Not a DOCX converter** — it is template-based *data extraction* (invoices/forms → structured data). Out of scope for PDF→Word |
| **Foxit PDF Conversion SDK** | Unclear — **[could not verify]** | "Windows, Linux & Web"; C/C++, Java, .NET, Python, Node.js | Quote-based, 30-day trial | "Web" appears to mean Node.js/server-side JS, not in-browser WASM; no WASM claim anywhere on the product page |
| **ComPDFKit Conversion SDK** | Unclear / unlikely — **[could not verify]** | Windows/Mac/Linux/iOS/Android SDKs + self-hosted + cloud "Open API" | Commercial, contact sales | Conversion SDK is desktop/mobile/server; their Web SDK is a viewer — no documented client-side PDF→Word |
| **Adobe (Acrobat / PDF Services API)** | **No** (cloud only) | Adobe cloud | API: free tier 500 Document Transactions/6 months; pay-as-you-go **$0.05/Document Transaction** (1 transaction = 1 export up to 50 pages) | Acrobat's engine is licensed Solid Documents technology (see 2.2) |

### 2.2 Solid Documents — the "Adobe engine" claim: VERIFIED

- Adobe licensed the Solid Framework SDK for Acrobat X (announced Nov 2010) and continued using it in Acrobat DC for PDF→Word/Excel/PowerPoint export: https://www.soliddocuments.com/pdf/_solidframework_adobe_x/300/12 and https://en.wikipedia.org/wiki/Solid_Documents
- Solid's own marketing: "Solid Framework Technology is the same PDF to Word technology used by Adobe since Acrobat X" — https://solidframework.net/ (via https://solidframework.net/faq/)
- Product form: a **.NET developer toolkit** ("Royalty Free .NET developer toolkit", https://www.soliddocuments.com/products.htm?product=). No JS/WASM offering found anywhere on solidframework.net — **[Inferred: no browser option exists; could not find any, and the SDK is .NET-native]**.
- Pricing: not published. "Pricing is based on the breadth of technology required and usage volumes" — https://solidframework.net/pricing-and-licensing/. Editions: Tools / Professional / Professional+OCR. Third-party (Capterra) lists "from $250/year" — https://www.capterra.com/p/128788/Solid-Framework-SDK/ **[could not verify on vendor site; real SDK licensing is negotiated]**.
- Implication: the best-reputation engine in the industry is structurally unavailable to a client-side web app.

### 2.3 Apryse / PDFTron — Structured Output is server/desktop ONLY

- The Structured Output module performs PDF→Word/Excel/PowerPoint/HTML: https://sdk.apryse.com/api/PDFTronSDK/java/com/pdftron/pdf/StructuredOutputModule.html
- Platform support page is titled "**Server/Desktop** PDF to docx, ppt, excel Conversion Library — support for C#, Python, C++, Java, PHP, Ruby, Go; on Windows, Linux and Mac": https://docs.apryse.com/core/guides/features/office/convert-to-office — fetched 2026-06-11; the page states the feature is "**Only available on Desktop and Server (Windows, Linux, or Mac)**" and requires downloading the optional Structured Output add-on module into the project's `lib` folder.
- WebViewer itself IS client-side WASM (viewing, annotation, DOCX *editing*, Office→PDF): https://docs.apryse.com/web/guides/overview — but PDF→Office is the one direction it does not do in-browser. Marketing blog copy ("WebViewer… fully client-side") creates the impression otherwise; the platform matrix is the ground truth.
- Pricing: quote-based commercial SDK. **[could not verify exact figures; Apryse does not publish pricing]**

### 2.4 Nutrient (PSPDFKit) — the one verified in-browser commercial engine

- Guide (fetched 2026-06-11): "Nutrient Web SDK is a client-side JavaScript library. It converts PDFs to Office documents directly in the browser and doesn't require server-side processing… uses its own conversion engine. It doesn't depend on third-party tools such as LibreOffice or Microsoft Office." — https://www.nutrient.io/guides/web/conversion/pdf-to-office/
- Product page: https://www.nutrient.io/sdk/pdf-to-office-conversion/ ; npm: https://www.npmjs.com/package/@nutrient-sdk/viewer
- Documented fidelity caveat: missing/custom fonts are substituted (e.g., Arial→Noto) unless you supply font files — same guide URL.
- Pricing: annual subscription, quote-only — https://www.nutrient.io/sdk/pricing/. Market intelligence (Vendr): **average ~$76,000/yr, range ~$2,500–$220,000** — https://www.vendr.com/marketplace/pspdfkit ; review complaints about 3-year contract lock-in — https://www.capterra.com/p/171174/PSPDFKit-SDK/ **[third-party figures; could not verify on vendor site — vendor publishes no numbers]**
- Verdict for pdfturbo: technically a perfect fit (proves browser PDF→DOCX is *possible*), economically a non-starter for a free MIT app.

### 2.5 Aspose.PDF for JavaScript via C++ — exists, WASM, commercial

- Exists and is real: https://products.aspose.com/pdf/javascript-cpp/conversion/pdf-to-docx/ and GitHub https://github.com/aspose-pdf/Aspose.PDF-for-JavaScript-via-CPP (fetched: "WebAssembly-based library… based on Aspose.PDF for .NET Lightweight"; `AsposePdfToDocX()` function; ships arial.ttf/times.ttf font files).
- npm: https://www.npmjs.com/package/aspose-pdf-js
- Pricing: Developer Small Business ≈ **US$1,797/yr** (1 developer); ~$11,980/yr tier with 50 commercial deployments — https://purchase.aspose.com/pricing/fr/pdf/javascript-cpp/ and https://www.componentsource.com/product/aspose-pdf-for-javascript-via-cpp/prices
- Unlicensed/evaluation mode imposes restrictions (Aspose-standard watermarking/limits) — **[could not verify the exact evaluation limits for the JS build]**.
- WASM payload size **[could not verify]** — Aspose WASM builds are historically very large (tens of MB), relevant for a PWA.
- Fidelity claim ("output identical to the original PDF") is vendor marketing — **[unverified, no independent benchmark found for the JS build]**.

### 2.6 iText pdf2Data — wrong tool for this job

- pdf2Data is template-driven **data extraction** (define zones/rules on one sample, extract fields from similar PDFs), not document-to-DOCX conversion: https://itextpdf.com/products/itext-7/pdf2data and https://kb.itextpdf.com/2data/getting-started-with-itext-pdf2data
- Java/.NET/CLI; commercial volume licensing on top of iText Core: https://pdf2data.apryse.com/documentation/docs/engine-guide/licensing/LicenseFAQ/
- Include in the comparison only to document that it was evaluated and excluded.

### 2.7 Foxit PDF Conversion SDK

- Converts PDF→DOCX/XLSX/PPTX, "an independent library based on Foxit's own core technology"; platforms listed as "Windows, Linux & Web"; languages C/C++, Java, .NET, .NET Core, Python and **Node.js**: https://developers.foxit.com/products/pdf-conversion-sdk/ (fetched 2026-06-11)
- "Web" most plausibly = Node.js bindings on a server, **not** in-browser WASM — no WASM/browser claim appears on the page. **[could not verify any client-side capability]**
- Pricing: quote-based; 30-day trial.

### 2.8 ComPDFKit

- Conversion SDK (PDF→Word/Excel/PPT/HTML/Text/CSV/RTF/images) for **desktop, mobile, self-hosted server, and cloud API**: https://www.compdf.com/conversion (fetched 2026-06-11 — page lists Windows/Mac/Linux/iOS/Android SDKs + Open API; no client-side browser conversion documented).
- Their Web SDK is a viewer/annotator; conversion in web contexts goes through their API. **[could not verify any in-browser conversion; evidence points against it]**
- Pricing: contact sales — https://www.compdf.com/pricing **[no public numbers]**

### 2.9 Adobe PDF Services API (cloud — for the comparison table)

- Export PDF→DOCX is one operation of the PDF Services API (cloud REST).
- Free tier: **500 Document Transactions** (6-month trial window per newer docs): https://developer.adobe.com/document-services/docs/overview/limits
- Pay-as-you-go: **$0.05 per Document Transaction**; for export-type operations, 1 transaction covers a document up to 50 pages: https://developer.adobe.com/document-services/pricing/main/ and https://developer.adobe.com/document-services/docs/overview/pdf-extract-api/dcserviceslicensing/
- Fidelity: effectively Acrobat-grade (Solid-derived pipeline) — widely considered the quality ceiling. **[Inferred: Adobe does not publicly document which engine backs the cloud export endpoint]**

---

## 3. OSS server-side baselines

### 3.1 pdf2docx (Python) — license surprise: now MIT, but effectively AGPL-bound and unmaintained

- Repo moved to Artifex: https://github.com/ArtifexSoftware/pdf2docx — GitHub API (queried 2026-06-11): **license MIT**, 3,442 stars, not archived, last push 2026-05-01.
- **License history**: originally GPL-3.0 (dothinking/pdf2docx; old docs still say "open-source AGPL and commercial" — https://pdf2docx.readthedocs.io/en/latest/license.html); Artifex **relicensed it to MIT** and simultaneously announced it is **"no longer actively maintained by Artifex"** (README recommends PyMuPDF/MuPDF.NET instead). So: permissive license, dead-ended development.
- **Hard dependency on PyMuPDF (AGPL-3.0)** — verified from `requirements.txt` (fetched 2026-06-11): `PyMuPDF>=1.26.7, python-docx>=0.8.10, fonttools, numpy, opencv-python-headless, fire` — https://raw.githubusercontent.com/ArtifexSoftware/pdf2docx/master/requirements.txt. PyMuPDF/MuPDF are AGPL-3.0 or commercial (Artifex): https://github.com/pymupdf/PyMuPDF, https://pymupdf.io/. **Net effect: any deployment of pdf2docx is AGPL-encumbered via PyMuPDF unless you buy an Artifex commercial license.** The MIT relicense of pdf2docx itself does not change this.
- **How it works internally**: rule-based layout analysis — PyMuPDF extracts raw text spans/curves/images with coordinates; pdf2docx clusters them into pages→blocks→lines→spans, detects table borders from vector strokes (plus opencv for some raster analysis), infers paragraphs from spacing, then rebuilds the document with python-docx. No ML, no OCR.
- **Quality reputation**: best-in-class among OSS for digitally-born PDFs with real tables — "among open source tools, pdf2docx generally produces the most accurate layout, preserving paragraphs, tables, and text styling better than most alternatives" (independent comparison: https://pdf4.dev/blog/how-to-convert-pdf-to-word). Known failure modes: scanned PDFs (no OCR), complex multi-column layouts, borderless tables, decorative typography misread as structure.
- **Browser feasibility**: none. Python + native MuPDF C library + opencv. Pyodide could theoretically run python-docx but PyMuPDF's C extension and opencv make this impractical; nobody has demonstrated it. **[could not verify any working browser port — none found]**

### 3.2 LibreOffice headless — the "it imports into Draw" problem: VERIFIED

- LibreOffice opens PDFs in **Draw** (fixed-layout editor), not Writer: https://forum.openoffice.org/en/forum/viewtopic.php?t=83944 and https://pdf.wondershare.com/how-to/import-pdf-to-libreoffice.html
- The PDF import filter (`writer_pdf_import` / Draw import) places **each line of text in its own positioned text frame** — output DOCX is a pile of absolutely-positioned text boxes, not flowing paragraphs. "LibreOffice typically imports PDFs as positioned text boxes, which results in poor editability" — https://pdf4.dev/blog/how-to-convert-pdf-to-word
- Headless CLI path: `soffice --headless --infilter=... --convert-to docx` works mechanically but inherits the Draw-import structure problem. Good for "looks roughly right when printed", bad for "editable Word document".
- License: MPL-2.0 (LibreOffice) — server-side only; obviously no browser build of LibreOffice's converter exists (LOWA/ZetaOffice WASM builds target the full editor UI, not a conversion library, and are huge — **[could not verify any practical WASM conversion path]**).

### 3.3 Stirling-PDF — wraps LibreOffice

- Stirling-PDF's PDF→Word (and file→PDF) endpoints shell out to **LibreOffice via unoconv, migrated to unoserver** in v0.42.0: https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v0.42.0 and https://github.com/Stirling-Tools/Stirling-PDF/issues/3087, https://github.com/Stirling-Tools/Stirling-PDF/issues/3273 (unoconv/unoserver: https://github.com/unoconv/unoconv)
- Therefore Stirling-PDF's PDF→Word quality ceiling = LibreOffice's (i.e., positioned-text-box output). It adds no conversion intelligence of its own. Server-side Java + LibreOffice container.

### 3.4 calibre — explicitly warns against PDF input

- calibre manual (fetched 2026-06-11): "To re-iterate **PDF is a really, really bad format to use as input**… Complex, multi-column, and image based documents are not supported. Extraction of vector images and tables… is also not supported… be prepared for an output ranging anywhere from decent to unusable" — https://manual.calibre-ebook.com/conversion.html
- DOCX output exists but targets ebook reflow, not layout fidelity. Not a serious PDF→Word baseline; cited because its warning is the most honest statement of the structural problem in any tool's docs.

### 3.5 Other CLIs

- Misc "pdftoword" CLIs are wrappers around one of the above (LibreOffice, pdf2docx) or around cloud APIs. No independent OSS engine with a better reputation than pdf2docx was found. **[searched; none found — marked as exhaustively-searched rather than proven absent]**

---

## 4. Cloud conversion APIs (rejected by architecture; for the comparison table)

| API | Free tier | Paid pricing (verified) | PDF→DOCX fidelity reputation | Source |
|---|---|---|---|---|
| **Adobe PDF Services** | 500 Document Transactions / 6 mo | **$0.05 / Document Transaction** (1 tx = export up to 50 pages); volume deals via sales | Industry ceiling (Acrobat/Solid lineage) | https://developer.adobe.com/document-services/pricing/main/ |
| **CloudConvert** | 10 conversions/day | Credit system; **PDF→Office costs 4 credits minimum** (most conversions cost 1); packages/subscriptions from ~$9, min 1,000 credits; subscriptions up to 50% cheaper per credit | Uses third-party engines per format; generally good, not Acrobat-grade | https://cloudconvert.com/pricing , https://cloudconvert.com/apis/pdf-to-office |
| **ConvertAPI** | 250 free conversions | ~**$84/mo for 5,000 conversions**; ~$150/mo for 15,000; overage billed, not blocked | Solid mid-tier reputation; engine undisclosed | https://www.convertapi.com/pricing (direct fetch blocked, HTTP 403 — figures from https://www.capterra.com/p/206789/ConvertAPI/ and https://subscribed.fyi/convertapi/pricing/ **[pricing page itself could not be fetched; third-party corroborated]**) |

Architectural note: all three violate pdfturbo's "nothing uploaded" promise — included only as the cost/fidelity reference points. At $0.05/doc, Adobe is cheap in absolute terms but requires a backend proxy (API credentials cannot ship in client JS), i.e., a backend pdfturbo doesn't have.

---

## 5. The fidelity reality — what structurally cannot be recovered

### 5.1 Why PDF→Word is inherently lossy

- A PDF content stream is absolutely-positioned painting operators: "PDF places every element at an absolute x/y coordinate on the page" while "Word uses a flow layout: text wraps, tables expand, paragraphs reflow" — https://pdf4.dev/blog/how-to-convert-pdf-to-word
- There is **no paragraph, table, column, list, heading, or reading-order object** in an untagged PDF. Converters must infer all of it from visual proximity, font metrics, and vector strokes. Known systematic failures (same source + calibre manual https://manual.calibre-ebook.com/conversion.html):
  - multi-column layouts (column order vs reading order)
  - tables with merged cells or no painted borders
  - headers/footers (absolute position, no semantic marker)
  - decorative font-size changes misread as headings
  - hyphenation/line-break reconstruction; ligature glyphs (ff, ll) with broken ToUnicode maps
  - scanned/image PDFs: zero text without OCR
  - RTL scripts and math typesetting (calibre: "will not convert correctly")

### 5.2 Tagged PDF / PDF/UA — the only real structure, and almost nobody has it

- Tagged PDF embeds a logical structure tree (paragraphs, headings, tables, reading order). Authoring-time tagging (Word/InDesign export) "draw[s] from the source document's paragraph styles… to produce a logical structure tree [that] reflects an accurate reading order" — https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html ; W3C PDF3 technique: https://www.w3.org/TR/WCAG20-TECHS/PDF3.html
- **Prevalence**: in a large scholarly-PDF analysis, only **15.5% of PDFs were tagged** at all, 10.5% had alt text; **<3.2% satisfied all accessibility criteria, 74.9% failed every criterion** — "Uncovering the New Accessibility Crisis in Scholarly PDFs", arXiv:2410.03022, https://arxiv.org/html/2410.03022 (scholarly corpus; general-web numbers are not better — **[no rigorous all-PDF census exists; could not verify a global percentage beyond this corpus]**)
- Even tagged PDFs are frequently mis-tagged (headings tagged as paragraphs, wrong order): https://community.adobe.com/t5/acrobat-discussions/word-365-to-acrobat-pdfmaker-generates-wrong-tags/td-p/11400232
- Consequence: a converter that *uses* tags when present (Adobe, Solid, Apryse claim this) gets near-perfect structure on ~15% of documents and falls back to geometry heuristics on the rest. Conversion quality is therefore **bimodal by input provenance**, not a single number any vendor can honestly quote.

### 5.3 Independent quality ranking (as far as verifiable)

No rigorous, current, peer-reviewed benchmark of PDF→Word fidelity across Adobe/Solid/pdf2docx/LibreOffice exists **[could not verify any — searched]**. The consistent picture from independent comparisons and tool documentation:

1. **Adobe Acrobat / Solid Framework** — best-in-class; flowing paragraphs, real tables, header/footer detection; Solid is literally Adobe's engine (verified, §2.2).
2. **Apryse Structured Output / Nutrient / Foxit / Aspose** — commercial tier claiming comparable results; no independent head-to-head found **[unverified vendor claims]**.
3. **pdf2docx** — best OSS for born-digital PDFs with bordered tables; breaks on complex/scanned layouts (https://pdf4.dev/blog/how-to-convert-pdf-to-word).
4. **Microsoft Word's own PDF import** ("Reflow") — decent text, mediocre tables — same source.
5. **LibreOffice / Stirling-PDF** — positioned-text-box output; "looks right, edits wrong" (§3.2).
6. **calibre** — self-described worst-case input format (§3.4).

---

## 6. Implications for pdfturbo (decision-relevant synthesis)

1. **A free, MIT, client-side PDF→DOCX of Acrobat-like quality is currently impossible.** The only two browser-capable engines (Nutrient, Aspose JS) are proprietary, with costs ($1.8k–$76k+/yr) incompatible with a free product; every OSS engine is server-side and/or AGPL-encumbered.
2. **If "good enough" beats "Acrobat-grade"**: the only realistic in-browser path is **building a heuristic converter on top of what pdfturbo already has** — pdfjs-dist text items (strings + transforms + font info) → paragraph/line/column clustering → generate DOCX with an MIT JS library (e.g., `docx` on npm). This is exactly the pdf2docx architecture, reimplemented in TS on pdfjs. Expect pdf2docx-tier results at best (good born-digital text, weak tables/columns), and a substantial engineering effort (table inference from vector strokes is the hard 20%).
3. **Honest scoping**: whatever ships should be labeled "export text to Word" rather than "convert PDF to Word" unless table/column inference is built — the fidelity gap vs Acrobat will be visible to users on the first complex document.
4. **OCR/scanned PDFs** are a separate problem (Tesseract-wasm exists, MIT-friendly) and should be explicitly out of scope for v1.
5. The same pdfjs-extraction pipeline can serve cheaper targets first: **PDF→TXT, PDF→Markdown, PDF→HTML** are dramatically easier than DOCX with most of the user value for "get my text out".

---

## 7. Source index

Commercial:
- https://www.soliddocuments.com/pdf/_solidframework_adobe_x/300/12 (Adobe licenses Solid, Acrobat X)
- https://en.wikipedia.org/wiki/Solid_Documents
- https://solidframework.net/pricing-and-licensing/ ; https://solidframework.net/versions/ ; https://www.soliddocuments.com/products.htm?product=
- https://docs.apryse.com/core/guides/features/office/convert-to-office (Structured Output = server/desktop only)
- https://sdk.apryse.com/api/PDFTronSDK/java/com/pdftron/pdf/StructuredOutputModule.html
- https://docs.apryse.com/web/guides/overview (WebViewer WASM scope)
- https://www.nutrient.io/guides/web/conversion/pdf-to-office/ (client-side PDF→DOCX, own engine)
- https://www.nutrient.io/sdk/pdf-to-office-conversion/ ; https://www.nutrient.io/sdk/pricing/ ; https://www.vendr.com/marketplace/pspdfkit ; https://www.capterra.com/p/171174/PSPDFKit-SDK/
- https://products.aspose.com/pdf/javascript-cpp/conversion/pdf-to-docx/ ; https://github.com/aspose-pdf/Aspose.PDF-for-JavaScript-via-CPP ; https://purchase.aspose.com/pricing/fr/pdf/javascript-cpp/ ; https://www.componentsource.com/product/aspose-pdf-for-javascript-via-cpp/prices ; https://www.npmjs.com/package/aspose-pdf-js
- https://itextpdf.com/products/itext-7/pdf2data ; https://kb.itextpdf.com/2data/getting-started-with-itext-pdf2data ; https://pdf2data.apryse.com/documentation/docs/engine-guide/licensing/LicenseFAQ/
- https://developers.foxit.com/products/pdf-conversion-sdk/
- https://www.compdf.com/conversion

OSS:
- https://github.com/ArtifexSoftware/pdf2docx (+ GitHub API license/stars/push date; requirements.txt raw fetch)
- https://pdf2docx.readthedocs.io/en/latest/license.html (historical AGPL/commercial wording)
- https://github.com/pymupdf/PyMuPDF ; https://pymupdf.io/ (AGPL-3.0 / commercial)
- https://forum.openoffice.org/en/forum/viewtopic.php?t=83944 ; https://pdf.wondershare.com/how-to/import-pdf-to-libreoffice.html (Draw import)
- https://github.com/Stirling-Tools/Stirling-PDF/releases/tag/v0.42.0 ; https://github.com/Stirling-Tools/Stirling-PDF/issues/3087 ; https://github.com/Stirling-Tools/Stirling-PDF/issues/3273 ; https://github.com/unoconv/unoconv
- https://manual.calibre-ebook.com/conversion.html

Cloud APIs:
- https://developer.adobe.com/document-services/pricing/main/ ; https://developer.adobe.com/document-services/docs/overview/limits ; https://developer.adobe.com/document-services/docs/overview/pdf-extract-api/dcserviceslicensing/
- https://cloudconvert.com/pricing ; https://cloudconvert.com/apis/pdf-to-office
- https://www.convertapi.com/pricing (403 on direct fetch) ; https://www.capterra.com/p/206789/ConvertAPI/ ; https://subscribed.fyi/convertapi/pricing/

Fidelity / Tagged PDF:
- https://pdf4.dev/blog/how-to-convert-pdf-to-word (independent method comparison)
- https://arxiv.org/html/2410.03022 (15.5% tagged; <3.2% fully accessible; 74.9% fail all)
- https://helpx.adobe.com/acrobat/using/creating-accessible-pdfs.html ; https://www.w3.org/TR/WCAG20-TECHS/PDF3.html
- https://community.adobe.com/t5/acrobat-discussions/word-365-to-acrobat-pdfmaker-generates-wrong-tags/td-p/11400232
