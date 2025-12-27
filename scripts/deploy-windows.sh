#!/bin/bash

# =============================================================================
# proPACE Windows Server Deployment Script
# =============================================================================
# This script deploys proPACE to a Windows server via SSH.
# It pulls the latest code, installs dependencies, builds, and restarts the service.
#
# Usage: ./deploy-windows.sh
# Prerequisites: SSH access to Windows server configured
# =============================================================================

# ===== CONFIGURATION =====
# TODO: Edit these values for your Windows server
SERVER_USER="Administrator"                 # Your Windows username
SERVER_HOST="192.168.1.100"                 # Your server IP or domain name
SERVER_PATH="C:/proPACE"                    # Installation path on Windows
NSSM_PATH="C:/nssm/win64/nssm.exe"         # Path to NSSM executable
SERVICE_NAME="proPACE"                      # Windows service name
# =========================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ${NC}  $1"
}

log_success() {
  echo -e "${GREEN}✅${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠️${NC}  $1"
}

log_error() {
  echo -e "${RED}❌${NC} $1"
}

# Deployment function
deploy() {
  log_info "Starting deployment to Windows server at ${SERVER_HOST}..."
  echo ""

  # SSH into server and run deployment commands
  ssh "${SERVER_USER}@${SERVER_HOST}" "powershell -Command \"
    # Set error action preference
    \$ErrorActionPreference = 'Stop'

    try {
      Set-Location '${SERVER_PATH}'
      Write-Host ''
      Write-Host '=== proPACE Deployment ===' -ForegroundColor Cyan
      Write-Host ''

      # Step 1: Pull latest changes
      Write-Host '📥 Pulling latest changes from Git...' -ForegroundColor Blue
      git pull origin main
      if (\$LASTEXITCODE -ne 0) {
        throw 'Git pull failed'
      }
      Write-Host '✅ Code updated' -ForegroundColor Green
      Write-Host ''

      # Step 2: Install dependencies
      Write-Host '📦 Installing dependencies...' -ForegroundColor Blue
      npm install
      if (\$LASTEXITCODE -ne 0) {
        throw 'npm install failed'
      }
      Write-Host '✅ Dependencies installed' -ForegroundColor Green
      Write-Host ''

      # Step 3: Build project
      Write-Host '🔨 Building project...' -ForegroundColor Blue
      npm run build
      if (\$LASTEXITCODE -ne 0) {
        throw 'Build failed'
      }
      Write-Host '✅ Build successful' -ForegroundColor Green
      Write-Host ''

      # Step 4: Stop service
      Write-Host '🛑 Stopping service...' -ForegroundColor Blue
      & '${NSSM_PATH}' stop '${SERVICE_NAME}'
      Start-Sleep -Seconds 3
      Write-Host '✅ Service stopped' -ForegroundColor Green
      Write-Host ''

      # Step 5: Start service
      Write-Host '▶️  Starting service...' -ForegroundColor Blue
      & '${NSSM_PATH}' start '${SERVICE_NAME}'
      Start-Sleep -Seconds 3

      # Step 6: Check service status
      \$status = & '${NSSM_PATH}' status '${SERVICE_NAME}'
      if (\$status -eq 'SERVICE_RUNNING') {
        Write-Host '✅ Service is running' -ForegroundColor Green
      } else {
        Write-Host '⚠️  Service status: ' + \$status -ForegroundColor Yellow
      }
      Write-Host ''

      Write-Host '=== Deployment Complete ===' -ForegroundColor Cyan
      Write-Host ''

    } catch {
      Write-Host ''
      Write-Host '❌ Deployment failed: ' + \$_.Exception.Message -ForegroundColor Red
      Write-Host ''
      exit 1
    }
  \""

  # Check if deployment succeeded
  if [ $? -eq 0 ]; then
    echo ""
    log_success "Deployment successful!"
    log_info "Server should be accessible at http://${SERVER_HOST}:3000"
    echo ""
  else
    echo ""
    log_error "Deployment failed. Check logs on server for details."
    echo ""
    exit 1
  fi
}

# Main execution
echo ""
echo "🚀 proPACE Windows Server Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Server: ${SERVER_USER}@${SERVER_HOST}"
echo "Path:   ${SERVER_PATH}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Confirm before deploying
read -p "Continue with deployment? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  deploy
else
  log_warning "Deployment cancelled"
  exit 0
fi
