# Toolbar Consolidation Plan

## Decisions Log

- [2026-06-10 14:00] AGREED: Shapes group → "Draw ▾" flyout (Arrow/Rect/Circle/Freehand/Eraser/Redact)
- [2026-06-10 14:00] AGREED: Text + Edit Text → "Text ▾" split-button
- [2026-06-10 14:00] AGREED: Export → Download stays prominent, Preview + Watermark tucked behind it
- [2026-06-10 14:00] AGREED: Satellite controls (color, width, eyedropper) move INTO the Draw flyout panel
- [2026-06-10 14:00] AGREED: Language switcher (EN/FR/ع) → single 🌐 globe dropdown
- [2026-06-10 14:00] AGREED: Highlight + Comment → "Annotate ▾" flyout
- [2026-06-10 14:00] AGREED: Context-sensitive row 2 (show/hide based on active mode) — LAST phase
- [2026-06-10 14:00] AGREED: Flyout UX = click to open, auto-close on tool pick
- [2026-06-10 14:00] AGREED: Deliver Phase 1 only, validate in browser, then continue
- [2026-06-10 14:00] VERIFIED: All keyboard shortcuts call `setMode()` directly — fully decoupled from button DOM (pdfEditorApp.ts lines 499–525). Flyout is safe.

## Formal Plan

### Phase 1 — Draw ▾ flyout + satellite controls (CURRENT)

**Files:** `index.html`, `js/uiController.ts`, `js/pdfEditorApp.ts`, CSS (inline or new `.flyout` rules)

**Steps:**
1. Replace 6 shape buttons + color + eyedropper in `tbg-shapes` with single `#drawBtn` + `#drawFlyout` panel
2. Flyout panel contains: Arrow/Rect/Circle/Freehand/Eraser/Redact as icon buttons + color input + eyedropper + shape width
3. `#drawBtn` face shows the currently-active shape tool icon
4. Click `#drawBtn` → toggle flyout; pick a tool → activate mode + close flyout; click away → close flyout
5. Keyboard shortcuts unchanged (call `setMode()` directly — no DOM dependency)
6. `#modeBadge` stays in sync via existing `updateModeButtons()`
7. Update `UIRefs` to reference new IDs; update `enableUI()`, `updateModeButtons()`, `pdfEditorApp.ts` click handlers
8. Verify in browser with Chrome automation

**Acceptance criteria:**
- Single "Draw" button visible in toolbar (not 6+)
- Clicking it opens flyout with all 6 tools + satellite controls
- Picking a tool: activates mode, closes flyout, updates button face icon
- A/R/C/D/E keyboard shortcuts still work without opening flyout
- All satellite controls (color, eyedropper, line width) functional inside flyout
- Mobile touch targets ≥ 40px

### Phase 2 — Annotate ▾ (Highlight + Comment)

Reuse flyout CSS from Phase 1. Same pattern: 2 tools, auto-close on pick.

### Phase 3 — Text ▾ split-button (Add Text + Edit Text) ✓ COMPLETE

Split-button: left half = active mode (Add Text or Edit Text), right half = ▾ opens chooser.
Browser verified: flyout opens/closes, outside-click dismisses, `closest('[aria-pressed]')` handles span-child buttons.

### Phase 4 — Export ▾ (Download prominent + Preview + Watermark) ✓ COMPLETE

Keep Download as primary CTA button. Preview + Watermark under a small ⬇▾ chevron.
Split-button pattern reused from Phase 3; exportSplitWrap/exportChevronBtn in UIRefs.

### Phase 5 — Language 🌐 globe dropdown ✓ COMPLETE

3 lang buttons → 1 globe icon + flyout. Globe face updates to "🌐 EN/FR/ع" via updateLangButtons() hook in i18n.ts. Toggle handler in main.ts. Outside-click closes.

### Phase 6 — Context-sensitive row 2 ✓ COMPLETE

#formattingGroup hides via `.row2-hidden` class when mode='select'; shown by updateFormattingToolbar() when element is selected.
**Note:** Easy to revert — remove row2-hidden CSS rule + two class-toggle lines in uiController.ts.

## Verification Note

Unit test suite (vitest 292 tests) covers PDF logic only — it cannot verify flyout open/close, tool activation, shortcut behavior, or aria-pressed sync. UI verification requires Chrome automation (`mcp__claude-in-chrome__*`) or manual browser testing for each phase.
