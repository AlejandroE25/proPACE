/**
 * Voice Interface Debug Helper
 * Add this to index.html before app.js to debug WebRTC and audio issues
 */

(function() {
  console.log('🔍 Voice Debug Helper Loaded');

  // Store original console methods
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  // Track WebRTC state
  window.voiceDebug = {
    websocketConnected: false,
    webrtcInitialized: false,
    webrtcConnected: false,
    audioPlayerInitialized: false,
    dataChannelOpen: false,
    chunksReceived: 0,
    errors: [],

    logState() {
      console.log('📊 Voice Interface State:', {
        websocket: this.websocketConnected,
        webrtcInit: this.webrtcInitialized,
        webrtcConnected: this.webrtcConnected,
        audioPlayer: this.audioPlayerInitialized,
        dataChannel: this.dataChannelOpen,
        chunks: this.chunksReceived,
        errors: this.errors.length
      });
    }
  };

  // Monitor WebSocket
  const originalWebSocket = window.WebSocket;
  window.WebSocket = function(url) {
    console.log('🔌 WebSocket connecting to:', url);
    const ws = new originalWebSocket(url);

    ws.addEventListener('open', () => {
      console.log('✅ WebSocket connected');
      window.voiceDebug.websocketConnected = true;
    });

    ws.addEventListener('close', () => {
      console.log('❌ WebSocket disconnected');
      window.voiceDebug.websocketConnected = false;
    });

    ws.addEventListener('error', (err) => {
      console.error('❌ WebSocket error:', err);
      window.voiceDebug.errors.push({type: 'websocket', error: err});
    });

    const originalSend = ws.send;
    ws.send = function(data) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'webrtc-answer') {
          console.log('📤 Sending WebRTC answer');
        } else if (parsed.type === 'webrtc-ice') {
          console.log('📤 Sending ICE candidate');
        }
      } catch(e) {}
      return originalSend.call(this, data);
    };

    return ws;
  };

  // Monitor RTCPeerConnection
  const originalRTCPeerConnection = window.RTCPeerConnection;
  window.RTCPeerConnection = function(config) {
    console.log('🌐 Creating RTCPeerConnection with config:', config);
    const pc = new originalRTCPeerConnection(config);

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        console.log('🧊 ICE candidate:', event.candidate.candidate.substring(0, 50) + '...');
      } else {
        console.log('🧊 ICE gathering complete');
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log('🔗 ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        window.voiceDebug.webrtcConnected = true;
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        window.voiceDebug.webrtcConnected = false;
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      console.log('🔗 Connection state:', pc.connectionState);
    });

    pc.addEventListener('datachannel', (event) => {
      console.log('📺 Data channel received:', event.channel.label);

      event.channel.addEventListener('open', () => {
        console.log('✅ Data channel opened:', event.channel.label);
        window.voiceDebug.dataChannelOpen = true;
      });

      event.channel.addEventListener('close', () => {
        console.log('❌ Data channel closed:', event.channel.label);
        window.voiceDebug.dataChannelOpen = false;
      });

      event.channel.addEventListener('message', (msgEvent) => {
        window.voiceDebug.chunksReceived++;
        const size = msgEvent.data.byteLength || msgEvent.data.size || 0;
        console.log(`📦 Received audio chunk #${window.voiceDebug.chunksReceived} (${size} bytes)`);

        // Check for markers
        if (size < 20) {
          const decoder = new TextDecoder();
          const text = decoder.decode(msgEvent.data);
          console.log('🏷️  Received marker:', text);
        }
      });

      event.channel.addEventListener('error', (err) => {
        console.error('❌ Data channel error:', err);
        window.voiceDebug.errors.push({type: 'datachannel', error: err});
      });
    });

    return pc;
  };

  // Monitor AudioContext
  const originalAudioContext = window.AudioContext || window.webkitAudioContext;
  if (originalAudioContext) {
    const AudioContextProxy = function(options) {
      console.log('🔊 Creating AudioContext with options:', options);
      const ctx = new originalAudioContext(options);

      console.log('🔊 AudioContext state:', ctx.state, 'Sample rate:', ctx.sampleRate);

      ctx.addEventListener('statechange', () => {
        console.log('🔊 AudioContext state changed to:', ctx.state);
      });

      const originalDecodeAudioData = ctx.decodeAudioData;
      ctx.decodeAudioData = function(audioData) {
        console.log(`🎵 Decoding audio data (${audioData.byteLength} bytes)`);
        return originalDecodeAudioData.call(this, audioData).then(
          (buffer) => {
            console.log(`✅ Decoded ${buffer.duration.toFixed(2)}s audio`);
            return buffer;
          },
          (err) => {
            console.error('❌ Audio decode failed:', err);
            window.voiceDebug.errors.push({type: 'audiodecode', error: err});
            throw err;
          }
        );
      };

      window.voiceDebug.audioPlayerInitialized = true;
      return ctx;
    };

    window.AudioContext = AudioContextProxy;
    if (window.webkitAudioContext) {
      window.webkitAudioContext = AudioContextProxy;
    }
  }

  // Add debug command to console
  window.checkVoice = () => window.voiceDebug.logState();

  console.log('🔍 Voice Debug Helper Ready');
  console.log('💡 Type checkVoice() in console to see current state');
})();
