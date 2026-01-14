/**
 * Voice Interface Plugin
 *
 * Provides speech-to-text (STT), text-to-speech (TTS), and dynamic personality
 * management for voice interactions with proPACE.
 *
 * Architecture:
 * - Subscribes to RESPONSE_GENERATED events to trigger TTS
 * - Subscribes to USER_MESSAGE events for interruption detection
 * - Publishes TTS_STARTED, TTS_CHUNK, TTS_COMPLETED, TTS_INTERRUPTED events
 * - Publishes USER_SPEECH events from STT transcription
 * - Publishes PERSONALITY_CHANGED events based on conversation context
 */

import { BasePlugin } from '../basePlugin.js';
import { PluginMetadata, PluginCapability, PluginConfig } from '../types.js';
import { EventBus } from '../../events/eventBus.js';
import { DataPipeline } from '../../data/dataPipeline.js';
import { EventType, Event } from '../../events/types.js';
import { PiperTTSService } from './services/piperTtsService.js';
import { randomUUID } from 'crypto';
// import { STTService } from './services/sttService.js'; // TODO: Re-enable for STT
// import { PersonalityManager } from './services/personalityManager.js'; // TODO
// import { InterruptionManager } from './services/interruptionManager.js'; // TODO
import { TTSCache } from './utils/ttsCache.js';
import { WebRTCPeerManager } from './webrtc/webrtcPeerManager.js';
import { SignalingService } from './webrtc/signalingService.js';
import { AudioTrackProcessor } from './webrtc/audioTrackProcessor.js';
import { PACEWebSocketServer } from '../../server/websocket.js';
import { logger } from '../../utils/logger.js';

/**
 * Voice plugin configuration
 */
export interface VoiceConfig {
  piperPath?: string;      // Path to Piper TTS executable
  piperModelPath?: string; // Path to Piper voice model (.onnx)
  sttLanguage: string;     // STT language code (e.g., 'en')
  personalityEnabled: boolean;  // Enable dynamic personality switching
}

/**
 * Client voice session tracking
 */
interface ClientVoiceSession {
  clientId: string;
  responseId?: string;      // Current active response ID
  isPlaying: boolean;       // Whether audio is currently playing
  lastActivity: Date;       // Last activity timestamp
}

/**
 * Voice Interface Plugin
 */
export class VoiceInterfacePlugin extends BasePlugin {
  // Tools exposed to the agent (empty for interface plugins - they work via events)
  tools: import('../../types/plugin').PluginTool[] = [];

  private activeClients: Map<string, ClientVoiceSession>;
  private logger = logger;

  // Internal services
  private ttsService?: PiperTTSService;
  // private sttService?: STTService; // TODO: Re-enable for STT functionality
  // private personalityManager?: PersonalityManager; // TODO: Implement personality switching
  // private interruptionManager?: InterruptionManager; // TODO: Implement interruption handling
  private ttsCache?: TTSCache;

  // WebRTC components
  private peerManager?: WebRTCPeerManager;
  private signalingService?: SignalingService;
  private audioProcessor?: AudioTrackProcessor;
  // @ts-ignore - Stored for future use (signaling message routing)
  private _wsServer?: PACEWebSocketServer;

  constructor() {
    const metadata: PluginMetadata & { tags?: string[] } = {
      id: 'voice-interface',
      name: 'Voice Interface',
      version: '1.0.0',
      description: 'Speech-to-text, text-to-speech, and personality management',
      author: 'proPACE',
      capability: PluginCapability.INTERFACE,
      tags: ['voice', 'interface', 'tts', 'stt', 'webrtc']
    };

    super(metadata as PluginMetadata);

    this.activeClients = new Map();
  }

