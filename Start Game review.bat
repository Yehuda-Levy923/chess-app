@echo off
rem Starts Game review on Windows. The first time, it installs Node.js if it's
rem missing, then the app's packages, and puts a "Game review" shortcut on the
rem Desktop. After that it just opens the app (the shortcut does the same).
setlocal
cd /d "%~dp0"
title Game review

where node >nul 2>nul
if errorlevel 1 (
  echo Game review needs Node.js. Installing it with winget; Windows will ask you to confirm.
  winget install -e --id OpenJS.NodeJS.LTS
  if errorlevel 1 goto :nonode
  rem winget adds Node.js to PATH for new windows only.
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  where node >nul 2>nul
  if errorlevel 1 goto :nonode
)

if not exist node_modules (
  echo Installing the app's packages. This happens once and takes a minute or two.
  call npm ci
  if errorlevel 1 (
    echo.
    echo The install failed; the messages above say why. Check your internet connection and run this again.
    pause
    exit /b 1
  )
)

if not exist "%USERPROFILE%\Desktop\Game review.lnk" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Game review.lnk');" ^
    "$s.TargetPath = 'powershell.exe';" ^
    "$s.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%~dp0scripts\launch-app.ps1\"';" ^
    "$s.WorkingDirectory = '%~dp0';" ^
    "$s.IconLocation = '%~dp0scripts\app-icon.ico';" ^
    "$s.Save()"
  echo Added a "Game review" shortcut to your Desktop.
)

echo Opening Game review...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-app.ps1"
exit /b 0

:nonode
echo.
echo Couldn't install Node.js automatically. Get the LTS version from https://nodejs.org,
echo install it, then run this file again.
pause
exit /b 1
