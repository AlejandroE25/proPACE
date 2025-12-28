@echo off
REM Install Visual Studio Build Tools on Windows
REM Run as Administrator

echo.
echo === Installing Visual Studio Build Tools ===
echo.
echo This will install the C++ build tools required for better-sqlite3
echo.

REM Check for Administrator privileges
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: This script must be run as Administrator!
    echo Right-click Command Prompt and select 'Run as Administrator'
    echo.
    exit /b 1
)

REM Check if winget is available
where winget >nul 2>&1
if errorlevel 1 (
    echo ERROR: winget not found. Please install App Installer from Microsoft Store
    echo https://apps.microsoft.com/detail/9nblggh4nns1
    echo.
    exit /b 1
)

echo Installing Visual Studio Build Tools 2022...
echo This may take 10-15 minutes...
echo.

winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

if errorlevel 1 (
    echo.
    echo ERROR: Installation failed
    echo.
    echo Manual installation steps:
    echo 1. Download from: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
    echo 2. Run installer
    echo 3. Select "Desktop development with C++"
    echo 4. Click Install
    echo.
    exit /b 1
)

echo.
echo === Build Tools Installed Successfully! ===
echo.
echo Next steps:
echo 1. Restart Command Prompt
echo 2. Run: scripts\rebuild-windows.cmd
echo.
