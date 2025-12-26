import { EventEmitter } from 'events';
import type { Logger } from 'winston';
import { logger as defaultLogger } from '../../../utils/logger.js';

// NOTE: For production server-side use, install 'wrtc' package:
// npm install wrtc
// Then uncomment: import wrtc from 'wrtc';
// For now, we'll use stub types that match the WebRTC API

// @ts-ignore - wrtc package to be installed in production
const RTCPeerConnection = global.RTCPeerConnection || class RTCPeerConnectionStub {};
// @ts-ignore
const RTCIceCandidate = global.RTCIceCandidate || class RTCIceCandidateStub {};
// @ts-ignore
const RTCSessionDescription = global.RTCSessionDescription || class RTCSessionDescriptionStub {};

/**
 * Connection statistics for monitoring
 */
export interface ConnectionStats {
  connectionState: string;
  iceConnectionState: string;
  iceGatheringState: string;
  signalingState: string;
  dataChannelState?: string;
  bufferedAmount?: number;
}

/**
 * WebRTC Peer Manager
 * Manages RTCPeerConnection instances and data channels for each client
 */
export class WebRTCPeerManager extends EventEmitter {
  private peerConnections: Map<string, any> = new Map();
  private dataChannels: Map<string, any> = new Map();
  private audioQueues: Map<string, Buffer[]> = new Map();
  private iceServers: any[];
  private logger: Logger;

  private readonly DATA_CHANNEL_LABEL = 'tts-audio';
  private readonly HIGH_WATER_MARK = 256 * 1024; // 256KB

  constructor(iceServers: any[], logger?: Logger) {
    super();
    this.iceServers = iceServers;
    this.logger = (logger || defaultLogger) as Logger;
  }

  /**
   * Create new peer connection for client
   */
  async createPeerConnection(clientId: string): Promise<any> {
    // Return existing connection if already exists
    if (this.peerConnections.has(clientId)) {
      return this.peerConnections.get(clientId)!;
    }

    this.logger.info(`Creating WebRTC peer connection for client ${clientId}`);

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    // Create data channel for audio streaming
    const dataChannel = pc.createDataChannel(this.DATA_CHANNEL_LABEL, {
      ordered: true,
      maxRetransmits: 3
    });

    this.setupDataChannelHandlers(clientId, dataChannel);
    this.setupPeerConnectionHandlers(clientId, pc);

    this.peerConnections.set(clientId, pc);
    this.dataChannels.set(clientId, dataChannel);
    this.audioQueues.set(clientId, []);

    return pc;
  }

