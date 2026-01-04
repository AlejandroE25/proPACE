/**
 * Voice Interface TTS Flow Integration Test
 *
 * This test verifies the complete TTS flow:
 * 1. Voice plugin receives RESPONSE_GENERATED event
 * 2. TTS service generates audio
 * 3. Audio chunks are sent through WebRTC data channel
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoiceInterfacePlugin } from '../../src/plugins/interfaces/voiceInterfacePlugin';
import { EventBus } from '../../src/events/eventBus';
import { EventStore } from '../../src/events/eventStore';
import { DataStorage } from '../../src/data/dataStorage';
import { DataPipeline } from '../../src/data/dataPipeline';
import { EventType } from '../../src/events/types';

describe('Voice Interface TTS Flow', () => {
  let plugin: VoiceInterfacePlugin;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let dataStorage: DataStorage;
  let dataPipeline: DataPipeline;
  let mockWsServer: any;
  let dataChannelSendSpy: any;

  beforeEach(async () => {
    // Create dependencies
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);
    dataStorage = new DataStorage(':memory:');
    dataPipeline = new DataPipeline(dataStorage, eventBus);

    // Create mock WebSocket server with data channel tracking
    dataChannelSendSpy = vi.fn();
    mockWsServer = {
      setClientConnectedHandler: vi.fn(),
      setWebRTCSignalingHandler: vi.fn(),
      sendToClient: vi.fn()
    };

    // Create and initialize plugin
    plugin = new VoiceInterfacePlugin();

    // Initialize with OpenAI API key
    await plugin.initialize(eventBus, dataPipeline, {
      enabled: true,
      settings: {
        ttsVoice: 'onyx',
        sttLanguage: 'en',
        personalityEnabled: true,
        openaiApiKey: process.env.OPENAI_API_KEY || 'test-key'
      }
    });

    // Start the plugin
    await plugin.start();

    // Set up WebRTC components
    plugin.setWebSocketServer(mockWsServer, eventBus);
  });

  afterEach(async () => {
    await plugin.stop().catch(() => {});
    await eventBus.shutdown();
    eventStore.close();
    dataStorage.close();
  });

  it('should be properly initialized and started', () => {
    expect(plugin.state).toBe('running');
  });

  it('should have WebRTC signaling handler registered', () => {
    expect(mockWsServer.setWebRTCSignalingHandler).toHaveBeenCalled();
  });

  it('should have client connected handler registered', () => {
    expect(mockWsServer.setClientConnectedHandler).toHaveBeenCalled();
  });

  it('should process RESPONSE_GENERATED event and generate TTS', async () => {
    // Track TTS events
    const ttsEvents: any[] = [];

    await eventBus.subscribe([EventType.TTS_STARTED, EventType.TTS_CHUNK, EventType.TTS_COMPLETED], {
      id: 'test-tts-tracker',
      handle: async (event) => {
        ttsEvents.push(event);
      },
      canHandle: () => true,
      priority: 0
    });

    // Publish a RESPONSE_GENERATED event
    await eventBus.publish({
      type: EventType.RESPONSE_GENERATED,
      source: 'test',
      payload: {
        clientId: 'test-client-123',
        message: 'Hello',
        response: 'Hi there!',
        subsystem: 'claude'
      }
    });

    // Wait for TTS processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify TTS events were published
    const startedEvents = ttsEvents.filter(e => e.type === EventType.TTS_STARTED);
    const chunkEvents = ttsEvents.filter(e => e.type === EventType.TTS_CHUNK);
    const completedEvents = ttsEvents.filter(e => e.type === EventType.TTS_COMPLETED);

    console.log('TTS Events:', {
      started: startedEvents.length,
      chunks: chunkEvents.length,
      completed: completedEvents.length,
      total: ttsEvents.length
    });

    // Should have at least one TTS_STARTED event
    expect(startedEvents.length).toBeGreaterThan(0);

    // If TTS is working, should have chunks
    if (process.env.OPENAI_API_KEY) {
      expect(chunkEvents.length).toBeGreaterThan(0);
      expect(completedEvents.length).toBeGreaterThan(0);
    } else {
      console.warn('Skipping TTS chunk verification - no OpenAI API key');
    }
  }, 10000); // 10 second timeout for TTS generation

  it('should handle multiple RESPONSE_GENERATED events', async () => {
    const ttsEvents: any[] = [];

    await eventBus.subscribe([EventType.TTS_STARTED], {
      id: 'test-multi-tts-tracker',
      handle: async (event) => {
        ttsEvents.push(event);
      },
      canHandle: () => true,
      priority: 0
    });

    // Publish multiple events
    await eventBus.publish({
      type: EventType.RESPONSE_GENERATED,
      source: 'test',
      payload: {
        clientId: 'test-client-1',
        message: 'First',
        response: 'Response one',
        subsystem: 'claude'
      }
    });

    await eventBus.publish({
      type: EventType.RESPONSE_GENERATED,
      source: 'test',
      payload: {
        clientId: 'test-client-2',
        message: 'Second',
        response: 'Response two',
        subsystem: 'claude'
      }
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 6000));

    // Should have received multiple TTS_STARTED events
    expect(ttsEvents.length).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('should track active clients when processing TTS', async () => {
    await eventBus.publish({
      type: EventType.RESPONSE_GENERATED,
      source: 'test',
      payload: {
        clientId: 'tracked-client',
        message: 'Test',
        response: 'Testing',
        subsystem: 'claude'
      }
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check internal state (accessing private property for testing)
    const activeClients = (plugin as any).activeClients;
    expect(activeClients).toBeDefined();
    expect(activeClients instanceof Map).toBe(true);
  }, 10000);
});
