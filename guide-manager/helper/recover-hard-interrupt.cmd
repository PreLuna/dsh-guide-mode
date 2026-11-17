@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0recover-hard-interrupt.ps1" %*
