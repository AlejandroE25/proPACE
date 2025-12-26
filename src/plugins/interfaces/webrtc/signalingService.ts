import { EventEmitter } from 'events';
import { WebRTCPeerManager } from './webrtcPeerManager.js';
import { PACEWebSocketServer } from '../../../server/websocket.js';
import type { Logger } from 'winston';

/**
 * Signaling state for each client
 */
type SignalingState = 'new' | 'offer-sent' | 'stable' | 'closed';

/**
 * Retry options for signaling messages
 */
interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  useExponentialBackoff?: boolean;
}

/**
 * Signaling Service
 * Handles WebRTC signaling via WebSocket (offer/answer/ICE exchange)
 */
export class SignalingService extends EventEmitter {
  private wsServer: PACEWebSocketServer;
  private peerManager: WebRTCPeerManager;
  private logger: Logger;
  private sessions: Map<string, SignalingState> = new Map();
  private initialized = false;

  constructor(
    wsServer: PACEWebSocketServer,
    peerManager: WebRTCPeerManager,
    logger: Logger
  ) {
    super();
    this.wsServer = wsServer;
    this.peerManager = peerManager;
    this.logger = logger;
  }

  /**
   * Initialize signaling handlers
   */
  initialize(): void {
    if (this.initialized) {
      this.logger.warn('SignalingService already initialized');
      return;
    }

    this.logger.info('Initializing WebRTC signaling service');

    // Note: WebSocket message handling is done via handleWebSocketMessage()
    // which is called from the voice plugin when signaling messages are received

    // Forward ICE candidates from peer manager
    this.peerManager.on('icecandidate', (clientId: string, candidate: any) => {
      this.sendIceCandidate(clientId, candidate);
    });

    // Handle connection state changes
    this.peerManager.on('connectionstatechange', (clientId: string, state: string) => {
      this.logger.debug(`Peer connection state for ${clientId}: ${state}`);

      if (state === 'connected') {
        this.updateSignalingState(clientId, 'stable');
      } else if (state === 'failed' || state === 'closed') {
        this.updateSignalingState(clientId, 'closed');
      }
    });

    this.initialized = true;
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleWebSocketMessage(clientId: string, message: string): Promise<void> {
    try {
      const data = JSON.parse(message);

      // Only handle WebRTC signaling messages
      if (data.type === 'webrtc-answer') {
        await this.handleAnswer(clientId, {
          type: 'answer',
          sdp: data.sdp
        });
      } else if (data.type === 'webrtc-ice') {
        await this.handleIceCandidate(clientId, data.candidate);
      }
      // Ignore non-signaling messages
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Not JSON, ignore
        return;
      }
      this.logger.error(`Error handling WebSocket message from ${clientId}:`, error);
    }
  }

