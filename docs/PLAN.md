# Vitrina — Detailed Execution Plan

Goal: take the current state (themes renamed to ink/gloss, repo vitrina,
scoop manifest vitrina.json, releases v1.1.0-vitrina) to a clean, theme-system
architecture that can be implemented by a weaker model step by step.
Every task below is self-contained; do them in order. After each task: run
`./build.sh`, restart Firefox Dev, and verify the UI visually.

Conventions:
- All code, comments, docs: English.
- Reports / notes for the user: Russian (do not leave Russian strings in code).
- Git commits: no sign-off, no AI trailers. Push to `origin main`.
- Manifest theme ids: `ink`, `gloss` (stock/contrast remain skeletons).
- Never use `nsIStyleSheetService`; always per-window `windowUtils.USER_SHEET`.
- Do NOT touch `profile/chrome/userChrome.css` — stale, to be deleted in P0.3.

---

## PHASE 0 — Hygiene (one-time)

### P0.1 [DONE] Delete stale profile userChrome
Path: `C:/Users/hrkcz001/scoop/persist/firefox-developer/profile/chrome/userChrome.css`
Action: delete `userChrome.css` and `userChrome.css.bak`.
Rationale: it is a byte-identical duplicate of the old ink theme; legacy
stylesheet pref is off so it is inert, but it confuses debugging.
Verify: file absent; extension still renders after Firefox restart.

### P0.2 [DONE] Scoop manifest: fix autoupdate URL template
File: `scoop/buckets/personal/bucket/vitrina.json`
Bug: autoupdate url uses `v$version-vitrina` (wrong order for `checkver: github`).
Fix: release tags are `vX.Y.Z-vitrina`; keep `checkver.github` pointing at the
repo, and set:
```json
"autoupdate": { "url": "https://github.com/hrkcz001/vitrina/releases/download/v$version-vitrina/vitrina.xpi" }
```
This already matches current tags. Just double-check `checkver` regex works with
`sed`-style `$version`. No code change needed; verify with `scoop checkver vitrina`.

### P0.3 [DONE] Translate all comments to English
Files with Russian comments: `extension/api.js` (29 lines), `background.js` (1),
`content-script.js` (3), `popup/popup.html` (5), `themes/gloss.css` (41),
`themes/ink.css` (66).
Action: translate comments and inline Russian UI strings to English in code
(popup labels, tooltips like "Панель управления (ЛКМ)", "Настройки").
Popup text may stay Russian ONLY as `label` strings — but for consistency
switch popup strings to English too; add a `ru.json` later only if i18n is built.
Commit: `chore: translate remaining Russian comments/strings to English`.

### P0.4 Remove leftover empty dir `~/,dev/min-firefox-de-ui-ext`
Action: `rmdir` (or after next reboot). Not blocking anything.

---

## PHASE 1 — Bug fixes (no architecture change)

### P1.1 [DONE] Fix movedPinned duplicate accumulation (api.js)
Problem: `updatePinnedExtensions` pushes to `movedPinned` on every observer
fire for elements already in `pinnedDeck`, duplicating restore entries.
Fix: track moved elements in a `Set` (or check `movedPinned.some(e => e.el === topEl)`)
before appending. Only restore once per element.
Files: `extension/api.js`, function `updatePinnedExtensions`.
Verify: switch between 1 and 3+ pinned extensions several times; disable
extension -> all native buttons restored once, none duplicated.

### P1.2 [DONE] Fix flyout-open class leak (api.js)
Problem: `toggleRightFlyout` adds `flyout-open` to `#PanelUI-button`; cleanup
never removes it.
Fix: in the `cleanup` object returned by `setupMenus`, add
`panelBtn?.classList.remove("flyout-open")`.
Verify: uninstall/reload extension; `#PanelUI-button` has no stale classes.

### P1.3 [DONE] De-duplicate JS/CSS geometry constants
Current: hardcoded `y > 115`, `x > leftRect.right + 110`, `x < leftRect.left - 40`,
pinned button width 28px, flyout widths 112px/84px.
Plan:
  a. Introduce CSS custom properties in `themes/ink.css` (and later `_base.css`):
     `--mg-close-threshold-y: 115px`, `--mg-close-margin-x: 110px`,
     `--mg-close-margin-x-near: 40px`, `--mg-flyout-btn-width: 28px`.
  b. In api.js, replace numeric literals with `parseFloat(getComputedStyle(
     win.document.documentElement).getPropertyValue("--mg-close-threshold-y"))`
     etc., with sane fallbacks (keep current numbers as defaults).
  c. For the pinned deck sizing, read the actual button width from the first
     moved element (`getBoundingClientRect().width`) instead of 28.
Files: `extension/api.js`, `themes/ink.css` (add vars).
Verify: change `--mg-close-threshold-y` in CSS to 60 -> menu closes sooner on
mouse leave; no regressions.

