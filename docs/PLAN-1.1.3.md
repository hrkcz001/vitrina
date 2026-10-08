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

## TASK 4 — Badge clipping  [BUILT — awaiting visual check]
`#min-pinned-deck .toolbarbutton-icon, ...badge-stack`: 18px → 16px (native
metrics). 17px only if 16 looks too small and still clips.

## TASK 5 — Right menu vs left visual mismatch  [BLOCKED on user input]
Needs a user screenshot/description of the exact diffing element.

## TASK 6 — Cleanup & release
- Remove diagnostics + `docs/NOTES-gear.md` (or keep as history).
- Bump manifest → 1.1.3, build, commit, push, tag `v1.1.3-vitrina`, gh release.
- Update `docs/ANALYSIS.md` root-cause section with the ACTUAL mechanism.
- Update skill `vitrina` → `references/firefox-chrome-css-pitfalls.md`.

## Rules
- Order 1→2→(3)→4→5→6. Never edit while waiting for user feedback. Build after
  each task, hand off for a manual test. If behavior contradicts a step, stop and
  report rather than forcing the fix.
