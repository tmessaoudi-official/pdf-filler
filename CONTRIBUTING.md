# Contributing to PDF Fill & Sign

Thank you for contributing!

## Before You Start

- **Open an issue first** for significant changes (new features, architectural decisions).
- For small bug fixes or typo corrections, a PR is welcome directly.

## Development Setup

```bash
git clone https://github.com/tmessaoudi-official/pdf-filler.git
cd pdf-filler
npm install
npm run dev
# Open http://localhost:5173/pdf-filler/
```

**Requirements:** Node.js 20+ and npm.

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build locally
```

## Quality Checks

All of these must pass before merging:

```bash
npm run type-check   # TypeScript type checking (tsc --noEmit)
npm run lint         # ESLint
npm run test         # Vitest unit + integration tests
```

These run automatically in CI (GitHub Actions) on every push to `master`.

## Tech Stack

- **TypeScript 5** — all source in `js/`
- **Vite 5** — bundler and dev server; `vite.config.ts` controls PWA, base path, build
- **pdfjs-dist** — PDF rendering (npm package, not CDN)
- **pdf-lib** — PDF generation for export (dynamic import at export time)
- **Vitest** — unit tests in `tests/`
- **VitePWA** — service worker + manifest generation

## Making Changes

1. Fork and create a feature branch: `git checkout -b fix/issue-description`
2. Write tests first for any bug fix or behaviour change (`tests/*.test.ts`)
3. Implement the fix
4. Run `npm run type-check && npm run lint && npm run test`
5. Test manually: upload a PDF, try every tool, zoom in/out, download
6. Test on a mobile viewport (Chrome DevTools device emulation ≥ 390px)
7. Commit with conventional prefix: `fix:`, `feat:`, `chore:`, `docs:`
8. Open a PR against `master`

## Project Structure

```
js/               TypeScript source modules (one class per file)
tests/            Vitest tests
docs/             Plans and reference docs
index.html        Single-page application entry point
vite.config.ts    Build config (base: '/pdf-filler/', PWA, manifest)
.github/          CI workflow (build → test → deploy to GitHub Pages)
```

## Reporting Bugs

Open a GitHub issue. Include your browser, device, and if possible a PDF that reproduces the issue.
