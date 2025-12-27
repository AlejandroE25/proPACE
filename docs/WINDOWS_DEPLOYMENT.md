# proPACE Windows Server Deployment Guide

Complete guide for deploying proPACE to a Windows server with remote update capabilities.

## Prerequisites

### On Windows Server
- Windows 10/11 or Windows Server 2019+
- Node.js 20+ LTS
- Git for Windows
- OpenSSH Server (for remote deployment)
- Administrator access

### On Development Machine (Mac)
- SSH client (built-in on macOS)
- Git

---

## Part 1: Initial Manual Installation on Windows Server

### Step 1: Install Required Software

1. **Install Node.js**
   ```powershell
   # Download from https://nodejs.org (LTS version)
   # Run installer, accept defaults
   # Verify installation:
   node --version  # Should show v20+
   npm --version
   ```

2. **Install Git for Windows**
   ```powershell
   # Download from https://git-scm.com/download/win
   # Run installer, accept defaults
   # Verify:
   git --version
   ```

3. **Enable OpenSSH Server** (for remote deployment)
   ```powershell
   # Run PowerShell as Administrator
   Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
   Start-Service sshd
   Set-Service -Name sshd -StartupType 'Automatic'

   # Confirm firewall rule
   New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' `
     -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
   ```

### Step 2: Clone and Setup proPACE

1. **Clone repository** (choose installation directory, e.g., `C:\proPACE`)
   ```powershell
   cd C:\
   git clone https://github.com/AlejandroE25/proPACE.git
   cd proPACE
   ```

2. **Install dependencies**
   ```powershell
   npm install
   ```

3. **Create production environment file**
   ```powershell
   # Copy example
   copy .env.example .env

   # Edit .env with your API keys
   notepad .env
   ```

   Required variables:
   ```env
   ANTHROPIC_API_KEY=your_anthropic_key_here
   OPENAI_API_KEY=your_openai_key_here
   PORT=3000
   ENABLE_VOICE=true
   ```

4. **Build the project**
   ```powershell
   npm run build
   ```

5. **Test run**
   ```powershell
   npm start
   ```
   Open browser to http://localhost:3000 to verify it works. Press Ctrl+C to stop.

### Step 3: Install wrtc Package (for WebRTC TTS)

The WebRTC TTS functionality requires the `wrtc` package with native dependencies.

1. **Install Visual Studio Build Tools**
   ```powershell
   # Download from: https://visualstudio.microsoft.com/downloads/
   # Select "Desktop development with C++" workload during installation

   # Or use chocolatey (if installed):
   choco install visualstudio2022buildtools `
     --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools"
   ```

2. **Install Python** (required by node-gyp)
   ```powershell
   # Download from https://www.python.org/downloads/
   # Or use chocolatey:
   choco install python3
   ```

3. **Install wrtc package**
   ```powershell
   cd C:\proPACE
   npm install wrtc
   ```

   If installation fails:
   ```powershell
   npm install --global windows-build-tools
   npm install wrtc --build-from-source
   ```

---

## Part 2: Running as a Windows Service

### Using NSSM (Non-Sucking Service Manager) - Recommended

1. **Download NSSM**
   - Visit https://nssm.cc/download
   - Download the latest version (e.g., nssm-2.24.zip)
   - Extract to `C:\nssm`

2. **Create service**
   ```powershell
   # Run PowerShell as Administrator
   cd C:\nssm\win64  # or win32 for 32-bit Windows

   # Install service
   .\nssm.exe install proPACE

   # A GUI will open. Configure:
   # Path: C:\Program Files\nodejs\node.exe
   # Startup directory: C:\proPACE
   # Arguments: dist\main.js

   # OR use command line:
   .\nssm.exe install proPACE "C:\Program Files\nodejs\node.exe" "dist\main.js"
   .\nssm.exe set proPACE AppDirectory C:\proPACE
   .\nssm.exe set proPACE DisplayName "proPACE AI Assistant"
   .\nssm.exe set proPACE Description "proPACE AI Assistant Server with WebRTC TTS"

   # Configure logging
   .\nssm.exe set proPACE AppStdout C:\proPACE\logs\service-out.log
   .\nssm.exe set proPACE AppStderr C:\proPACE\logs\service-error.log

   # Configure automatic restart
   .\nssm.exe set proPACE AppExit Default Restart

   # Start service
   .\nssm.exe start proPACE
   ```

