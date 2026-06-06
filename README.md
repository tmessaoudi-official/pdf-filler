# PDFturbo

Edit, annotate, sign and fill PDFs entirely in your browser — nothing uploaded, nothing tracked.

## How to run

**Option 1 — npm:**
```bash
npm start
# opens at http://localhost:3000
```

**Option 2 — Python:**
```bash
python3 -m http.server 8080
# opens at http://localhost:8080
```

> **Do not open `index.html` by double-clicking** — browsers block ES module
> imports from `file://` URLs. Always serve via HTTP.

## Deploy to GitHub Pages (free, HTTPS, always-on)

1. **Create a GitHub repo** at github.com → New repository (e.g. `pdf-fill-sign`)
2. **Add the remote and push:**
   ```bash
   git remote add github https://github.com/YOUR_USERNAME/pdf-fill-sign.git
   git push -u github master
   ```
3. **Enable Pages:** repo Settings → Pages → Source: `Deploy from a branch` → Branch: `master` → folder: `/ (root)` → Save
4. Your app is live at `https://YOUR_USERNAME.github.io/pdf-fill-sign/`

> **Install on Android:** visit the URL in Chrome → three-dot menu → "Add to Home screen"
> **Install on iOS:** visit in Safari → Share → "Add to Home Screen"

## Features

- Upload any PDF and fill/sign it on mobile or desktop
- Add text, draw shapes (arrow, rect, circle, freehand), place signatures
- Pinch-to-zoom on mobile; Ctrl+Wheel on desktop
- Navigate multi-page PDFs
- Download the filled PDF with vector shapes and text preserved
- PWA: installable, works offline for the app shell
