@echo off
setlocal

REM Build Angular app for GitHub Pages into /docs
REM Place this file in the Angular project root (same folder as angular.json)
REM Then double–click it or run:  build-ghpages.bat

REM Move to the directory of this script
cd /d "%~dp0"

echo.
echo === Cleaning old build folders ===
if exist dist-ghpages rd /s /q dist-ghpages
if exist docs rd /s /q docs

echo.
echo === Running Angular build via npx ng ===
REM Using npx so it works even if ng is not on the global PATH for cmd.exe
call npx ng build --configuration production --base-href /BetterMeScratchPad/ --output-path dist-ghpages
if errorlevel 1 (
    echo.
    echo !!! Angular build failed. See errors above.
    goto :end
)

echo.
echo === Creating docs folder and copying browser build ===
mkdir docs
xcopy /e /i /y "dist-ghpages\browser\*" "docs\" >nul
if errorlevel 1 (
    echo.
    echo !!! Failed to copy build output into docs.
    goto :end
)

echo.
echo === Cleaning temporary dist-ghpages folder ===
rd /s /q dist-ghpages

echo.
echo === DONE ===
echo Static site is now in the docs folder, ready for GitHub Pages.
echo.

:end
endlocal
