@echo off
REM Verify Git Sync Script
REM This checks if your local files match what's in git

echo.
echo === Checking Git Sync Status ===
echo.

REM Check if we're in a git repo
git status >nul 2>&1
if errorlevel 1 (
    echo ERROR: Not in a git repository
    exit /b 1
)

REM Check for uncommitted changes
echo Checking for uncommitted changes...
git diff --quiet
if errorlevel 1 (
    echo WARNING: You have uncommitted changes!
    echo.
    git status -s
    echo.
) else (
    echo * No uncommitted changes
)

REM Check if package.json matches git
echo.
echo Checking package.json...
git diff --quiet HEAD package.json
if errorlevel 1 (
    echo X package.json differs from git
) else (
    echo * package.json matches git
)

REM Check if package-lock.json exists and matches git
echo.
echo Checking package-lock.json...
if not exist "package-lock.json" (
    echo X package-lock.json does NOT exist locally!
    echo   Run: git checkout package-lock.json
) else (
    git diff --quiet HEAD package-lock.json
    if errorlevel 1 (
        echo X package-lock.json differs from git
        echo.
        echo   File size differences:
        for %%F in (package-lock.json) do echo   Local: %%~zF bytes
        git show HEAD:package-lock.json > %TEMP%\package-lock-git.json
        for %%F in (%TEMP%\package-lock-git.json) do echo   Git:   %%~zF bytes
        del %TEMP%\package-lock-git.json
        echo.
        echo   To sync: git checkout package-lock.json
    ) else (
        echo * package-lock.json matches git
    )
)

REM Check .gitignore
echo.
echo Checking .gitignore...
git diff --quiet HEAD .gitignore
if errorlevel 1 (
    echo X .gitignore differs from git
) else (
    echo * .gitignore matches git
)

REM Check if package-lock.json is in .gitignore
findstr /C:"package-lock.json" .gitignore >nul 2>&1
if errorlevel 1 (
    echo * package-lock.json is NOT in .gitignore (correct!)
) else (
    echo X package-lock.json is STILL in .gitignore (wrong!)
    echo   Run: git pull origin main
)

REM Check current branch and remote status
echo.
echo Git Status:
git status -sb
echo.

REM Show last 3 commits
echo Last 3 commits:
git log --oneline -3
echo.

echo === Verification Complete ===
echo.
echo If package-lock.json differs, run:
echo   git checkout package-lock.json
echo   del /q node_modules
echo   scripts\rebuild-windows.cmd
echo.
