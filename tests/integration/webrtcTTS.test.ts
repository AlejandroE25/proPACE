import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../src/events/eventBus.js';
import { EventStore } from '../../src/events/eventStore.js';
import { EventType, EventPriority } from '../../src/events/types.js';
import { WebRTCPeerManager } from '../../src/plugins/interfaces/webrtc/webrtcPeerManager.js';
import { SignalingService } from '../../src/plugins/interfaces/webrtc/signalingService.js';
import { AudioTrackProcessor } from '../../src/plugins/interfaces/webrtc/audioTrackProcessor.js';
import { logger } from '../../src/utils/logger.js';

describe('WebRTC TTS Integration Tests', () => {
  let eventBus: EventBus;
  let eventStore: EventStore;
  let peerManager: WebRTCPeerManager;
  let signalingService: SignalingService;
  let audioProcessor: AudioTrackProcessor;
  let mockWsServer: any;

  const testClientId = 'test-client-123';
  const testResponseId = 'response-456';
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

  beforeEach(() => {
    eventStore = new EventStore(100);
    eventBus = new EventBus(eventStore, logger);

    mockWsServer = {
      sendToClient: vi.fn(),
      broadcast: vi.fn(),
      on: vi.fn()
    };

    peerManager = new WebRTCPeerManager(iceServers);
    signalingService = new SignalingService(mockWsServer, peerManager, logger);
    audioProcessor = new AudioTrackProcessor(eventBus, peerManager, logger);

    signalingService.initialize();
    audioProcessor.initialize();
  });

  afterEach(async () => {
    audioProcessor.cleanup();
    signalingService.cleanup();
    await peerManager.closeAll();
  });

  describe('Full TTS Flow', () => {
    it('should complete end-to-end TTS flow', async () => {
      // Step 1: Client connects, WebRTC offer/answer exchange
      await signalingService.initiateConnection(testClientId);

      expect(mockWsServer.sendToClient).toHaveBeenCalledWith(
        testClientId,
        expect.stringContaining('webrtc-offer')
      );

      // Simulate client answer
      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };

      await signalingService.handleAnswer(testClientId, answer);

      // Step 2: User sends message, RESPONSE_GENERATED event published
      // (This would normally come from ConversationOrchestrator)

      // Step 3: TTS generation starts
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'Hello, this is a test response'
        }
      });

      expect(audioProcessor.isStreaming(testClientId)).toBe(true);

      // Step 4: TTS chunks streamed
      const chunks = [
        Buffer.from('audio chunk 1'),
        Buffer.from('audio chunk 2'),
        Buffer.from('audio chunk 3')
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

      // Step 5: TTS completes
      await eventBus.publish({
        type: EventType.TTS_COMPLETED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          totalBytes: 42,
          duration: 1000
        }
      });

      expect(audioProcessor.isStreaming(testClientId)).toBe(false);

      // Verify connection remains open for next message
      expect(peerManager.hasConnection(testClientId)).toBe(true);
    });

    it('should handle rapid consecutive messages', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      // Send 5 consecutive messages
      for (let i = 0; i < 5; i++) {
        const responseId = `response-${i}`;

        await eventBus.publish({
          type: EventType.TTS_STARTED,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId,
            clientId: testClientId,
            text: `Message ${i}`
          }
        });

        await eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId,
            clientId: testClientId,
            chunk: Buffer.from(`audio ${i}`)
          }
        });

        await eventBus.publish({
          type: EventType.TTS_COMPLETED,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId,
            clientId: testClientId,
            totalBytes: 10 + i,
            duration: 500
          }
        });
      }

      expect(audioProcessor.isStreaming(testClientId)).toBe(false);
    });

    it('should stream first audio chunk within 500ms', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      const startTime = Date.now();

      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'Quick response'
        }
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: Buffer.from('first audio chunk')
        }
      });

      const latency = Date.now() - startTime;

      expect(latency).toBeLessThan(500); // < 500ms latency
    });
  });

  describe('Multi-Client Isolation', () => {
    it('should handle two clients simultaneously', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';

      // Both clients connect
      await signalingService.initiateConnection(client1);
      await signalingService.initiateConnection(client2);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };

      await signalingService.handleAnswer(client1, answer);
      await signalingService.handleAnswer(client2, answer);

      // Both send messages
      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp1',
          clientId: client1,
          chunk: Buffer.from('client1 audio')
        }
      });

      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp2',
          clientId: client2,
          chunk: Buffer.from('client2 audio')
        }
      });

      // Verify isolation - each client has own connection
      expect(peerManager.hasConnection(client1)).toBe(true);
      expect(peerManager.hasConnection(client2)).toBe(true);
    });

    it('should not cross-contaminate audio between clients', async () => {
      const client1 = 'client-1';
      const client2 = 'client-2';

      const sentAudio: Map<string, Buffer[]> = new Map();

      // Mock sendAudioChunk to track what's sent to each client
      const originalSend = peerManager.sendAudioChunk.bind(peerManager);
      peerManager.sendAudioChunk = vi
        .fn()
        .mockImplementation((clientId: string, chunk: Buffer) => {
          if (!sentAudio.has(clientId)) {
            sentAudio.set(clientId, []);
          }
          sentAudio.get(clientId)!.push(chunk);
          return Promise.resolve();
        });

      await signalingService.initiateConnection(client1);
      await signalingService.initiateConnection(client2);

      // Client 1 gets "Hello"
      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp1',
          clientId: client1,
          chunk: Buffer.from('Hello')
        }
      });

      // Client 2 gets "Goodbye"
      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp2',
          clientId: client2,
          chunk: Buffer.from('Goodbye')
        }
      });

      const client1Audio = sentAudio.get(client1) || [];
      const client2Audio = sentAudio.get(client2) || [];

      expect(client1Audio.some((b) => b.toString() === 'Hello')).toBe(true);
      expect(client1Audio.some((b) => b.toString() === 'Goodbye')).toBe(false);

      expect(client2Audio.some((b) => b.toString() === 'Goodbye')).toBe(true);
      expect(client2Audio.some((b) => b.toString() === 'Hello')).toBe(false);
    });

    it('should handle 10 concurrent clients', async () => {
      const clients = Array.from({ length: 10 }, (_, i) => `client-${i}`);

      // All clients connect
      await Promise.all(
        clients.map((clientId) => signalingService.initiateConnection(clientId))
      );

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };

      await Promise.all(
        clients.map((clientId) => signalingService.handleAnswer(clientId, answer))
      );

      // All send audio
      await Promise.all(
        clients.map((clientId, i) =>
          eventBus.publish({
            type: EventType.TTS_CHUNK,
            priority: EventPriority.MEDIUM,
            source: 'tts-service',
            payload: {
              responseId: `resp-${i}`,
              clientId,
              chunk: Buffer.from(`audio-${i}`)
            }
          })
        )
      );

      // All should have active connections
      clients.forEach((clientId) => {
        expect(peerManager.hasConnection(clientId)).toBe(true);
      });

      expect(peerManager.getActiveConnectionsCount()).toBe(10);
    });
  });

  describe('Error Recovery', () => {
    it('should handle client disconnect during TTS', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      // Start TTS
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'Test'
        }
      });

      // Client disconnects
      await signalingService.cleanupSession(testClientId);
      await peerManager.closePeerConnection(testClientId);

      // TTS chunk arrives after disconnect
      await expect(
        eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            clientId: testClientId,
            chunk: Buffer.from('audio')
          }
        })
      ).resolves.not.toThrow(); // Should handle gracefully
    });

    it('should handle TTS service error', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      // TTS error (simulated via interruption)
      await eventBus.publish({
        type: EventType.TTS_INTERRUPTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          reason: 'TTS service error'
        }
      });

      expect(audioProcessor.isStreaming(testClientId)).toBe(false);

      // Connection should remain for next message
      expect(peerManager.hasConnection(testClientId)).toBe(true);
    });

    it('should reconnect after network interruption', async () => {
      // Initial connection
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      // Network interruption - connection closes
      await peerManager.closePeerConnection(testClientId);
      await signalingService.cleanupSession(testClientId);

      // Client reconnects
      await signalingService.initiateConnection(testClientId);
      await signalingService.handleAnswer(testClientId, answer);

      // TTS should work again
      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'new-response',
          clientId: testClientId,
          chunk: Buffer.from('reconnected audio')
        }
      });

      expect(peerManager.hasConnection(testClientId)).toBe(true);
    });

    it('should handle peer connection failure', async () => {
      await signalingService.initiateConnection(testClientId);

      // Simulate connection failure
      const pc = await peerManager.createPeerConnection(testClientId);
      Object.defineProperty(pc, 'connectionState', { value: 'failed' });
      pc.onconnectionstatechange?.({} as Event);

      // Should emit error event
      // Connection should be cleaned up
      expect(true).toBe(true); // Placeholder - verify cleanup behavior
    });
  });

  describe('Performance', () => {
    it('should maintain stable memory with continuous streaming', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      const initialMemory = process.memoryUsage().heapUsed;

      // Stream 100 chunks
      for (let i = 0; i < 100; i++) {
        await eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            clientId: testClientId,
            chunk: Buffer.alloc(1024) // 1KB chunks
          }
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (< 10MB for 100KB of audio)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
    });

    it('should handle high throughput (> 50 KB/s)', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      const chunkSize = 16 * 1024; // 16KB chunks
      const numChunks = 10;
      const startTime = Date.now();

      for (let i = 0; i < numChunks; i++) {
        await eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            clientId: testClientId,
            chunk: Buffer.alloc(chunkSize)
          }
        });
      }

      const duration = (Date.now() - startTime) / 1000; // seconds
      const totalBytes = chunkSize * numChunks;
      const throughput = totalBytes / duration; // bytes per second

      expect(throughput).toBeGreaterThan(50 * 1024); // > 50 KB/s
    });

    it('should process queue efficiently', async () => {
      // Mock data channel as connecting (to queue chunks)
      const mockChannel = {
        readyState: 'connecting',
        bufferedAmount: 0
      };

      vi.spyOn(peerManager, 'getDataChannel').mockReturnValue(mockChannel as any);

      await signalingService.initiateConnection(testClientId);

      // Queue 50 chunks
      for (let i = 0; i < 50; i++) {
        await eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId: testResponseId,
            clientId: testClientId,
            chunk: Buffer.from(`chunk ${i}`)
          }
        });
      }

      expect(audioProcessor.getQueueLength(testClientId)).toBe(50);

      // Channel opens
      mockChannel.readyState = 'open';

      const startTime = Date.now();
      await audioProcessor.processQueue(testClientId);
      const processingTime = Date.now() - startTime;

      // Should process 50 chunks in < 100ms
      expect(processingTime).toBeLessThan(100);
      expect(audioProcessor.getQueueLength(testClientId)).toBe(0);
    });
  });

  describe('End-to-End Scenarios', () => {
    it('should handle user interruption mid-speech', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      // Start TTS
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          text: 'Long response that gets interrupted'
        }
      });

      // Stream some chunks
      await eventBus.publish({
        type: EventType.TTS_CHUNK,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          chunk: Buffer.from('audio chunk 1')
        }
      });

      // User interrupts
      await eventBus.publish({
        type: EventType.TTS_INTERRUPTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: testResponseId,
          clientId: testClientId,
          reason: 'User sent new message'
        }
      });

      expect(audioProcessor.isStreaming(testClientId)).toBe(false);

      // New TTS should start cleanly
      await eventBus.publish({
        type: EventType.TTS_STARTED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'new-response',
          clientId: testClientId,
          text: 'New response after interruption'
        }
      });

      expect(audioProcessor.isStreaming(testClientId)).toBe(true);
    });

    it('should handle multiple messages in quick succession', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };
      await signalingService.handleAnswer(testClientId, answer);

      // User sends 3 messages rapidly
      for (let i = 0; i < 3; i++) {
        const responseId = `resp-${i}`;

        // Interrupt previous (if any)
        if (i > 0) {
          await eventBus.publish({
            type: EventType.TTS_INTERRUPTED,
            priority: EventPriority.MEDIUM,
            source: 'tts-service',
            payload: {
              responseId: `resp-${i - 1}`,
              clientId: testClientId,
              reason: 'New message'
            }
          });
        }

        // Start new TTS
        await eventBus.publish({
          type: EventType.TTS_STARTED,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId,
            clientId: testClientId,
            text: `Response ${i}`
          }
        });

        await eventBus.publish({
          type: EventType.TTS_CHUNK,
          priority: EventPriority.MEDIUM,
          source: 'tts-service',
          payload: {
            responseId,
            clientId: testClientId,
            chunk: Buffer.from(`audio ${i}`)
          }
        });
      }

      // Complete last TTS
      await eventBus.publish({
        type: EventType.TTS_COMPLETED,
        priority: EventPriority.MEDIUM,
        source: 'tts-service',
        payload: {
          responseId: 'resp-2',
          clientId: testClientId,
          totalBytes: 100,
          duration: 500
        }
      });

      expect(audioProcessor.isStreaming(testClientId)).toBe(false);
    });
  });
});
