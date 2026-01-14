# WAV Audio Decode Fix

## Problem

When switching from OpenAI TTS (MP3 output) to Piper TTS (WAV output), the audio player was failing with:

```
DOMException: The buffer passed to decodeAudioData contains an unknown content type
```

## Root Cause

The audio player was designed for MP3 streams, which need to be buffered and decoded as a complete file. The code was:

1. Buffering multiple audio chunks in an array
2. Concatenating all chunks into a single ArrayBuffer
3. Calling `decodeAudioData()` on the concatenated buffer

**This works for MP3** because MP3 chunks are fragments of a single stream.

**This FAILS for WAV** because each Piper chunk is a complete WAV file with its own header. Concatenating multiple WAV files creates an invalid audio buffer with multiple headers.

## Solution

Changed the decoding strategy to handle each WAV chunk individually:

1. Buffer chunks in array (same as before)
2. **Decode each chunk separately** using `decodeAudioData()`
3. Schedule each decoded AudioBuffer for sequential playback

### Code Changes

**Before (concatenation approach):**
```javascript
// Concatenate all chunks
const totalLength = this.pendingChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
const completeMP3 = new Uint8Array(totalLength);
let offset = 0;
for (const chunk of this.pendingChunks) {
  completeMP3.set(new Uint8Array(chunk), offset);
  offset += chunk.byteLength;
}

// Decode as single buffer
const audioBuffer = await this.audioContext.decodeAudioData(completeMP3.buffer);
```

**After (individual decode approach):**
```javascript
// Decode each WAV chunk individually
for (let i = 0; i < chunksToProcess.length; i++) {
  const chunk = chunksToProcess[i];
  try {
    const audioBuffer = await this.audioContext.decodeAudioData(chunk);
    this._scheduleBuffer(audioBuffer);
  } catch (decodeError) {
    console.error(`Failed to decode chunk ${i + 1}:`, decodeError);
  }
}
```

## Files Modified

- [`public/audio-player.js`](../public/audio-player.js)
  - Updated `_decodeAndPlayBufferedChunks()` to decode chunks individually
  - Renamed method `_decodeMP3Chunk()` → `_decodeAudioChunk()`
  - Updated comments from "MP3" to generic "audio"

## Testing

After this fix, Piper WAV audio should:
1. Decode successfully without "unknown content type" errors
2. Play each sentence chunk sequentially
3. Maintain audio-reactive visualization
4. Support interruption via abort signals

## Performance Impact

**Minimal:** Decoding multiple small AudioBuffers vs one large AudioBuffer has negligible performance difference. The Web Audio API schedules them seamlessly for continuous playback.

## Future Considerations

This approach works for both:
- **WAV files** (Piper TTS): Each chunk is a complete file with headers
- **MP3 streams** (if we ever switch back): Could be adapted by detecting format

The key insight: **Don't assume chunks can be concatenated** - always decode them individually unless you know the format supports streaming concatenation.
