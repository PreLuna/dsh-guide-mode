@echo off
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-guide-manager.ps1" -PackageChange %*
pause
