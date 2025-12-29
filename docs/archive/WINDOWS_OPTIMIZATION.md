# Windows 11 Pro Server Optimization Guide

Guide to remove bloatware and optimize Windows 11 Pro for running proPACE as a dedicated server.

## ⚠️ Important Warning

- **Create a system restore point** before making any changes
- **Back up important data**
- Some optimizations may affect Windows Update or Microsoft Store functionality
- Test each change and verify proPACE still works correctly

---

## Quick Start: Automated Debloat Script

### Option 1: Windows11Debloat Script (Recommended)

The safest and most comprehensive automated solution.

1. **Download the script**
   ```powershell
   # Run PowerShell as Administrator
   irm https://christitus.com/win | iex
   ```

2. **In the GUI tool that opens:**
   - Click **"Remove All Bloatware"**
   - Click **"Disable Telemetry"**
   - Click **"Disable Cortana"**
   - Click **"Remove OneDrive"** (if you don't use it)
   - Click **"Install Essential Tweaks"**
   - **DON'T** disable Windows Defender (needed for security)
   - **DON'T** disable Windows Update (needed for security patches)

3. **Reboot after completion**

### Option 2: Manual Removal (More Control)

See sections below for manual step-by-step removal.

---

## Manual Debloating - Step by Step

### Step 1: Remove Built-in Apps

#### Remove Pre-installed Apps

```powershell
# Run PowerShell as Administrator

# Get list of all installed apps
Get-AppxPackage | Select Name, PackageFullName

# Remove specific bloatware apps
# Safe to remove for a server:

# Xbox apps
Get-AppxPackage *Xbox* | Remove-AppxPackage

# Gaming services
Get-AppxPackage *GamingApp* | Remove-AppxPackage
Get-AppxPackage *GamingServices* | Remove-AppxPackage

# Mixed Reality
Get-AppxPackage *MixedReality* | Remove-AppxPackage

# 3D Viewer
Get-AppxPackage *3DBuilder* | Remove-AppxPackage
Get-AppxPackage *3DViewer* | Remove-AppxPackage

# Maps
Get-AppxPackage *Maps* | Remove-AppxPackage

# Messaging and communication
Get-AppxPackage *Messaging* | Remove-AppxPackage
Get-AppxPackage *Skype* | Remove-AppxPackage
Get-AppxPackage *YourPhone* | Remove-AppxPackage
Get-AppxPackage *People* | Remove-AppxPackage

# Music/Video
Get-AppxPackage *ZuneMusic* | Remove-AppxPackage
Get-AppxPackage *ZuneVideo* | Remove-AppxPackage
Get-AppxPackage *Music* | Remove-AppxPackage

# Office Hub
Get-AppxPackage *OfficeHub* | Remove-AppxPackage
Get-AppxPackage *Solitaire* | Remove-AppxPackage

# Feedback
Get-AppxPackage *Feedback* | Remove-AppxPackage

# Get Help
Get-AppxPackage *GetHelp* | Remove-AppxPackage

# Tips
Get-AppxPackage *Getstarted* | Remove-AppxPackage

# Weather
Get-AppxPackage *Weather* | Remove-AppxPackage

# News
Get-AppxPackage *News* | Remove-AppxPackage

# Alarms
Get-AppxPackage *Alarms* | Remove-AppxPackage

# Camera (if no webcam needed)
Get-AppxPackage *Camera* | Remove-AppxPackage

# Voice Recorder
Get-AppxPackage *SoundRecorder* | Remove-AppxPackage

# Paint 3D
Get-AppxPackage *Paint3D* | Remove-AppxPackage

# Sticky Notes
Get-AppxPackage *StickyNotes* | Remove-AppxPackage

# Windows Widgets
Get-AppxPackage *WebExperience* | Remove-AppxPackage
```

#### Apps to KEEP (Important)

```powershell
# DO NOT REMOVE these (required for system functionality):
# - Microsoft.WindowsStore (Microsoft Store)
# - Microsoft.Windows.Photos (if you need to view images)
# - Microsoft.WindowsCalculator (useful for quick calcs)
# - Microsoft.MicrosoftEdge.Stable (default browser, useful for admin tasks)
# - Microsoft.VCLibs* (Visual C++ libraries, required by many apps)
# - Microsoft.NET.* (Required by many applications)
# - Microsoft.UI.Xaml* (Required by modern UI apps)
```

### Step 2: Disable Unnecessary Services

```powershell
# Run PowerShell as Administrator

# Disable Xbox services
Stop-Service -Name XblAuthManager -Force
Set-Service -Name XblAuthManager -StartupType Disabled

Stop-Service -Name XblGameSave -Force
Set-Service -Name XblGameSave -StartupType Disabled

Stop-Service -Name XboxGipSvc -Force
Set-Service -Name XboxGipSvc -StartupType Disabled

Stop-Service -Name XboxNetApiSvc -Force
Set-Service -Name XboxNetApiSvc -StartupType Disabled

# Disable Windows Search (if you don't need it - saves RAM)
# WARNING: This will disable file search in Start Menu
Stop-Service -Name WSearch -Force
Set-Service -Name WSearch -StartupType Disabled

# Disable Superfetch/SysMain (can improve SSD performance)
Stop-Service -Name SysMain -Force
Set-Service -Name SysMain -StartupType Disabled

# Disable Connected User Experiences (telemetry)
Stop-Service -Name DiagTrack -Force
Set-Service -Name DiagTrack -StartupType Disabled

# Disable Windows Error Reporting
Stop-Service -Name WerSvc -Force
Set-Service -Name WerSvc -StartupType Disabled

# Disable HomeGroup services (deprecated anyway)
Stop-Service -Name HomeGroupListener -Force -ErrorAction SilentlyContinue
Set-Service -Name HomeGroupListener -StartupType Disabled -ErrorAction SilentlyContinue

Stop-Service -Name HomeGroupProvider -Force -ErrorAction SilentlyContinue
Set-Service -Name HomeGroupProvider -StartupType Disabled -ErrorAction SilentlyContinue

# Disable Bluetooth (if not needed)
Stop-Service -Name bthserv -Force
Set-Service -Name bthserv -StartupType Disabled

# Disable Print Spooler (if no printer)
Stop-Service -Name Spooler -Force
Set-Service -Name Spooler -StartupType Disabled

# Disable Fax service (if not needed)
Stop-Service -Name Fax -Force -ErrorAction SilentlyContinue
Set-Service -Name Fax -StartupType Disabled -ErrorAction SilentlyContinue
```

### Step 3: Disable Startup Programs

```powershell
# Open Task Manager
# Ctrl+Shift+Esc → Startup tab
# Disable unnecessary startup programs

# Or use PowerShell:
Get-CimInstance -ClassName Win32_StartupCommand | Select-Object Name, Command, Location
```

Disable these common bloatware startup items:
- OneDrive
- Microsoft Teams
- Cortana
- Xbox Game Bar
- Any OEM software (Dell, HP, Lenovo utilities)

### Step 4: Disable Telemetry and Privacy Settings

```powershell
# Run as Administrator

# Disable telemetry
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection" -Name "AllowTelemetry" -Type DWord -Value 0
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection" -Name "AllowTelemetry" -Type DWord -Value 0

# Disable advertising ID
Set-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo" -Name "Enabled" -Type DWord -Value 0

# Disable activity history
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\System" -Name "PublishUserActivities" -Type DWord -Value 0
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\System" -Name "UploadUserActivities" -Type DWord -Value 0

# Disable location tracking
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location" -Name "Value" -Type String -Value "Deny"

# Disable feedback notifications
Set-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Siuf\Rules" -Name "NumberOfSIUFInPeriod" -Type DWord -Value 0

# Disable Windows Tips
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent" -Name "DisableSoftLanding" -Type DWord -Value 1
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent" -Name "DisableWindowsSpotlightFeatures" -Type DWord -Value 1

# Disable Cortana
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search" -Name "AllowCortana" -Type DWord -Value 0
```

### Step 5: Disable Visual Effects (Improve Performance)

```powershell
# Disable animations and visual effects for better performance

# Via GUI:
# 1. Right-click "This PC" → Properties
# 2. Advanced system settings → Performance Settings
# 3. Select "Adjust for best performance"
# 4. Or manually uncheck unwanted effects

# Via Registry:
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop" -Name "UserPreferencesMask" -Type Binary -Value ([byte[]](0x90,0x12,0x03,0x80,0x10,0x00,0x00,0x00))
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop\WindowMetrics" -Name "MinAnimate" -Type String -Value "0"
```

### Step 6: Disable Windows Features

```powershell
# Disable unnecessary Windows features

# Internet Explorer 11 (deprecated)
Disable-WindowsOptionalFeature -Online -FeatureName Internet-Explorer-Optional-amd64 -NoRestart

# Windows Media Player (if not needed)
Disable-WindowsOptionalFeature -Online -FeatureName WindowsMediaPlayer -NoRestart

# Work Folders Client (if not used)
Disable-WindowsOptionalFeature -Online -FeatureName WorkFolders-Client -NoRestart

# XPS Services (if you don't use XPS documents)
Disable-WindowsOptionalFeature -Online -FeatureName Printing-XPSServices-Features -NoRestart
```

### Step 7: Disable OneDrive

```powershell
# Uninstall OneDrive completely

# Stop OneDrive
taskkill /f /im OneDrive.exe

# Uninstall OneDrive
if (Test-Path "$env:systemroot\System32\OneDriveSetup.exe") {
    & "$env:systemroot\System32\OneDriveSetup.exe" /uninstall
}
if (Test-Path "$env:systemroot\SysWOW64\OneDriveSetup.exe") {
    & "$env:systemroot\SysWOW64\OneDriveSetup.exe" /uninstall
}

# Remove OneDrive leftovers
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:localappdata\Microsoft\OneDrive"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:programdata\Microsoft OneDrive"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "C:\OneDriveTemp"

# Remove OneDrive from explorer sidebar
New-PSDrive -PSProvider "Registry" -Root "HKEY_CLASSES_ROOT" -Name "HKCR"
Remove-Item -Path "HKCR:\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}" -Recurse -ErrorAction SilentlyContinue
Remove-Item -Path "HKCR:\Wow6432Node\CLSID\{018D5C66-4533-4307-9B53-224DE2ED1FE6}" -Recurse -ErrorAction SilentlyContinue
```

---

## Performance Optimizations for Server

### Optimize Power Settings

```powershell
# Set power plan to High Performance
powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c

# Disable sleep and hibernation
powercfg -change -monitor-timeout-ac 0
powercfg -change -standby-timeout-ac 0
powercfg -change -hibernate-timeout-ac 0
powercfg -h off
```

### Optimize Network Settings

```powershell
# Disable Large Send Offload (if you have network issues)
# Get-NetAdapterAdvancedProperty -Name "Ethernet" -DisplayName "*Large Send*" | Set-NetAdapterAdvancedProperty -RegistryValue 0

# Enable auto-tuning
netsh int tcp set global autotuninglevel=normal

# Enable RSS (Receive Side Scaling)
Enable-NetAdapterRss -Name "Ethernet"
```

### Disable Windows Defender Real-Time Scanning (Optional, Not Recommended)

**⚠️ Only if you have another antivirus or understand the security implications**

```powershell
# Disable Windows Defender
Set-MpPreference -DisableRealtimeMonitoring $true

# Add proPACE folder to exclusions instead (better approach):
Add-MpPreference -ExclusionPath "C:\proPACE"
```

### Clean Up Disk Space

```powershell
# Run Disk Cleanup
cleanmgr /sageset:1
cleanmgr /sagerun:1

# Clean Windows Update cache
Stop-Service wuauserv
Remove-Item C:\Windows\SoftwareDistribution\Download\* -Recurse -Force
Start-Service wuauserv

# Clean Temp files
Remove-Item $env:TEMP\* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item C:\Windows\Temp\* -Recurse -Force -ErrorAction SilentlyContinue

# Disable hibernation (saves ~8GB on disk)
powercfg -h off
```

---

## Complete Optimization Script

Save this as `optimize-windows.ps1` and run as Administrator:

```powershell
#Requires -RunAsAdministrator

Write-Host "Windows 11 Server Optimization Script for proPACE" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Create restore point
Write-Host "Creating system restore point..." -ForegroundColor Yellow
Checkpoint-Computer -Description "Before proPACE optimization" -RestorePointType "MODIFY_SETTINGS"

# Remove bloatware
Write-Host "Removing bloatware apps..." -ForegroundColor Green
$bloatware = @(
    "*Xbox*"
    "*GamingApp*"
    "*MixedReality*"
    "*3DBuilder*"
    "*Maps*"
    "*Messaging*"
    "*YourPhone*"
    "*ZuneMusic*"
    "*ZuneVideo*"
    "*OfficeHub*"
    "*Solitaire*"
    "*Feedback*"
    "*GetHelp*"
    "*Getstarted*"
    "*Weather*"
    "*Alarms*"
    "*SoundRecorder*"
    "*Paint3D*"
)

foreach ($app in $bloatware) {
    Get-AppxPackage $app | Remove-AppxPackage -ErrorAction SilentlyContinue
}

# Disable services
Write-Host "Disabling unnecessary services..." -ForegroundColor Green
$services = @(
    "XblAuthManager"
    "XblGameSave"
    "XboxGipSvc"
    "XboxNetApiSvc"
    "DiagTrack"
    "WerSvc"
)

foreach ($service in $services) {
    Stop-Service -Name $service -Force -ErrorAction SilentlyContinue
    Set-Service -Name $service -StartupType Disabled -ErrorAction SilentlyContinue
}

# Disable telemetry
Write-Host "Disabling telemetry..." -ForegroundColor Green
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection" -Name "AllowTelemetry" -Type DWord -Value 0 -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection" -Name "AllowTelemetry" -Type DWord -Value 0 -ErrorAction SilentlyContinue

# Set power plan
Write-Host "Setting High Performance power plan..." -ForegroundColor Green
powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
powercfg -h off

# Add proPACE to Windows Defender exclusions
Write-Host "Adding proPACE to Windows Defender exclusions..." -ForegroundColor Green
Add-MpPreference -ExclusionPath "C:\proPACE" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ Optimization complete!" -ForegroundColor Green
Write-Host "Please reboot your computer for all changes to take effect." -ForegroundColor Yellow
Write-Host ""

Read-Host "Press Enter to exit"
```

---

## After Optimization Checklist

- [ ] Reboot the system
- [ ] Verify Windows is still stable
- [ ] Test proPACE installation
- [ ] Verify SSH still works
- [ ] Check network connectivity
- [ ] Ensure Windows Update still functions (important for security)

---

## Recommended Tools

### Monitoring & Cleanup

- **Process Explorer** (https://docs.microsoft.com/sysinternals/downloads/process-explorer)
  - Better than Task Manager for identifying resource usage

- **WinDirStat** (https://windirstat.net/)
  - Visualize disk space usage

- **CCleaner** (https://www.ccleaner.com/)
  - Clean temporary files and registry (use with caution)

### Debloat Tools

- **Windows11Debloat** (https://github.com/Raphire/Win11Debloat)
  - GUI tool for removing bloatware

- **O&O ShutUp10++** (https://www.oo-software.com/en/shutup10)
  - Privacy configuration tool

---

## What NOT to Disable

**DO NOT disable these (required for proPACE server):**

- ✅ Windows Update (security patches)
- ✅ Windows Defender (unless you have alternative antivirus)
- ✅ Network services (obviously needed for server)
- ✅ SSH Server (needed for remote deployment)
- ✅ Windows Firewall (security)
- ✅ DNS Client
- ✅ DHCP Client (if using DHCP)
- ✅ Event Log (useful for debugging)
- ✅ Task Scheduler (needed for automated tasks)

---

## Reverting Changes

If you experience issues after optimization:

1. **Restore from System Restore Point**
   ```powershell
   rstrui.exe
   ```

2. **Re-enable a service**
   ```powershell
   Set-Service -Name ServiceName -StartupType Automatic
   Start-Service -Name ServiceName
   ```

3. **Reinstall an app**
   ```powershell
   Get-AppxPackage -AllUsers | Where-Object {$_.Name -like "*AppName*"} | ForEach-Object {Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\AppxManifest.xml"}
   ```

---

## Performance Impact

After optimization, you should see:

- **RAM usage**: Reduced by 500MB - 1.5GB
- **Disk space**: Freed up 2-5GB
- **Boot time**: 10-30% faster
- **Background processes**: Reduced by 20-40%
- **Network latency**: Potential 5-10% improvement

**Perfect for running proPACE as a dedicated server!**
