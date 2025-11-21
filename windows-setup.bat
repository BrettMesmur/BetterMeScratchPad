@echo off
setlocal ENABLEDELAYEDEXPANSION

set LOGFILE=%~dp0windows-setup.log

title BetterMe - Windows setup helper
echo =====================================
echo BetterMe Windows setup helper
echo =====================================

net session >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo NOTE: You are not running as Administrator. If you hit permissions errors, close this window and rerun as Administrator.
)

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo npm is not available on PATH. Please install Node.js 18+ before running this script.
  echo Press any key to close...
  pause >nul
  exit /b 1
)

echo Logging output to %LOGFILE%

echo Installing dependencies... this may take a minute.
call npm install >"%LOGFILE%" 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo npm install failed. Details are in %LOGFILE%.
  echo If you see permissions or access denied errors, rerun this script as Administrator.
  echo Press any key to view the log...
  pause >nul
  type "%LOGFILE%"
  echo Press any key to close...
  pause >nul
  exit /b %ERRORLEVEL%
)

echo Dependencies installed successfully.
echo Starting the dev server (Ctrl+C to stop). Output will continue in this window.
echo If you need a record of the install step, check %LOGFILE%.
call npm start
if %ERRORLEVEL% NEQ 0 (
  echo npm start failed. Review %LOGFILE% for details.
  echo Press any key to close...
  pause >nul
  exit /b %ERRORLEVEL%
)

echo Dev server exited.
echo Press any key to close...
pause >nul
endlocal
