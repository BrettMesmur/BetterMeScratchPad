@echo off
setlocal

set PORT=8000
if not "%~1"=="" set PORT=%~1

pushd %~dp0

where py >nul 2>&1
if %errorlevel%==0 (
  set PYTHON_CMD=py
) else (
  set PYTHON_CMD=python
)

echo Starting local server on port %PORT% using %PYTHON_CMD%...
start "BetterMeScratchPad Server" cmd /k "%PYTHON_CMD% -m http.server %PORT%"

REM Give the server a moment to start
timeout /t 2 >nul

echo Opening http://localhost:%PORT%/ in your default browser.
start "" http://localhost:%PORT%/

popd
endlocal
