# Piper TTS Installation Guide

Piper is a fast, local neural text-to-speech system that replaces OpenAI's TTS API for low-latency audio generation.

## Installation on Remote Server

### Windows (PowerShell)

```powershell
# Create directories
New-Item -ItemType Directory -Force -Path "C:\Program Files\Piper"
New-Item -ItemType Directory -Force -Path "C:\Program Files\Piper\voices"

# Download Piper for Windows
$piperUrl = "https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_windows_amd64.zip"
Invoke-WebRequest -Uri $piperUrl -OutFile "$env:TEMP\piper.zip"

# Extract
Expand-Archive -Path "$env:TEMP\piper.zip" -DestinationPath "C:\Program Files\Piper" -Force

# Add to PATH (requires admin)
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\Piper", [EnvironmentVariableTarget]::Machine)

# Download voice model
$modelUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
$modelJsonUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

Invoke-WebRequest -Uri $modelUrl -OutFile "C:\Program Files\Piper\voices\en_US-lessac-medium.onnx"
Invoke-WebRequest -Uri $modelJsonUrl -OutFile "C:\Program Files\Piper\voices\en_US-lessac-medium.onnx.json"

# Verify installation (restart PowerShell after PATH update)
piper --version

# Test with a sentence
"Hello, I am PACE, your personal AI assistant." | piper --model "C:\Program Files\Piper\voices\en_US-lessac-medium.onnx" --output-file test.wav
```

### Ubuntu/Debian

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y wget

# Download Piper binary
cd /tmp
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz

# Extract and install
tar -xzf piper_amd64.tar.gz
sudo cp piper/piper /usr/local/bin/
sudo chmod +x /usr/local/bin/piper

# Create voice model directory
sudo mkdir -p /usr/local/share/piper/voices

# Download voice model (en_US-lessac-medium)
cd /usr/local/share/piper/voices
sudo wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
sudo wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# Verify installation
piper --version
```

### macOS (Local Development)

```bash
# Install via Homebrew
brew install piper-tts

# Create voice model directory
mkdir -p /usr/local/share/piper/voices

# Download voice model
cd /usr/local/share/piper/voices
curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -L -O https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# Verify installation
piper --version
```

### Alternative Debian Package (Ubuntu 22.04+)

```bash
# Add Piper repository
sudo add-apt-repository ppa:rhasspy/piper
sudo apt-get update

# Install Piper
sudo apt-get install piper-tts

# Download voice model (same as above)
sudo mkdir -p /usr/local/share/piper/voices
cd /usr/local/share/piper/voices
sudo wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
sudo wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

## Testing Piper

```bash
# Test with a simple sentence
echo "Hello, I am PACE, your personal AI assistant." | piper \
  --model /usr/local/share/piper/voices/en_US-lessac-medium.onnx \
  --output-file test.wav

# Play the audio (Linux)
aplay test.wav

# Play the audio (macOS)
afplay test.wav
```

## Voice Models

Piper supports many voices. The default `en_US-lessac-medium` is recommended for PACE:
- **Quality**: High (neural TTS)
- **Speed**: ~200-300ms per sentence on CPU
- **Size**: ~63MB

### Other Available Voices

```bash
# Male voice (deeper)
wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/joe/medium/en_US-joe-medium.onnx

# Female voice (higher quality, slower)
wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/alba/medium/en_GB-alba-medium.onnx

# British accent
wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/northern_english_male/medium/en_GB-northern_english_male-medium.onnx
```

Full voice catalog: https://rhasspy.github.io/piper-samples/

## Troubleshooting

### Windows: "piper.exe is not recognized"

```powershell
# Check if Piper is in PATH
where.exe piper

# If not, add to PATH manually or set in .env:
# PIPER_PATH="C:\Program Files\Piper\piper.exe"

# Or refresh PATH in current PowerShell session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine")
```

### Windows: "Model file not found"

```powershell
# Verify model file exists
Test-Path "C:\Program Files\Piper\voices\en_US-lessac-medium.onnx"

# If false, re-download (see installation steps above)
```

### Windows: Permission errors

```powershell
# Run PowerShell as Administrator, then:
icacls "C:\Program Files\Piper" /grant Users:(OI)(CI)F /T
```

### Linux/macOS: "piper: command not found"

```bash
# Check if piper is in PATH
which piper

# If not, add to PATH or specify full path in config
export PATH=$PATH:/usr/local/bin
```

### Linux/macOS: "Model file not found"

```bash
# Verify model file exists
ls -lh /usr/local/share/piper/voices/en_US-lessac-medium.onnx

# Re-download if missing (see installation steps above)
```

### Slow generation (>1 second)

```bash
# Use faster "low" quality model
wget https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/low/en_US-lessac-low.onnx

# Update config.ts piperModelPath to use low quality model
```

### Permission denied

```bash
# Make piper executable
sudo chmod +x /usr/local/bin/piper

# Check ownership of voice models
ls -l /usr/local/share/piper/voices/
sudo chown -R $(whoami) /usr/local/share/piper/voices/
```

## Performance Expectations

- **Latency**: 200-500ms per sentence (vs 1500-3000ms with OpenAI)
- **CPU Usage**: ~10-20% per generation on modern CPU
- **Memory**: ~100MB for model + 50MB per concurrent generation
- **Disk Space**: ~60-200MB per voice model

## Next Steps for Windows Server

After installation on your Windows server:

```powershell
# 1. Navigate to PACE directory
cd C:\path\to\proPACE

# 2. Pull latest changes
git pull

# 3. Rebuild
npm run build

# 4. Restart PACE
# If using pm2:
pm2 restart pace

# If using node directly:
# Stop current instance (Ctrl+C), then:
npm start
```

The configuration will automatically detect Windows and use:
- Piper path: `C:\Program Files\Piper\piper.exe`
- Model path: `C:\Program Files\Piper\voices\en_US-lessac-medium.onnx`

No `.env` changes needed unless you installed Piper in a custom location.

## Next Steps for Linux/macOS

```bash
cd /path/to/proPACE
git pull
npm run build
./update.sh  # Or your restart script
```

Audio should now start playing **much faster** - within 800ms-1.7s total latency instead of 2-4s!
