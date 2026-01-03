# Diagnose wrtc installation issues on Windows

Write-Host "🔍 Diagnosing wrtc installation..." -ForegroundColor Cyan
Write-Host ""

# Check Node.js version
Write-Host "Node.js Information:" -ForegroundColor Yellow
node --version
Write-Host "   Process architecture: $env:PROCESSOR_ARCHITECTURE" -ForegroundColor Gray
Write-Host ""

# Check if wrtc directory exists
Write-Host "Checking node_modules..." -ForegroundColor Yellow
if (Test-Path "node_modules\wrtc") {
    Write-Host "   ✓ node_modules\wrtc exists" -ForegroundColor Green

    # List files in wrtc directory
    Write-Host ""
    Write-Host "wrtc directory contents:" -ForegroundColor Gray
    Get-ChildItem "node_modules\wrtc" | Select-Object Name | Format-Table -AutoSize
} else {
    Write-Host "   ✗ node_modules\wrtc NOT found" -ForegroundColor Red

    # Check if it's in optionalDependencies
    if (Test-Path "package.json") {
        $package = Get-Content "package.json" | ConvertFrom-Json
        if ($package.optionalDependencies.wrtc) {
            Write-Host "   ✓ wrtc is listed in package.json optionalDependencies" -ForegroundColor Yellow
            Write-Host "   Version: $($package.optionalDependencies.wrtc)" -ForegroundColor Gray
        }
    }
}

# Try to require wrtc
Write-Host ""
Write-Host "Testing require('wrtc')..." -ForegroundColor Yellow
$testScript = @"
try {
  const wrtc = require('wrtc');
  console.log('✓ Successfully loaded wrtc');
  console.log('  RTCPeerConnection:', typeof wrtc.RTCPeerConnection);
} catch (err) {
  console.log('✗ Failed to load wrtc');
  console.log('  Error:', err.message);
  console.log('  Code:', err.code);
}
"@

$testScript | node

# Try dynamic import (ESM)
Write-Host ""
Write-Host "Testing import('wrtc')..." -ForegroundColor Yellow
$importTest = @"
import('wrtc')
  .then(wrtc => {
    console.log('✓ Successfully imported wrtc');
    console.log('  RTCPeerConnection:', typeof wrtc.RTCPeerConnection);
  })
  .catch(err => {
    console.log('✗ Failed to import wrtc');
    console.log('  Error:', err.message);
    console.log('  Code:', err.code);
  });
"@

$importTest | node --input-type=module

# Check npm logs
Write-Host ""
Write-Host "Checking npm install logs..." -ForegroundColor Yellow
if (Test-Path "npm-debug.log") {
    Write-Host "   Found npm-debug.log:" -ForegroundColor Red
    Get-Content "npm-debug.log" -Tail 20
} else {
    Write-Host "   No npm-debug.log found" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Diagnosis complete" -ForegroundColor Cyan
