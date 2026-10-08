#!/usr/bin/env bash
# Thin wrapper for git-bash users. The real build lives in build.ps1
# (PowerShell): it is the native toolchain on Windows and does not depend on
# MSYS. Any argument is forwarded, e.g. ./build.sh -Install
set -euo pipefail
cd "$(dirname "$0")"
exec pwsh -NoProfile -File build.ps1 "$@"
