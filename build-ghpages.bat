@echo off
setlocal

REM Build Angular app for GitHub Pages into /docs
REM Run this from the Angular project root (same folder as angular.json)

REM Move to the directory of this script
cd /d "%~dp0"

echo Cleaning old build folders...
if exist dist-ghpages rd /s /q dist-ghpages
if exist docs rd /s /q docs

echo Running Angular build...
ng build --configuration production --base-href /BetterMeScratchPad/ --output-path dist-ghpages
if errorlevel 1 (
    echo.
    echo Angular build failed. See errors above.
    exit /b 1
)

echo Creating docs folder and copying build output...
mkdir docs
xcopy /e /i /y "dist-ghpages\browser\*" "docs\" >nul

echo Cleaning temporary dist-ghpages folder...
rd /s /q dist-ghpages

echo.
echo Build complete. Static site is now in the docs folder, ready for GitHub Pages.
echo.

endlocal
