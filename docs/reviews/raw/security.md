# Security Review — PDFturbo
**Date**: 2026-06-11  
**Scope**: Exclusive — dependencies, XSS/injection surface, PWA/SW risks, privacy vs. claims, supply chain/CI, headers, license compliance, repo hygiene  
**Reviewer**: SECURITY agent (adversarial forge-style)

---

## npm audit output

```
# npm audit --omit=dev
found 0 vulnerabilities

# npm audit (all deps including devDependencies)
found 0 vulnerabilities
```

---

## Findings

### SEC-01 · P2 · Phantom/orphan dependency: `pdf-lib@1.17.1`
**Confidence**: Verified  
**Files**: `package.json:21`, `package-lock.json`

`pdf-lib@1.17.1` (the original, unmaintained upstream) is listed as a direct dependency in `package.json`, but **zero imports of `'pdf-lib'`** exist anywhere in `src/`, `tests/`, or `index.html`. All PDF manipulation imports use `@cantoo/pdf-lib` (lines 1784, 2685, 2774, 2917, 2993 in `pdfEditorApp.ts`).

`@cantoo/pdf-lib` is an independently-maintained fork; it has its own dependency tree (`crypto-js`, `color`, `pako`, `node-html-better-parser`, `@pdf-lib/standard-fonts`, etc.) and does **not** list `pdf-lib` as a dependency. The two packages coexist silently in the bundle.

**Exploitation/Failure scenario**: Two separate PDF parser/writer code paths are shipped to every user (~`pdf-lib@1.17.1` adds ~100KB+ to the bundle with no functionality gained). Any future security advisory for `pdf-lib@1.17.1` will appear in `npm audit` even though the code is unused. Confusion about which library is canonical can lead to future developers importing from the wrong package, diverging behavior.

**Fix**: Remove `"pdf-lib": "^1.17.1"` from `package.json` dependencies. Run `npm install` to update the lockfile. Verify bundle size drops accordingly.

---

### SEC-02 · P2 · `escapeValue: false` in i18next + innerHTML usage
**Confidence**: Verified  
**Files**: `src/utils/i18n.ts:70`, `src/core/pageThumbnailPanel.ts:166`

i18next is initialized with `interpolation: { escapeValue: false }`. This disables HTML entity escaping for **all** translation interpolations. Currently, `t()` output reaches `innerHTML` in exactly one place:

```typescript
// pageThumbnailPanel.ts:166
addBtn.innerHTML = `<span>+</span><span class="thumb-add-label">${t('thumbnail.addPages')}</span>`;
```

The `t('thumbnail.addPages')` key resolves to a **static, bundled translation string** (not user-supplied), so this specific instance is safe today.

**Risk surface**: The combination of `escapeValue: false` + `innerHTML` is a latent XSS pattern. If a future developer:
1. Adds a translation key that includes user-controlled data (e.g., a PDF title or filename interpolated into a translation string), **or**
2. Adds another `innerHTML` assignment using `t()` with user-facing dynamic content,

...the result would be a stored/reflected XSS with no escaping defense.

Additionally, the `file.name` passes through `t('toast.fileLoadFailed', { name: file.name })` (`pdfEditorApp.ts:1247`). This currently routes to `textContent` (safe), but the `escapeValue: false` setting means that if this were ever changed to an `innerHTML` insertion, malicious filenames (`<img src=x onerror=alert(1)>`) would execute.

**Fix**:
1. Change `pageThumbnailPanel.ts:166` to use `textContent` instead of `innerHTML`, building the `<span>` elements via `document.createElement` — eliminating the only current `innerHTML + t()` pattern.
2. Re-enable `escapeValue: true` in `i18n.ts:70`. This is the safe default for React/DOM-rendered apps; i18next docs only recommend disabling it when the rendering framework already escapes. Raw DOM manipulation does not.

---

### SEC-03 · P2 · `qpdf-wasm@0.1.0` in `package.json` — zero code usage, pre-release maturity signal
**Confidence**: Verified  
**Files**: `package.json:23`

`qpdf-wasm@0.1.0` is a direct dependency but **not imported anywhere** in `src/`, `tests/`, or `index.html`. A comprehensive grep across the entire repository found zero references to `qpdf`, `qpdfwasm`, or `qpdf-wasm` outside of `package.json` and `package-lock.json`.

