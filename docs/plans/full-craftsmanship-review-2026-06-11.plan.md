# Full Craftsmanship Review Plan — 2026-06-11

## Decisions Log
- [2026-06-11 ~11:00] AGREED: Task = Large, proceed fully autonomously (`_AUTONOMOUS_3C=1`)
- [2026-06-11 ~11:00] AGREED: Review mode = forge-inspired hybrid — 5 parallel exclusive-ownership agents + synthesis, all craftsmanship dimensions (not just architecture)
- [2026-06-11 ~11:00] AGREED: Claude config = design AND write directly this session (greenfield — no `.claude/` exists)
- [2026-06-11 ~11:00] AGREED: Report = file in repo (`docs/reviews/`) + executive summary in chat

## Formal Plan

### Agents (exclusive ownership, ≤5 concurrent)
| Agent | Owns | Excluded |
|---|---|---|
| ARCH | Structural design of `src/` — module boundaries, `pdfEditorApp.ts` god object, coupling, patterns, state/command design | Line-level bugs (QUALITY), tests (TEST-BUILD) |
| QUALITY | Line-level code quality in `src/` — error handling, dead code, leaks, types, async, DOM | Structure (ARCH), security (SECURITY) |
| TEST-BUILD | `tests/`, vitest/vite/tsconfig/eslint configs, `package.json` scripts, `.github/workflows/` | Doc content (DOCS) |
| DOCS | All `.md` files, `.github` templates, `public/*.html` legal pages, `locales/*.json`, `docs/plans` + `docs/superpowers` staleness — bidirectional docs↔code inventory | Code itself |
| SECURITY | Dependencies (incl. pdf-lib duplication), XSS surface, PWA/SW, IndexedDB privacy, license compliance, repo hygiene | General quality (QUALITY) |

### Pipeline
1. Agents write raw findings to `docs/reviews/raw/<agent>.md` (compaction-safe), return short summaries
2. Synthesis agent dedupes/prioritizes → `docs/reviews/2026-06-11-full-craftsmanship-review.md` (P0–P3, evidence, [KNOWN] tags for prior-audit overlaps)
3. Claude config written: `CLAUDE.md` + `.claude/settings.json` (+ hooks if justified by findings)
4. Phase 6/6C sweep, executive summary in chat

### Acceptance criteria
- Every file in the repo owned by exactly one agent; no dimension unowned
- Every finding has file:line evidence and severity
- Prior-audit overlaps tagged [KNOWN], not re-reported as new
- Config validates (JSON parses, references only real commands/paths)
