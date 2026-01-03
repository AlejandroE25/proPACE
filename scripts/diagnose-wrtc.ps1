# Diagnose wrtc installation issues on Windows

Write-Host "Diagnosing wrtc installation..." -ForegroundColor Cyan
Write-Host ""

# Check Node.js version
Write-Host "Node.js Information:" -ForegroundColor Yellow
node --version
Write-Host ""

# Check if wrtc directory exists
Write-Host "Checking node_modules..." -ForegroundColor Yellow
if (Test-Path "node_modules\wrtc") {
    Write-Host "   wrtc exists in node_modules" -ForegroundColor Green
    Write-Host ""
    Write-Host "wrtc directory contents:" -ForegroundColor Gray
    Get-ChildItem "node_modules\wrtc" | Select-Object Name
} else {
    Write-Host "   wrtc NOT found in node_modules" -ForegroundColor Red
}

Write-Host ""

# Try to require wrtc
Write-Host "Testing require wrtc..." -ForegroundColor Yellow

$testScript = 'try { const wrtc = require("wrtc"); console.log("SUCCESS: wrtc loaded"); console.log("RTCPeerConnection:", typeof wrtc.RTCPeerConnection); } catch (err) { console.log("FAILED:", err.message); console.log("Code:", err.code); }'

$testScript | Out-File -FilePath "test-wrtc.js" -Encoding ASCII

node test-wrtc.js

Remove-Item test-wrtc.js

Write-Host ""
Write-Host "Diagnosis complete" -ForegroundColor Cyan
