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

    // Waveform visualizer
    this.analyser = null;
    this.waveformCanvas = null;
    this.waveformCtx = null;
    this.animationId = null;

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

      // Create analyser for waveform visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 128; // Small FFT for 64 frequency bars
      this.analyser.smoothingTimeConstant = 0.7; // Smooth animation
      this.analyser.connect(this.audioContext.destination);

      // Setup canvas for waveform
      this.waveformCanvas = document.getElementById('waveform-canvas');
      if (this.waveformCanvas) {
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        // Set canvas resolution (350x350 to surround 250px button)
        this.waveformCanvas.width = 350;
        this.waveformCanvas.height = 350;
      }

      // Resume context if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        console.log('[AudioPlayer] AudioContext suspended, will resume on user interaction');
      }

      console.log('[AudioPlayer] AudioContext created with waveform visualizer');
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
   * Start circular waveform visualization around logo
   */
  startWaveformVisualization() {
    if (!this.waveformCanvas || !this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);

      // Get frequency data
      this.analyser.getByteFrequencyData(dataArray);

      const ctx = this.waveformCtx;
      const canvas = this.waveformCanvas;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const barCount = 64; // Number of bars around the circle
      const baseRadius = 125; // Button radius (250px diameter / 2)
      const maxBarLength = 50; // Maximum bar extension outward

      // Draw circular waveform
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';

      for (let i = 0; i < barCount; i++) {
        // Calculate angle for this bar (full circle = 2π radians)
        const angle = (i / barCount) * Math.PI * 2;

        // Sample from frequency data
        const dataIndex = Math.floor(i * (bufferLength / barCount));
        const value = dataArray[dataIndex];

        // Normalize bar length (0-255 → 0-maxBarLength)
        const barLength = (value / 255) * maxBarLength;

        // Calculate start and end points of the bar
        const startX = centerX + Math.cos(angle) * baseRadius;
        const startY = centerY + Math.sin(angle) * baseRadius;
        const endX = centerX + Math.cos(angle) * (baseRadius + barLength);
        const endY = centerY + Math.sin(angle) * (baseRadius + barLength);

        // Create gradient for this bar (inner to outer)
        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, 'rgba(252, 190, 36, 0.4)');
        gradient.addColorStop(1, 'rgba(252, 190, 36, 0.9)');

        // Draw the bar
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    };

    draw();
    console.log('[AudioPlayer] Circular waveform visualization started');
  }

  /**
   * Stop waveform visualization
   */
  stopWaveformVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Clear canvas
    if (this.waveformCtx && this.waveformCanvas) {
      this.waveformCtx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
    }

    console.log('[AudioPlayer] Waveform visualization stopped');
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
