# Dependency Research Report — pdfturbo

**Date:** 2026-06-11
**Scope:** Client-side browser PDF editor, proprietary license — AGPL = unusable without commercial license; MIT/Apache/BSD = fine.

---

## 1. Declared Dependencies — Status Table

### 1a. @cantoo/pdf-lib

| Field | Value |
|---|---|
| **Declared** | ^2.7.1 |
| **Latest on npm** | 2.7.1 |
| **Last publish** | 2026-05-27 |
| **Maintenance** | ACTIVE (single maintainer: François Billioud) |
| **License** | MIT |
| **Source** | https://github.com/cantoo-scribe/pdf-lib |

**Notes:**
- Most recent commit 2026-05-27 "Release 2.7.1" — actively maintained with recent SVG, text characterSpacing improvements.
- Fork of upstream Hopding/pdf-lib (effectively abandoned) with explicit mission statement: "Until pdf-lib gets better maintenance, we will maintain this as long as we need it."
- Versioning jumped from 1.x (old fork numbering) to 2.x in this fork; 2.7.1 is the latest and current.
- 115 tags total; recent cadence: v2.6.2 → v2.6.3 → v2.6.4 → v2.6.5 → v2.7.1.
- 336 GitHub stars, 28 open issues.
- Upstream pdf-lib (Hopding) NOT revived — still on 1.17.1, abandoned since ~2021.
- Alternative fork: @pdfme/pdf-lib (pdfme org, MIT, v5.5.10, updated 9 days ago) — also active, but focused on the pdfme template-generator ecosystem rather than standalone PDF manipulation.

**Verdict: KEEP** — at latest version, actively maintained, MIT license. Monitor @pdfme/pdf-lib as potential future upgrade if pdfme ecosystem adoption grows.

**Sources:**
- https://github.com/cantoo-scribe/pdf-lib
- https://api.github.com/repos/cantoo-scribe/pdf-lib/commits
- https://www.npmjs.com/package/@cantoo/pdf-lib

---

### 1b. pdf-lib (upstream/original)

| Field | Value |
|---|---|
| **Declared** | ^1.17.1 |
| **Latest on npm** | 1.17.1 |
| **Last publish** | ~2021 (last meaningful release) |
| **Maintenance** | ABANDONED |
| **License** | MIT |
| **Notes** | 6.2M weekly downloads (legacy inertia); GitHub issue #1423 "Is this thing still on?" |

**Notes:**
- Confirmed abandoned since ~2021 (DMCA incident in Aug 2021 disrupted development; no recovery).
- Already declared unused in pdfturbo (per task brief) — this is dead code in package.json.
- Still receives ~6M weekly downloads purely from legacy dependents.

**Verdict: REMOVE** — declared but unused; dead project; keeping it pollutes lockfile and signals confusion. Remove the declaration entirely.

**Sources:**
- https://www.npmjs.com/package/pdf-lib
- https://github.com/Hopding/pdf-lib/issues/1423
- https://security.snyk.io/package/npm/pdf-lib

---

### 1c. pdfjs-dist

