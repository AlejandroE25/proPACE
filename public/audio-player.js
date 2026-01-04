/**
 * Audio Player
 * Decodes MP3 chunks and plays audio using Web Audio API
 */

class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    this.audioQueue = [];
    this.nextStartTime = 0;
    this.currentSourceNodes = [];
    this.pendingChunks = []; // Buffer for MP3 chunks until TTS_END

    console.log('[AudioPlayer] Initialized');
  }

  /**
   * Initialize Web Audio API context
   */
  async initialize() {
    try {
      // Create AudioContext
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000
      });

      // Resume context if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        console.log('[AudioPlayer] AudioContext suspended, will resume on user interaction');
      }

      console.log('[AudioPlayer] AudioContext created, state:', this.audioContext.state);
      return true;
    } catch (error) {
      console.error('[AudioPlayer] Failed to initialize AudioContext:', error);
      return false;
    }
  }

  /**
   * Resume audio context (call on user interaction for autoplay policy)
   */
  async resumeContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('[AudioPlayer] AudioContext resumed');
    }
  }

  /**
   * Play an MP3 audio chunk
   */
  async playChunk(mp3ArrayBuffer) {
    try {
      // Resume context if needed (browser autoplay policy)
      await this.resumeContext();

      // Check for special markers
      if (this._isMarker(mp3ArrayBuffer)) {
        const marker = this._getMarkerType(mp3ArrayBuffer);
        console.log('[AudioPlayer] Received marker:', marker);

        if (marker === 'TTS_END') {
          // Decode and play all buffered chunks
          await this._decodeAndPlayBufferedChunks();
          await this._onPlaybackComplete();
          return;
        } else if (marker === 'TTS_ABORT') {
          this.pendingChunks = []; // Clear buffer
          await this.stop();
          return;
        }
      }

      // Buffer the chunk instead of decoding immediately
      // MP3 chunks can't be decoded individually - need the full stream
      this.pendingChunks.push(mp3ArrayBuffer);
      console.log(`[AudioPlayer] Buffered chunk ${this.pendingChunks.length} (${mp3ArrayBuffer.byteLength} bytes)`);

    } catch (error) {
      console.error('[AudioPlayer] Error playing chunk:', error);
      // Continue playing - don't let one bad chunk stop everything
    }
  }

  /**
   * Check if data is a text marker instead of audio
   */
  _isMarker(data) {
    if (data instanceof ArrayBuffer && data.byteLength < 20) {
      const text = new TextDecoder().decode(data);
      return text.startsWith('TTS_');
    }
    return false;
  }

  /**
   * Get marker type from data
   */
  _getMarkerType(data) {
    return new TextDecoder().decode(data);
  }

  /**
   * Decode and play all buffered MP3 chunks
   */
  async _decodeAndPlayBufferedChunks() {
    if (this.pendingChunks.length === 0) {
      console.log('[AudioPlayer] No chunks to decode');
      return;
    }

    try {
      // Stop any currently playing audio (interrupt)
      if (this.isPlaying) {
        console.log('[AudioPlayer] Interrupting previous playback');
        this.currentSourceNodes.forEach(node => {
          try {
            node.stop();
          } catch (e) {
            // Node might already be stopped
          }
        });
        this.currentSourceNodes = [];
      }

      // Concatenate all chunks into a single ArrayBuffer
      const totalLength = this.pendingChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const completeMP3 = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of this.pendingChunks) {
        completeMP3.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }

      console.log(`[AudioPlayer] Decoding complete MP3 (${totalLength} bytes from ${this.pendingChunks.length} chunks)`);

      // Clear buffer
      this.pendingChunks = [];

      // Decode the complete MP3
      const audioBuffer = await this.audioContext.decodeAudioData(completeMP3.buffer);
      console.log(`[AudioPlayer] Decoded ${audioBuffer.duration.toFixed(2)}s of audio`);

      // Reset state and play from beginning
      this.isPlaying = false;
      this.nextStartTime = 0;

      // Play the decoded audio
      this._scheduleBuffer(audioBuffer);

    } catch (error) {
      console.error('[AudioPlayer] Failed to decode buffered MP3:', error);
      this.pendingChunks = []; // Clear buffer on error
      this.isPlaying = false;
      this.nextStartTime = 0;
    }
  }

  /**
   * Decode MP3 chunk to AudioBuffer
   */
  async _decodeMP3Chunk(arrayBuffer) {
    try {
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error('[AudioPlayer] MP3 decode error:', error);
      return null;
    }
  }

  /**
   * Schedule audio buffer for playback
   */
  _scheduleBuffer(audioBuffer) {
    const currentTime = this.audioContext.currentTime;

    // If not playing, start immediately
    if (!this.isPlaying) {
      this.nextStartTime = currentTime;
      this.isPlaying = true;
    }

    // Create source node
    const sourceNode = this.audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(this.audioContext.destination);

    // Schedule playback
    sourceNode.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;

    // Track source node
    this.currentSourceNodes.push(sourceNode);

    // Clean up when finished
    sourceNode.onended = () => {
      const index = this.currentSourceNodes.indexOf(sourceNode);
      if (index > -1) {
        this.currentSourceNodes.splice(index, 1);
      }

      // If no more chunks are playing, reset state
      if (this.currentSourceNodes.length === 0) {
        this.isPlaying = false;
        this.nextStartTime = 0;
      }
    };

    console.log(`[AudioPlayer] Scheduled chunk (duration: ${audioBuffer.duration.toFixed(2)}s, start: ${this.nextStartTime.toFixed(2)}s)`);
  }

  /**
   * Handle playback completion
   */
  async _onPlaybackComplete() {
    console.log('[AudioPlayer] Playback complete');

    // Wait for any remaining audio to finish
    const waitTime = Math.max(0, this.nextStartTime - this.audioContext.currentTime);
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    }

    // Reset state for next TTS session
    this.isPlaying = false;
    this.nextStartTime = 0;
    this.pendingChunks = [];
    console.log('[AudioPlayer] State reset for next TTS session');

    // Dispatch event for UI updates
    if (window.handleWebRTCStateChange) {
      window.handleWebRTCStateChange('playback-complete');
    }
  }

  /**
   * Stop playback immediately
   */
  async stop() {
    console.log('[AudioPlayer] Stopping playback');

    // Stop all currently playing audio
    this.currentSourceNodes.forEach(node => {
      try {
        node.stop();
      } catch (e) {
        // Node might already be stopped
      }
    });

    this.currentSourceNodes = [];
    this.audioQueue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;

    // Dispatch event for UI updates
    if (window.handleWebRTCStateChange) {
      window.handleWebRTCStateChange('playback-stopped');
    }
  }

  /**
   * Get current playback state
   */
  getState() {
    return {
      isPlaying: this.isPlaying,
      queueLength: this.currentSourceNodes.length,
      contextState: this.audioContext ? this.audioContext.state : 'null'
    };
  }
}

// Make it available globally
window.AudioPlayer = AudioPlayer;