3. **Manage service**
   ```powershell
   # Check status
   C:\nssm\win64\nssm.exe status proPACE

   # Stop service
   C:\nssm\win64\nssm.exe stop proPACE

   # Restart service
   C:\nssm\win64\nssm.exe restart proPACE

   # Remove service (if needed)
   C:\nssm\win64\nssm.exe remove proPACE confirm
   ```

---

## Part 3: Remote Deployment from Mac

### Option A: Git-Based Deployment (Recommended & Simplest)

This approach pulls changes directly on the server via SSH.

1. **Create deployment script on Mac** (`deploy-windows.sh`)
   ```bash
   #!/bin/bash

   # ===== CONFIGURATION =====
   # Edit these values for your server
   SERVER_USER="your_windows_username"
   SERVER_HOST="192.168.1.100"  # Your server IP or domain
   SERVER_PATH="C:/proPACE"
   NSSM_PATH="C:/nssm/win64/nssm.exe"
   SERVICE_NAME="proPACE"
   # =========================

   echo "🚀 Deploying proPACE to Windows server at ${SERVER_HOST}..."

   # SSH into server and run deployment commands
   ssh "${SERVER_USER}@${SERVER_HOST}" "powershell -Command \"
     Set-Location '${SERVER_PATH}'

     Write-Host '📥 Pulling latest changes from Git...'
     git pull origin main

     Write-Host '📦 Installing dependencies...'
     npm install

     Write-Host '🔨 Building project...'
     npm run build

     Write-Host '🛑 Stopping service...'
     & '${NSSM_PATH}' stop '${SERVICE_NAME}'
     Start-Sleep -Seconds 3

     Write-Host '▶️  Starting service...'
     & '${NSSM_PATH}' start '${SERVICE_NAME}'
     Start-Sleep -Seconds 2

     Write-Host '✅ Checking service status...'
     & '${NSSM_PATH}' status '${SERVICE_NAME}'

     Write-Host ''
     Write-Host '✅ Deployment complete!'
   \""

   if [ $? -eq 0 ]; then
     echo "✅ Deployment successful!"
   else
     echo "❌ Deployment failed. Check logs on server."
     exit 1
   fi
   ```

2. **Make executable and configure**
   ```bash
   chmod +x deploy-windows.sh

   # Edit the script to add your server details
   nano deploy-windows.sh
   # Update: SERVER_USER, SERVER_HOST
   ```

3. **Deploy**
   ```bash
   ./deploy-windows.sh
   ```

### Option B: Deploy with Status Check

Enhanced script that checks service health after deployment.

1. **Create `deploy-windows-safe.sh`**
   ```bash
   #!/bin/bash

   # Configuration
   SERVER_USER="your_windows_username"
   SERVER_HOST="192.168.1.100"
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

     # Install and build
     Write-Host '📦 Installing dependencies...'
     npm install
     if (\$LASTEXITCODE -ne 0) {
       Write-Error 'npm install failed!'
       exit 1
     }

     Write-Host '🔨 Building...'
     npm run build
     if (\$LASTEXITCODE -ne 0) {
       Write-Error 'Build failed!'
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
   ```

### SSH Key Setup (Recommended)

Avoid entering password for each deployment:

