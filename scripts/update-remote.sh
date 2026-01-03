#!/bin/bash
# Update proPACE on remote Windows server (handles package-lock conflicts)

# Configuration
SERVER_USER="${SERVER_USER:-ajesc}"
SERVER_HOST="${SERVER_HOST:-10.0.0.69}"

echo "🔄 Updating proPACE on ${SERVER_HOST}..."
echo "⚠️  You will be prompted for the Windows password"
echo ""

# Upload the update script
echo "📤 Uploading update script..."
scp -o PreferredAuthentications=password scripts/update-and-rebuild.ps1 "${SERVER_USER}@${SERVER_HOST}:C:/proPACE/scripts/"

if [ $? -ne 0 ]; then
    echo "❌ Failed to upload script"
    exit 1
fi

# Execute update script on remote server
echo "🔨 Running update script on remote server..."
echo "   (This may take a few minutes - installing werift, building TypeScript)"
echo ""
ssh -o PreferredAuthentications=password "${SERVER_USER}@${SERVER_HOST}" "cd C:/proPACE && powershell -ExecutionPolicy Bypass -File scripts/update-and-rebuild.ps1"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Update complete!"
    echo ""
    echo "What changed:"
    echo "  • Migrated from wrtc → werift (Node.js 24 compatible)"
    echo "  • WebRTC voice features now work on Node 24"
    echo "  • No native compilation required"
    echo ""
    echo "🧪 Test the voice interface:"
    echo "  1. Open http://10.0.0.69:3000 in your browser"
    echo "  2. Send a message to PACE"
    echo "  3. You should hear the TTS audio response"
    echo "  4. Check console: run checkVoice() - should show webrtcInit: true"
else
    echo ""
    echo "❌ Update failed. Check the output above for details."
    exit 1
fi
