@echo off
setlocal
cd /d "%~dp0"
where pwsh >nul 2>nul
if errorlevel 1 (
  echo PowerShell 7 ^(pwsh^) was not found on PATH.
  pause
  exit /b 1
)
echo This applies the staged guide-manager intent, then closes and reopens DeepSeek Harness.
echo The current chat window will disconnect briefly.
echo.
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-guide-manager.ps1" %*
echo.
if errorlevel 1 (
  echo FAILED. See the newest .guide-manager\helper-*.log and helper-result.json
) else (
  echo Done. Check the Plugins page for the "指导" tab after DSH reopens.
)
pause
