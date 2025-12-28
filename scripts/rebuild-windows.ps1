# Windows Clean Rebuild Script for proPACE
# This script performs a complete clean rebuild to fix module loading issues

Write-Host ""
Write-Host "=== proPACE Windows Clean Rebuild ===" -ForegroundColor Cyan
Write-Host "This will clean and rebuild the entire project" -ForegroundColor Yellow
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found. Please run this script from the proPACE directory." -ForegroundColor Red
    Write-Host "Example: cd C:\proPACE" -ForegroundColor Yellow
    Write-Host "         .\scripts\rebuild-windows.ps1" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Step 1: Clean old build
Write-Host "[1/5] Cleaning old build..." -ForegroundColor Green

# Kill any running node processes that might lock files
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
    Write-Host "      Removed dist/ directory" -ForegroundColor Gray
}

if (Test-Path "node_modules") {
    Write-Host "      Removing node_modules/ (this may take a moment)..." -ForegroundColor Gray

    # Try normal removal first
    Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue

    # If it still exists, try more aggressive approach
    if (Test-Path "node_modules") {
        Write-Host "      Using aggressive cleanup for locked files..." -ForegroundColor Yellow

        # Use robocopy to clear the directory (Windows-specific robust method)
        $emptyDir = Join-Path $env:TEMP "empty_propace"
        New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
        robocopy $emptyDir "node_modules" /MIR /R:0 /W:0 /NJH /NJS | Out-Null
        Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $emptyDir -ErrorAction SilentlyContinue
    }

    Write-Host "      Removed node_modules/ directory" -ForegroundColor Gray
}

Write-Host "      ✓ Clean complete" -ForegroundColor Green
Write-Host ""

# Step 2: Install dependencies
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Green
Write-Host "      Running: npm install --omit=optional --legacy-peer-deps --force" -ForegroundColor Gray
Write-Host "      (this may show warnings about locked files - these can be ignored)" -ForegroundColor Gray
$installOutput = npm install --omit=optional --legacy-peer-deps --force 2>&1

# Check if install actually failed (not just warnings)
if ($LASTEXITCODE -ne 0) {
    # Check if it's just cleanup warnings vs actual failure
    $hasCriticalError = $installOutput | Select-String -Pattern "npm error code" -Quiet

    if ($hasCriticalError) {
        Write-Host "      ERROR during npm install:" -ForegroundColor Red
        Write-Host $installOutput -ForegroundColor Red
        exit 1
    } else {
        Write-Host "      Install completed with warnings (safe to ignore)" -ForegroundColor Yellow
    }
} else {
    Write-Host "      ✓ Dependencies installed" -ForegroundColor Green
}
Write-Host ""

# Step 3: Verify critical dependencies
Write-Host "[3/5] Verifying critical dependencies..." -ForegroundColor Green
$criticalDeps = @(
    "@types/node",
    "@anthropic-ai/sdk",
    "better-sqlite3",
    "ws",
    "dotenv",
    "boxen",
    "chalk"
)

$missingDeps = @()
foreach ($dep in $criticalDeps) {
    $check = npm list $dep 2>&1 | Select-String -Pattern $dep
    if ($check) {
        Write-Host "      ✓ $dep" -ForegroundColor Gray
    } else {
        Write-Host "      ✗ $dep MISSING" -ForegroundColor Red
        $missingDeps += $dep
    }
}

if ($missingDeps.Count -gt 0) {
    Write-Host ""
    Write-Host "      ERROR: Missing dependencies detected!" -ForegroundColor Red
    Write-Host "      Please install manually: npm install $($missingDeps -join ' ')" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
Write-Host "      ✓ All critical dependencies present" -ForegroundColor Green
Write-Host ""

# Step 4: Build the project
Write-Host "[4/5] Building TypeScript project..." -ForegroundColor Green
Write-Host "      Running: npm run build" -ForegroundColor Gray
$buildOutput = npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERROR during build:" -ForegroundColor Red
    Write-Host $buildOutput -ForegroundColor Red
    exit 1
}
Write-Host "      ✓ Build complete" -ForegroundColor Green
Write-Host ""

# Step 5: Verify build output
Write-Host "[5/5] Verifying build output..." -ForegroundColor Green

$criticalFiles = @(
    "dist\src\server\index.js",
    "dist\src\config\index.js",
    "dist\src\utils\logger.js",
    "dist\src\utils\terminalUI.js"
)

$missingFiles = @()
foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Write-Host "      ✓ $file" -ForegroundColor Gray
    } else {
        Write-Host "      ✗ $file MISSING" -ForegroundColor Red
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "      ERROR: Build incomplete! Missing files:" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "      - $file" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "      This indicates a TypeScript compilation issue." -ForegroundColor Yellow
    Write-Host "      Check the build output above for errors." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "      ✓ All critical files present" -ForegroundColor Green
Write-Host ""

# Success!
Write-Host "=== Rebuild Complete! ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your proPACE server is ready to run." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps" -ForegroundColor Yellow
Write-Host "  1. Ensure .env file exists with your API keys" -ForegroundColor White
Write-Host "  2. Run npm start to start the server" -ForegroundColor White
Write-Host ""
