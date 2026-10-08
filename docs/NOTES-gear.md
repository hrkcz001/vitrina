# Gear-button / app-menu close — diagnostic notes (TASK 1)

Status: RESOLVED. Diagnostics removed from api.js on 2026-10-08.

## Root cause (from Browser Console)
`[vitrina] gear click; panelBtn display= flex visibility= hidden` — the app-menu
anchor `#PanelUI-button` was hidden while the flyout was open. `PanelUI.show()`
with a hidden anchor opens the popup and tears it down instantly:
`popupshowing` → `popupshown` → `popuphidden`. Once the anchor was revealed:
`popupshowing` → `state=showing` → `popupshown` (stays open). Confirmed working.

Fix: anchor hidden with `visibility:hidden` (box survives); the gear sets
`:root[panelui-anchor="true"]` to reveal it, opens via `PanelUI.show()` in a
`setTimeout(0)`, and clears the attribute on `popuphidden`.

## Listener audit (right-menu area) — historical

| # | Target | Event | Phase | Handler | Effect |
|---|--------|-------|-------|---------|--------|
| 1 | doc | mousedown | capture | `onDocMouseDown` | clears `rightJustOpened` |
| 2 | `#PanelUI-button` | mousedown | capture | `onPanelBtnMouseDown` | opens right flyout on first press |
| 3 | `#PanelUI-button` | click | capture | `onPanelBtnClick` | suppresses native app menu |
| 4 | `#appMenu-popup` | popuphidden | bubble | `onPopupHidden` | clears anchor attr + `toggleRightFlyout(false)` |
| 5 | doc | click | capture | `onDocClick` | closes on outside click (guard-consumer) |
| 6 | doc | mousemove | bubble | `onDocMouseMove` | closes when cursor leaves |
| 7 | `#min-settings-btn` | click | target | gear handler | reveal anchor + `PanelUI.show()` |