  /**
   * Initialize the plugin with dependencies
   */
  async initialize(eventBus: EventBus, dataPipeline: DataPipeline, config: PluginConfig): Promise<void> {
    await super.initialize(eventBus, dataPipeline, config);

    // Safely access settings
    const settings = config?.settings || {};

    // Initialize TTS cache
    this.ttsCache = new TTSCache({
      maxEntries: settings.ttsCacheSize || 100,
      ttlMs: settings.ttsCacheTTL || 3600000 // 1 hour default
    });

    // Initialize Piper TTS service (local, low-latency)
    // Defaults are set in PiperTTSService constructor based on platform
    this.ttsService = new PiperTTSService({
      eventBus,
      piperPath: settings.piperPath,
      modelPath: settings.piperModelPath
    });

    // TODO: Initialize STT service for speech-to-text functionality
    // this.sttService = new STTService({
    //   apiKey,
    //   language: settings.sttLanguage || 'en',
    //   eventBus
    // });

    // TODO: Initialize personality manager
    // this.personalityManager = new PersonalityManager(
    //   settings.personalityEnabled !== false // Enabled by default
    // );

    // TODO: Initialize interruption manager
    // this.interruptionManager = new InterruptionManager();

    // Initialize WebRTC components for TTS audio streaming
    // Note: wsServer will be injected via setWebSocketServer() method
    // which should be called from server initialization

    // Warmup TTS cache with common phrases (optional)
    if (settings.warmupCache !== false) {
      await this.warmupTTSCache();
    }
  }

  /**
   * Set WebSocket server instance (called from server initialization)
   */
  setWebSocketServer(wsServer: PACEWebSocketServer, eventBus?: EventBus): void {
    this._wsServer = wsServer;

    // Initialize WebRTC components now that we have wsServer
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' }
    ];

    this.peerManager = new WebRTCPeerManager(iceServers, this.logger as any);
    this.signalingService = new SignalingService(wsServer, this.peerManager, this.logger as any);

    // Use passed eventBus or try to get from BasePlugin (may not be set yet)
    const busToUse = eventBus || (this as any)._eventBus;
    if (!busToUse) {
      throw new Error('EventBus not available - must be passed to setWebSocketServer()');
    }

    this.audioProcessor = new AudioTrackProcessor(busToUse, this.peerManager, this.logger as any);

    // Initialize services
    this.signalingService.initialize();
    this.audioProcessor.initialize();

    // Register WebRTC signaling handler to route messages to signaling service
    wsServer.setWebRTCSignalingHandler((clientId: string, message: string) => {
      return this.signalingService!.handleWebSocketMessage(clientId, message);
    });

    // Register handler for new client connections
    wsServer.setClientConnectedHandler((clientId: string) => {
      this.handleClientConnected(clientId);
    });

