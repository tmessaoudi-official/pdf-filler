# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (master) | Yes |

## Reporting a Vulnerability

**Please do not report security vulnerabilities in public GitHub issues.**

Use GitHub's private [security advisory](https://github.com/tmessaoudi-official/pdf-filler/security/advisories/new) to report vulnerabilities confidentially.

Include:
- A description of the vulnerability
- Steps to reproduce it
- Potential impact
- Any suggested fix (optional)

You can expect an acknowledgment within 48 hours and a resolution within 14 days for confirmed issues.

## Scope

This is a **client-side only** application — no server, no database, no user accounts. All PDF processing happens in your browser. No data is sent to any server except when loading CDN dependencies (pdf.js, pdf-lib).

Security concerns most relevant to this project:
- XSS via malicious PDF content
- Malicious PDF files causing unexpected behavior in pdf.js
- Privacy: PDFs are processed locally and never uploaded anywhere
