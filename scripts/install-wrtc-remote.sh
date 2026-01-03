#!/bin/bash
# Install wrtc package on remote Windows server

# Configuration
SERVER_USER="${SERVER_USER:-CDN4LIFE}"
SERVER_HOST="${SERVER_HOST:-10.0.0.69}"

echo "📦 Installing wrtc package on ${SERVER_HOST}..."
echo "⚠️  You will be prompted for the Windows password"
echo ""

# Upload the install script
echo "📤 Uploading install script..."
scp -o PreferredAuthentications=password scripts/install-wrtc-windows.ps1 "${SERVER_USER}@${SERVER_HOST}:C:/proPACE/scripts/"

if [ $? -ne 0 ]; then
    echo "❌ Failed to upload script"
    exit 1
fi

# Execute install script on remote server
echo "🔨 Running install script on remote server..."
echo "   (This may take several minutes - wrtc requires native compilation)"
echo ""
ssh -o PreferredAuthentications=password "${SERVER_USER}@${SERVER_HOST}" "cd C:/proPACE && powershell -ExecutionPolicy Bypass -File scripts/install-wrtc-windows.ps1"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Installation complete!"
    echo ""
    echo "Next steps:"
    echo "1. Restart the proPACE service"
    echo "2. Refresh the browser and test voice interface"
else
    echo ""
    echo "❌ Installation failed. Check the output above for details."
    exit 1
fi
