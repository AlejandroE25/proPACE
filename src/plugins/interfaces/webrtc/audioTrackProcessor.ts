import { EventEmitter } from 'events';
import { EventBus } from '../../../events/eventBus.js';
import { Event, EventType } from '../../../events/types.js';
import { WebRTCPeerManager } from './webrtcPeerManager.js';
import type { Logger } from 'winston';

/**
 * Audio Track Processor
 * Consumes TTS_CHUNK events and streams audio to clients via WebRTC data channels
 */
export class AudioTrackProcessor extends EventEmitter {
  private eventBus: EventBus;
  private peerManager: WebRTCPeerManager;
  private logger: Logger;
  private streamingClients: Map<string, boolean> = new Map();
  private activeResponseIds: Map<string, string> = new Map();
  private initialized = false;

  private readonly END_MARKER = Buffer.from('TTS_END');
  private readonly ABORT_MARKER = Buffer.from('TTS_ABORT');

  constructor(
    eventBus: EventBus,
    peerManager: WebRTCPeerManager,
    logger: Logger
  ) {
    super();
    this.eventBus = eventBus;
    this.peerManager = peerManager;
    this.logger = logger;
  }

  /**
   * Initialize event subscriptions
   */
  initialize(): void {
    if (this.initialized) {
      this.logger.warn('AudioTrackProcessor already initialized');
      return;
    }

    this.logger.info('Initializing WebRTC audio track processor');

    // Subscribe to all TTS events
    this.eventBus.subscribe(
      [
        EventType.TTS_STARTED,
        EventType.TTS_CHUNK,
        EventType.TTS_COMPLETED,
        EventType.TTS_INTERRUPTED
      ],
      {
        id: 'webrtc-audio-processor',
        priority: 50, // Medium priority
        canHandle: (event: Event) => {
          return [
            EventType.TTS_STARTED,
            EventType.TTS_CHUNK,
            EventType.TTS_COMPLETED,
            EventType.TTS_INTERRUPTED
          ].includes(event.type);
        },
        handle: async (event: Event) => {
          try {
            await this.handleTTSEvent(event);
          } catch (error) {
            this.logger.error('Error handling TTS event:', error);
            this.emit('error', error);
          }
        }
      }
    );

    this.initialized = true;
  }

  /**
   * Handle TTS events
   */
  private async handleTTSEvent(event: Event): Promise<void> {
    const { clientId } = event.payload;

    if (!clientId) {
      this.logger.warn(`TTS event missing clientId:`, event.type);
      return;
    }

    switch (event.type) {
      case EventType.TTS_STARTED:
        await this.handleTTSStarted(event);
        break;

      case EventType.TTS_CHUNK:
        await this.handleTTSChunk(event);
        break;

      case EventType.TTS_COMPLETED:
        await this.handleTTSCompleted(event);
        break;

      case EventType.TTS_INTERRUPTED:
        await this.handleTTSInterrupted(event);
        break;
    }
  }

  /**
   * Handle TTS_STARTED event
   */
  private async handleTTSStarted(event: Event): Promise<void> {
    const { clientId, responseId } = event.payload;

    this.logger.info(`TTS started for ${clientId}, response ${responseId}`);

    // Clear any existing queue and mark as streaming
    this.streamingClients.set(clientId, true);
    this.activeResponseIds.set(clientId, responseId);

    // Clear queue (handled by peer manager)
    const queue = this.peerManager.getQueueLength(clientId);
    if (queue > 0) {
      this.logger.warn(`Clearing ${queue} queued chunks for ${clientId}`);
    }
  }

  /**
   * Handle TTS_CHUNK event
   */
  private async handleTTSChunk(event: Event): Promise<void> {
    const { clientId, responseId, chunk } = event.payload;

    if (!chunk || !Buffer.isBuffer(chunk)) {
      this.logger.warn(`TTS_CHUNK event missing or invalid chunk for ${clientId}`);
      return;
    }

    // Verify client has active connection
    if (!this.peerManager.hasConnection(clientId)) {
      this.logger.warn(`No peer connection for ${clientId}, dropping audio chunk`);
      return;
    }

    this.logger.debug(
      `Processing TTS chunk for ${clientId}: ${chunk.length} bytes (response ${responseId})`
    );

    try {
      await this.streamChunk(clientId, chunk);
    } catch (error) {
      this.logger.error(`Failed to stream chunk to ${clientId}:`, error);
      this.emit('error', error);
    }
  }

  /**
   * Handle TTS_COMPLETED event
   */
  private async handleTTSCompleted(event: Event): Promise<void> {
    const { clientId, responseId, totalBytes, duration } = event.payload;

    this.logger.info(
      `TTS completed for ${clientId}: ${totalBytes} bytes in ${duration}ms (response ${responseId})`
    );

    // Flush any remaining queued chunks
    await this.processQueue(clientId);

    // Send end marker
    try {
      await this.peerManager.sendAudioChunk(clientId, this.END_MARKER);
    } catch (error) {
      this.logger.error(`Failed to send end marker to ${clientId}:`, error);
    }

    // Mark as not streaming
    this.streamingClients.set(clientId, false);
    this.activeResponseIds.delete(clientId);
  }

  /**
   * Handle TTS_INTERRUPTED event
   */
  private async handleTTSInterrupted(event: Event): Promise<void> {
    const { clientId, responseId, reason } = event.payload;

    this.logger.info(
      `TTS interrupted for ${clientId}: ${reason} (response ${responseId})`
    );

    // Clear queue immediately (handled by peer manager - but we can help)
    this.cleanupClient(clientId);

    // Send abort marker
    try {
      await this.peerManager.sendAudioChunk(clientId, this.ABORT_MARKER);
    } catch (error) {
      this.logger.error(`Failed to send abort marker to ${clientId}:`, error);
    }

    // Mark as not streaming
    this.streamingClients.set(clientId, false);
    this.activeResponseIds.delete(clientId);
  }

  /**
   * Stream audio chunk to client
   */
  private async streamChunk(clientId: string, chunk: Buffer): Promise<void> {
    try {
      await this.peerManager.sendAudioChunk(clientId, chunk);
    } catch (error) {
      this.logger.error(`Error streaming chunk to ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Process audio queue for client
   */
  async processQueue(clientId: string): Promise<void> {
    await this.peerManager.processQueue(clientId);
  }

  /**
   * Check if client is streaming
   */
  isStreaming(clientId: string): boolean {
    return this.streamingClients.get(clientId) || false;
  }

  /**
   * Get active response ID for client
   */
  getActiveResponseId(clientId: string): string | null {
    return this.activeResponseIds.get(clientId) || null;
  }

  /**
   * Get queue length for client
   */
  getQueueLength(clientId: string): number {
    return this.peerManager.getQueueLength(clientId);
  }

  /**
   * Cleanup client audio state
   */
  cleanupClient(clientId: string): void {
    this.logger.debug(`Cleaning up audio state for ${clientId}`);

    this.streamingClients.delete(clientId);
    this.activeResponseIds.delete(clientId);
  }

  /**
   * Cleanup all state
   */
  cleanup(): void {
    this.logger.info('Cleaning up audio track processor');

    this.streamingClients.clear();
    this.activeResponseIds.clear();

    // Unsubscribe from events
    // Note: EventBus doesn't expose unsubscribe by handler ID yet
    // Would need to track subscription and unsubscribe here

    this.initialized = false;
  }
}
