@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org first.
  pause
  exit /b 1
)
node bin\setup.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
echo See README for configuration and verification.
pause
