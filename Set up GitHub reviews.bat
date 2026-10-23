@echo off
rem Sets up GitHub reviews for this copy of Game review: see scripts\setup-github.ps1.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-github.ps1"
pause
