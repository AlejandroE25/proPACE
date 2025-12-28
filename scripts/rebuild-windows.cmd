@echo off
REM Windows Clean Rebuild Script for proPACE
REM This script performs a complete clean rebuild to fix module loading issues

echo.
echo === proPACE Windows Clean Rebuild ===
echo This will clean and rebuild the entire project
echo.

REM Check if we're in the right directory
if not exist "package.json" (
    echo ERROR: package.json not found. Please run this script from the proPACE directory.
    echo Example: cd C:\proPACE
    echo          scripts\rebuild-windows.cmd
    echo.
    exit /b 1
)

REM Step 1: Clean old build
echo [1/5] Cleaning old build...

REM Kill any running node processes
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

if exist "dist" (
    rmdir /s /q "dist" 2>nul
    echo       Removed dist/ directory
)

if exist "node_modules" (
    echo       Removing node_modules/ ^(this may take a moment^)...
    rmdir /s /q "node_modules" 2>nul
    echo       Removed node_modules/ directory
)

echo       * Clean complete
echo.

REM Step 2: Install dependencies
echo [2/5] Installing dependencies...
echo       Running: npm install --omit=optional --legacy-peer-deps
echo       ^(this may show warnings - these can be ignored^)

npm install --omit=optional --legacy-peer-deps

if errorlevel 1 (
    echo       ERROR during npm install
    echo       Check the output above for errors
    exit /b 1
)

echo       * Dependencies installed
echo.

REM Step 3: Verify critical dependencies
echo [3/5] Verifying critical dependencies...

set ALL_DEPS_OK=1

call :check_dep "@types/node"
call :check_dep "@anthropic-ai/sdk"
call :check_dep "better-sqlite3"
call :check_dep "ws"
call :check_dep "dotenv"
call :check_dep "boxen"
call :check_dep "chalk"

if %ALL_DEPS_OK%==0 (
    echo.
    echo       ERROR: Missing dependencies detected!
    echo       Please check npm install output above
    echo.
    exit /b 1
)

echo       * All critical dependencies present
echo.

REM Step 4: Build the project
echo [4/5] Building TypeScript project...
echo       Running: npm run build

npm run build

if errorlevel 1 (
    echo       ERROR during build
    exit /b 1
)

echo       * Build complete
echo.

REM Step 5: Verify build output
echo [5/5] Verifying build output...

set ALL_FILES_OK=1

call :check_file "dist\src\server\index.js"
call :check_file "dist\src\config\index.js"
call :check_file "dist\src\utils\logger.js"
call :check_file "dist\src\utils\terminalUI.js"

if %ALL_FILES_OK%==0 (
    echo.
    echo       ERROR: Build incomplete! Missing files
    echo       This indicates a TypeScript compilation issue.
    echo       Check the build output above for errors.
    echo.
    exit /b 1
)

echo       * All critical files present
echo.

REM Success!
echo === Rebuild Complete! ===
echo.
echo Your proPACE server is ready to run.
echo.
echo Next steps
echo   1. Ensure .env file exists with your API keys
echo   2. Run npm start to start the server
echo.

exit /b 0

REM Function to check if dependency exists
:check_dep
npm list %~1 >nul 2>&1
if errorlevel 1 (
    echo       X %~1 MISSING
    set ALL_DEPS_OK=0
) else (
    echo       * %~1
)
exit /b 0

REM Function to check if file exists
:check_file
if exist "%~1" (
    echo       * %~1
) else (
    echo       X %~1 MISSING
    set ALL_FILES_OK=0
)
exit /b 0