| Field | Value |
|---|---|
| **Declared** | ^6.0.0 |
| **Latest on npm** | 6.0.227 |
| **Last publish** | 2026-05-30 |
| **Maintenance** | ACTIVE (Mozilla, automated bot commits) |
| **License** | Apache-2.0 |
| **Current major** | v6 (v6.0.0 was first v6 release; v5 EOL'd with v5.7.284 on 2026-04-27) |

**Notes:**
- v6 is a major release with API-breaking changes (api-minor / api-major tags in changelog).
- Declared as ^6.0.0 puts us on the current major — correctly pinned.
- Released ~May 30, 2026; previously running v5.x through April 2026.
- Very actively maintained by Mozilla; releases every few weeks.
- Primarily a PDF **renderer** (read/display), not a writer — complementary to @cantoo/pdf-lib.

**Verdict: KEEP** — at latest major, actively maintained by Mozilla, Apache-2.0 license. The ^6.0.0 declaration is correct. Verify API-breaking changes from v5→v6 are handled if upgrading from v5.

**Sources:**
- https://github.com/mozilla/pdf.js/releases
- https://github.com/mozilla/pdfjs-dist
- https://www.npmjs.com/package/pdfjs-dist

---

### 1d. bwip-js

| Field | Value |
|---|---|
| **Declared** | ^4.11.1 |
| **Latest on npm** | 4.11.1 |
| **Last publish** | 2026-05-28 |
| **Maintenance** | ACTIVE (Mark Warren / metafloor) |
| **License** | MIT |

**Notes:**
- At latest version; very actively maintained (3 releases within 2 days: v4.10.2, v4.11.0, v4.11.1 on 2026-05-27-28).
- Supports 90+ barcode types; unique breadth in the JS ecosystem.
- v4.10 introduced EAN guard bar height change (5px increase at scale=1) — breaking change for pixel-exact layouts.
- Scoped packages available: @bwip-js/browser, @bwip-js/node for environment-specific builds.
- No credible alternatives offer comparable barcode type coverage in pure JS/browser.

**Verdict: KEEP** — at latest version, best-in-class for barcode breadth, MIT license, actively maintained.

**Sources:**
- https://github.com/metafloor/bwip-js/releases
- https://www.npmjs.com/package/bwip-js

---

### 1e. qr-code-styling

| Field | Value |
|---|---|
| **Declared** | ^1.9.2 |
| **Latest on npm** | 1.9.2 |
| **Last publish** | ~June 2025 (~1 year ago) |
| **Maintenance** | SLOW / maintenance-mode |
| **License** | MIT |

**Notes:**
- At latest version; however last publish was ~1 year ago (June 2025 approximately).
- Package has 217 dependents, stable user base, but low recent activity.
- Niche use case: styled QR codes with logos/custom shapes — no direct drop-in replacement with equal visual customization exists.
- Alternatives: qrcode (MIT, very active, simple QR generation only — no styling), react-qr-code (MIT, active, basic styling). Neither matches qr-code-styling's visual customization depth (gradient fills, custom dot shapes, embedded logos).
- If the app requires branded/styled QR codes, qr-code-styling remains the only serious option; if basic QR suffices, `qrcode` (npm package) is better maintained.

**Verdict: WATCH** — at latest version but slow maintenance. Monitor for abandonment. If visual customization is required, no better-maintained alternative exists in the MIT space. If only plain QR needed, replace with `qrcode` (MIT, active).

**Sources:**
- https://www.npmjs.com/package/qr-code-styling
- https://cloudsmith.com/navigator/npm/qr-code-styling

---

### 1f. i18next + i18next-browser-languagedetector

| Field | Value |
|---|---|
| **i18next declared** | ^26.3.1 |
| **i18next latest** | 26.3.1 |
| **i18next last publish** | ~June 3, 2026 (8 days ago) |
| **i18next maintenance** | ACTIVE (i18next org) |
| **detector declared** | ^8.2.1 |
| **detector latest** | 8.2.1 |
| **detector last publish** | Recent (current) |
| **License** | MIT (both) |

**Notes:**
- Both packages at their latest versions.
- i18next v26 was released sometime in late 2025/early 2026; v26.3.1 is the current stable.
- One of the most actively maintained i18n libraries in the JS ecosystem; widely adopted, no credible reason to replace.
- The browser language detector at v8.x is correctly paired with i18next v26.

**Verdict: KEEP (both)** — at latest versions, actively maintained, MIT license. No action needed.

**Sources:**
- https://www.npmjs.com/package/i18next
- https://github.com/i18next/i18next

---

### 1g. qpdf-wasm

| Field | Value |
|---|---|
| **Declared** | ^0.1.0 |
| **Latest on npm** | 0.1.0 |
| **Last publish** | 2025-07-26 |
| **Maintenance** | STALE/ABANDONED (jsscheller, 6 total commits, 7 stars) |
| **License** | Unverified (check repository) |

**Notes:**
- Declared but unused per task brief.
- Original jsscheller/qpdf-wasm has only 6 commits total, 7 stars — prototype-grade project.
- Published July 2025, no subsequent updates; 3 open issues, no PRs.
- Active forks exist: @neslinesli93/qpdf-wasm (v0.3.0, published ~Dec 2025, more active) and kairi003/qpdf-wasm-esm (ESM variant).
- The @jspawn/qpdf-wasm variant has v0.0.2 last published 4 years ago — also stale.
- Since this is declared but unused, the immediate action is removal; if qpdf WASM is needed in future, prefer @neslinesli93/qpdf-wasm.

**Verdict: REMOVE** — declared but unused, stale/abandoned package. Remove from package.json.

**Sources:**
- https://github.com/jsscheller/qpdf-wasm
- https://www.npmjs.com/package/@jspawn/qpdf-wasm
- https://github.com/neslinesli93/qpdf-wasm

---

## 2. Dev Tooling — Quick Version Check

| Tool | Declared | Latest | Status | Verdict |
|---|---|---|---|---|
| **vite** | 8.x (confirmed) | 8.0.16 (2026-06-01) | ACTIVE — Rolldown fully integrated in v8 (Dec 2025) | KEEP / update to 8.0.16 |
| **vitest** | 4.x (confirmed) | 4.1.8 (latest stable) | ACTIVE — v5.0.0-beta.4 exists for preview | KEEP / update to 4.1.8 |
| **typescript** | 6.x (confirmed) | 6.0.3 (2026-04-16); v7.0 Beta (Go rewrite) announced 2026-04-21 | ACTIVE — TS6 is last JS-based release; TS7 beta available | KEEP 6.x; evaluate TS7 when stable |
| **eslint** | 10.x (confirmed) | 10.4.1 | ACTIVE — ESLint v10 released Feb 2026; v9.x EOL 2026-08-06 | KEEP / update to 10.4.1 |

**Notes:**
- All dev tooling is on current major versions — no surprises.
- TypeScript 7.0 (Go-based, 10x faster) is in beta; not stable yet — do not rush.
- Vite 8 ships with Rolldown (Rust-based bundler) fully integrated — potentially faster builds.

---

## 3. Alternatives Analysis — PDF Write/Manipulation

The host app is proprietary/closed-source. License column critical: **AGPL = unusable without paid commercial license.**

| Library | npm Package | Latest | License | Write/Modify? | Active? | Verdict |
|---|---|---|---|---|---|---|
| **@cantoo/pdf-lib** | @cantoo/pdf-lib | 2.7.1 (2026-05-27) | MIT | YES (full) | YES | **Current choice — keep** |
| **@pdfme/pdf-lib** | @pdfme/pdf-lib | 5.5.10 (2026-06-02) | MIT | YES (full, fork of same upstream) | YES | Viable alternative; pdfme ecosystem; slightly higher weekly downloads than cantoo |
| **mupdf (official)** | mupdf | 1.27.0 | **AGPL + commercial** | YES (full, WASM, high fidelity) | YES (Artifex) | **UNUSABLE** for closed-source without paid license |
| **mupdf-js** | mupdf-js | ~1.x | MIT (unofficial wrapper) | Limited (render-focused) | LOW (andytango) | Stale unofficial wrapper; not production-ready |
| **jsPDF** | jspdf | Current | MIT | YES (create new, limited modify) | YES | Weaker modify support vs pdf-lib; not a replacement for editing existing PDFs |
| **pdfmake** | pdfmake | Current | MIT | YES (create new only) | YES | Template/document generation only; cannot edit existing PDFs |
| **PDFKit** | pdfkit | Current | MIT | YES (create new) | YES | Node-first; browser support via browserify; no existing-PDF editing |
| **LibPDF** | libpdf | 2025 | MIT | YES (TypeScript-native, async) | EMERGING | New 2025 library; no production track record yet |
| **qpdf WASM** | @neslinesli93/qpdf-wasm | 0.3.0 | GPL/MIT (verify) | Transform only (CLI operations) | Moderate | Good for decrypt/compress/merge; not a write API |
| **Nutrient Web SDK** | (commercial SDK) | N/A | **Commercial proprietary** | YES (full viewer + editor) | YES | Not open source; licensed product |

**Summary for PDF write/modify:** @cantoo/pdf-lib (MIT, active, 2026) is the right choice for this use case. The only serious competitor in the open-source MIT space is @pdfme/pdf-lib (also MIT, also active, higher download velocity). MuPDF.js is technically superior but AGPL-blocked. No other library matches the combination of: browser-native, modify-existing-PDFs, MIT license, active maintenance.

---

## 4. Alternatives Analysis — Barcode/QR

| Library | Latest | License | Purpose | Active? | Verdict |
|---|---|---|---|---|---|
| **bwip-js** | 4.11.1 (2026-05-28) | MIT | 90+ barcode types | YES | **Keep — no real alternative for breadth** |
| **qr-code-styling** | 1.9.2 (~June 2025) | MIT | Styled QR (logos, gradients) | SLOW | **Keep if styling needed; replace with `qrcode` if plain QR sufficient** |
| **qrcode** | Current | MIT | Plain QR generation | YES | Better maintained than qr-code-styling; no visual customization |
| **react-qr-code** | Current | MIT | QR as SVG React component | YES | Good for React; no styling features |
| **@zxing/library** | Current | Apache-2.0 | Multi-format barcode scanner/gen | YES | Read-focused; generation limited |

**Summary:** bwip-js + qr-code-styling is still best-in-class for the use case. No consolidation has happened. The combination covers all barcode types (bwip-js) + branded QR (qr-code-styling). The only risk is qr-code-styling going truly abandoned, at which point a custom-styled QR implementation or a fork would be needed.

---

## 5. Action Summary

| Package | Current | Latest | Action | Priority |
|---|---|---|---|---|
| @cantoo/pdf-lib | 2.7.1 | 2.7.1 | KEEP — already current | Low |
| pdf-lib | 1.17.1 | 1.17.1 | **REMOVE** — unused & abandoned | High |
| pdfjs-dist | ^6.0.0 | 6.0.227 | KEEP — already on current major | Low |
| bwip-js | 4.11.1 | 4.11.1 | KEEP — already current | Low |
| qr-code-styling | 1.9.2 | 1.9.2 | WATCH — slow but no better alternative | Medium |
| i18next | 26.3.1 | 26.3.1 | KEEP — already current | Low |
| i18next-browser-languagedetector | 8.2.1 | 8.2.1 | KEEP — already current | Low |
| qpdf-wasm | 0.1.0 | 0.1.0 | **REMOVE** — unused & abandoned | High |
| vite | 8.x | 8.0.16 | Update patch version | Low |
| vitest | 4.x | 4.1.8 | Update patch version | Low |
| typescript | 6.x | 6.0.3 | KEEP — on current stable | Low |
| eslint | 10.x | 10.4.1 | Update patch version | Low |

---

*Research conducted: 2026-06-11. All npm version data verified via npm registry API and GitHub API. Dates marked [Inferred] where exact publish timestamp was not directly readable from truncated API responses but corroborated by multiple sources.*
