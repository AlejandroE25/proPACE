# Update proPACE from Git and rebuild with new dependencies
# Handles package-lock.json conflicts by resetting and reinstalling

Write-Host "🔄 Updating proPACE from Git..." -ForegroundColor Cyan
Write-Host ""

# Save current directory
$originalPath = Get-Location

try {
    # Navigate to project directory
    Set-Location "C:\proPACE"

    # Stash any local changes to package-lock.json
    Write-Host "📦 Resetting package-lock.json..." -ForegroundColor Yellow
    git checkout package-lock.json

    # Pull latest changes
    Write-Host "⬇️  Pulling latest changes..." -ForegroundColor Yellow
    git pull

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Git pull failed" -ForegroundColor Red
        exit 1
    }

    # Clean install dependencies (will install werift)
    Write-Host ""
    Write-Host "📥 Installing dependencies (including werift)..." -ForegroundColor Yellow
    npm install

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ npm install failed" -ForegroundColor Red
        exit 1
    }

    # Build TypeScript
    Write-Host ""
    Write-Host "🔨 Building TypeScript..." -ForegroundColor Yellow
    npm run build

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
        exit 1
    }

    # Restart service
    Write-Host ""
    Write-Host "🔄 Restarting proPACE service..." -ForegroundColor Yellow
    nssm restart proPACE

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Update complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Changes applied:" -ForegroundColor Cyan
        Write-Host "  - Migrated from wrtc to werift (Node.js 24 compatible)" -ForegroundColor White
        Write-Host "  - WebRTC voice interface now compatible with Node 24" -ForegroundColor White
        Write-Host "  - Pure JavaScript implementation (no build tools needed)" -ForegroundColor White
        Write-Host ""
        Write-Host "🌐 Server should be accessible at http://10.0.0.69:3000" -ForegroundColor Cyan
        Write-Host "🎤 Voice interface should now work in browser" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  Service restart had issues" -ForegroundColor Yellow
        Write-Host "Try manually: nssm restart proPACE" -ForegroundColor Gray
    }

} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    exit 1
} finally {
    # Restore original directory
    Set-Location $originalPath
}
