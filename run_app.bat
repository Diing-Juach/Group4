@echo off
setlocal
set PORT=8000

echo ============================================
echo Climate Change Dashboard - Local Server
echo ============================================
echo.
echo Current directory: %CD%
echo.

REM Check if index.html exists in current directory
if not exist "index.html" (
  echo ERROR: index.html not found in current directory!
  echo.
  echo Make sure you are running this file from the project folder
  echo that contains index.html, css/, js/, and data/ folders.
  echo.
  pause
  exit /b 1
)

echo Starting server on port %PORT%...
echo.

echo Checking Python launcher...
where py >nul 2>nul
if %errorlevel%==0 (
  echo.
  echo ✓ Python found! Starting server...
  echo ✓ Opening browser to http://127.0.0.1:%PORT%/
  echo.
  echo Server is running. Press Ctrl+C to stop.
  echo ============================================
  echo.
  start "" "http://127.0.0.1:%PORT%/"
  py -m http.server %PORT%
  goto :end
)

echo Checking Python executable...
where python >nul 2>nul
if %errorlevel%==0 (
  echo.
  echo ✓ Python found! Starting server...
  echo ✓ Opening browser to http://127.0.0.1:%PORT%/
  echo.
  echo Server is running. Press Ctrl+C to stop.
  echo ============================================
  echo.
  start "" "http://127.0.0.1:%PORT%/"
  python -m http.server %PORT%
  goto :end
)

echo.
echo Python was not found on PATH.
echo Install Python from https://www.python.org/downloads/
echo Then run this file again.
pause

:end
endlocal
