# Vitrina 1.1.3 — right-menu trio fix plan

Symptom (user, confirmed): gear click → the native app menu opens and
**instantly closes** (visible flicker). Right flyout still doesn't match the
left; uBlock badge still clipped.

Architecture: `extension/api.js` (privileged experiment), `extension/themes/ink.css`.
Right flyout `#min-right-flyout`, hamburger `#PanelUI-button`, native app menu
popup `#appMenu-popup` / `#PanelUI-popup`, our gear `#min-settings-btn`.

## TASK 1 — Prove which handler closes the app menu  [DONE]
Root cause found via console logs: `#PanelUI-button` (the app-menu anchor) was
hidden with `display:none`/`visibility:hidden` while the flyout was open, so
`PanelUI.show()` opened the popup and it was torn down instantly (`popuphidden`).
`PanelUI.show()` itself works (log showed `popupshowing` → `popupshown` once the
anchor was made visible).

## TASK 2 — Fix: defer the open one turn  [DONE — kept]
`PanelUI.show()` now runs inside `win.setTimeout(..., 0)` so the click that
triggered it settles first.

## TASK 3 — Fix: reveal the anchor for the popup  [DONE — verified]
`#PanelUI-button` is hidden with `visibility:hidden` (not `display:none`, so the
box survives). The gear sets `:root[panelui-anchor="true"]` → CSS reveals the
button → `PanelUI.show()` → on `popuphidden` the attribute is removed. Verified
working by the user.

## TASK 4 — Badge clipping  [FIXED — awaiting visual check]
Real cause (probe): a pinned extension is wrapped
(`toolbaritem > .unified-extensions-item-row-wrapper > toolbarbutton`); the badge
lives in the DEEPEST button, which ships with `overflow:hidden` and clips it. The
`> toolbaritem > toolbarbutton` child selector never matched the grandchild.
Fix: open `overflow` on the whole deck descendant chain (`#min-pinned-deck
toolbarbutton, toolbaritem, .unified-extensions-item-row-wrapper, .webextension-action`).
(Icon size was NOT the cause; the earlier 18→16 change was noise.)

## TASK 5 — Right menu vs left visual mismatch  [PARTIAL]
User: no default dividers (that was a two-button hover in the screenshot — not a
bug). Real diffs: (a) active/hover highlight differs; (b) deck right side seemed
darker.
Fix: added `outline:none` to the right flyout buttons + badge-stack/icon (the
left already had it; the native widgets carried a white focus outline). Cleared
background/border/shadow/outline on the deck's `.unified-extensions-item-row-wrapper`
and `.unified-extensions-item`. Verify visually; if the active highlight still
differs, compare the `:active` gradients next.

## TASK 6 — Cleanup & release
- Remove diagnostics + `docs/NOTES-gear.md` (or keep as history).
- Bump manifest → 1.1.3, build, commit, push, tag `v1.1.3-vitrina`, gh release.
- Update `docs/ANALYSIS.md` root-cause section with the ACTUAL mechanism.
- Update skill `vitrina` → `references/firefox-chrome-css-pitfalls.md`.

## Rules
- Order 1→2→(3)→4→5→6. Never edit while waiting for user feedback. Build after
  each task, hand off for a manual test. If behavior contradicts a step, stop and
  report rather than forcing the fix.