    this.logger.info('WebRTC TTS components initialized');
  }

  /**
   * Handle new client connection - initiate WebRTC
   */
  private handleClientConnected(clientId: string): void {
    this.logger.info(`New client connected, initiating WebRTC: ${clientId}`);

    // Initiate WebRTC connection asynchronously
    this.signalingService!.initiateConnection(clientId).catch((error) => {
      this.logger.error(`Failed to initiate WebRTC for ${clientId}:`, error);
    });
  }

  /**
   * Called when plugin starts
   */
  protected async onStart(): Promise<void> {
    // Subscribe to events
    this.subscribeToEvents();
  }

  /**
   * Called when plugin stops
   */
  protected async onStop(): Promise<void> {
    // Cleanup active sessions
    this.activeClients.clear();

    // Unsubscribe from events (EventBus handles this automatically on plugin stop)
  }

  /**
   * Subscribe to EventBus events
   */
  private subscribeToEvents(): void {
    if (!this['_eventBus']) {
      throw new Error('EventBus not initialized');
    }

    const eventBus = this['_eventBus'] as EventBus;

    // Subscribe to RESPONSE_GENERATED events for TTS generation (non-streaming)
    eventBus.subscribe([EventType.RESPONSE_GENERATED], {
      id: `${this.metadata.id}-response-handler`,
      handle: this.handleResponseGenerated.bind(this),
      canHandle: () => true,
      priority: 1
    });
    logger.info('Voice plugin subscribed to RESPONSE_GENERATED events');

    // Subscribe to RESPONSE_CHUNK events for streaming TTS
    eventBus.subscribe([EventType.RESPONSE_CHUNK], {
      id: `${this.metadata.id}-chunk-handler`,
      handle: this.handleResponseChunk.bind(this),
      canHandle: () => true,
      priority: 1
    });
    logger.info('Voice plugin subscribed to RESPONSE_CHUNK events');

    // Subscribe to USER_MESSAGE events for interruption detection
    eventBus.subscribe([EventType.USER_MESSAGE], {
      id: `${this.metadata.id}-interruption-handler`,
      handle: this.handleUserMessage.bind(this),
      canHandle: () => true,
      priority: 1
    });
    logger.info('Voice plugin subscribed to USER_MESSAGE events');
  }

  /**
   * Handle RESPONSE_GENERATED event - trigger TTS
   */
  private async handleResponseGenerated(event: Event): Promise<void> {
    logger.info('Voice plugin received RESPONSE_GENERATED event', { clientId: event.payload.clientId });
    try {
      const { clientId, response } = event.payload;

      if (!clientId || !response) {
        return; // Invalid payload
      }

      // Track client session
      let session = this.activeClients.get(clientId);
      if (!session) {
        session = {
          clientId,
          isPlaying: false,
          lastActivity: new Date()
        };
        this.activeClients.set(clientId, session);
      }

      // Update session
      session.lastActivity = new Date();

      // Generate TTS and publish TTS events
      const responseId = randomUUID();
      session.responseId = responseId;
      session.isPlaying = true;

      // Generate TTS audio (this will emit TTS_CHUNK events)
      if (this.ttsService) {
        await this.ttsService.generate(response, responseId, clientId);
      }

    } catch (error) {
      this.recordError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle RESPONSE_CHUNK event - trigger streaming TTS for sentence
   */
  private async handleResponseChunk(event: Event): Promise<void> {
    logger.info('Voice plugin received RESPONSE_CHUNK event', { clientId: event.payload.clientId });
    try {
      const { clientId, chunk, isComplete } = event.payload;

      if (!clientId || !chunk) {
        return; // Invalid payload
      }

      // Track client session
      let session = this.activeClients.get(clientId);
      if (!session) {
        session = {
          clientId,
          isPlaying: false,
          lastActivity: new Date()
        };
        this.activeClients.set(clientId, session);
      }

      // Update session
      session.lastActivity = new Date();

      // Generate TTS for this sentence chunk
      const responseId = randomUUID();
      session.responseId = responseId;
      session.isPlaying = true;

      logger.debug(`[Streaming TTS] Generating audio for chunk (${chunk.length} chars, isComplete: ${isComplete})`);

      // Generate TTS audio for this chunk (this will emit TTS_CHUNK events)
      if (this.ttsService) {
        await this.ttsService.generate(chunk, responseId, clientId);
      }

    } catch (error) {
      this.recordError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle USER_MESSAGE event - detect interruptions
   */
  private async handleUserMessage(event: Event): Promise<void> {
    try {
      const { clientId } = event.payload;

      if (!clientId) {
        return; // Invalid payload
      }

      const session = this.activeClients.get(clientId);
      if (session && session.isPlaying && session.responseId) {
        // User is interrupting active TTS
        // TODO: Abort TTS and publish TTS_INTERRUPTED event
        // await this.interruptionManager.interrupt(clientId, session.responseId);
        // await this.publishEvent({
        //   type: EventType.TTS_INTERRUPTED,
        //   source: this.metadata.id,
        //   payload: { clientId, responseId: session.responseId }
        // });

        session.isPlaying = false;
        session.responseId = undefined;
      }
    } catch (error) {
      this.recordError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Warmup TTS cache with common phrases
   */
  private async warmupTTSCache(): Promise<void> {
    if (!this.ttsCache || !this.ttsService) {
      return;
    }

    const commonPhrases = [
      'Hello!',
      'How can I help you?',
      'I understand.',
      'Let me think about that.',
      'Is there anything else?',
      'Got it.',
      'One moment please.'
    ];

    await this.ttsCache.warmup(commonPhrases, async (text: string) => {
      await this.ttsService!.generate(text, 'warmup-' + Date.now());
      // Return empty buffer for warmup (actual audio not needed)
      return Buffer.alloc(0);
    });
  }


  /**
   * Update plugin configuration
   */
  async updateConfig(config: Partial<PluginConfig>): Promise<void> {
    if (config.settings) {
      this.config.settings = {
        ...this.config.settings,
        ...config.settings
      };
    }

    await super.updateConfig(config);
  }

  /**
   * Poll method (required by MonitoringPlugin interface, but not used for voice)
   */
  async poll(): Promise<void> {
    // Voice plugin doesn't use polling - it's event-driven
    // This method is here to satisfy the MonitoringPlugin interface
  }
}