  /**
   * Setup peer connection event handlers
   */
  private setupPeerConnectionHandlers(
    clientId: string,
    pc: any
  ): void {
    // ICE candidate gathering
    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        this.logger.debug(`ICE candidate for ${clientId}:`, event.candidate.candidate);
        this.emit('icecandidate', clientId, event.candidate);
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      this.logger.info(`Connection state for ${clientId}: ${pc.connectionState}`);
      this.emit('connectionstatechange', clientId, pc.connectionState);

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.handleConnectionFailure(clientId);
      }
    };

    // ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      this.logger.debug(`ICE connection state for ${clientId}: ${pc.iceConnectionState}`);
      this.emit('iceconnectionstatechange', clientId, pc.iceConnectionState);
    };

    // ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      this.logger.debug(`ICE gathering state for ${clientId}: ${pc.iceGatheringState}`);
      this.emit('icegatheringstatechange', clientId, pc.iceGatheringState);
    };
  }

  /**
   * Setup data channel event handlers
   */
  private setupDataChannelHandlers(
    clientId: string,
    dataChannel: any
  ): void {
    dataChannel.onopen = () => {
      this.logger.info(`Data channel opened for ${clientId}`);
      this.emit('datachannel-open', clientId);
      this.emit('datachannel-statechange', clientId, 'open');

      // Process any queued audio chunks
      this.processAudioQueue(clientId);
    };

    dataChannel.onclose = () => {
      this.logger.info(`Data channel closed for ${clientId}`);
      this.emit('datachannel-close', clientId);
      this.emit('datachannel-statechange', clientId, 'closed');
    };

    dataChannel.onerror = (event: any) => {
      const error = event.error || new Error('Data channel error');
      this.logger.error(`Data channel error for ${clientId}:`, error);
      this.emit('datachannel-error', clientId, error);
    };

    // Set buffered amount low threshold for backpressure
    dataChannel.bufferedAmountLowThreshold = this.HIGH_WATER_MARK / 2;
    dataChannel.onbufferedamountlow = () => {
      this.logger.debug(`Buffer drained for ${clientId}, processing queue`);
      this.processAudioQueue(clientId);
    };
  }

  /**
   * Create WebRTC offer
   */
  async createOffer(clientId: string): Promise<any> {
    const pc = this.peerConnections.get(clientId);
    if (!pc) {
      throw new Error(`No peer connection found for client ${clientId}`);
    }

    this.logger.info(`Creating offer for ${clientId}`);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return offer;
  }

  /**
   * Apply remote answer
   */
  async setRemoteAnswer(
    clientId: string,
    answer: any
  ): Promise<void> {
    const pc = this.peerConnections.get(clientId);
    if (!pc) {
      throw new Error(`No peer connection found for client ${clientId}`);
    }

    this.logger.info(`Setting remote answer for ${clientId}`);

    const remoteDesc = new RTCSessionDescription(answer);
    await pc.setRemoteDescription(remoteDesc);
  }

  /**
   * Add remote ICE candidate
   */
  async addIceCandidate(
    clientId: string,
    candidate: any
  ): Promise<void> {
    const pc = this.peerConnections.get(clientId);
    if (!pc) {
      throw new Error(`No peer connection found for client ${clientId}`);
    }

    this.logger.debug(`Adding ICE candidate for ${clientId}`);

    if (candidate.candidate) {
      const iceCandidate = new RTCIceCandidate(candidate);
      await pc.addIceCandidate(iceCandidate);
    }
  }

  /**
   * Send audio chunk via data channel
   */
  async sendAudioChunk(clientId: string, chunk: Buffer): Promise<void> {
    const dataChannel = this.dataChannels.get(clientId);
    if (!dataChannel) {
      throw new Error(`No peer connection found for client ${clientId}`);
    }

    // Queue if channel not ready or buffer is full
    if (
      dataChannel.readyState !== 'open' ||
      dataChannel.bufferedAmount > this.HIGH_WATER_MARK
    ) {
      this.logger.debug(
        `Queueing audio chunk for ${clientId} (state: ${dataChannel.readyState}, buffered: ${dataChannel.bufferedAmount})`
      );
      const queue = this.audioQueues.get(clientId) || [];
      queue.push(chunk);
      this.audioQueues.set(clientId, queue);

      if (dataChannel.bufferedAmount > this.HIGH_WATER_MARK) {
        this.emit('backpressure', clientId);
      }

      return;
    }

    // Send immediately
    try {
      dataChannel.send(chunk);
      this.logger.debug(`Sent ${chunk.length} bytes to ${clientId}`);
    } catch (error) {
      this.logger.error(`Failed to send audio chunk to ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Process queued audio chunks
   */
  private async processAudioQueue(clientId: string): Promise<void> {
    const queue = this.audioQueues.get(clientId);
    const dataChannel = this.dataChannels.get(clientId);

    if (!queue || !dataChannel || dataChannel.readyState !== 'open') {
      return;
    }

    this.logger.debug(`Processing ${queue.length} queued chunks for ${clientId}`);

    while (queue.length > 0 && dataChannel.bufferedAmount <= this.HIGH_WATER_MARK) {
      const chunk = queue.shift()!;
      try {
        dataChannel.send(chunk);
        this.logger.debug(`Sent queued chunk (${chunk.length} bytes) to ${clientId}`);
      } catch (error) {
        this.logger.error(`Failed to send queued chunk to ${clientId}:`, error);
        // Re-queue the chunk
        queue.unshift(chunk);
        break;
      }
    }

    this.audioQueues.set(clientId, queue);
  }

  /**
   * Process queue manually (for testing)
   */
  async processQueue(clientId: string): Promise<void> {
    await this.processAudioQueue(clientId);
  }

  /**
   * Get data channel for client
   */
  getDataChannel(clientId: string): any | null {
    return this.dataChannels.get(clientId) || null;
  }

  /**
   * Check if client has active connection
   */
  hasConnection(clientId: string): boolean {
    return this.peerConnections.has(clientId);
  }

  /**
   * Get number of active connections
   */
  getActiveConnectionsCount(): number {
    return this.peerConnections.size;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(clientId: string): ConnectionStats | null {
    const pc = this.peerConnections.get(clientId);
    const dataChannel = this.dataChannels.get(clientId);

    if (!pc) {
      return null;
    }

    return {
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      iceGatheringState: pc.iceGatheringState,
      signalingState: pc.signalingState,
      dataChannelState: dataChannel?.readyState,
      bufferedAmount: dataChannel?.bufferedAmount
    };
  }

  /**
   * Check if streaming for client
   */
  isStreaming(clientId: string): boolean {
    const dataChannel = this.dataChannels.get(clientId);
    return dataChannel?.readyState === 'open';
  }

  /**
   * Get queue length for client
   */
  getQueueLength(clientId: string): number {
    return this.audioQueues.get(clientId)?.length || 0;
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(clientId: string): void {
    this.logger.warn(`Connection failed for ${clientId}, cleaning up`);
    this.closePeerConnection(clientId);
  }

  /**
   * Close peer connection for client
   */
  async closePeerConnection(clientId: string): Promise<void> {
    this.logger.info(`Closing peer connection for ${clientId}`);

    const dataChannel = this.dataChannels.get(clientId);
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch (error) {
        this.logger.error(`Error closing data channel for ${clientId}:`, error);
      }
      this.dataChannels.delete(clientId);
    }

    const pc = this.peerConnections.get(clientId);
    if (pc) {
      try {
        pc.close();
      } catch (error) {
        this.logger.error(`Error closing peer connection for ${clientId}:`, error);
      }
      this.peerConnections.delete(clientId);
    }

    // Clear audio queue
    this.audioQueues.delete(clientId);

    this.emit('connection-closed', clientId);
  }

  /**
   * Close all peer connections
   */
  async closeAll(): Promise<void> {
    this.logger.info('Closing all peer connections');

    const clientIds = Array.from(this.peerConnections.keys());
    await Promise.all(
      clientIds.map((clientId) => this.closePeerConnection(clientId))
    );
  }
}
