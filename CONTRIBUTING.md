# Contributing to PDF Fill & Sign

Thank you for taking the time to contribute!

## Before You Start

- **Open an issue first** for significant changes (new features, architectural decisions). This prevents wasted effort if the direction doesn't align.
- For small bug fixes or typo corrections, a PR is welcome directly.

## Development Setup

```bash
git clone https://github.com/tmessaoudi-official/pdf-filler.git
cd pdf-filler
python3 -m http.server 8080
# Open http://localhost:8080
```

No build step — pure HTML/CSS/JS with ES modules.

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes
4. Test manually: upload a PDF, try every tool (text, signature, shapes, zoom, download)
5. Test on a mobile viewport (Chrome DevTools device emulation)
6. Commit with a clear message: `feat:`, `fix:`, `chore:`, `docs:` prefix
7. Open a pull request against `master`

## Code Style

- Vanilla JS — no frameworks, no bundlers
- ES modules (`import`/`export`) throughout
- Module version suffix (`?v=N`) must be bumped when any JS file changes
- No external dependencies beyond pdf.js (CDN) and pdf-lib (CDN dynamic import)
- Keep each class in its own file (`js/elementName.js`)

## What Makes a Good PR

- One concern per PR (don't mix unrelated fixes)
- Screenshots or a short screen recording for UI changes
- Mobile tested (Chrome DevTools ≥ 390px viewport)
- No console errors introduced

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).
Include your browser, device, and a PDF that reproduces the issue if possible.
