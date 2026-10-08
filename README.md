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
> are enabled by policy. Install it on Developer Edition as an unsigned
> extension (see below).

## Install

Vitrina ships as a plain, unsigned `.xpi` — no store, no scoop, no build step.

1. Download the xpi from the [latest release](https://github.com/hrkcz001/vitrina/releases).
2. Set these prefs in `<profile>/user.js`:
   ```
   user_pref("xpinstall.signatures.required", false);
   user_pref("extensions.experiments.enabled", true);
   ```
3. In Firefox Developer Edition open `about:addons` → gear →
   "Install Add-on From File…" and pick the xpi (or drag-drop it onto the window).
4. Restart Firefox Developer Edition.

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
```

## Roadmap

See [docs/ANALYSIS.md](docs/ANALYSIS.md) for the phased refactor plan
(bug fixes → theme system with per-theme CSS + optional settings schema).

## License

Apache-2.0 — Copyright 2026 hrkcz001
