/**
 * WebRTC Client
 * Manages WebRTC peer connection lifecycle and signaling for TTS audio streaming
 */

class WebRTCClient {
  constructor(clientId, websocket, onStateChange) {
    this.clientId = clientId;
    this.websocket = websocket;
    this.onStateChange = onStateChange || (() => {});

    this.peerConnection = null;
    this.dataChannel = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 2000; // Start with 2 seconds
    this.iceCandidateQueue = []; // Queue for early ICE candidates

    console.log('[WebRTC] Client initialized');
  }

  /**
   * Initialize WebRTC connection
   */
  async initialize() {
    try {
      console.log('[WebRTC] Starting initialization...');
      this._createPeerConnection();
      this.onStateChange('webrtc-initializing');
      return true;
    } catch (error) {
      console.error('[WebRTC] Initialization failed:', error);
      this.onStateChange('webrtc-error', error);
      return false;
    }
  }

  /**
   * Create RTCPeerConnection with STUN server
   */
  _createPeerConnection() {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(config);
    console.log('[WebRTC] Peer connection created');

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] Sending ICE candidate');
        this._sendIceCandidate(event.candidate);
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', this.peerConnection.iceConnectionState);

      if (this.peerConnection.iceConnectionState === 'connected' || this.peerConnection.iceConnectionState === 'completed') {
        this.isConnected = true;
        this.retryCount = 0; // Reset retry count on successful connection
        this.onStateChange('webrtc-connected');
      } else if (this.peerConnection.iceConnectionState === 'failed') {
        this.onStateChange('webrtc-failed');
        this._handleConnectionFailure();
      } else if (this.peerConnection.iceConnectionState === 'disconnected') {
        this.onStateChange('webrtc-disconnected');
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.peerConnection.connectionState);
    };

    // Handle data channel from server
    this.peerConnection.ondatachannel = (event) => {
      console.log('[WebRTC] Data channel received:', event.channel.label);
      if (event.channel.label === 'tts-audio') {
        this._setupDataChannel(event.channel);
      }
    };
  }

  /**
   * Setup data channel for receiving audio chunks
   */
  _setupDataChannel(channel) {
    this.dataChannel = channel;

    this.dataChannel.onopen = () => {
      console.log('[WebRTC] Data channel opened');
      this.onStateChange('datachannel-open');
    };

    this.dataChannel.onclose = () => {
      console.log('[WebRTC] Data channel closed');
      this.onStateChange('datachannel-closed');
    };

    this.dataChannel.onerror = (error) => {
      console.error('[WebRTC] Data channel error:', error);
      this.onStateChange('datachannel-error', error);
    };

    this.dataChannel.onmessage = async (event) => {
      // Forward audio chunks to audio player via state change callback
      // The app.js will handle routing this to the audio player
      this.onStateChange('audio-chunk-received', event.data);
    };
  }

  /**
   * Handle incoming signaling messages
   */
  async handleSignalingMessage(message) {
    try {
      if (message.type === 'webrtc-offer') {
        await this._handleOffer(message);
      } else if (message.type === 'webrtc-ice') {
        await this._handleIceCandidate(message);
      }
    } catch (error) {
      console.error('[WebRTC] Error handling signaling message:', error);
      this.onStateChange('signaling-error', error);
    }
  }

  /**
   * Handle WebRTC offer from server
   */
  async _handleOffer(message) {
    console.log('[WebRTC] Received offer from server');

    // Store client ID if provided
    if (message.clientId) {
      this.clientId = message.clientId;
    }

    // Set remote description
    // Server sends { type: 'webrtc-offer', sdp: '...', clientId: '...' }
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({
        type: 'offer',
        sdp: message.sdp
      })
    );

    // Create answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // Send answer back to server
    this._sendAnswer(answer);
    console.log('[WebRTC] Answer sent to server');

    // Process any queued ICE candidates
    if (this.iceCandidateQueue.length > 0) {
      console.log(`[WebRTC] Processing ${this.iceCandidateQueue.length} queued ICE candidates`);
      for (const candidate of this.iceCandidateQueue) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('[WebRTC] Error adding queued ICE candidate:', error);
        }
      }
      this.iceCandidateQueue = [];
    }
  }

  /**
   * Handle ICE candidate from server
   */
  async _handleIceCandidate(message) {
    if (message.candidate) {
      console.log('[WebRTC] Received ICE candidate from server');

      // Check if remote description is set
      if (!this.peerConnection.remoteDescription) {
        console.log('[WebRTC] Queueing ICE candidate (no remote description yet)');
        this.iceCandidateQueue.push(message.candidate);
        return;
      }

      // Add candidate immediately if remote description is already set
      try {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(message.candidate)
        );
      } catch (error) {
        console.error('[WebRTC] Error adding ICE candidate:', error);
      }
    }
  }

  /**
   * Send answer to server via WebSocket
   */
  _sendAnswer(answer) {
    const message = {
      type: 'webrtc-answer',
      sdp: answer.sdp,
      clientId: this.clientId
    };

    this.websocket.send(JSON.stringify(message));
  }

  /**
   * Send ICE candidate to server via WebSocket
   */
  _sendIceCandidate(candidate) {
    const message = {
      type: 'webrtc-ice',
      candidate: candidate.toJSON(),
      clientId: this.clientId
    };

    this.websocket.send(JSON.stringify(message));
  }

  /**
   * Handle connection failure with retry logic
   */
  _handleConnectionFailure() {
    if (this.retryCount < this.maxRetries) {
      this.retryCount++;
      const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // Exponential backoff

      console.log(`[WebRTC] Connection failed. Retrying in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);

      setTimeout(() => {
        this.close();
        this.initialize();
      }, delay);
    } else {
      console.error('[WebRTC] Max retries reached. Giving up.');
      this.onStateChange('webrtc-max-retries-reached');
    }
  }

  /**
   * Close WebRTC connection
   */
  close() {
    console.log('[WebRTC] Closing connection');

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isConnected = false;
    this.onStateChange('webrtc-closed');
  }

  /**
   * Check if WebRTC is connected
   */
  isWebRTCConnected() {
    return this.isConnected &&
           this.dataChannel &&
           this.dataChannel.readyState === 'open';
  }
}

// Make it available globally
window.WebRTCClient = WebRTCClient;