The `0.x` version signals pre-release maturity (no stability guarantee). The package wraps `qpdf` (Apache-2.0) as a WASM binary. The ~2MB WASM binary **may** be included in the Vite bundle depending on the asset inliner's threshold (the `maximumFileSizeToCacheInBytes: 6MB` config would allow it into the SW precache).

**Exploitation/Failure scenario**: Bundle bloat (WASM binaries are large). Future `npm audit` advisories against an unused package. The `0.x` pre-release status also means API-breaking changes on any minor/patch update.

**Fix**: Remove `"qpdf-wasm": "^0.1.0"` from `package.json`. If PDF password protection was planned via qpdf, the current implementation already uses `@cantoo/pdf-lib`'s `encrypt()` method (lines 1605-1607 in `pdfEditorApp.ts`), making qpdf-wasm redundant.

---

### SEC-04 · P2 · `THIRD-PARTY-NOTICES.md` incomplete — 4 shipped packages missing, Apache-2.0 NOTICE gap
**Confidence**: Verified  
**Files**: `THIRD-PARTY-NOTICES.md`

The following packages are **shipped in the bundle** but **not listed** in `THIRD-PARTY-NOTICES.md`:

| Package | License | Shipped | Required attribution |
|---|---|---|---|
| `@cantoo/pdf-lib@2.7.1` | MIT | Yes — 5 dynamic imports in `pdfEditorApp.ts` | Copyright notice |
| `qr-code-styling@1.9.2` | MIT | Yes — imported in `codeGenerator.ts:2` | Copyright notice |
| `bwip-js@4.11.1` | MIT | Yes — imported in `codeGenerator.ts:1` | Copyright notice |
| `qpdf-wasm@0.1.0` | Apache-2.0 | Likely (installed dep, WASM may be bundled) | Copyright + NOTICE |

Additionally, `pdfjs-dist` (Apache-2.0) is listed but the NOTICE file says "Full license texts are available in each package's repository" — Apache-2.0 requires the copyright notice and NOTICE file content to accompany any distribution. The current listing omits the full copyright notice text.

The THIRD-PARTY-NOTICES.md also erroneously lists `pdf-lib@1.17.1` (the unused orphan dep, `SEC-01`), which misleads readers about what is actually shipped.

**Fix**: Add entries for `@cantoo/pdf-lib`, `qr-code-styling`, and `bwip-js`. Remove the `pdf-lib` entry (after fixing SEC-01). If `qpdf-wasm` is removed (per SEC-03), omit it; otherwise include it with its Apache-2.0 NOTICE. Consider using `license-checker` or `generate-license-file` in CI to auto-generate an accurate notices file.

---

### SEC-05 · P2 · `autoUpdate` SW strategy: silent mid-session takeover with no user notification
**Confidence**: Verified  
**Files**: `vite.config.ts:12`, `dist/sw.js` (confirmed `skipWaiting` + `clientsClaim`)

The Workbox `registerType: 'autoUpdate'` configuration generates a service worker that:
1. Installs and activates immediately (`skipWaiting`)
2. Claims all open clients immediately (`clientsClaim`)
3. Does this **silently** — no prompt, no toast, no reload warning

The built `sw.js` confirms both `skipWaiting` and `clientsClaim` are present.

The app registers the SW via `registerSW.js` without importing the `virtual:pwa-register` API — meaning `onNeedRefresh` (user-prompt path) is never wired up.

**Exploitation/Failure scenario**: A user mid-session (PDF loaded, unsaved annotations) will have their page silently reloaded by `clientsClaim` when a new deployment lands. While IndexedDB autosave runs every 800ms, the 800ms debounce window plus any mid-stroke/mid-annotation state means data loss is possible. More importantly, the *user has no warning* that their editing session will be interrupted.

For a tool processing potentially sensitive documents, a surprise reload is a UX liability that may cause distrust even without data loss.

**Fix**: Switch to `registerType: 'prompt'` and implement an `onNeedRefresh` handler that shows a dismissable toast: `"A new version is available — reload when ready"`. The autosave protects state; the prompt respects user agency. This is the recommended pattern for stateful PWA editors.

---

### SEC-06 · P3 · GitHub Actions not SHA-pinned
**Confidence**: Verified  
**Files**: `.github/workflows/deploy.yml:21-31,43`

