#!/usr/bin/env bash
# Packs extension/ into dist/vitrina.xpi and (optionally) copies it
# into the scoop-persisted Firefox Developer profile.
set -euo pipefail

cd "$(dirname "$0")"
OUT="dist/vitrina.xpi"
PROFILE="$HOME/scoop/persist/firefox-developer/profile"

rm -rf dist
mkdir -p dist
(cd extension && zip -qr "../$OUT" . -x '*.DS_Store')

echo "Packed: $OUT ($(stat -c%s "$OUT") bytes)"

if [[ "${1:-}" == "--install" ]]; then
  if [[ -d "$PROFILE" ]]; then
    mkdir -p "$PROFILE/extensions"
    cp "$OUT" "$PROFILE/extensions/vitrina@local.xpi"
    echo "Installed to: $PROFILE/extensions/vitrina@local.xpi"
    echo "Restart Firefox Developer Edition to apply."
  else
    echo "Profile not found: $PROFILE (skipping install)" >&2
    exit 1
  fi
fi
