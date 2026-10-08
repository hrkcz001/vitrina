# Vitrina — Architecture Analysis & Refactor Plan

## What this is

A Firefox Developer Edition UI overhaul shipped as a **WebExtension Experiment**
(MV2, id `vitrina@local`). The extension injects chrome-level CSS and
rearranges native toolbar widgets to create a Min-browser-like single-bar UI
with glass aesthetics and dynamic per-site accent colors.

## Current architecture

| File | Role |
|---|---|
| `manifest.json` | MV2 + `experiment_apis.vitrina` registration, content script, popup |
| `schema.json` | Experiment API schema: `init`, `setTheme`, `setTabColor`, `setMenuOptions` |
| `api.js` | Privileged parent-process code: registers `chrome://vitrina/content/` chrome mapping to `themes/`, injects USER_SHEET per window, creates all UI widgets, moves native buttons, manages menus/tabs/accent color |
| `background.js` | Thin bridge: storage <-> experiment API, message router (THEME_COLOR / SWITCH_THEME / SET_MENU_OPTIONS) |
| `content-script.js` | Reads `<meta name="theme-color">` from every page, reports changes via runtime messages |
| `popup/popup.{html,js}` | Theme picker (2 hardcoded buttons) + 2 checkboxes (always-show left/right menus) |
| `themes/vitrina.css` | 1252 lines, main theme (identical copy deployed as `profile/chrome/userChrome.css`) |
| `themes/gloss.css` | 450 lines, secondary B/W theme |

### Deployment
`vitrina.xpi` is installed in the profile (`extensions/vitrina@local.xpi`),
`xpinstall.signatures.required=false` set in user.js. After every code edit the
xpi must be repacked manually. `userChrome.css` is a stale duplicate of
vitrina.css (legacy stylesheet pref is NOT enabled in user.js, so it is inert —
can be deleted).

### Runtime behavior (api.js)
- `start()` registers chrome handle, hooks all windows + observes new ones.
- Per window: `ensureWidgets` (CustomizableUI placement), `setupMenus`
  (creates `#min-control-box` / `#min-nav-flyout` / `#min-right-flyout` /
  `#min-pinned-deck`, moves native buttons: back/forward/reload/devtools ->
  left flyout, firefox-view/unified-extensions -> right flyout, all
  `-browser-action` widgets -> pinned deck), loads theme sheet via
  `windowUtils.loadSheetUsingURIString`.
- Menus: LMB toggle, click-outside close, mousemove far-away close (hardcoded
  `y > 115`, `±110px/40px` thresholds), app-menu popuphidden close.
- Accent color: content script reports meta theme-color -> stored per tab ->
  `--site-accent` CSS var on :root; fallback to hand-picked PALETTE by domain,
  then hash-based HSL.
- Tab click on already-selected tab focuses URL bar (Min behavior).

## Bugs found (candidates, to confirm with user)

1. **gloss + widget injection mismatch (likely visible breakage).** `setupMenus`
   unconditionally creates the min-* widgets and moves native buttons into them
   regardless of theme, but `gloss.css` was written for the old layout:
   it never styles `#min-control-box`, `#min-nav-flyout`, `#min-right-flyout`,
   `#min-pinned-deck`, and it positions `#firefox-view-button` absolutely at
   `right: btn*4` — yet api.js moves firefox-view into `#min-right-flyout`.
   Also bw's hide-list `#nav-bar-customization-target > :not(...)` no longer
   matches moved buttons. Switching to gloss very likely produces a broken
   right side / floating buttons.
2. **`movedPinned` duplicate accumulation.** `updatePinnedExtensions` pushes to
   `movedPinned` on every MutationObserver firing for elements it already moved
   (guard checks `topEl.parentNode === target`, but re-fires for children of
   moved top elements can re-resolve). Duplicated restore entries on cleanup.
   Needs a moved-set guard.
3. **Theme registry duplicated 3x** (api.js THEMES, background.js DEFAULT_THEME,
   popup.js hardcoded ids/labels) — no single source of truth; adding a theme
   touches 4+ files including CSS.
4. **Hardcoded geometry duplicated between JS and CSS**: menu widths (40/124/
   136/192px), flyout widths (112px, 84px), mouse-leave thresholds (115px, 110,
   40), pinned button width 28px. If a theme changes `--bar-height` or menu
   widths, JS logic goes out of sync (mousemove close zone, deck sizing).
5. **`ensureWidgets` vs moved widgets race**: it calls `addWidgetToArea` for
   widgets that `setupMenus` later relocates. On customization changes or new
   windows CustomizableUI may pull buttons back out of the flyouts mid-session.