### P1.4 [DONE] ensureWidgets vs moved widgets race (api.js)
Problem: `ensureWidgets` calls `addWidgetToArea(AREA_NAVBAR)` for buttons that
`setupMenus` later relocates into flyouts. CustomizableUI can pull them back.
Fix:
  - Keep `ensureWidgets` (needed so buttons exist at all), but after moving
    them into the flyout, remove the now-empty placement with
    `cui.removeWidgetFromArea(id)`? NO — that hides them everywhere.
  - Better: leave placement in AREA_NAVBAR and instead mark moved buttons with
    attribute `data-vitrina-moved="1"`; in the theme CSS add
    `#nav-bar toolbarbutton[data-vitrina-moved] { display: none }` fallback for
    the brief window before move. The race is cosmetic; simplest safe fix is
    to run `setupMenus` synchronously right after `ensureWidgets` and to
    re-run `ensureWidgets` lazily via observer only for genuinely new widgets.
  - Practical fix: in `ensureWidgets`, skip ids that are already inside a
    `#min-nav-flyout` / `#min-right-flyout` / `#min-pinned-deck`.
Files: `extension/api.js` `ensureWidgets`.
Verify: open Customize mode, close it; buttons stay in flyouts, no duplicates.

### P1.5 [DONE] Gloss theme: stop breaking injected widgets
Short-term (before Phase 2): add a small compat block to `themes/gloss.css`
that styles `#min-control-box`, `#min-nav-flyout`, `#min-right-flyout`,
`#min-pinned-deck` in monochrome, mirroring the ink structure but with
black/white tokens. This unbreaks gloss immediately; Phase 2 replaces it
properly with `_base.css` + `themes/gloss/theme.css`.
Files: `themes/gloss.css`.
Verify: switch to gloss; left/right menus open, pinned extensions visible.

### P1.6 [DONE] Content-script: also report on navigation without head mutation
Edge case: some SPAs update `meta[name=theme-color]` via attribute change on
existing node — already covered by MutationObserver attributes. But if the
`<head>` is re-created (rare), observer dies. Add a `documentElement`
`childList` observer as a safety net that re-attaches to the new head.
Files: `extension/content-script.js`.
Verify: sites like github.com switch accent after navigation within SPA.

---

## PHASE 2 — Theme system (the "maximum" goal)

Directory layout (already partly in place):

```
extension/themes/
  _base.css              # structural, theme-agnostic rules
  ink/
    theme.css            # = current ink.css, tokenized
    theme.json           # optional settings schema
  gloss/
    theme.css
    theme.json
  stock/theme.css        # skeleton exists
  contrast/theme.css     # skeleton exists
```

### P2.1 Create `_base.css` (structural layer)
Extract from `themes/ink.css` ALL rules that are NOT about color/shadow/blur:
  - `#navigator-toolbox` positioning/borderless (keep, but background comes
    from tokens)
  - `#nav-bar` absolute overlay + pointer-events none
  - hide-list of default toolbar items
  - `#min-control-box` / `#min-nav-flyout` / `#min-right-flyout` /
    `#min-pinned-deck` layout (position, flex, sizes driven by tokens)
  - `#TabsToolbar` padding rules driven by `--left-menu-width` / `--tabs-right-padding`
  - urlbar collapse/expand mechanics
  - tab island geometry (positioning, margins) — visual skin stays in theme
  - bookmarks toolbar wrap mechanics
Everything references tokens: `--mg-bar-height`, `--mg-btn-width`,
`--mg-flyout-btn-width`, `--mg-left-menu-width`, `--mg-right-menu-width`,
`--mg-close-threshold-y`, `--mg-close-margin-x`, `--mg-accent`,
`--mg-surface-bg`, `--mg-panel-bg`, `--mg-panel-border`, `--mg-hover-bg`,
`--mg-radius-*`, `--mg-blur`, etc.
Convention: `_base.css` contains NO hex colors, only `var(--mg-*, <fallback>)`.
Fallbacks are neutral (transparent / inherit).

### P2.2 Token contract document
Create `docs/TOKENS.md` listing every `--mg-*` variable, its default, where
consumed, and which theme.json setting (if any) can override it. This is the
single source of truth for theme authors.

### P2.3 Convert ink to `themes/ink/theme.css`
- Move `themes/ink.css` content into `themes/ink/theme.css`.
- Replace inline colors with `--mg-*` token definitions at the top.
- Keep identical visual output (regression-check against current screenshot).
- Keep `--site-accent` integration: `--mg-accent: var(--site-accent, #1c1c22)`.

### P2.4 Convert gloss to `themes/gloss/theme.css`
Same tokenization. Structural layout deviations of gloss (e.g. it used to
position firefox-view at `btn*4`, urlbar expands on hover instead of focus)
are expressed via:
  - overriding token values, and
  - `themes/gloss/theme.json` feature flags consumed by api.js:
```json
{ "name": "Gloss",
  "features": { "pinnedDeck": true, "urlbarExpandOnHover": true,
                "useSiteAccent": false } }
```

