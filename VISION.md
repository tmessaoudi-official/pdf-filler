# PDF Fill & Sign — Vision & Future Features

Captured 2026-06-04. Ideas that surfaced during development — not yet planned or committed.

---

## Bugs to Investigate (reported 2026-06-04)

| # | Report | Status |
|---|--------|--------|
| B1 | Add PDF — file chooser opens but PDF not appended to document | Re-verify (prev. test said OK) |
| B2 | Watermark appears only in centre of page, not tiled/repeated | Confirmed broken |
| B3 | Can delete a highlight but not a single comment | Missing delete-per-comment |
| B4 | Delete Page button in toolbar does not work | Re-verify |

---

## Enhancements to Existing Features

### Watermark — Tiled / Repeated Pattern
Currently watermark renders as a single centred overlay. Desired: tile it across the full page (e.g. diagonal repeating grid, configurable opacity and spacing).

### Form Field Detection — Expand Widget Types
Currently detects text input fields. Missing:
- **Checkboxes** — tick/untick
- **Radio buttons** — single-select groups
- **Dropdown / Combo boxes** — select from list
- **List boxes** — multi-select
- **Push buttons** — trigger actions

### Comment / Sticky Note — Per-Note Delete
Currently unclear if individual comment removal is possible. Add a × delete control on each comment note (same as other annotation types).

### Page Export UX
Export single page as PDF is available via the 📄 toolbar button (exports current page) and the ⬇ button on each thumbnail. Future idea: "Split all pages" batch action to download a ZIP of per-page PDFs.

---

## New Feature Ideas

| Idea | Notes |
|------|-------|
| **Stamps** | Pre-defined image overlays (Approved, Draft, Confidential, Custom) |
| **Date field** | Auto-fill today's date as a text element |
| **Page numbering overlay** | Add "Page N of M" footer to all pages |
| **Header / Footer** | Repeating text or image banner on all pages |
| **Hyperlink annotation** | Attach URL to a region; clickable in exported PDF |
| **OCR text layer** | For scanned PDFs — extract selectable text via Tesseract.js |
| **QR code insertion** | Generate + embed a QR code for a URL |
| **Batch export** | Export all pages as separate PDFs or a ZIP of PNGs |
| **PDF compression** | Re-compress output PDF to reduce file size |
| **Page background** | Set a solid colour background (useful for blank PDFs) |
| **Tables** | Draw a table overlay with configurable rows/columns |
| **Digital signature** | Embed a cryptographic signature field |

---

## PDF Element Types Reference (pdfjs-dist)

Types that pdfjs-dist can expose for annotation/detection:

| Widget type | pdfjs fieldType | Current support |
|-------------|-----------------|-----------------|
| Text input  | Tx              | ✅ Detected + fillable |
| Checkbox    | Btn (checkBox)  | ❌ Not detected |
| Radio       | Btn (radioButton) | ❌ Not detected |
| Combo box   | Ch (comboBox)   | ❌ Not detected |
| List box    | Ch (listBox)    | ❌ Not detected |
| Push button | Btn (pushButton) | ❌ Not detected |
| Signature   | Sig             | ❌ Not detected (draw tool exists separately) |

Other annotation types beyond AcroForm widgets: links, free text, stamps, file attachments, ink (freehand), popup, highlight/underline/strikeout.

---

## Parked

- **Dependency upgrades** (TypeScript 5→6, Vite 5→8, pdfjs-dist 3→6, ESLint 9→10): Phase 0 research complete. Strategy: 3 sequential branches (Cluster 1: TS+ESLint → Cluster 2: Vite+PWA → Cluster 3: pdfjs). Deferred until active bugs are cleared.
