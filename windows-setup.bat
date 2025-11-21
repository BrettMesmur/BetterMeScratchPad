@echo off
setlocal

REM Helper script for Windows setups. Run this from an elevated PowerShell or Command Prompt
REM if you hit permission errors while installing dependencies.

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo npm is not available on PATH. Please install Node.js 18+ before running this script.
  exit /b 1
)

echo Installing dependencies...
npm install
if %ERRORLEVEL% NEQ 0 (
  echo npm install failed. If you see permissions or access denied errors, re-run this script as Administrator.
  exit /b %ERRORLEVEL%
)

echo Starting the dev server...
npm start