### P2.5 theme.json schema + api.js support
`theme.json` schema v1:
```json
{
  "name": "Ink",
  "description": "...",
  "features": { "pinnedDeck": true, "urlbarExpandOnHover": false,
                "useSiteAccent": true },
  "settings": [
    { "key": "accentSource", "label": "Accent color source",
      "type": "enum", "values": ["site", "palette", "custom"],
      "default": "site", "cssVar": "--mg-accent-src" },
    { "key": "blur", "label": "Panel blur (px)", "type": "range",
      "min": 0, "max": 32, "default": 20, "cssVar": "--mg-blur" }
  ]
}
```
api.js changes:
  - `listThemes()`: enumerate `themes/*/theme.json` + `themes/_base.css`
    presence, return `[{id, name, description, features, settings}]`.
    Implementation: chrome-registered `chrome://vitrina/content/` already maps
    to `themes/`; use `ChromeUtils.import`? No — simpler: keep a small static
    list in api.js (ids + filenames) but move ALL metadata to theme.json and
    fetch it via `Services.io` reading the file (or `fetch(resource://...)`).
    Choose: fetch via `Cu.readUTF8URI` on `chrome://vitrina/content/<id>/theme.json`;
    fall back to id if missing.
  - `setTheme(id)`: loads `chrome://vitrina/content/_base.css` first (once),
    then `chrome://vitrina/content/<id>/theme.css`. Apply theme.json
    `features` flags to widget creation (skip pinnedDeck if disabled).
  - Persist per-theme setting overrides in `storage.local` under key
    `themeSettings.<id>`; on apply, write each override as inline
    `--mg-*` on `:root` BEFORE loading the theme sheet (inline wins over
    stylesheet defaults without !important fights).
  - Keep back-compat: if a theme folder has no `theme.json`, treat as
    `{name: id, features: all-true, settings: []}`.

### P2.6 Popup: dynamic theme list + settings scaffolding
- popup.js: on open, call `browser.vitrina.listThemes()`, render a button per
  theme (name + description from theme.json). Highlight active from storage.
- Render settings controls from the active theme's `settings` array:
  `enum` -> `<select>`, `range` -> `<input type=range>`, `bool` -> checkbox.
- On change: save to `storage.local` (`themeSettings.<id>.<key>`) and send
  `SET_THEME_SETTING` message; api.js applies the cssVar inline on :root.
- Add a simple section divider "Menu behavior" for the existing two
  always-show checkboxes (keep them global, not per-theme).
Files: `popup/popup.html`, `popup/popup.js`, `api.js`, `schema.json`
(add `listThemes`, `setThemeSetting`).

### P2.7 Update schema.json
Add to the experiment API:
  - `listThemes(): Promise<Array<ThemeInfo>>`
  - `setThemeSetting(themeId: string, key: string, value: any): Promise<void>`
Keep existing four functions unchanged.

### P2.8 Stock + contrast themes: fill skeletons
- `themes/stock/theme.css`: implement neutral adaptation (no glass, native
  colors). Mostly inherits `_base.css`; only overrides tokens to Firefox
  defaults and adds `:root[lwtheme]` guards so a real Firefox theme can still
  apply.
- `themes/contrast/theme.css`: implement strict two-color theme. Override
  `--mg-accent` to `#fff` (ignore `--site-accent`), all surfaces `#000`,
  borders `#fff`, hover = inversion. Set `useSiteAccent: false` in its
  theme.json.
Verify each: switch theme, navigate between about:* and colored sites, open
both menus, pinned deck, bookmarks wrap.

---

## PHASE 3 — Deferred (do NOT implement yet, keep stubs)
- Options page (theme.json-driven full settings UI) — popup scaffold suffices.
- Per-theme menu transition tuning.
- i18n of popup (ru/en) — only if user asks.
- Old empty dir cleanup (P0.4) — cosmetic.

---

## What else to watch / loose ends
- `ensureWidgets` list duplicates ids in `leftBtnIds`/`rightBtnIds`; keep them
  in sync when adding buttons (move the id lists to one const in api.js).
- When adding a third real theme, review the hide-list in `_base.css` — the
  `#nav-bar toolbarbutton:not(...)` selector must include all min-* ids.
- `startupcache-invalidate` on shutdown already handles CSS caching; if CSS
  changes are not picked up after `./build.sh`, bump `version` in manifest.json
  so Firefox re-registers the chrome URI cleanly.
- Contrast theme + site accent: api.js must check `features.useSiteAccent`
  before writing `--site-accent`; otherwise contrast will pick up colors.
- Test matrix after P2: themes ink/gloss x menus open/always-show x pinned
  extensions 0/1/3 x about:home / github / youtube / yandex (theme-color).
- Git workflow for the weak model: one commit per P-task, message
  `P1.3: <summary>`. Push after each phase. Releases: after Phase 2 tag
  `v1.2.0-vitrina` and update scoop manifest hash.

## Quick smoke test script (manual, after any change)
1. `./build.sh --install`
2. Restart Firefox Dev.
3. about:debugging shows "Vitrina" enabled, no errors.
4. Left menu opens on control click; closes on outside click and far mouse.
5. Right menu opens on hamburger click; settings gear opens app menu.
6. Click active tab -> URL bar focused.
7. github.com -> accent = its palette color; about:home -> default accent.
8. Popup: switch ink <-> gloss; both render; restart; theme persists.
