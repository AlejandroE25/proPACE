#!/bin/bash

# Configuration
SERVER_USER="ajesc"
SERVER_HOST="10.0.0.69"
SERVER_PATH="C:/proPACE"
NSSM_PATH="C:/nssm/win64/nssm.exe"
SERVICE_NAME="proPACE"
PORT=3000

echo "🚀 Safe deployment to Windows server..."

# Pre-deployment check
echo "🔍 Checking current service status..."
ssh "${SERVER_USER}@${SERVER_HOST}" "powershell -Command \"& '${NSSM_PATH}' status '${SERVICE_NAME}'\""

# Deploy
ssh "${SERVER_USER}@${SERVER_HOST}" "powershell -Command \"
  Set-Location '${SERVER_PATH}'

  # Pull changes
  Write-Host '📥 Pulling latest changes...'
  git pull origin main
  if (\$LASTEXITCODE -ne 0) {
    Write-Error 'Git pull failed!'
    exit 1
  }

  # Use rebuild script instead of manual install/build
  Write-Host '🔨 Running rebuild script...'
  & '.\\scripts\\rebuild-windows.cmd'
  if (\$LASTEXITCODE -ne 0) {
    Write-Error 'Rebuild failed!'
    exit 1
  }

  # Restart service
  Write-Host '🔄 Restarting service...'
  & '${NSSM_PATH}' restart '${SERVICE_NAME}'
  Start-Sleep -Seconds 5

  # Verify service is running
  \$status = & '${NSSM_PATH}' status '${SERVICE_NAME}'
  if (\$status -ne 'SERVICE_RUNNING') {
    Write-Error 'Service failed to start!'
    exit 1
  }

  Write-Host '✅ Service is running'
\""

if [ $? -eq 0 ]; then
  echo "✅ Deployment successful!"
  echo "🌐 Server should be accessible at http://${SERVER_HOST}:${PORT}"
else
  echo "❌ Deployment failed!"
  exit 1
fi
