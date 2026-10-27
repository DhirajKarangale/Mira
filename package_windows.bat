@echo off
setlocal
title MIRA - Windows Package Builder
echo ===================================================
echo   MIRA Master Windows Packaging & Release Builder
echo ===================================================
echo.

python "%~dp0package_windows.py" %*
if errorlevel 1 (
    echo.
    echo [ERROR] Packaging failed with error code %errorlevel%.
    pause
    exit /b %errorlevel%
)

echo.
echo Packaging completed successfully!
pause