1. **On Mac, generate SSH key** (if you don't have one)
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   # Press Enter to accept default location
   # Press Enter twice for no passphrase (or set one)
   ```

2. **Copy public key to Windows server**
   ```bash
   # Method 1: Manual copy
   cat ~/.ssh/id_ed25519.pub
   # Copy the output

   # On Windows server, create/edit authorized_keys:
   # C:\Users\YourUsername\.ssh\authorized_keys
   # Paste the public key there

   # Method 2: Using ssh-copy-id (if available)
   ssh-copy-id user@server
   ```

3. **Test connection**
   ```bash
   ssh user@server
   # Should connect without password
   ```

---

## Part 4: Firewall Configuration

### Allow Incoming Connections

```powershell
# Run as Administrator

# Allow HTTP (port 3000)
New-NetFirewallRule -DisplayName "proPACE HTTP" `
  -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

# If using different port, adjust:
# New-NetFirewallRule -DisplayName "proPACE HTTP" `
#   -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow

# Allow SSH (if not already allowed)
New-NetFirewallRule -DisplayName "OpenSSH Server" `
  -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow
```

---

## Part 5: Monitoring and Logs

### View Service Logs

**NSSM logs** (stdout/stderr):
```powershell
# View real-time logs
Get-Content C:\proPACE\logs\service-out.log -Tail 50 -Wait

# View error logs
Get-Content C:\proPACE\logs\service-error.log -Tail 50 -Wait
```

**Application logs**:
```powershell
# proPACE application logs
Get-Content C:\proPACE\logs\propace.log -Tail 50 -Wait
```

### Check Service Status

```powershell
# Windows Services
Get-Service proPACE

# NSSM status
C:\nssm\win64\nssm.exe status proPACE

# Check if process is running
Get-Process node
```

### Monitor from Mac

```bash
# SSH and check logs
ssh user@server "powershell -Command 'Get-Content C:\proPACE\logs\propace.log -Tail 20'"

# Check service status
ssh user@server "powershell -Command 'C:\nssm\win64\nssm.exe status proPACE'"

# Test HTTP endpoint
curl http://your-server:3000
```

---

## Part 6: Troubleshooting

### Issue: SSH Connection Refused

**Solution**:
```powershell
# On Windows server, ensure SSH is running
Get-Service sshd
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# Check firewall
Get-NetFirewallRule -DisplayName "*SSH*"
```

### Issue: Permission Denied on Deployment

**Solution**:
- Ensure Windows user has write permissions to `C:\proPACE`
- Run PowerShell as Administrator for service commands

### Issue: Service Won't Start

**Solution**:
```powershell
# Check logs
Get-Content C:\proPACE\logs\service-error.log -Tail 50

# Verify build succeeded
cd C:\proPACE
npm run build

# Test manual start
node dist\main.js

# If works manually, restart service
C:\nssm\win64\nssm.exe restart proPACE
```

### Issue: wrtc Package Installation Fails

**Solution**:
```powershell
# Ensure build tools are installed
npm install --global windows-build-tools

# Rebuild wrtc
npm rebuild wrtc --build-from-source

# If still fails, check:
# - Visual Studio Build Tools with C++ workload installed
# - Python 3 installed and in PATH
# - Run PowerShell as Administrator
```

### Issue: Port Already in Use

**Solution**:
```powershell
# Find process using port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess

# Kill the process
Stop-Process -Id <PID> -Force

# Or change port in .env file
```

---

## Quick Reference

### Deployment Commands (from Mac)

```bash
# Deploy latest changes
./deploy-windows.sh

# SSH into server
ssh user@server

# Check service status remotely
ssh user@server "powershell -Command 'C:\nssm\win64\nssm.exe status proPACE'"

# View logs remotely
ssh user@server "powershell -Command 'Get-Content C:\proPACE\logs\propace.log -Tail 20'"
```

### Server Management Commands (on Windows)

```powershell
# Navigate to project
cd C:\proPACE

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Build
npm run build

# Restart service
C:\nssm\win64\nssm.exe restart proPACE

# Check service status
C:\nssm\win64\nssm.exe status proPACE

# View logs
Get-Content logs\propace.log -Tail 50 -Wait
```

---

## Security Best Practices

1. **Use SSH keys** instead of passwords for authentication
2. **Restrict SSH access** - Configure firewall to only allow your IP
3. **Keep .env secure** - Never commit to git, set proper file permissions
4. **Use HTTPS** - Set up reverse proxy (IIS/nginx) with SSL certificate
5. **Regular updates** - Keep Windows, Node.js, and dependencies updated
6. **Strong passwords** - Use strong Windows user password
7. **Disable unnecessary services** - Only run what you need

---

## Next Steps

1. ✅ Complete manual installation on Windows server
2. ✅ Set up NSSM Windows service
3. ✅ Configure SSH for remote access
4. ✅ Create and test deployment script on Mac
5. ✅ Set up firewall rules
6. ⬜ Configure monitoring/alerting (optional)
7. ⬜ Set up automated backups (optional)
8. ⬜ Configure HTTPS with reverse proxy (optional)

---

For more information, see:
- [Main README](../README.md)
- [CLAUDE.md](../CLAUDE.md) - Architecture documentation
- [DEPLOYMENT.md](../DEPLOYMENT.md) - General deployment guide
