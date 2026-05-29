# PDF Fill & Sign

Add text and draw signatures on any PDF, then download the filled copy.

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

## Features

- Upload any PDF
- Add text fields at any position on any page
- Draw and place a handwritten signature
- Navigate multi-page PDFs
- Download the filled PDF at the correct original page size
