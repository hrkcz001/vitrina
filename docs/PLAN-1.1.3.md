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

## TASK 5 — Right menu vs left visual mismatch  [FIXED — awaiting visual check]
User: no default dividers (two-button hover in the screenshot — not a bug).
Real cause (frame probe): the right menu's icons carried the native focus
outline — `outline: 2.4px rgb(255,255,255)` on
`#firefox-view-button .toolbarbutton-icon` and `#unified-extensions-button
.toolbarbutton-icon`, while the left icons were `0px`. Structural reason: the
left buttons hold their icon inside `.toolbarbutton-badge-stack` (so the native
`.toolbarbutton-1 > .toolbarbutton-icon` rule misses it), whereas firefox-view /
unified-extensions have the icon as a DIRECT child and get the native
`outline: var(--toolbarbutton-outline)`.
Fix: override the SOURCE VARIABLES on the flyout containers
(`--toolbarbutton-outline: none`, hover/active/selected outline colors
transparent, `--focus-outline: none`) — a specificity fight with the native rule
is fragile; variable override is reliable. Plus `outline:none` on all descendants
and `::-moz-focus-inner`.

## TASK 6 — Cleanup & release  [DONE through 1.1.5]
Diagnostics removed; version now 1.1.5; releases v1.1.3/1.1.4/1.1.5 published.
`docs/NOTES-gear.md` kept as history. Skill `references/firefox-chrome-css-pitfalls.md`
updated (§2c popuphidden, §5 badge wrapper, §6 anchor visibility, §7 async show).

## Rules
- Order 1→2→(3)→4→5→6. Never edit while waiting for user feedback. Build after
  each task, hand off for a manual test. If behavior contradicts a step, stop and
  report rather than forcing the fix.
