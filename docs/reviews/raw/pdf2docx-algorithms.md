# PDF→DOCX Layout-Reconstruction Algorithms & Multi-Format Export Architecture

**Date**: 2026-06-11 · **Scope**: due-diligence research for a DIY client-side PDF→DOCX converter built on pdf.js text extraction (pdfturbo).
**Method**: web-verified against primary sources (readthedocs, GitHub source code, academic papers). Each claim is tagged
`[Verified: <source>]`, `[Inferred: <basis>]`, or `[Unverified]`.

---

## 0. What pdf.js gives us as raw input (the substrate)

Everything below has to be built on what `pdfjs-dist` actually exposes:

- **`page.getTextContent()`** returns `TextItem[]` with: `str`, `dir` (`'ltr'`/`'rtl'`/`'ttb'`), `width`, `height`,
  `transform` (6-element matrix; `transform[4]`/`transform[5]` = x/y of the text origin; `transform[0]`/`transform[3]`
  encode the effective font scale), `fontName` (internal style code, e.g. `g_d0_f1` — must be resolved through
  `textContent.styles[fontName]` which carries `fontFamily`, `ascent`, `descent`, `vertical`), and `hasEOL`.
  [Verified: pdf.js JSDoc + issues #8096, #12031 — https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html,
  https://github.com/mozilla/pdf.js/issues/8096, https://github.com/mozilla/pdf.js/issues/12031]
- **Items arrive in content-stream order, not reading order.** pdf.js explicitly returns elements "in the order that
  elements appear in the PDF internally instead of how it would be read intuitively by a human". Any reconstruction
  pipeline MUST re-sort geometrically and must not trust item sequence.
  [Verified: pdf.js issues #14493, #17191 — https://github.com/mozilla/pdf.js/issues/14493,
  https://github.com/mozilla/pdf.js/issues/17191]
- **`page.getOperatorList()`** returns `{fnArray, argsArray}`. Raster images: scan for `OPS.paintImageXObject`,
  `OPS.paintImageXObjectRepeat`, `OPS.paintInlineImageXObject` (and legacy `OPS.paintJpegXObject` in old versions);
  the args carry an object name resolvable via `page.objs.get(name)` to a decoded `ImageBitmap` or raw pixel buffer
  with colorspace tag. Position comes from tracking the current transform matrix (`OPS.transform`, `OPS.save`/`OPS.restore`)
  at the moment the paint op fires (a unit square is mapped by the CTM → image bbox).
  [Verified: pdf.js issues #9603, #10498, #13742; jsdev.space snippet — https://github.com/mozilla/pdf.js/issues/9603,
  https://github.com/mozilla/pdf.js/issues/10498, https://jsdev.space/snippets/exptract-pdf-images/]
- **Vector graphics**: paths are exposed through `OPS.constructPath`, whose args are `[ops, args]` where `ops` is an
  array of sub-operator indexes — `moveTo (13)`, `lineTo (14)`, `curveTo (15)`, `curveTo2 (16)`, `curveTo3 (17)`,
  `closePath (18)`, `rectangle (19)` — and `args` is a flat coordinate array consumed positionally (2 floats for
  moveTo/lineTo, 6 for curveTo, 4 for rectangle). Batched this way for rendering speed. The paint op that *follows*
  (`OPS.stroke`, `OPS.fill`, `OPS.eoFill`, `OPS.fillStroke`…) plus current graphics state (`OPS.setStrokeRGBColor`,
  `OPS.setFillRGBColor`, `OPS.setLineWidth`, CTM) tells you whether it is a ruled line or a shading rectangle.
  This is the pdf.js equivalent of PyMuPDF's `page.get_drawings()` — lower-level, but sufficient.
  [Verified: pdf.js discussion #18410 + MeiKatz/pdfjs-docs operator reference —
  https://github.com/mozilla/pdf.js/discussions/18410, https://github.com/MeiKatz/pdfjs-docs/blob/master/README.md]
  ⚠ Caveat: exact numeric values of OPS sub-codes should be read from the installed `pdfjs-dist` (`pdfjsLib.OPS`)
  rather than hardcoded — they are an internal enum, stable in practice but not a documented public contract.
  [Inferred: enum lives in src/shared/util.js, not in the typed public API surface]
- ⚠ In recent pdf.js versions (v4+/v6) `constructPath` args may arrive as a path-data buffer rather than the classic
  `[ops, flatArgs]` pair depending on version; verify against the installed v6 before building on it. [Unverified:
  could not confirm v6's exact arg shape from public docs in this pass — must be checked empirically in a spike]

---

## 1. Line & paragraph reconstruction

### 1.1 The reference algorithm: pdfminer.six (the most-documented heuristic stack)

pdfminer.six performs a 3-stage grouping; **all parameters are relative, not absolute points** — this is the single
most important design lesson (font-size independence):
[Verified: https://pdfminersix.readthedocs.io/en/latest/topic/converting_pdf_to_text.html,
https://pdfminersix.readthedocs.io/en/latest/reference/composable.html]

| Param | Default | Meaning |
|---|---|---|
| `line_overlap` | **0.5** | two chars are on the same line if vertical bbox overlap > 0.5 × min(height of both) |
| `char_margin` | **2.0** | same line if horizontal gap < 2.0 × char width |
| `word_margin` | **0.1** | insert a space if gap > 0.1 × width of the new char (must stay < char_margin) |
| `line_margin` | **0.5** | two lines join one paragraph (textbox) if the gap between bbox tops/bottoms < 0.5 × line height |
| `boxes_flow` | **0.5** | reading-order weight: −1.0 = only x matters … +1.0 = only y matters; `None` = naive bottom-left sort |

Pseudo-code (adapted to pdf.js TextItems, which are already word/segment runs rather than single glyphs):

```
# Stage 1 — lines: cluster items by baseline
for each item: baseline_y = transform[5]; size = |transform[3]| (or hypot(t[1],t[3]) for rotated text)
sort items by (round(baseline_y / (size*0.5)), x)
same_line(a, b):
    vertical_overlap(a,b) > 0.5 * min(a.h, b.h)        # pdfminer line_overlap
    and gap_x(a,b) < 2.0 * avg_char_width(a)           # pdfminer char_margin
insert explicit space between items on a line when gap_x > 0.1..0.3 * char_width   # word_margin
   (pdfplumber uses absolute x_tolerance = 3pt, y_tolerance = 3pt as its variant)

# Stage 2 — paragraphs
same_para(line1, line2):
    horizontal_overlap(line1, line2) > 0
    and vertical_gap(line1, line2) < 0.5 * line_height          # line_margin
    # refinements used by real tools (pdf2docx / heuristics literature):
    and same_dominant_font_size(line1, line2)
    and not (line2.x0 - column.x0 > indent_threshold AND vertical_gap ≈ leading)  # indent ⇒ new para
```

pdfplumber's variant: `extract_words` uses absolute `x_tolerance=3`, `y_tolerance=3` (points), optional
`x_tolerance_ratio` for size-relative behavior, `use_text_flow` to follow PDF stream order instead of spatial sort.
[Verified: https://github.com/jsvine/pdfplumber README]

### 1.2 Paragraph-break signals (what production tools actually use)

Combined signal set (each alone is weak):
1. **Line gap vs. leading**: compute the dominant inter-line gap (mode) inside a column; a gap > ~1.5–2× the mode
   ⇒ paragraph break. pdfminer's `line_margin=0.5` (relative to line height) is the canonical default.
   [Verified: pdfminer docs above]
2. **First-line indentation**: pdf2docx computes `first_line_space = rows[0][0].x0 − rows[1][0].x0`; a positive
   delta vs. the following lines ⇒ `first-line indent` (kept as a real DOCX property, not spaces).
   [Verified: pdf2docx/text/TextBlock.py source]
3. **Short previous line**: previous line ends well before the column's right edge (e.g. < 80–90% of column width)
   while the paragraph is otherwise justified/full ⇒ break after it. [Inferred: standard heuristic in layout
   literature and visible in tools' behavior; no single canonical threshold published]
4. **Font-size / style change** between lines ⇒ always a block boundary (also the heading signal, §4).

### 1.3 Alignment detection — pdf2docx's actual decision procedure (the best documented)

From `pdf2docx/text/TextBlock.py::_parse_alignment` [Verified: raw source on GitHub,
https://github.com/dothinking/pdf2docx — file pdf2docx/text/TextBlock.py]:

```
W = width of containing column;  X0 = line left edges;  X1 = line right edges;  X = line centers
if single line:
    if |center(line) − center(column)| < center_threshold → CENTER
    elif d_left ≤ 0.25 * W → LEFT
    else → RIGHT
else (multi-line):
    left_aligned   = max(X0) − min(X0) ≤ left_threshold
    right_aligned  = max(X1) − min(X1) ≤ right_threshold
    center_aligned = max(X)  − min(X)  ≤ center_threshold
    if left_aligned and right_aligned and rows ≥ 3 → JUSTIFY
    elif center_aligned and not left/right → CENTER
    elif left_aligned → LEFT
    elif right_aligned → RIGHT
    else → NONE  (fallback: LEFT + explicit tab stops to reproduce exact x-positions)
```

pdf2docx also infers: left/right indent = distance from block edge to column edge; line spacing as either
*relative* (`block_height / standard_height`, clamped ≥ 1.0) or *exact* (in Pt); and adds DOCX tab stops
(`tab_stops.add_tab_stop(Pt(left_space + pos))`) for irregular lines. The thresholds
(`lines_left_aligned_threshold` etc.) are configurable converter settings on the order of a few points.
[Verified: same source file]

### 1.4 Reading order

- Simplest robust approach for ≤2-column docs: **recursive XY-cut** (§2) yields the block tree; depth-first
  traversal of the tree = reading order (left-to-right, top-to-bottom — must be mirrored right-to-left for RTL
  pages, see §7). [Verified: XY-cut literature, https://github.com/BobLd/DocumentLayoutAnalysis]
- pdfminer's alternative: `boxes_flow` continuous weighting between x and y proximity when chaining boxes
  (default 0.5). [Verified: pdfminer docs]
- Never rely on pdf.js item order (§0). `item.hasEOL` is a useful *hint* for line breaks within a run sequence
  but not a paragraph signal. [Verified: pdf.js API; Inferred: hasEOL semantics from API description]

---

## 2. Column detection

Three families, simplest-first:

1. **Projection profile + recursive XY-cut** — project text bboxes onto the x-axis; a vertical whitespace valley
   spanning (nearly) the full block height that is wider than ~1.5–2× the average inter-word gap ⇒ column gutter;
   cut, recurse on each side alternating axes until no cut exists. The classic Nagy et al. top-down algorithm;
   the block tree directly yields reading order; explicitly handles multi-column layouts. **This is the right
   choice for a v1: a 2-column detector is ~100 lines of TS.**
   [Verified: XY-cut survey/implementations — https://www.semanticscholar.org/topic/Recursive-XY-cut/8052957,
   https://github.com/BobLd/DocumentLayoutAnalysis, https://github.com/UglyToad/PdfPig/wiki/Document-Layout-Analysis]
   Notably, **pdf2docx itself ships `recursive_xy_cut()` and `xy_project_profile()` in `pdf2docx.common.algorithm`**
   — i.e. the most successful OSS PDF→DOCX tool uses XY-cut for section/column splitting.
   [Verified: https://pdf2docx.readthedocs.io/en/latest/api/pdf2docx.common.html]

   ```
   xycut(boxes, axis):
       profile = merge_intervals(project(boxes, axis))
       gaps = complement(profile) filtered by min_gap(axis)   # x: ~10–15pt gutter; y: ~1.4× median leading
       if no gaps: return Leaf(boxes)
       parts = split boxes at widest gaps
       return Node([xycut(p, other(axis)) for p in parts])
   ```

2. **Maximal whitespace rectangles (Breuel 2002)** — compute the cover of page background by maximal empty
   rectangles (branch-and-bound, globally optimal), then score rectangles as column-gutter candidates by aspect
   ratio, width and proximity to text-sized components. More robust than XY-cut for irregular layouts (L-shaped
   text, floating figures), and the basis used inside Tabula's page division. Harder: ~3–5× the implementation
   effort of XY-cut. [Verified: Breuel, "Two Geometric Algorithms for Layout Analysis" —
   https://www.researchgate.net/publication/2504221_Two_Geometric_Algorithms_for_Layout_Analysis]

3. **pdfminer `boxes_flow`** — no explicit column model at all; ordering emerges from the box-chaining weight.
   Works surprisingly often for clean 2-column text, fails silently when columns have unequal lengths.
   [Verified: pdfminer docs]

**Recommendation**: XY-cut at page level (detect 1 vs 2 columns + headers/footers as separate y-bands), with a
"column confidence" score; fall back to single-column when the gutter is ambiguous. [Speculative: design judgment]

---

## 3. Table detection

### 3.1 Ruled ("lattice") tables from vector strokes — the pdf2docx approach

pdf2docx pipeline (PyMuPDF `page.get_drawings()` → ours: `getOperatorList` path reconstruction, §0):
[Verified: pdf2docx TableStructure.py source + https://pdf2docx.readthedocs.io/en/latest/api/pdf2docx.shape.Paths.html]

1. Extract paths; keep axis-parallel (iso-oriented) strokes and rectangular fills; convert thin filled rects
   (height ≤ ~2× line width) into strokes; non-iso-oriented path clusters are rasterized as images by pdf2docx
   (we can simply ignore them for table purposes).
2. **Group strokes**: horizontal strokes keyed by rounded y (`{y0:[h1,h2], y1:[h4]}`), vertical by rounded x;
   strokes within `min_border_clearance` are merged with averaged coordinates; missing outer borders are
   synthesized from the bbox (tolerance `max_border_width`).
3. **Cells & merges**: for each candidate row, shoot a horizontal reference line at `(y0+y1)/2` and test
   intersection with vertical strokes — no intersection ⇒ horizontally merged cell; symmetric test with a vertical
   reference line for row-merges; runs of `0` in the status arrays give `rowSpan`/`colSpan`, validated as rectangles.
4. **Borders/shading per cell**: pick the strokes lying along each cell edge (style/color); a cell is shaded when a
   fill shape contains the cell's inner region above a containment factor (`FACTOR_MOST` ≈ 0.75 [Inferred:
   constant name from source; exact value unconfirmed]).
5. Same machinery as the validation step Camelot-Lattice does with images, but purely vector — **no OpenCV, no
   rasterization needed**. Tabula's "spreadsheet" mode does the same on ruling lines with colinear-line collapsing
   (`Ruling.collapseOrientedRulings`) + cell finding (`SpreadsheetExtractionAlgorithm.findCells`).
   [Verified: https://github.com/tabulapdf/tabula-java — SpreadsheetDetectionAlgorithm.java]

pdfplumber's equivalent knobs (good defaults to copy): `snap_tolerance=3` (merge near-parallel lines),
`join_tolerance=3` (connect collinear segments), `edge_min_length=3` (noise filter),
`intersection_tolerance=3` (orthogonal intersection test). [Verified: pdfplumber README]

**Realistic JS difficulty: MODERATE.** The geometry (snap/join/intersect/cell-grid) is a few hundred lines of pure
math on top of the §0 path extraction. The risky part is only path extraction fidelity (CTM tracking, clipping).
[Inferred: from the algorithm surface area of pdfplumber/pdf2docx implementations]

### 3.2 Unruled ("stream") tables from whitespace alignment — Camelot/Tabula

Camelot Stream (built on pdfminer grouping; derives from Anssi Nurminen's 2013 MSc thesis):
[Verified: https://camelot-py.readthedocs.io/en/latest/user/how-it-works.html]

1. Group words into text rows by y-overlap.
2. Compute **text edges** (left/right/mid alignment lines that many rows share); Tabula's
   `NurminenDetectionAlgorithm` assigns each row a probability of being tabular by which edge type intersects the
   most rows. [Verified: tabula-java NurminenDetectionAlgorithm.java]
3. Guess table region; column count = **mode of per-row word counts**; initial column x-ranges from rows having
   that mode; extend ranges with remaining words.
4. Assign words to cells by coordinates. Tolerances in Camelot: `row_tol` (default 2pt), `column_tol` (0),
   `edge_tol` (50) [Verified for existence and roles; defaults from Camelot docs — row_tol=2 confirmed in docs,
   others Inferred from CLI reference].
5. Camelot 1.x adds a "network" parser (text-alignment graph) and "hybrid" (network + lattice) — evidence that
   pure stream mode was not reliable enough alone. [Verified: same docs]

**Realistic JS difficulty: HIGH — not the algorithm but the precision/recall.** Stream-mode has a notorious
false-positive problem (any aligned list looks like a table) and needs a table/not-table classifier gate.
**Recommendation: v1 ships lattice-only; stream mode flagged experimental or deferred.** [Speculative + Inferred
from Camelot's own evolution toward hybrid parsers]

---

## 4. Headings & style inference

- **Font-size clustering — the pymupdf4llm `IdentifyHeaders` recipe** (simple, proven): scan all spans, find the
  **most frequent font size = body text**; every larger size becomes a heading level by rank
  (largest → H1, next → H2 …, capped at `max_levels`, e.g. 3); sizes ≤ body are body.
  [Verified: https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/api.html, https://github.com/pymupdf/pymupdf4llm]
  - Practical refinements: round sizes to 0.5pt before histogramming; require headings to be short (< ~100 chars),
    not ending in '.', and on their own line; treat same-size-but-bold lines as candidate H3/H4.
    [Inferred: common refinements in OSS markdown converters; no single citable threshold]
- **Bold/italic from font names**: PostScript names embed style — match `/bold|black|heavy|semibold/i` and
  `/italic|oblique/i` against `styles[fontName].fontFamily` and the raw name (e.g. `Arial-BoldMT`,
  `TimesNewRomanPS-ItalicMT`). pdf.js does NOT expose the PDF FontDescriptor flags bitfield through
  `getTextContent()`, so name-sniffing is the available signal (plus `style.fontWeight` when present in newer
  versions). [Verified: fontName/styles behavior from pdf.js issue #8096; Inferred: name-pattern matching is what
  pdfplumber/pymupdf users do — `fontname` conventions; Unverified: availability of a `fontWeight` field in v6's
  TextStyle — check the installed typings]
- Map to DOCX: emit real `Heading1..3` paragraph styles (gives navigation pane + TOC support in Word), and set
  run `bold`/`italics`/`size`/`font`/`color` (color must be captured per-item from the operator list's fill color
  at text-draw time, or via `getTextContent`'s `includeMarkedContent`/style info — pdf.js does not put color on
  TextItem; color requires correlating with `OPS.setFillRGBColor` in the operator list. [Verified: TextItem schema
  has no color field; correlation approach Inferred])

---

## 5. Images into DOCX

- Extraction (verified API, §0): walk `fnArray`, maintain a CTM stack across `OPS.save/restore/transform`; on
  `paintImageXObject*`/`paintInlineImageXObject`, current CTM maps the unit square → placement bbox (x, y, w, h,
  rotation); `page.objs.get(name)` (or `page.commonObjs`) yields the decoded bitmap → draw to an offscreen canvas
  → `canvas.convertToBlob({type:'image/png'})`. Beware: object may not be resolved yet (resolve via
  `objs.get(name, callback)`), duplicate names across pages (issue #13742), and CMYK/ICC buffers needing manual
  conversion when not already an ImageBitmap. [Verified: issues #9603/#10498/#13742 + jsdev.space snippet]
- Placement in DOCX (`docx` npm): `ImageRun` with `transformation: {width, height}`; **inline** by default —
  simplest and most robust; **floating** via `floating: {horizontalPosition, verticalPosition, wrap}` when the
  image overlaps text flow (needed to mimic magazine-style layouts). Decision rule: if the image bbox vertically
  overlaps reconstructed text lines by > ~20%, emit floating with absolute position; else inline between
  paragraphs. [Verified: docx library exists/works in browser — https://github.com/dolanmiu/docx; floating API
  names Inferred from docx.js docs structure — confirm exact option names against installed version;
  decision rule Speculative]
- Vector-only figures (charts drawn as paths): no raster object exists. Options: (a) skip, (b) render the page
  region to canvas via pdf.js `page.render` with a clip and embed as PNG — pragmatic and what pdf2docx effectively
  does for SVG-like clusters ("convert paths to images by clipping page"). [Verified: pdf2docx Paths module doc
  describes exactly this fallback]

---

## 6. Multi-format architecture from ONE intermediate model

**The pandoc lesson**: n readers × m writers collapse from n·m converters to n+m through one typed AST —
`Pandoc = Meta + [Block]`; Blocks = `Para, Header(level), Table, BulletList, CodeBlock…`; Inlines =
`Str, Emph, Strong, Space, Link, Image…`. This is the reference shape for our intermediate model.
[Verified: https://pandoc.org/using-the-pandoc-api.html, https://pandoc.org/filters.html]

Proposed model (one page-segmentation + reconstruction pass produces it; every exporter is a pure function):

```ts
type DocModel = { pages?: PageBreak[]; blocks: Block[]; lang: { rtl: boolean } };
type Block =
  | { kind: 'paragraph'; runs: Run[]; align: 'left'|'right'|'center'|'justify';
      indent?: {left?: number; firstLine?: number}; spacing?: {before?: number; line?: number};
      headingLevel?: 1|2|3; bidi?: boolean; listInfo?: {ordered: boolean; level: number} }
  | { kind: 'table'; rows: Cell[][]; colWidths: number[];
      cellMeta: {rowSpan: number; colSpan: number; shading?: string; borders?: BorderStyle}[][] }
  | { kind: 'image'; data: Blob; bbox: Rect; placement: 'inline'|'float' };
type Run = { text: string; bold?: boolean; italic?: boolean; size: number;
             font?: string; color?: string; rtl?: boolean; link?: string };
```

Cost of each additional exporter given this model:

| Format | Cost | Notes |
|---|---|---|
| **TXT** | trivial (~50 LOC) | flatten runs; blank line between paragraphs; tabs between cells |
| **Markdown** | trivial (~150 LOC) | `#` from headingLevel, `**`/`*`, pipe tables (loses spans/colors — acceptable) |
| **HTML** | easy (~300 LOC) | best fidelity after DOCX: full styles, `dir="rtl"`, colspan/rowspan, base64 imgs |
| **EPUB** | easy once HTML exists | EPUB3 = zipped XHTML + manifest (we already ship a zip-capable stack; @cantoo/pdf-lib aside, a minimal zip writer or fflate does it); chapter split on H1 [Inferred: EPUB3 spec structure — standard knowledge; container format verifiable] |
| **DOCX** | the main work | via `docx` npm — declarative API, works in browser, supports headings/tables/merged cells (`columnSpan`/`rowSpan` demo verified), tab stops, images, RTL [Verified: https://github.com/dolanmiu/docx demos 22 & 41] |
| **XLSX** | NOT nearly-free | different document semantics (grid, not flow); only sensible as "export detected tables to sheets" — a separate, narrower feature (SheetJS/exceljs) [Speculative: scoping judgment] |
| **PPTX** | NOT sensible from this model | slide canvas with absolutely-positioned shapes; would need the *positioned* low-level model, not the flow model; skip [Speculative] |

Architectural consequence: keep TWO layers — (1) the geometric layer (positioned items/paths/images, already close
to what pdfturbo's editor holds) and (2) the flow `DocModel`. DOCX/HTML/MD/TXT/EPUB consume layer 2; a future
PPTX/SVG/fixed-HTML exporter would consume layer 1 (pdf2htmlEX demonstrates the layer-1 export style: absolutely
positioned native text with pixel-perfect CSS — excellent fidelity, zero editability semantics).
[Verified: pdf2htmlEX paper, Wang & Liu, TUGboat 34(3) 2013 — https://www.tug.org/TUGboat/tb34-3/tb108wang.pdf]

---

## 7. The fidelity ceiling — honest assessment

**Works well (expect "good to excellent")** [Inferred: from the documented scope and known failure reports of
pdf2docx/Camelot/pdfminer — consistent across sources]:
- Letters, contracts, reports, theses, books: single/two-column, consistent leading, ruled tables
- Digitally-born PDFs (Word/LaTeX/InDesign exports with proper text encoding)

**Degrades (expect "usable but needs cleanup")**:
- Justified text with aggressive kerning/tracking (word-gap heuristics misfire → joined/split words)
- Stream tables, nested tables, tables without any rulings
- Footnotes/endnotes (become plain paragraphs), headers/footers (must be y-band-filtered or they pollute every page),
  multi-level lists (bullet glyph + indent detection is doable; numbering-scheme inference is fragile)

**Fails (be upfront in the UI)**:
- Magazines/brochures/slides: arbitrary text placement, text over images, non-rectangular flow — flow reconstruction
  is semantically undefined; offer layer-1 style export or rasterized pages instead
- Scanned PDFs with no text layer: nothing to extract — requires OCR (out of scope; Tesseract.js exists but is a
  separate project) [Verified: trivially — getTextContent returns nothing for image-only pages]
- Forms (AcroForm widgets are not page text), math formulas (glyph soup), CJK vertical text (`dir:'ttb'`)
- **ligature/ToUnicode-damaged PDFs**: text extraction inherits whatever broken mapping the PDF has

### RTL/Arabic — extra care required (pdfturbo ships AR locale, so this is P1, not optional)

1. **Order within lines**: pdf.js gives `TextItem.dir` per item. A visual line may interleave RTL and LTR items
   (Arabic + Latin numbers). Reconstruct the *logical* string per line: sort items by x, then reorder contiguous
   same-direction groups according to the paragraph's base direction (a mini bidi-reordering step — the inverse
   of the Unicode BiDi algorithm's display reordering). Naive left-to-right x-sort concatenation produces
   reversed Arabic words. [Verified: dir field exists; the visual-vs-logical pitfall — pdf.js issues #14493/#15546;
   the exact inverse-bidi recipe Inferred — standard approach, no single canonical citation]
2. **Already-shaped glyphs**: many Arabic PDFs store *presentation forms* (U+FB50–FEFF contextual forms) rather
   than logical Arabic letters. For correct DOCX text, normalize presentation forms back to base letters
   (NFKC handles most of it) and let Word re-shape. [Inferred: known property of Arabic PDF text extraction across
   pdfminer/PyMuPDF issue trackers; verify against sample GRDF-irrelevant Arabic PDFs in a spike]
3. **Paragraph base direction**: majority-strong-character heuristic (count Arabic-script chars vs Latin) per
   paragraph → sets base direction. [Inferred: standard heuristic, cf. Unicode UAX#9 "first strong" / higher-level
   protocols]
4. **DOCX emission** — verified concrete API: paragraph `bidirectional: true` (→ OOXML `<w:bidi/>`), run
   `rightToLeft: true` (→ `<w:rtl/>`), table `visuallyRightToLeft: true`. OOXML semantics: `w:bidi` flips paragraph
   layout direction; `w:rtl` marks the run as complex-script (Word then uses `bCs`/`iCs`/`cs` font attributes for
   bold/italic/font of Arabic runs).
   [Verified: docx.js demo/22-right-to-left-text.ts (fetched raw source);
   OOXML: https://ooxml.dev/docs/bidirectional-text/, https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_bidi_topic_ID0ETWAK.html,
   https://c-rex.net/samples/ooxml/e1/Part4/OOXML_P4_DOCX_rtl_topic_ID0E4RWO.html]
5. **Column/reading order**: XY-cut traversal must be right-to-left for RTL pages; alignment detection mirrors
   (RIGHT becomes the default alignment, first-line indent measured from the right edge). [Inferred: direct
   consequence of §1.3/§2 geometry under mirroring]

---

## 8. Bottom-line algorithmic plan (synthesis)

1. **Per page**: getTextContent + getOperatorList → items, paths, images (one geometric model).
2. **XY-cut** on item bboxes (with header/footer y-band stripping) → columns/blocks + reading order.
3. **Lines** via baseline clustering (pdfminer-style relative tolerances); **words** via word_margin.
4. **Tables first**: lattice detection from path-derived rulings (snap 3pt / join 3pt / intersect 3pt grid);
   claim those items; remainder flows as text.
5. **Paragraphs** via line_margin + indent + font-change; **alignment** via pdf2docx's X0/X1/center spread tests;
   **headings** via body-size-mode clustering; **bold/italic** via font-name sniffing.
6. **RTL pass**: per-line logical reordering, presentation-form normalization, base-direction per paragraph.
7. Emit `DocModel` → exporters: DOCX (docx npm), HTML, MD, TXT, EPUB; XLSX only as "tables → sheets"; no PPTX.
8. Fidelity gate in UI: detect document class (no text layer / >2 columns / heavy overlap) and warn before export.
   [Speculative: product suggestion]

## Source index

- pdfminer.six layout docs: https://pdfminersix.readthedocs.io/en/latest/topic/converting_pdf_to_text.html ·
  https://pdfminersix.readthedocs.io/en/latest/reference/composable.html
- pdfplumber: https://github.com/jsvine/pdfplumber
- pdf2docx: https://github.com/dothinking/pdf2docx (source: table/TableStructure.py, text/TextBlock.py) ·
  https://pdf2docx.readthedocs.io/en/latest/api/pdf2docx.common.html ·
  https://pdf2docx.readthedocs.io/en/latest/api/pdf2docx.shape.Paths.html — note: **no longer actively maintained** (Artifex archived it)
- Camelot: https://camelot-py.readthedocs.io/en/latest/user/how-it-works.html
- tabula-java: https://github.com/tabulapdf/tabula-java (NurminenDetectionAlgorithm.java, SpreadsheetDetectionAlgorithm.java)
- XY-cut: https://github.com/BobLd/DocumentLayoutAnalysis · https://github.com/UglyToad/PdfPig/wiki/Document-Layout-Analysis
- Breuel whitespace rectangles: https://www.researchgate.net/publication/2504221_Two_Geometric_Algorithms_for_Layout_Analysis
- pdf2htmlEX paper: https://www.tug.org/TUGboat/tb34-3/tb108wang.pdf
- pdf.js APIs: issues #8096, #9603, #9728, #10498, #12031, #13742, #14493, #15546, #16184, #17191; discussion #18410;
  https://github.com/MeiKatz/pdfjs-docs/blob/master/README.md ; https://jsdev.space/snippets/exptract-pdf-images/
- pymupdf4llm heading clustering: https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/api.html
- pandoc AST: https://pandoc.org/using-the-pandoc-api.html
- docx npm: https://github.com/dolanmiu/docx (demo/22-right-to-left-text.ts, demo/41-merge-table-cells-2.ts)
- OOXML bidi/rtl: https://ooxml.dev/docs/bidirectional-text/ · c-rex.net OOXML Part 4 (`bidi`, `rtl`)
