@echo off
REM Windows Service Installation Script for proPACE using NSSM
REM Run this script as Administrator

setlocal

set SERVICE_NAME=proPACE
set INSTALL_PATH=%CD%
set NODE_PATH=C:\Program Files\nodejs\node.exe

echo.
echo === proPACE Service Installation ===
echo Installing proPACE as a Windows service using NSSM
echo.

REM Check if running as Administrator
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: This script must be run as Administrator!
    echo Right-click Command Prompt and select 'Run as Administrator'
    echo.
    exit /b 1
)

REM Check if NSSM is installed
where nssm >nul 2>&1
if errorlevel 1 (
    echo ERROR: NSSM is not installed or not in PATH
    echo.
    echo Please install NSSM first:
    echo   Option 1 ^(Chocolatey^): choco install nssm
    echo   Option 2 ^(WinGet^):     winget install NSSM.NSSM
    echo   Option 3 ^(Manual^):     Download from https://github.com/kirillkovalenko/nssm/releases
    echo.
    exit /b 1
)

echo * NSSM found

REM Check if Node.js exists
if not exist "%NODE_PATH%" (
    echo.
    echo WARNING: Node.js not found at: %NODE_PATH%
    where node >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Node.js not found!
        echo Please install Node.js or specify the path
        echo.
        exit /b 1
    )
    for /f "delims=" %%i in ('where node') do set NODE_PATH=%%i
    echo Using Node.js from PATH: !NODE_PATH!
)

echo * Node.js found at: %NODE_PATH%

REM Check if project is built
set SERVER_PATH=%INSTALL_PATH%\dist\src\server\index.js
if not exist "%SERVER_PATH%" (
    echo.
    echo ERROR: Server not built!
    echo Please run: scripts\rebuild-windows.cmd
    echo.
    exit /b 1
)

echo * Server build found

REM Check if .env exists
if not exist "%INSTALL_PATH%\.env" (
    echo.
    echo WARNING: .env file not found!
    echo The service will fail to start without API keys.
    echo Press Ctrl+C to cancel and create .env, or
    pause
)

REM Create logs directory
if not exist "%INSTALL_PATH%\logs" (
    mkdir "%INSTALL_PATH%\logs"
    echo * Created logs directory
)

REM Stop and remove existing service if it exists
sc query %SERVICE_NAME% >nul 2>&1
if not errorlevel 1 (
    echo.
    echo Removing existing service...
    nssm stop %SERVICE_NAME% >nul 2>&1
    nssm remove %SERVICE_NAME% confirm >nul 2>&1
    timeout /t 2 /nobreak >nul
    echo * Removed existing service
)

REM Install the service
echo.
echo Installing service...
nssm install %SERVICE_NAME% "%NODE_PATH%" "%SERVER_PATH%"
if errorlevel 1 (
    echo ERROR: Failed to install service
    exit /b 1
)

REM Configure service
echo Configuring service...
nssm set %SERVICE_NAME% AppDirectory "%INSTALL_PATH%"
nssm set %SERVICE_NAME% AppStdout "%INSTALL_PATH%\logs\service-stdout.log"
nssm set %SERVICE_NAME% AppStderr "%INSTALL_PATH%\logs\service-stderr.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateOnline 1
nssm set %SERVICE_NAME% AppRotateBytes 10485760
nssm set %SERVICE_NAME% DisplayName "proPACE AI Assistant"
nssm set %SERVICE_NAME% Description "Personal AI Assistant with persistent memory"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START

echo * Service configured

REM Start the service
echo.
echo Starting service...
nssm start %SERVICE_NAME%
timeout /t 3 /nobreak >nul

REM Check status
for /f "tokens=*" %%a in ('nssm status %SERVICE_NAME%') do set SERVICE_STATUS=%%a
if "%SERVICE_STATUS%"=="SERVICE_RUNNING" (
    echo * Service started successfully!
) else (
    echo WARNING: Service status: %SERVICE_STATUS%
    echo Check logs at: %INSTALL_PATH%\logs
)

REM Display service info
echo.
echo === Service Installation Complete ===
echo.
echo Service Name:  %SERVICE_NAME%
echo Status:        %SERVICE_STATUS%
echo Install Path:  %INSTALL_PATH%
echo Logs:          %INSTALL_PATH%\logs
echo.
echo Useful Commands:
echo   Start:   nssm start %SERVICE_NAME%
echo   Stop:    nssm stop %SERVICE_NAME%
echo   Restart: nssm restart %SERVICE_NAME%
echo   Status:  nssm status %SERVICE_NAME%
echo   Remove:  nssm remove %SERVICE_NAME% confirm
echo.
echo View logs: type %INSTALL_PATH%\logs\service-stdout.log
echo.

endlocal
exit /b 0
