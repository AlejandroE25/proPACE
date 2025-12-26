import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioTrackProcessor } from '../../../../../src/plugins/interfaces/webrtc/audioTrackProcessor.js';
import { EventBus } from '../../../../../src/events/eventBus.js';
import { EventStore } from '../../../../../src/events/eventStore.js';
import { EventType, EventPriority } from '../../../../../src/events/types.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('AudioTrackProcessor', () => {
  let processor: AudioTrackProcessor;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let mockPeerManager: any;
  const testClientId = 'test-client-123';
  const testResponseId = 'response-456';

  beforeEach(() => {
    eventStore = new EventStore(100);
    eventBus = new EventBus(eventStore, logger);

    // Mock Peer Manager
    mockPeerManager = {
      sendAudioChunk: vi.fn().mockResolvedValue(undefined),
      getDataChannel: vi.fn().mockReturnValue({
        readyState: 'open',
        bufferedAmount: 0
      }),
      hasConnection: vi.fn().mockReturnValue(true)
    };

    processor = new AudioTrackProcessor(eventBus, mockPeerManager, logger);
  });

  afterEach(() => {
    processor.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(() => processor.initialize()).not.toThrow();
    });

    it('should subscribe to TTS events', () => {
      processor.initialize();

      const subscriptions = eventBus.getSubscriptions();
      const processorSub = subscriptions.find(
        (s) => s.handler.id === 'webrtc-audio-processor'
      );

      expect(processorSub).toBeDefined();
    });

    it('should subscribe to correct event types', () => {
      processor.initialize();

      const subscriptions = eventBus.getSubscriptions();
      const processorSub = subscriptions.find(
        (s) => s.handler.id === 'webrtc-audio-processor'
      );

      expect(processorSub?.eventTypes).toContain(EventType.TTS_STARTED);
      expect(processorSub?.eventTypes).toContain(EventType.TTS_CHUNK);
      expect(processorSub?.eventTypes).toContain(EventType.TTS_COMPLETED);
      expect(processorSub?.eventTypes).toContain(EventType.TTS_INTERRUPTED);
    });

    it('should not initialize twice', () => {
      processor.initialize();
      const initialSubs = eventBus.getSubscriptions().length;

      processor.initialize(); // Second call

      const finalSubs = eventBus.getSubscriptions().length;
      expect(finalSubs).toBe(initialSubs);
    });
  });

  describe('TTS_STARTED Event Handling', () => {
    beforeEach(() => {
      processor.initialize();
    });

    it('should handle TTS_STARTED event', async () => {
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'Hello world'
        }
      });

      // Should prepare streaming state
      expect(processor.isStreaming(testClientId)).toBe(true);
    });

    it('should clear existing queue on TTS_STARTED', async () => {
      // Add some data to queue
      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'old-response',
          clientId: testClientId,
          chunk: Buffer.from('old data')
        }
      });

      // Start new TTS
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'New response'
        }
      });

      // Old queue should be cleared
      expect(processor.getQueueLength(testClientId)).toBe(0);
    });

    it('should handle TTS_STARTED without clientId', async () => {
      await expect(
        eventBus.publish({
          type: EventType.TTS_STARTED,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            text: 'Hello world'
            // Missing clientId
          }
        })
      ).resolves.not.toThrow(); // Should log warning but not crash
    });

    it('should track active response ID', async () => {
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'Hello world'
        }
      });

      expect(processor.getActiveResponseId(testClientId)).toBe(testResponseId);
    });
  });

  describe('TTS_CHUNK Event Handling', () => {
    beforeEach(() => {
      processor.initialize();
    });

    it('should process TTS audio chunk', async () => {
      const audioChunk = Buffer.from('test audio data');

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: audioChunk
        }
      });

      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalledWith(
        testClientId,
        audioChunk
      );
    });

    it('should queue chunks when data channel not ready', async () => {
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'connecting',
        bufferedAmount: 0
      });

      const audioChunk = Buffer.from('test audio data');

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: audioChunk
        }
      });

      // Chunk should be queued, not sent immediately
      expect(processor.getQueueLength(testClientId)).toBe(1);
    });

    it('should process queued chunks when channel opens', async () => {
      // Queue chunks while channel is connecting
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'connecting',
        bufferedAmount: 0
      });

      const chunk1 = Buffer.from('chunk 1');
      const chunk2 = Buffer.from('chunk 2');

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: chunk1
        }
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: chunk2
        }
      });

      expect(processor.getQueueLength(testClientId)).toBe(2);

      // Channel opens
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'open',
        bufferedAmount: 0
      });

      await processor.processQueue(testClientId);

      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalledTimes(2);
      expect(processor.getQueueLength(testClientId)).toBe(0);
    });

    it('should maintain chunk order (FIFO)', async () => {
      const chunks = [
        Buffer.from('chunk 1'),
        Buffer.from('chunk 2'),
        Buffer.from('chunk 3')
      ];

      for (const chunk of chunks) {
        await eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            clientId: testClientId,
            chunk
          }
        });
      }

      const calls = mockPeerManager.sendAudioChunk.mock.calls;
      expect(calls[0][1]).toEqual(chunks[0]);
      expect(calls[1][1]).toEqual(chunks[1]);
      expect(calls[2][1]).toEqual(chunks[2]);
    });

    it('should handle large audio chunks', async () => {
      const largeChunk = Buffer.alloc(64 * 1024); // 64KB

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: largeChunk
        }
      });

      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalledWith(
        testClientId,
        largeChunk
      );
    });

    it('should handle missing chunk data', async () => {
      await expect(
        eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            clientId: testClientId
            // Missing chunk
          }
        })
      ).resolves.not.toThrow(); // Should log warning but not crash
    });

    it('should route chunks to correct client', async () => {
      const chunk1 = Buffer.from('client1 audio');
      const chunk2 = Buffer.from('client2 audio');

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp1',
          clientId: 'client1',
          chunk: chunk1
        }
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp2',
          clientId: 'client2',
          chunk: chunk2
        }
      });

      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalledWith(
        'client1',
        chunk1
      );
      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalledWith(
        'client2',
        chunk2
      );
    });
  });

  describe('TTS_COMPLETED Event Handling', () => {
    beforeEach(() => {
      processor.initialize();
    });

    it('should handle TTS_COMPLETED event', async () => {
      await eventBus.publish({
        type: EventType.TTS_COMPLETED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          totalBytes: 1024,
          duration: 1000
        }
      });

      expect(processor.isStreaming(testClientId)).toBe(false);
    });

    it('should flush remaining queued chunks on completion', async () => {
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'connecting',
        bufferedAmount: 0
      });

      // Queue some chunks
      const chunk1 = Buffer.from('chunk 1');
      const chunk2 = Buffer.from('chunk 2');

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: chunk1
        }
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: chunk2
        }
      });

      // Channel opens
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'open',
        bufferedAmount: 0
      });

      // Complete TTS
      await eventBus.publish({
        type: EventType.TTS_COMPLETED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          totalBytes: 14,
          duration: 500
        }
      });

      // Queue should be flushed
      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalledTimes(2);
    });

    it('should send end marker on completion', async () => {
      await eventBus.publish({
        type: EventType.TTS_COMPLETED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          totalBytes: 1024,
          duration: 1000
        }
      });

      // Should send special end marker
      const calls = mockPeerManager.sendAudioChunk.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toEqual(Buffer.from('TTS_END'));
    });

    it('should clear active response ID on completion', async () => {
      // Start TTS
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'Hello'
        }
      });

      expect(processor.getActiveResponseId(testClientId)).toBe(testResponseId);

      // Complete TTS
      await eventBus.publish({
        type: EventType.TTS_COMPLETED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          totalBytes: 100,
          duration: 500
        }
      });

      expect(processor.getActiveResponseId(testClientId)).toBeNull();
    });
  });

  describe('TTS_INTERRUPTED Event Handling', () => {
    beforeEach(() => {
      processor.initialize();
    });

    it('should handle TTS_INTERRUPTED event', async () => {
      await eventBus.publish({
        type: EventType.TTS_INTERRUPTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          reason: 'User interrupted'
        }
      });

      expect(processor.isStreaming(testClientId)).toBe(false);
    });

    it('should clear queue immediately on interruption', async () => {
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'connecting',
        bufferedAmount: 0
      });

      // Queue some chunks
      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: Buffer.from('chunk 1')
        }
      });

      expect(processor.getQueueLength(testClientId)).toBe(1);

      // Interrupt
      await eventBus.publish({
        type: EventType.TTS_INTERRUPTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          reason: 'User interrupted'
        }
      });

      expect(processor.getQueueLength(testClientId)).toBe(0);
    });

    it('should send abort marker on interruption', async () => {
      await eventBus.publish({
        type: EventType.TTS_INTERRUPTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          reason: 'User interrupted'
        }
      });

      const calls = mockPeerManager.sendAudioChunk.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toEqual(Buffer.from('TTS_ABORT'));
    });

    it('should clear active response ID on interruption', async () => {
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'Hello'
        }
      });

      await eventBus.publish({
        type: EventType.TTS_INTERRUPTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          reason: 'User interrupted'
        }
      });

      expect(processor.getActiveResponseId(testClientId)).toBeNull();
    });
  });

  describe('Backpressure Handling', () => {
    beforeEach(() => {
      processor.initialize();
    });

    it('should respect data channel buffer limit', async () => {
      const HIGH_WATER_MARK = 256 * 1024; // 256KB

      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'open',
        bufferedAmount: HIGH_WATER_MARK + 1000 // Over threshold
      });

      const chunk = Buffer.from('test audio');

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk
        }
      });

      // Should queue instead of sending
      expect(processor.getQueueLength(testClientId)).toBeGreaterThan(0);
    });

    it('should resume sending when buffer drains', async () => {
      const HIGH_WATER_MARK = 256 * 1024;

      // High buffer - should queue
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'open',
        bufferedAmount: HIGH_WATER_MARK + 1000
      });

      const chunk = Buffer.from('test audio');

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk
        }
      });

      // Buffer drains
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'open',
        bufferedAmount: 1000 // Below threshold
      });

      await processor.processQueue(testClientId);

      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalled();
    });

    it('should emit backpressure warning event', async () => {
      const warnings: string[] = [];

      processor.on('backpressure', (clientId) => {
        warnings.push(clientId);
      });

      const HIGH_WATER_MARK = 256 * 1024;

      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'open',
        bufferedAmount: HIGH_WATER_MARK + 1000
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: Buffer.from('test')
        }
      });

      expect(warnings).toContain(testClientId);
    });
  });

  describe('Multi-Client Handling', () => {
    beforeEach(() => {
      processor.initialize();
    });

    it('should handle concurrent TTS streams for different clients', async () => {
      const chunk1 = Buffer.from('client1 audio');
      const chunk2 = Buffer.from('client2 audio');

      await Promise.all([
        eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: 'resp1',
            clientId: 'client1',
            chunk: chunk1
          }
        }),
        eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: 'resp2',
            clientId: 'client2',
            chunk: chunk2
          }
        })
      ]);

      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalledWith(
        'client1',
        chunk1
      );
      expect(mockPeerManager.sendAudioChunk).toHaveBeenCalledWith(
        'client2',
        chunk2
      );
    });

    it('should maintain separate queues per client', async () => {
      mockPeerManager.getDataChannel.mockReturnValue({
        readyState: 'connecting',
        bufferedAmount: 0
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp1',
          clientId: 'client1',
          chunk: Buffer.from('client1 data')
        }
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp2',
          clientId: 'client2',
          chunk: Buffer.from('client2 data')
        }
      });

      expect(processor.getQueueLength('client1')).toBe(1);
      expect(processor.getQueueLength('client2')).toBe(1);
    });

    it('should not cross-contaminate audio between clients', async () => {
      const calls: any[] = [];

      mockPeerManager.sendAudioChunk.mockImplementation(
        (clientId: string, chunk: Buffer) => {
          calls.push({ clientId, chunk });
        }
      );

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp1',
          clientId: 'client1',
          chunk: Buffer.from('client1 audio')
        }
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp2',
          clientId: 'client2',
          chunk: Buffer.from('client2 audio')
        }
      });

      const client1Calls = calls.filter((c) => c.clientId === 'client1');
      const client2Calls = calls.filter((c) => c.clientId === 'client2');

      expect(client1Calls[0].chunk.toString()).toBe('client1 audio');
      expect(client2Calls[0].chunk.toString()).toBe('client2 audio');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      processor.initialize();
    });

    it('should handle peer connection send failures', async () => {
      mockPeerManager.sendAudioChunk.mockRejectedValueOnce(
        new Error('Send failed')
      );

      await expect(
        eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            clientId: testClientId,
            chunk: Buffer.from('test')
          }
        })
      ).resolves.not.toThrow(); // Should log error but not crash
    });

    it('should handle missing peer connection', async () => {
      mockPeerManager.hasConnection.mockReturnValue(false);
      mockPeerManager.sendAudioChunk.mockRejectedValueOnce(
        new Error('No peer connection')
      );

      await expect(
        eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            clientId: 'non-existent-client',
            chunk: Buffer.from('test')
          }
        })
      ).resolves.not.toThrow();
    });

    it('should emit error events on failures', async () => {
      const errors: Error[] = [];

      processor.on('error', (error: Error) => {
        errors.push(error);
      });

      mockPeerManager.sendAudioChunk.mockRejectedValueOnce(
        new Error('Test error')
      );

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: Buffer.from('test')
        }
      });

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      processor.initialize();
    });

    it('should cleanup all client state', async () => {
      // Create some state
      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: Buffer.from('test')
        }
      });

      processor.cleanupClient(testClientId);

      expect(processor.isStreaming(testClientId)).toBe(false);
      expect(processor.getQueueLength(testClientId)).toBe(0);
      expect(processor.getActiveResponseId(testClientId)).toBeNull();
    });

    it('should cleanup on service shutdown', () => {
      processor.cleanup();

      const subscriptions = eventBus.getSubscriptions();
      const processorSub = subscriptions.find(
        (s) => s.handler.id === 'webrtc-audio-processor'
      );

      expect(processorSub).toBeUndefined();
    });
  });
});
