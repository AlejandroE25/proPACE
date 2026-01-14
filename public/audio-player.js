/**
 * Audio Player
 * Decodes audio chunks (WAV from Piper TTS) and plays using Web Audio API
 */

class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    this.audioQueue = [];
    this.nextStartTime = 0;
    this.currentSourceNodes = [];
    this.pendingChunks = []; // Buffer for audio chunks until TTS_END

    // Audio-reactive blob visualization
    this.analyser = null;
    this.animationId = null;

    console.log('[AudioPlayer] Initialized');
  }

  /**
   * Initialize Web Audio API context
   */
  async initialize() {
    try {
      // Create AudioContext with default sample rate
      // This will automatically match the audio file's sample rate (Piper outputs 22050 Hz)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Create analyser for audio-reactive blob visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // FFT size for frequency analysis
      this.analyser.smoothingTimeConstant = 0.8; // Smooth animation
      this.analyser.connect(this.audioContext.destination);

      // Resume context if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        console.log('[AudioPlayer] AudioContext suspended, will resume on user interaction');
      }

      console.log('[AudioPlayer] AudioContext created with audio-reactive visualization');
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
   * Play an audio chunk (WAV from Piper TTS)
   */
  async playChunk(audioArrayBuffer) {
    try {
      // Resume context if needed (browser autoplay policy)
      await this.resumeContext();

      // Check for special markers
      if (this._isMarker(audioArrayBuffer)) {
        const marker = this._getMarkerType(audioArrayBuffer);
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

      // Buffer the chunk for sequential playback
      // WAV chunks are complete audio files with headers - decode individually
      this.pendingChunks.push(audioArrayBuffer);
      console.log(`[AudioPlayer] Buffered chunk ${this.pendingChunks.length} (${audioArrayBuffer.byteLength} bytes)`);

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
   * Decode and play all buffered audio chunks
   * WAV chunks from Piper are complete audio files with headers - decode each individually
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

      // Reset state for sequential playback
      this.isPlaying = false;
      this.nextStartTime = 0;

      console.log(`[AudioPlayer] Decoding ${this.pendingChunks.length} WAV chunks`);

      // Copy chunks array and clear buffer before processing
      const chunksToProcess = [...this.pendingChunks];
      this.pendingChunks = [];

      // Decode and schedule each WAV chunk individually
      let totalDuration = 0;
      let successfulChunks = 0;

      for (let i = 0; i < chunksToProcess.length; i++) {
        const chunk = chunksToProcess[i];

        try {
          // Decode this WAV chunk
          const audioBuffer = await this.audioContext.decodeAudioData(chunk);
          totalDuration += audioBuffer.duration;
          successfulChunks++;

          // Schedule it for playback
          this._scheduleBuffer(audioBuffer);

          console.log(`[AudioPlayer] Decoded chunk ${i + 1}/${chunksToProcess.length} (${audioBuffer.duration.toFixed(2)}s)`);
        } catch (decodeError) {
          console.error(`[AudioPlayer] Failed to decode chunk ${i + 1}:`, decodeError);
          // Continue with remaining chunks
        }
      }

      console.log(`[AudioPlayer] Successfully decoded ${successfulChunks}/${chunksToProcess.length} chunks (${totalDuration.toFixed(2)}s total)`);

    } catch (error) {
      console.error('[AudioPlayer] Failed to process buffered chunks:', error);
      this.pendingChunks = []; // Clear buffer on error
      this.isPlaying = false;
      this.nextStartTime = 0;
    }
  }

  /**
   * Decode audio chunk to AudioBuffer
   */
  async _decodeAudioChunk(arrayBuffer) {
    try {
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error('[AudioPlayer] Audio decode error:', error);
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
    // Connect through analyser for waveform visualization
    sourceNode.connect(this.analyser);

    // Schedule playback
    sourceNode.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;

    // Track source node
    this.currentSourceNodes.push(sourceNode);

    // Start waveform visualization
    if (this.currentSourceNodes.length === 1) {
      this.startWaveformVisualization();
    }

    // Clean up when finished
    sourceNode.onended = () => {
      const index = this.currentSourceNodes.indexOf(sourceNode);
      if (index > -1) {
        this.currentSourceNodes.splice(index, 1);
      }

      // If no more chunks are playing, reset state and stop visualization
      if (this.currentSourceNodes.length === 0) {
        this.isPlaying = false;
        this.nextStartTime = 0;
        this.stopWaveformVisualization();
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

    // Stop waveform visualization
    this.stopWaveformVisualization();

    // Dispatch event for UI updates
    if (window.handleWebRTCStateChange) {
      window.handleWebRTCStateChange('playback-stopped');
    }
  }

  /**
   * Start audio-reactive background blob visualization
   */
  startWaveformVisualization() {
    if (!this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Get references to background blobs
    const blob1 = document.getElementById('blob1');
    const blob2 = document.getElementById('blob2');

    if (!blob1 || !blob2) {
      console.warn('[AudioPlayer] Background blobs not found');
      return;
    }

    // Add audio-active class for color change
    blob1.classList.add('audio-active');
    blob2.classList.add('audio-active');

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);

      // Get frequency data
      this.analyser.getByteFrequencyData(dataArray);

      // Calculate low and high frequency components
      const lowFreq = dataArray.slice(0, bufferLength / 3).reduce((sum, v) => sum + v, 0) / (bufferLength / 3) / 255;
      const highFreq = dataArray.slice(bufferLength * 2 / 3).reduce((sum, v) => sum + v, 0) / (bufferLength / 3) / 255;

      // Modulate blob1 with low frequencies (bass) - MORE AGGRESSIVE
      const blob1Scale = 1 + (lowFreq * 1.2); // Scale 1.0 - 2.2x
      const blob1Blur = 100 + (lowFreq * 100); // Blur 100-200px
      const blob1Opacity = 0.8 + (lowFreq * 0.2); // Opacity 0.8-1.0

      // Apply transform (preserve CSS animation)
      blob1.style.setProperty('--audio-scale', blob1Scale);
      blob1.style.filter = `blur(${blob1Blur}px) opacity(${blob1Opacity})`;

      // Modulate blob2 with high frequencies (treble) - MORE AGGRESSIVE
      const blob2Scale = 1 + (highFreq * 1.2); // Scale 1.0 - 2.2x
      const blob2Blur = 100 + (highFreq * 100); // Blur 100-200px
      const blob2Opacity = 0.8 + (highFreq * 0.2); // Opacity 0.8-1.0

      // Apply transform (preserve CSS animation)
      blob2.style.setProperty('--audio-scale', blob2Scale);
      blob2.style.filter = `blur(${blob2Blur}px) opacity(${blob2Opacity})`;
    };

    draw();
    console.log('[AudioPlayer] Audio-reactive background blob visualization started');
  }

  /**
   * Stop blob visualization and reset to default state
   */
  stopWaveformVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Reset blobs to default appearance
    const blob1 = document.getElementById('blob1');
    const blob2 = document.getElementById('blob2');

    if (blob1) {
      blob1.classList.remove('audio-active');
      blob1.style.removeProperty('--audio-scale');
      blob1.style.filter = '';
    }

    if (blob2) {
      blob2.classList.remove('audio-active');
      blob2.style.removeProperty('--audio-scale');
      blob2.style.filter = '';
    }

    console.log('[AudioPlayer] Blob visualization stopped');
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
