@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22.12 or newer, then try again.
  pause
  exit /b 1
)
if not exist "dist\index.html" goto build
if not exist "server-dist\index.js" goto build
goto play
:build
call npm.cmd run build
if errorlevel 1 goto failed
:play
node "scripts\play-local.mjs"
if errorlevel 1 goto failed
exit /b 0
:failed
echo Could not start. If dependencies are missing, run npm ci, then try again.
pause
exit /b 1
