#!/bin/bash
# Remote Deployment Script for Windows
# Deploy proPACE from Mac to Windows machine via SSH

set -e

# Configuration
WINDOWS_USER="${WINDOWS_USER:-ajesc}"
WINDOWS_HOST="${WINDOWS_HOST:-192.168.1.100}"  # Change to your Windows IP
WINDOWS_PATH="${WINDOWS_PATH:-C:/proPace}"
SSH_PORT="${SSH_PORT:-22}"

echo ""
echo "=== proPACE Windows Remote Deployment ==="
echo ""
echo "Target: $WINDOWS_USER@$WINDOWS_HOST:$WINDOWS_PATH"
echo ""

# Check if SSH connection works
echo "[1/5] Testing SSH connection..."
if ! ssh -p "$SSH_PORT" -o ConnectTimeout=5 "$WINDOWS_USER@$WINDOWS_HOST" "echo Connected successfully"; then
    echo "ERROR: Cannot connect to Windows machine via SSH"
    echo ""
    echo "Please ensure:"
    echo "  1. OpenSSH Server is running on Windows"
    echo "  2. Firewall allows port $SSH_PORT"
    echo "  3. WINDOWS_HOST is set correctly: export WINDOWS_HOST=<your-windows-ip>"
    echo ""
    exit 1
fi
echo "✓ SSH connection successful"
echo ""

# Sync files (excluding node_modules, dist, etc.)
echo "[2/5] Syncing files to Windows..."
rsync -avz --progress \
    --exclude 'node_modules/' \
    --exclude 'dist/' \
    --exclude '.git/' \
    --exclude 'logs/' \
    --exclude 'data/' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    ./ "$WINDOWS_USER@$WINDOWS_HOST:$WINDOWS_PATH/"

echo "✓ Files synced"
echo ""

# Run rebuild script on Windows
echo "[3/5] Running rebuild script on Windows..."
ssh -p "$SSH_PORT" "$WINDOWS_USER@$WINDOWS_HOST" "cd $WINDOWS_PATH && scripts\\rebuild-windows.cmd"

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Rebuild failed on Windows"
    echo "Check the output above for errors"
    exit 1
fi

echo "✓ Rebuild complete"
echo ""

# Check if server is running
echo "[4/5] Checking if server is running..."
SERVER_RUNNING=$(ssh -p "$SSH_PORT" "$WINDOWS_USER@$WINDOWS_HOST" "tasklist /FI \"IMAGENAME eq node.exe\" 2>NUL | find /I \"node.exe\" >NUL && echo yes || echo no")

if [ "$SERVER_RUNNING" = "yes" ]; then
    echo "Server is already running. Restarting..."
    ssh -p "$SSH_PORT" "$WINDOWS_USER@$WINDOWS_HOST" "cd $WINDOWS_PATH && taskkill /F /IM node.exe >NUL 2>&1 || true"
    sleep 2
fi

# Start server in background
echo "[5/5] Starting server on Windows..."
ssh -p "$SSH_PORT" "$WINDOWS_USER@$WINDOWS_HOST" "cd $WINDOWS_PATH && start /B npm start > logs\\server.log 2>&1"

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "Server is running on Windows at: ws://$WINDOWS_HOST:9001"
echo ""
echo "View logs:"
echo "  ssh $WINDOWS_USER@$WINDOWS_HOST \"type $WINDOWS_PATH\\logs\\server.log\""
echo ""
echo "Stop server:"
echo "  ssh $WINDOWS_USER@$WINDOWS_HOST \"taskkill /F /IM node.exe\""
echo ""
