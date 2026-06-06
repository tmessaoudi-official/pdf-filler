# PDFturbo — v1 Publish Sprint

**Created**: 2026-06-07  
**Goal**: Make PDFturbo legally publishable, fully internationalized (EN/FR/AR), accessible (WCAG 2.1 AA), and bug-free on the watermark/search/preview fronts.  
**Deployed target**: https://tmessaoudi-official.github.io/pdfturbo/  
**Hosting**: GitHub Pages (needed for Mentions légales)  
**Contact email**: TODO — user must supply a personal email for Mentions légales (NOT the GRDF work address)

---

## Decisions Log

- [2026-06-07] AGREED: Rename to PDFturbo (commit 3fc10e2) — "PDF Fill & Sign" collides with Adobe branding
- [2026-06-07] AGREED: Languages = English + French + Arabic (full RTL for Arabic)
- [2026-06-07] AGREED: Footer = `© 2026 Takieddine Messaoudi` + nav links only — no email in footer
- [2026-06-07] AGREED: Contact email goes in Mentions légales page only (user to provide personal email)
- [2026-06-07] AGREED: Hosting = GitHub Pages → Mentions légales hosting provider = GitHub Inc., 88 Colin P Kelly Jr St, San Francisco, CA 94107, USA
- [2026-06-07] AGREED: Arabic legal prose (Privacy Policy, ToS, Mentions légales) requires human translation — not machine translation
- [2026-06-07] AGREED: Build order: B1/B2/B4 bugs → i18n scaffold → a11y → legal pages → B3 text layer (last)
- [2026-06-07] AGREED: LICENSE = All Rights Reserved (proprietary); dependencies are MIT/Apache 2.0 — no GPL conflict
- [2026-06-07] AGREED: i18n must use CSS logical properties (`margin-inline`, `padding-block`, `inset-inline-start`) from day one — no retrofitting

---

## Formal Plan

### Stage 1 — Bug Fixes (no new user strings, safe before i18n)

| Bug | File | Root cause | Fix |
|-----|------|-----------|-----|
| B1: Font size slider no preview | `js/pdfEditorApp.ts` `_updateWatermarkPreview()` | `previewScale = Math.min(32, h*0.4) / realFontSize` → effectiveFontSize always 32px | Remove normalization; scale canvas to represent A4 density |
| B2: Export preview stale on page/zoom change | `js/pdfEditorApp.ts` `_goToPageIndex()`, `applyZoom()` | Neither calls `_showExportPreview()` when `_exportPreviewOpen` | Add `if (this._exportPreviewOpen) this._showExportPreview();` in both methods |
| B4: Search misses user text boxes | `js/pdfEditorApp.ts` `_search()` | Only queries native PDF text via `buildIndex()`; no `TextElement` search | Collect `TextElement` items from current page model; append synthetic matches to results |

### Stage 2 — i18n Scaffold

- Install `i18next` (MIT, 5KB gzip) + `i18next-browser-languagedetector`
- Create `locales/en.json`, `locales/fr.json`, `locales/ar.json`
- Add `<html lang="en" dir="ltr">` switching
- Replace ALL hardcoded UI strings with `t('key')` calls
- CSS: replace all `margin-left/right`, `padding-left/right`, `left/right` with logical equivalents
- Toolbar: mirror layout for RTL (CSS `[dir="rtl"]` or `direction: rtl`)
- Language switcher in header (EN / FR / AR buttons)

### Stage 3 — Accessibility (a11y)

All new ARIA strings authored as i18n keys.

- 32 toolbar buttons missing `aria-label` → add with translation keys
- All modals: `role="dialog" aria-modal="true" aria-labelledby="<h2-id>"`
- Toggle buttons: `aria-pressed="true/false"`
- Focus trap in modals (Tab/Shift+Tab cycles inside, Escape closes)
- Main canvas: `role="img" aria-label={t('canvas.label')}`
- Find bar input: `aria-label`, results count `aria-live="polite"`
- Test: keyboard-only navigation through full workflow

### Stage 4 — Legal Pages + Footer

All content authored as i18n keys. Arabic prose = placeholder until human translation supplied.

| Page / Component | Content |
|---|---|
| Footer | `© 2026 Takieddine Messaoudi` + links: Privacy · Mentions légales · Terms · Accessibility |
| Cookie/storage banner | "This tool uses IndexedDB to save your session locally. Nothing is sent to any server." |
| Privacy Policy | Data collected (none server-side), IndexedDB scope, contact |
| Mentions légales | Publisher: Takieddine Messaoudi; Hosting: GitHub Inc. (address above); Contact: [user email] |
| Terms of Use | Permitted use, no warranty, All Rights Reserved |
| Accessibility statement | WCAG 2.1 AA target, known gaps, contact for issues |
| LICENSE | All Rights Reserved, © 2026 Takieddine Messaoudi |
| THIRD-PARTY-NOTICES.md | pdfjs-dist (Apache 2.0), pdf-lib (MIT), i18next (MIT), vite (MIT) |

### Stage 5 — B3 Text Layer (last, biggest)

- Implement `renderTextLayer` using pdfjs-dist v6 API
- CSS for `.textLayer` (transparent overlay, pointer-events enable)
- Coordinate mapping: text layer must align with canvas at current zoom/rotation
- Annotation layer for clickable links/emails
- Ensure text layer is re-rendered on page change and zoom change
- Ensure text layer does not interfere with annotation drawing mode

---

## Status Tracker

| Stage | Items | Status |
|-------|-------|--------|
| Stage 0: Rename | PDFturbo | ✅ DONE (3fc10e2) |
| Stage 1: Bugs B1/B2/B4 | 3 bugs | ✅ DONE (56c4ec6) |
| Stage 2: i18n scaffold | EN/FR/AR + RTL | ✅ DONE (2979213) |
| Stage 3: a11y | 32 aria-labels + modals + focus traps | ⏳ PENDING |
| Stage 4: Legal pages | 6 pages + footer + LICENSE | ⏳ PENDING |
| Stage 5: B3 text layer | renderTextLayer + annotation layer | ⏳ PENDING |

---

## Open Questions (blocking specific stages)

1. **Contact email for Mentions légales** — user must provide a personal email (not GRDF address). Blocks Stage 4.
2. **Arabic legal prose translation** — English/French can be authored now; Arabic = placeholder until user arranges human translation.
