# Vitrina

Min-style interface for Firefox Developer Edition: fluid ink-glass aesthetics,
dynamic per-site accent colors, and tactile island tabs. Ships as a
WebExtension Experiment (MV2) that injects chrome-level stylesheets and
rearranges native toolbar widgets.

> Firefox-only by design — the experiment API (`experiment_apis`) is required.
> Works with the scoop-managed `firefox-developer` package (see below).

## Install

### Scoop (recommended)

```powershell
scoop bucket add personal https://github.com/hrkcz001/scoop_bucket
scoop install personal/vitrina
```

The manifest depends on `firefox-developer` and installs the xpi into the
scoop-persisted profile (`~/scoop/persist/firefox-developer/profile/extensions/`).

### Manual

1. `./build.sh` — packs `extension/` into `dist/vitrina.xpi`
2. Open Firefox Developer Edition → `about:debugging` → Load Temporary Add-on,
   or copy the xpi into `<profile>/extensions/vitrina@local.xpi`
3. Requires `xpinstall.signatures.required = false` (set automatically by the
   scoop installer; for manual installs add it to `user.js`).

## Features

- Single 32px bar: island tabs, collapsing URL bar, hamburger + control-button flyouts
- Dynamic accent color from each site's `<meta name="theme-color">` (fallback:
  curated palette / deterministic per-domain color)
- Click on the active tab focuses the URL bar (Min-browser behavior)
- Pinned extension buttons deck
- Multi-row wrapping bookmarks toolbar (icons only, hover to reveal labels)
- Two themes: `vitrina-ink` (ink & glass) and `gloss` (monochrome gloss)

## Development

```
extension/
  manifest.json      MV2 + experiment API registration
  schema.json        experiment API schema
  api.js             privileged parent-process code (widgets, sheets, accent)
  background.js      storage <-> experiment API bridge
  content-script.js  reports <meta theme-color> from pages
  popup/             theme picker
  themes/            theme stylesheets (injected per-window as USER_SHEET)
docs/ANALYSIS.md     architecture analysis & refactor plan
build.sh             packs the xpi
```

After each code change: `./build.sh`, restart Firefox (the extension
invalidates the startup cache on shutdown so updated CSS is picked up).

## Roadmap

See [docs/ANALYSIS.md](docs/ANALYSIS.md) for the phased refactor plan
(bug fixes → theme system with per-theme CSS + optional settings schema).

## License

MIT