All four GitHub Actions are pinned by **tag** (`@v3`, `@v4`), not by commit SHA:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
- uses: actions/upload-pages-artifact@v3
- uses: actions/deploy-pages@v4
```

**Exploitation/Failure scenario**: If any of these action repositories is compromised and the tag is force-pushed to a malicious commit, the next workflow run executes attacker-controlled code with `pages: write` and `id-token: write` permissions. For a personal/single-developer project this is P3 — the risk is real but the blast radius (GitHub Pages site defacement) is limited.

**Fix**: Pin each action to its current commit SHA. Use `--allow-update-to` via `dependabot` or `pin-github-action`:
```yaml
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
```
The GITHUB_TOKEN permissions are already minimal (`contents: read`, `pages: write`, `id-token: write`) — that part is correct.

---

### SEC-07 · P3 · No Dependabot / Renovate configuration
**Confidence**: Verified  
**Files**: `.github/` (no `dependabot.yml`)

There is no `.github/dependabot.yml` and no Renovate config. Dependency updates (including security patches) must be applied manually.

For a project with `^` ranges on all deps (accepting any minor/patch update), `npm ci` in CI always installs the lockfile-pinned versions. New security releases won't auto-update the lockfile without manual `npm update` runs.

**Fix**: Add `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      dev-deps:
        patterns: ['*']
        dependency-type: development
