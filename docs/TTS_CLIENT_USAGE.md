# TTS (Text-to-Speech) Client Usage

## Overview

The proPACE web client now supports TTS (Text-to-Speech) playback, allowing PACE to speak its responses aloud. Audio is streamed over WebSocket for low-latency playback.

## How to Use

### 1. Open the Web Client

Navigate to `http://localhost:9001` (or your configured server address) in a modern web browser.

**Supported Browsers:**
- Chrome/Edge 80+
- Firefox 70+
- Safari 14+

### 2. Enable TTS Mode

Click the **proPACE logo** in the center of the screen to enable TTS playback.

**What happens:**
1. The logo will glow green when TTS is active
2. A "TTS Active" indicator will appear in the top-left status bar
3. PACE's responses will now be **spoken aloud**

### 3. Interact with PACE

Once TTS is enabled:
- **Type your messages** in the text input as normal
- PACE's responses will be **displayed as text** (with typewriter effect)
- **AND** spoken aloud via TTS simultaneously

### 4. Disable TTS Mode

Click the **proPACE logo** again to disable TTS playback.

**What happens:**
1. Logo glow disappears
2. TTS status indicator disappears
3. Responses return to text-only

## Visual Indicators

### Logo States
- **No glow**: TTS disabled (click to enable)
- **Green glow**: TTS active (click to disable)

### Status Bar
- **Connection Status**: Shows WebSocket connection state
- **TTS Active** (when enabled): Shows TTS playback is running

### Health Ring
- **Green**: System healthy
- **Yellow**: Degraded performance
- **Red**: System issues

## Audio Processing

### Text-to-Speech (TTS)
- **Service**: OpenAI TTS API
- **Voice**: "onyx" (configurable in `.env`)
- **Model**: tts-1
- **Caching**: 30-40% cost reduction via LRU cache
- **Transport**: Base64-encoded audio chunks over WebSocket
- **Playback**: Web Audio API with automatic queueing

### How It Works
1. You type a message and press Enter
2. Server processes your message
3. Server generates TTS audio for the response
4. Audio chunks are sent to browser in real-time
5. Browser plays chunks sequentially with no gaps

## Troubleshooting

### "Failed to enable TTS" Error
**Cause**: Browser couldn't create AudioContext

**Solution**:
1. Try refreshing the page
2. Check browser console (F12) for specific errors
3. Try a different browser

### No Audio Playback
**Cause**: Audio context or decoding issue

**Solution**:
1. Check browser volume is not muted
2. Check that the website is not muted in browser settings
3. Check browser console for audio decoding errors
4. Verify OpenAI API key is valid in server `.env`
5. Try disabling/re-enabling TTS mode (click logo twice)
6. Try a different browser

### Audio Cuts Off or Stutters
**Cause**: Network latency or audio buffer underrun

**Solution**:
1. Check network connection stability
2. Try refreshing the page
3. Disable/re-enable TTS mode
4. Check server logs for audio generation errors

### TTS Responses Not Generated
**Cause**: Server-side TTS not enabled or API key issue

**Solution**:
1. Verify `ENABLE_VOICE=true` in server's `.env`
2. Verify `OPENAI_API_KEY` is set and valid
3. Check server is running in agent mode (`ENABLE_AGENT_MODE=true`)
4. Check server logs for TTS errors

## Cost Considerations

### OpenAI API Pricing (as of 2024)
- **TTS (tts-1)**: $0.015 per 1,000 characters

### Example Usage Costs
- **100-word response**: ~$0.0075 (TTS only)
- **1,000-word response**: ~$0.075 (TTS only)
- **30-minute conversation** (typical): ~$0.20 - $0.40 total

### Cost Optimization
- TTS responses are cached (30-40% savings on repeated responses)
- TTS can be toggled on/off as needed
- Only responses are spoken (not user input)

## Privacy & Security

- **Audio data**: Sent via WebSocket (encrypted with HTTPS/WSS)
- **API keys**: Stored server-side, never exposed to client
- **Text processing**: Processed by OpenAI (see their privacy policy)
- **No microphone access**: Client is TTS playback only

## Technical Details

### Architecture
- **Transport**: WebSocket (same connection as text messages)
- **Audio Format**: Base64-encoded audio chunks (MP3/Opus from OpenAI)
- **Playback**: Web Audio API (`AudioContext`, `AudioBuffer`)
- **Queueing**: Sequential playback with automatic queue management

### Browser APIs Used
- `AudioContext` - Audio playback
- `AudioBuffer` - Audio data buffering
- `WebSocket` - Real-time communication
- `atob()` - Base64 decoding

## Configuration

Server-side configuration in `.env`:

```bash
# Enable voice interface (includes TTS)
ENABLE_VOICE=true

# TTS settings
VOICE_TTS_VOICE=onyx
VOICE_TTS_CACHE_SIZE=100
VOICE_TTS_CACHE_TTL=3600000
```

## Future Enhancements

Planned features (not yet implemented):
- Multiple voice personalities
- Adjustable speech rate
- Volume control in UI
- Custom wake words
- Voice interruption support

## Support

For issues or questions:
- Check browser console (F12) for errors
- Check server logs for backend issues
- Verify all environment variables are set correctly
- Ensure OpenAI API has sufficient credits
- Test with different browsers to isolate issues