6. **`flyout-open` class leak**: `toggleRightFlyout` adds `flyout-open` to
   `#PanelUI-button`; cleanup never removes the class.
7. **Popup not theme-aware**: static HTML with 2 hardcoded theme buttons and
   inline Russian strings — cannot list themes dynamically.
8. **Comments in Russian inside project files** — violates project language
   convention (English), needs pass over api.js/css/popup.
9. **No build script**: manual xpi repack; startupcache invalidation exists in
   shutdown, good, but no pack/install/verify loop.
10. **Global stop-button selectors** (`#stop-button:not([displaystop])`) inside
    theme CSS are fine while sheet-scoped, but brittle if themes share base CSS
    later — keep scoped when splitting.

## Refactor plan

### Phase 0 — hygiene
- Delete stale `profile/chrome/userChrome.css` (+ .bak) or stop syncing; single
  source of truth = extension themes.
- Add `build.sh` (or npm script): zip extension -> xpi, copy to profile
  extensions dir, print restart note.
- Translate all comments to English.

### Phase 1 — bug fixes (no architecture change)
- Fix movedPinned guard (Set of moved elements).
- Fix flyout-open class cleanup.
- Make gloss at least neutralize the injected widgets (Phase 2 solves it
  properly via layout/skin split).
- De-duplicate magic numbers: JS reads geometry from CSS custom properties via
  `getComputedStyle` where needed (mousemove thresholds derived from actual
  rects + vars instead of constants).

### Phase 2 — theme system (the "maximum" goal)
Structure so styles and logic never need decoupling later:

```
themes/
  _base.css          # structural rules shared by ALL themes: layout, positioning,
                     # widget injection targets (#min-* ids), menu open/close mechanics.
                     # Consumes ONLY var(--mg-*) tokens; contains no colors.
  <theme-id>/
    theme.css        # defines all --mg-* tokens + skin rules (colors, gradients,
                     # radii, shadows, blurs). This is "one style file per theme".
    theme.json       # optional config: {
                     #   "name", "description",
                     #   "settings": [  # rendered by our extension UI later
                     #     {"key": "accentSource", "label": "...", "type": "enum",
                     #      "values": [...], "default": ..., "cssVar": "--mg-accent-src"}
                     #   ]
                     # }
```

- Token contract in `_base.css` docs: dimensions (`--mg-bar-height`,
  `--mg-left-menu-width-open/closed`, `--mg-right-menu-width-open/closed`,
  `--mg-flyout-btn-width`), colors (`--mg-accent`, `--mg-surface`,
  `--mg-panel-bg`, `--mg-hover`, ...), effects (`--mg-blur`, `--mg-radius-*`).
- api.js changes:
  - Enumerate `themes/` dir at startup (chrome registration already serves the
    folder) instead of hardcoded THEMES map; discover theme.json presence.
  - Read geometry constants from computed CSS vars (single source = theme css).
  - Apply settings: write user-adjusted values as inline `--mg-*` overrides on
    :root; persist in storage.local.
  - Expose `listThemes` (+ settings schemas) through the experiment API so
    background/popup can render dynamically.
- popup.js: render theme list + per-theme settings controls from
  `theme.json` schemas (built now as scaffolding; UI polish later).
- Keep `--site-accent` mechanism: _base.css maps `--mg-accent` from
  `--site-accent` unless theme.json setting overrides the source.
- gloss becomes a proper theme folder; its deliberate layout deviations
  (e.g. no pinned deck) expressed via tokens + theme.json option flags
  (`"features": {"leftFlyout": false}`) that api.js reads to skip widget moves.

### Phase 3 — later (explicitly deferred)
- Settings UI in extension options page (full theme.json-driven).
- Per-theme menu behaviors, transition tuning.

## Key constraint to respect
MV2 experiment API only — no MV3 (experiments require `experiment_apis`).
`strict_min_version: 140`. Sheet injection must remain per-window USER_SHEET
(nsIStyleSheetService leaks into content).

## Platform support (hard requirement — not a preference)
Vitrina runs ONLY on Firefox Developer Edition or Nightly (and ESR with
experiment prefs enabled by policy). It does NOT run on regular/release
Firefox, and there is no install trick that changes this:
- `experiment_apis` requires `extensions.experiments.enabled = true`, which is
  locked off in release builds.
- An experiment extension can never be signed by Mozilla, so it must load as an
  unsigned package; `xpinstall.signatures.required = false` is honored only in
  DE/Nightly/ESR, ignored on release.
Therefore the normal `about:addons` / "Install Add-on From File" flow does not
apply; the only permanent install is dropping the xpi into
`<profile>/extensions/` (what the scoop installer and `build.ps1 -Install` do).
`about:debugging` temporary install works but is lost on restart.