```

---

### SEC-08 · P3 · `style-src: 'unsafe-inline'` in meta-CSP — cannot be tightened on GitHub Pages
**Confidence**: Verified  
**Files**: `index.html:5`

The meta-CSP (`Content-Security-Policy` via `<meta http-equiv>`) includes `'unsafe-inline'` for `style-src`. This is required because `index.html` contains 59 occurrences of inline `style=` attributes (confirmed by grep). Vite also injects inline styles at runtime for some components.

**Note**: GitHub Pages does not support custom HTTP response headers, so a `Content-Security-Policy` header (which would allow nonces or hashes) is architecturally impossible without a CDN layer. The `<meta>` CSP is the best available option.

`'unsafe-inline'` for styles (not scripts) is a significantly lower risk than `'unsafe-inline'` for scripts. CSS injection cannot execute JavaScript in modern browsers without a script execution primitive. The `script-src` correctly uses `'self'` and `'wasm-unsafe-eval'` (not `'unsafe-eval'`), which is appropriate for the WASM PDF rendering stack.

**Exploitation scenario**: An XSS that manages to inject into a `style` attribute could achieve CSS-based exfiltration (e.g., `:visited` history sniffing, CSS selector-based data extraction) — but this requires a prior XSS vulnerability, and the script-src prevents script injection independently.

**Fix**: No actionable fix without a CDN/reverse proxy. Document the constraint. If a CDN is added later, migrate the CSP to a response header with nonce-based `style-src`.

---

### SEC-09 · P3 · `window.app` global exposes full application object
**Confidence**: Verified  
**Files**: `src/main.ts:13`

```typescript
window.app = new PDFEditorApp();
```

The entire application instance, including `_exportPassword`, `documentModel` (with raw PDF bytes), `elements`, and all internal state, is accessible from the browser console and any same-origin script.

**Exploitation scenario**: Any injected `<script>` (e.g., from a browser extension with page-script access, or a same-origin XSS) can call `window.app._exportPassword` to exfiltrate the in-memory export password, or `window.app.documentModel.sourcePdfs` to access the raw PDF bytes without needing to intercept a download.

For a purely client-side app this is a known tradeoff (useful for debugging), but it is worth noting for users who process sensitive documents.

**Fix**: In production builds, replace with a restricted public API or remove the global entirely. Use Vite's `define` to conditionally expose:
```typescript
if (import.meta.env.DEV) window.app = new PDFEditorApp();
else new PDFEditorApp();
```

---

### SEC-10 · P3 · Regex search: user-supplied pattern without complexity guard (browser ReDoS)
**Confidence**: Verified  
**Files**: `src/handlers/textSearchHandler.ts:58`

When the user enables regex mode in the find bar, the raw user-supplied string is compiled to `new RegExp(query, flags)` and executed against potentially long PDF text strings:

```typescript
pattern = useRegex ? new RegExp(query, flags) : ...
```

**Exploitation/Failure scenario**: A crafted catastrophic backtracking pattern (e.g., `(a+)+` tested against a long run of `a`s) will spin the main thread at 100% CPU, freezing the tab until the browser's script timeout kicks in (~5-30 seconds). This is a **browser-only** ReDoS — no server involved — but it degrades the UX severely.

The `try/catch` around `new RegExp()` only catches syntax errors, not runtime catastrophic backtracking.

**Fix**: Add a character-class/complexity guard before executing: limit regex length (e.g., `> 200 chars → reject`), or run the search in a Web Worker where a long-running script can be terminated without freezing the UI thread.

---

## What Is GOOD

- **No network calls**: `grep` across all of `src/` finds zero `fetch`, `XMLHttpRequest`, `sendBeacon`, or `WebSocket` calls. The pdf.js worker (`pdf-worker-shim.ts`) is bundled locally via Vite — no CDN fetch at runtime. The CSP `connect-src: 'self' blob:` correctly enforces this at the browser level. The privacy claim ("nothing uploaded") is fully backed by code.

- **npm audit: 0 vulnerabilities** (both production-only and full). pdfjs-dist version `6.0.227` is well past CVE-2024-4367 (the arbitrary-JS-in-PDF issue, fixed in `4.2.67`).

- **CSP is meaningful**: `script-src 'self' 'wasm-unsafe-eval'` (not `'unsafe-eval'`) is the correct setting for WASM-based PDF rendering. `object-src 'none'` eliminates the Flash/plugin vector. No `data:` in `script-src`.

- **innerHTML writes are clearing operations only** (5 of 7 occurrences are `= ''`). The one functional `innerHTML` write uses a fixed translation key, not user-controlled data.

- **Passwords not persisted**: `_exportPassword` is a runtime-only field, not included in `SavedState`. The IndexedDB autosave schema (`storage.ts`) confirms this.

- **test.pdf is innocuous**: No metadata fields (Author, Subject, Keywords) found via byte-level inspection. File is 1.2KB — clearly synthetic. No personal data.

- **Regex injection is escaped** in non-regex mode: `query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` correctly sanitizes before RegExp construction.

- **Privacy disclosure is accurate and complete**: `public/privacy.html` correctly documents IndexedDB storage, localStorage keys (`i18nextLng`, `pdfturbo_storage_notice`), names the "Reset Session" clear affordance, and states no server-side collection. The claims match the code.

- **GitHub Actions permissions are minimal**: `contents: read`, `pages: write`, `id-token: write` only — no repo secrets beyond what Pages deployment requires, no `secrets.*` references in the workflow.

- **No secrets in tracked files**: grep for `token`, `key`, `password`, `secret`, `credential` patterns in `src/` finds only legitimate UI/password-modal variable names — no hardcoded credentials.

- **`.playwright-mcp/` is gitignored**: Session logs (which could contain sensitive PDF content from browser tests) are excluded from the repo.

- **SW scope is correct**: `register('/pdfturbo/sw.js', { scope: '/pdfturbo/' })` matches the Vite `base: '/pdfturbo/'`. No scope mismatch.

---

## Summary Table

| ID | Severity | Title |
|---|---|---|
| SEC-01 | P2 | Orphan dep `pdf-lib@1.17.1` — never imported, bundled for nothing |
| SEC-02 | P2 | `escapeValue: false` + `innerHTML` — latent XSS pattern |
| SEC-03 | P2 | Orphan dep `qpdf-wasm@0.1.0` — never imported, pre-release 0.x |
| SEC-04 | P2 | `THIRD-PARTY-NOTICES.md` missing 4 shipped packages + Apache notice gap |
| SEC-05 | P2 | `autoUpdate` SW: silent mid-session client takeover, no user prompt |
| SEC-06 | P3 | GitHub Actions pinned by tag, not SHA |
| SEC-07 | P3 | No Dependabot/Renovate configuration |
| SEC-08 | P3 | `style-src: 'unsafe-inline'` — GitHub Pages architectural limit, no fix available |
| SEC-09 | P3 | `window.app` global exposes full app object including in-memory passwords |
| SEC-10 | P3 | User-supplied regex search has no complexity guard (browser-tab ReDoS) |

**P0**: 0  
**P1**: 0  
**P2**: 5 (SEC-01 through SEC-05)  
**P3**: 5 (SEC-06 through SEC-10)  
**Known/resolved**: GAP-1 (redaction rasterization) — confirmed RESOLVED per `docs/plans/full-audit-2026-06-07.plan.md`
