@echo off
setlocal
cd /d "%~dp0"
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell was not found on PATH.
  pause
  exit /b 1
)
echo This restores the newest cordis.patch.yml backup and reopens DeepSeek Harness.
echo The current chat window will disconnect briefly.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-guide-manager.ps1" -Rollback
echo.
if errorlevel 1 (
  echo FAILED. See the newest .guide-manager\helper-*.log and helper-result.json
) else (
  echo Done. Recheck the "指导" tab after DSH reopens.
)
pause