  /**
   * Initiate WebRTC connection with client
   */
  async initiateConnection(clientId: string): Promise<void> {
    this.logger.info(`Initiating WebRTC connection for ${clientId}`);

    try {
      // Create peer connection
      await this.peerManager.createPeerConnection(clientId);

      // Create and send offer
      const offer = await this.peerManager.createOffer(clientId);
      await this.sendOffer(clientId, offer);

      this.updateSignalingState(clientId, 'offer-sent');
    } catch (error) {
      this.logger.error(`Failed to initiate connection for ${clientId}:`, error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Send WebRTC offer to client
   */
  async sendOffer(
    clientId: string,
    offer: any
  ): Promise<void> {
    this.validateSessionDescription(offer, 'offer');

    this.logger.info(`Sending WebRTC offer to ${clientId}`);

    const message = JSON.stringify({
      type: 'webrtc-offer',
      sdp: offer.sdp,
      clientId
    });

    try {
      this.wsServer.sendToClient(clientId, message);
    } catch (error) {
      this.logger.error(`Failed to send offer to ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Send WebRTC offer with retry
   */
  async sendOfferWithRetry(
    clientId: string,
    offer: any,
    options: RetryOptions
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        await this.sendOffer(clientId, offer);
        return; // Success
      } catch (error) {
        lastError = error as Error;

        if (attempt < options.maxRetries) {
          const delay = options.useExponentialBackoff
            ? options.retryDelay * Math.pow(2, attempt)
            : options.retryDelay;

          this.logger.warn(
            `Failed to send offer to ${clientId}, retrying in ${delay}ms (attempt ${attempt + 1}/${options.maxRetries})`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Handle incoming answer from client
   */
  async handleAnswer(
    clientId: string,
    answer: any
  ): Promise<void> {
    this.validateSessionDescription(answer, 'answer');

    this.logger.info(`Handling WebRTC answer from ${clientId}`);

    try {
      await this.peerManager.setRemoteAnswer(clientId, answer);
      this.updateSignalingState(clientId, 'stable');
    } catch (error) {
      this.logger.error(`Failed to handle answer from ${clientId}:`, error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Send ICE candidate to client
   */
  async sendIceCandidate(
    clientId: string,
    candidate: any
  ): Promise<void> {
    this.logger.debug(`Sending ICE candidate to ${clientId}`);

    const message = JSON.stringify({
      type: 'webrtc-ice',
      candidate: {
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex,
        sdpMid: candidate.sdpMid
      },
      clientId
    });

    try {
      this.wsServer.sendToClient(clientId, message);
    } catch (error) {
      this.logger.error(`Failed to send ICE candidate to ${clientId}:`, error);
      // Don't throw - ICE candidates are optional
    }
  }

  /**
   * Handle incoming ICE candidate from client
   */
  async handleIceCandidate(
    clientId: string,
    candidate: any
  ): Promise<void> {
    if (!candidate || !candidate.candidate) {
      // End of candidates or null candidate
      this.logger.debug(`Received end-of-candidates from ${clientId}`);
      return;
    }

    this.logger.debug(`Handling ICE candidate from ${clientId}`);

    try {
      await this.peerManager.addIceCandidate(clientId, candidate);
    } catch (error) {
      this.logger.error(`Failed to add ICE candidate from ${clientId}:`, error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Validate session description
   */
  private validateSessionDescription(
    desc: any,
    expectedType: string
  ): void {
    if (!desc || desc.type !== expectedType) {
      throw new Error(
        `Invalid session description: expected type '${expectedType}', got '${desc?.type}'`
      );
    }

    if (!desc.sdp || typeof desc.sdp !== 'string') {
      throw new Error('Invalid session description: missing or invalid SDP');
    }
  }

  /**
   * Update signaling state
   */
  private updateSignalingState(clientId: string, state: SignalingState): void {
    const previousState = this.sessions.get(clientId);
    this.sessions.set(clientId, state);

    if (previousState !== state) {
      this.logger.debug(`Signaling state for ${clientId}: ${previousState} -> ${state}`);
      this.emit('signalingstatechange', clientId, state);
    }
  }

  /**
   * Get signaling state for client
   */
  getSignalingState(clientId: string): SignalingState {
    return this.sessions.get(clientId) || 'new';
  }

  /**
   * Check if client has active session
   */
  hasSession(clientId: string): boolean {
    const state = this.sessions.get(clientId);
    return state !== undefined && state !== 'closed';
  }

  /**
   * Cleanup session for client
   */
  async cleanupSession(clientId: string): Promise<void> {
    this.logger.info(`Cleaning up signaling session for ${clientId}`);

    this.updateSignalingState(clientId, 'closed');
    this.sessions.delete(clientId);

    await this.peerManager.closePeerConnection(clientId);
  }

  /**
   * Cleanup all sessions
   */
  cleanup(): void {
    this.logger.info('Cleaning up all signaling sessions');

    const clientIds = Array.from(this.sessions.keys());
    clientIds.forEach((clientId) => {
      this.updateSignalingState(clientId, 'closed');
      this.sessions.delete(clientId);
    });

    this.initialized = false;
  }
}
