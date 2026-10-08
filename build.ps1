# Packs extension/ into dist/vitrina.xpi and optionally installs it into the
# scoop-persisted Firefox Developer profile.
#
# Usage:
#   pwsh -File build.ps1              # pack only
#   pwsh -File build.ps1 -Install     # pack and copy into the profile
#
# Vitrina is a WebExtension Experiment: Firefox cannot install it through the
# normal about:addons / "Install Add-on From File" flow (experiment APIs are
# never signed by Mozilla), so the only permanent install path is dropping the
# xpi into <profile>/extensions/.

[CmdletBinding()]
param(
    [switch]$Install
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$out     = Join-Path $PSScriptRoot 'dist\vitrina.xpi'
$srcDir  = Join-Path $PSScriptRoot 'extension'
$profile = Join-Path $env:USERPROFILE 'scoop\persist\firefox-developer\profile'

# --- Pack ---------------------------------------------------------------------
if (Test-Path (Join-Path $PSScriptRoot 'dist')) {
    Remove-Item (Join-Path $PSScriptRoot 'dist') -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'dist') -Force | Out-Null

# Compress-Archive writes a .zip; rename to .xpi (same OPC/zip container).
$tmpZip = Join-Path $PSScriptRoot 'dist\vitrina.zip'
Compress-Archive -Path (Join-Path $srcDir '*') -DestinationPath $tmpZip -Force
Move-Item -LiteralPath $tmpZip -Destination $out -Force

$size = (Get-Item -LiteralPath $out).Length
Write-Host "Packed: dist\vitrina.xpi ($size bytes)"

# --- Install ------------------------------------------------------------------
if ($Install) {
    if (-not (Test-Path -LiteralPath $profile)) {
        Write-Error "Profile not found: $profile"
        exit 1
    }
    $extDir = Join-Path $profile 'extensions'
    New-Item -ItemType Directory -Path $extDir -Force | Out-Null
    $target = Join-Path $extDir 'vitrina@local.xpi'

    try {
        Copy-Item -LiteralPath $out -Destination $target -Force
    } catch {
        Write-Error "Could not write $target - is Firefox running? Close it and retry. ($($_.Exception.Message))"
        exit 1
    }
    Write-Host "Installed to: $target"
    Write-Host 'Restart Firefox Developer Edition to apply.'
}
