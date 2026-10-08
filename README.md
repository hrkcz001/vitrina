# Vitrina

Min-style interface for Firefox Developer Edition: fluid ink-glass aesthetics,
dynamic per-site accent colors, and tactile island tabs. Ships as a
WebExtension Experiment (MV2) that injects chrome-level stylesheets and
rearranges native toolbar widgets.

> **Firefox Developer Edition / Nightly only — NOT regular Firefox.** Vitrina
> is a WebExtension Experiment, which needs two things that the release channel
> forbids: the `experiment_apis` mechanism (`extensions.experiments.enabled` is
> locked off in release builds) and the ability to load an unsigned package
> (`xpinstall.signatures.required=false` is ignored in release builds, and
> Mozilla never signs experiment APIs). ESR can work only if experiment prefs
> are enabled by policy. The scoop manifest therefore depends on
> `firefox-developer`.

## Install

### Scoop (recommended)

```powershell
scoop bucket add hrkcz001 https://github.com/hrkcz001/scoop_bucket
scoop install hrkcz001/vitrina
```
The manifest depends on `firefox-developer` and installs the xpi into the
scoop-persisted profile (`~/scoop/persist/firefox-developer/profile/extensions/`).

### Manual

1. `pwsh -File build.ps1` — packs `extension/` into `dist/vitrina.xpi`
   (or `build.cmd` on plain Command Prompt)
2. Copy the xpi into `<profile>/extensions/vitrina@local.xpi`. The normal
   `about:addons` / "Install Add-on From File" flow does NOT work for
   experiment extensions (they cannot be signed), so this is the only
   permanent install path; `about:debugging` → Load Temporary Add-on works
   only until the next restart.
3. Requires `xpinstall.signatures.required = false` (set automatically by the
   scoop installer; for manual installs add it to `user.js`).

## Features

- Single 32px bar: island tabs, collapsing URL bar, hamburger + control-button flyouts
- Dynamic accent color from each site's `<meta name="theme-color">` (fallback:
  curated palette / deterministic per-domain color)
- Click on the active tab focuses the URL bar (Min-browser behavior)
- Pinned extension buttons deck
- Multi-row wrapping bookmarks toolbar (icons only, hover to reveal labels)
- Themes: `ink` (ink & glass) and `gloss` (monochrome gloss)

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
docs/PLAN.md         phased execution plan
build.ps1            packs the xpi (PowerShell; -Install copies to the profile)
build.sh             thin bash wrapper around build.ps1 (for git-bash users)
```

After each code change: `pwsh -File build.ps1 -Install` (Firefox must be closed),
restart Firefox (the extension invalidates the startup cache on shutdown so
updated CSS is picked up).

## Roadmap

See [docs/ANALYSIS.md](docs/ANALYSIS.md) for the phased refactor plan
(bug fixes → theme system with per-theme CSS + optional settings schema).

## License

Apache-2.0 — Copyright 2026 hrkcz001
