# Install wrtc package on Windows
# Requires: Node.js, npm, Visual Studio Build Tools

Write-Host "📦 Installing wrtc package for WebRTC support..." -ForegroundColor Cyan
Write-Host ""

# Check if running from proPACE directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: package.json not found. Run this script from C:/proPACE directory" -ForegroundColor Red
    exit 1
}

# Check Node.js version
Write-Host "🔍 Checking Node.js version..." -ForegroundColor Yellow
$nodeVersion = node --version
Write-Host "   Node.js version: $nodeVersion" -ForegroundColor Gray

# Check npm version
$npmVersion = npm --version
Write-Host "   npm version: $npmVersion" -ForegroundColor Gray
Write-Host ""

# Check for Windows Build Tools
Write-Host "🔍 Checking for Visual Studio Build Tools..." -ForegroundColor Yellow
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vsWhere) {
    $vsInstalled = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($vsInstalled) {
        Write-Host "   ✓ Visual Studio Build Tools found: $vsInstalled" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Visual Studio Build Tools not found" -ForegroundColor Yellow
        Write-Host "   wrtc requires C++ build tools to compile native modules" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   To install build tools, run:" -ForegroundColor Cyan
        Write-Host "   npm install --global windows-build-tools" -ForegroundColor White
        Write-Host ""
        $continue = Read-Host "Continue anyway? (y/n)"
        if ($continue -ne "y") {
            exit 1
        }
    }
} else {
    Write-Host "   ⚠️  Visual Studio installer not found" -ForegroundColor Yellow
    Write-Host "   wrtc may fail to install without build tools" -ForegroundColor Yellow
    Write-Host ""
}

# Install wrtc
Write-Host "📥 Installing wrtc package..." -ForegroundColor Cyan
Write-Host "   This may take several minutes (native compilation required)..." -ForegroundColor Gray
Write-Host ""

# Try to install wrtc with verbose logging
npm install wrtc --save-optional --loglevel=verbose

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ wrtc package installed successfully!" -ForegroundColor Green

    # Verify installation
    if (Test-Path "node_modules\wrtc") {
        Write-Host "✓ Verified: node_modules\wrtc exists" -ForegroundColor Green

        # Test import
        Write-Host ""
        Write-Host "🧪 Testing wrtc import..." -ForegroundColor Yellow
        $testScript = @"
const wrtc = require('wrtc');
console.log('✓ wrtc loaded successfully');
console.log('RTCPeerConnection:', typeof wrtc.RTCPeerConnection);
console.log('RTCSessionDescription:', typeof wrtc.RTCSessionDescription);
console.log('RTCIceCandidate:', typeof wrtc.RTCIceCandidate);
"@
        $testScript | node

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "🎉 wrtc is ready to use!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Next steps:" -ForegroundColor Cyan
            Write-Host "1. Restart the proPACE service: nssm restart proPACE" -ForegroundColor White
            Write-Host "2. Check server logs for: '✓ wrtc package loaded successfully'" -ForegroundColor White
        } else {
            Write-Host ""
            Write-Host "⚠️  wrtc installed but import test failed" -ForegroundColor Yellow
            Write-Host "Check the error above for details" -ForegroundColor Gray
        }
    } else {
        Write-Host "⚠️  Installation reported success but node_modules\wrtc not found" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "❌ Failed to install wrtc package" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "1. Missing Visual Studio Build Tools" -ForegroundColor Gray
    Write-Host "   Install with: npm install --global windows-build-tools" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Missing Python 2.7" -ForegroundColor Gray
    Write-Host "   node-gyp requires Python 2.7 or 3.x" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Node version too old/new" -ForegroundColor Gray
    Write-Host "   wrtc requires Node.js 10-18 (may not work with Node 20+)" -ForegroundColor White
    Write-Host ""
    exit 1
}
