@echo off
rem Wrapper so the build can be run from a plain Command Prompt / double-click.
pwsh -NoProfile -File "%~dp0build.ps1" %*
