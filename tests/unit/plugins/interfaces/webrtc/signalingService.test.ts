import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignalingService } from '../../../../../src/plugins/interfaces/webrtc/signalingService.js';
import { WebRTCPeerManager } from '../../../../../src/plugins/interfaces/webrtc/webrtcPeerManager.js';
import { PACEWebSocketServer } from '../../../../../src/server/websocket.js';
import { logger } from '../../../../../src/utils/logger.js';

describe('SignalingService', () => {
  let signalingService: SignalingService;
  let mockWsServer: any;
  let mockPeerManager: any;
  const testClientId = 'test-client-123';

  beforeEach(() => {
    // Mock WebSocket server
    mockWsServer = {
      sendToClient: vi.fn(),
      broadcast: vi.fn(),
      on: vi.fn()
    };

    // Mock Peer Manager
    mockPeerManager = {
      createPeerConnection: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({
        type: 'offer',
        sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      }),
      setRemoteAnswer: vi.fn().mockResolvedValue(undefined),
      addIceCandidate: vi.fn().mockResolvedValue(undefined),
      on: vi.fn()
    };

    signalingService = new SignalingService(
      mockWsServer,
      mockPeerManager,
      logger
    );
  });

  afterEach(() => {
    signalingService.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(() => signalingService.initialize()).not.toThrow();
    });

    it('should register WebSocket message handlers', () => {
      signalingService.initialize();

      expect(mockWsServer.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function)
      );
    });

    it('should register peer manager event handlers', () => {
      signalingService.initialize();

      expect(mockPeerManager.on).toHaveBeenCalledWith(
        'icecandidate',
        expect.any(Function)
      );
    });

    it('should not initialize twice', () => {
      signalingService.initialize();
      const spy = vi.spyOn(mockWsServer, 'on');
      signalingService.initialize(); // Second call

      // Should not register handlers again
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Sending Offers', () => {
    beforeEach(() => {
      signalingService.initialize();
    });

    it('should send WebRTC offer to client', async () => {
      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };

      await signalingService.sendOffer(testClientId, offer);

      expect(mockWsServer.sendToClient).toHaveBeenCalledWith(
        testClientId,
        JSON.stringify({
          type: 'webrtc-offer',
          sdp: offer.sdp,
          clientId: testClientId
        })
      );
    });

    it('should create and send offer for new connection', async () => {
      await signalingService.initiateConnection(testClientId);

      expect(mockPeerManager.createPeerConnection).toHaveBeenCalledWith(
        testClientId
      );
      expect(mockPeerManager.createOffer).toHaveBeenCalledWith(testClientId);
      expect(mockWsServer.sendToClient).toHaveBeenCalled();
    });

    it('should handle offer creation failure', async () => {
      mockPeerManager.createOffer.mockRejectedValueOnce(
        new Error('Failed to create offer')
      );

      await expect(
        signalingService.initiateConnection(testClientId)
      ).rejects.toThrow('Failed to create offer');
    });

    it('should validate offer before sending', async () => {
      const invalidOffer: any = {
        type: 'invalid',
        sdp: null
      };

      await expect(
        signalingService.sendOffer(testClientId, invalidOffer)
      ).rejects.toThrow();
    });
  });

  describe('Handling Answers', () => {
    beforeEach(() => {
      signalingService.initialize();
    });

    it('should handle incoming answer from client', async () => {
      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };

      await signalingService.handleAnswer(testClientId, answer);

      expect(mockPeerManager.setRemoteAnswer).toHaveBeenCalledWith(
        testClientId,
        answer
      );
    });

    it('should validate answer before applying', async () => {
      const invalidAnswer: any = {
        type: 'invalid',
        sdp: null
      };

      await expect(
        signalingService.handleAnswer(testClientId, invalidAnswer)
      ).rejects.toThrow();
    });

    it('should reject answer for non-existent connection', async () => {
      mockPeerManager.setRemoteAnswer.mockRejectedValueOnce(
        new Error('No peer connection found')
      );

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 456 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };

      await expect(
        signalingService.handleAnswer('non-existent-client', answer)
      ).rejects.toThrow('No peer connection found');
    });

    it('should handle malformed answer SDP', async () => {
      mockPeerManager.setRemoteAnswer.mockRejectedValueOnce(
        new Error('Invalid SDP')
      );

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'malformed sdp string'
      };

      await expect(
        signalingService.handleAnswer(testClientId, answer)
      ).rejects.toThrow('Invalid SDP');
    });
  });

  describe('ICE Candidate Exchange', () => {
    beforeEach(() => {
      signalingService.initialize();
    });

    it('should send ICE candidate to client', async () => {
      const candidate: RTCIceCandidate = {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      } as RTCIceCandidate;

      await signalingService.sendIceCandidate(testClientId, candidate);

      expect(mockWsServer.sendToClient).toHaveBeenCalledWith(
        testClientId,
        JSON.stringify({
          type: 'webrtc-ice',
          candidate: {
            candidate: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
          },
          clientId: testClientId
        })
      );
    });

    it('should handle incoming ICE candidate from client', async () => {
      const candidate: RTCIceCandidateInit = {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      };

      await signalingService.handleIceCandidate(testClientId, candidate);

      expect(mockPeerManager.addIceCandidate).toHaveBeenCalledWith(
        testClientId,
        candidate
      );
    });

    it('should forward ICE candidates from peer manager', async () => {
      const candidate: RTCIceCandidate = {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      } as RTCIceCandidate;

      // Get the registered handler
      const iceCandidateHandler = mockPeerManager.on.mock.calls.find(
        (call: any) => call[0] === 'icecandidate'
      )?.[1];

      expect(iceCandidateHandler).toBeDefined();

      // Simulate ICE candidate event from peer manager
      await iceCandidateHandler(testClientId, candidate);

      expect(mockWsServer.sendToClient).toHaveBeenCalled();
    });

    it('should validate ICE candidate before adding', async () => {
      const invalidCandidate: any = {
        candidate: null
      };

      await expect(
        signalingService.handleIceCandidate(testClientId, invalidCandidate)
      ).rejects.toThrow();
    });

    it('should handle null ICE candidate (end of candidates)', async () => {
      const candidate: RTCIceCandidateInit = {
        candidate: '',
        sdpMLineIndex: 0
      };

      await expect(
        signalingService.handleIceCandidate(testClientId, candidate)
      ).resolves.not.toThrow();
    });
  });

  describe('Client Session Management', () => {
    beforeEach(() => {
      signalingService.initialize();
    });

    it('should create signaling session for new client', async () => {
      await signalingService.initiateConnection(testClientId);

      expect(signalingService.hasSession(testClientId)).toBe(true);
    });

    it('should track multiple concurrent sessions', async () => {
      await signalingService.initiateConnection('client1');
      await signalingService.initiateConnection('client2');
      await signalingService.initiateConnection('client3');

      expect(signalingService.hasSession('client1')).toBe(true);
      expect(signalingService.hasSession('client2')).toBe(true);
      expect(signalingService.hasSession('client3')).toBe(true);
    });

    it('should cleanup session on client disconnect', async () => {
      await signalingService.initiateConnection(testClientId);
      await signalingService.cleanupSession(testClientId);

      expect(signalingService.hasSession(testClientId)).toBe(false);
    });

    it('should handle cleaning up non-existent session', async () => {
      await expect(
        signalingService.cleanupSession('non-existent-client')
      ).resolves.not.toThrow();
    });

    it('should cleanup all sessions on service cleanup', async () => {
      await signalingService.initiateConnection('client1');
      await signalingService.initiateConnection('client2');

      signalingService.cleanup();

      expect(signalingService.hasSession('client1')).toBe(false);
      expect(signalingService.hasSession('client2')).toBe(false);
    });
  });

  describe('Message Formatting', () => {
    beforeEach(() => {
      signalingService.initialize();
    });

    it('should format offer message correctly', async () => {
      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'test sdp'
      };

      await signalingService.sendOffer(testClientId, offer);

      const sentMessage = JSON.parse(
        mockWsServer.sendToClient.mock.calls[0][1]
      );

      expect(sentMessage).toEqual({
        type: 'webrtc-offer',
        sdp: 'test sdp',
        clientId: testClientId
      });
    });

    it('should format ICE candidate message correctly', async () => {
      const candidate: RTCIceCandidate = {
        candidate: 'test candidate',
        sdpMLineIndex: 0,
        sdpMid: '0'
      } as RTCIceCandidate;

      await signalingService.sendIceCandidate(testClientId, candidate);

      const sentMessage = JSON.parse(
        mockWsServer.sendToClient.mock.calls[0][1]
      );

      expect(sentMessage).toEqual({
        type: 'webrtc-ice',
        candidate: {
          candidate: 'test candidate',
          sdpMLineIndex: 0,
          sdpMid: '0'
        },
        clientId: testClientId
      });
    });

    it('should parse incoming answer message', async () => {
      const answerMessage = {
        type: 'webrtc-answer',
        sdp: 'answer sdp',
        clientId: testClientId
      };

      await signalingService.handleWebSocketMessage(
        testClientId,
        JSON.stringify(answerMessage)
      );

      expect(mockPeerManager.setRemoteAnswer).toHaveBeenCalledWith(
        testClientId,
        {
          type: 'answer',
          sdp: 'answer sdp'
        }
      );
    });

    it('should parse incoming ICE candidate message', async () => {
      const iceMessage = {
        type: 'webrtc-ice',
        candidate: {
          candidate: 'test candidate',
          sdpMLineIndex: 0
        },
        clientId: testClientId
      };

      await signalingService.handleWebSocketMessage(
        testClientId,
        JSON.stringify(iceMessage)
      );

      expect(mockPeerManager.addIceCandidate).toHaveBeenCalledWith(
        testClientId,
        {
          candidate: 'test candidate',
          sdpMLineIndex: 0
        }
      );
    });

    it('should ignore non-signaling messages', async () => {
      const normalMessage = {
        type: 'command',
        text: 'Hello PACE'
      };

      await expect(
        signalingService.handleWebSocketMessage(
          testClientId,
          JSON.stringify(normalMessage)
        )
      ).resolves.not.toThrow();

      expect(mockPeerManager.setRemoteAnswer).not.toHaveBeenCalled();
      expect(mockPeerManager.addIceCandidate).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON messages', async () => {
      await expect(
        signalingService.handleWebSocketMessage(
          testClientId,
          'invalid json {{'
        )
      ).resolves.not.toThrow(); // Should log error but not crash
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      signalingService.initialize();
    });

    it('should handle WebSocket send failures', async () => {
      mockWsServer.sendToClient.mockImplementationOnce(() => {
        throw new Error('WebSocket not connected');
      });

      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'test sdp'
      };

      await expect(
        signalingService.sendOffer(testClientId, offer)
      ).rejects.toThrow('WebSocket not connected');
    });

    it('should handle peer connection failures during initiation', async () => {
      mockPeerManager.createPeerConnection.mockRejectedValueOnce(
        new Error('Failed to create peer connection')
      );

      await expect(
        signalingService.initiateConnection(testClientId)
      ).rejects.toThrow('Failed to create peer connection');
    });

    it('should handle ICE candidate addition failures', async () => {
      mockPeerManager.addIceCandidate.mockRejectedValueOnce(
        new Error('Invalid ICE candidate')
      );

      const candidate: RTCIceCandidateInit = {
        candidate: 'invalid',
        sdpMLineIndex: 0
      };

      await expect(
        signalingService.handleIceCandidate(testClientId, candidate)
      ).rejects.toThrow('Invalid ICE candidate');
    });

    it('should emit error events on failures', async () => {
      const errors: Error[] = [];

      signalingService.on('error', (error: Error) => {
        errors.push(error);
      });

      mockPeerManager.createOffer.mockRejectedValueOnce(
        new Error('Test error')
      );

      await expect(
        signalingService.initiateConnection(testClientId)
      ).rejects.toThrow();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Test error');
    });
  });

  describe('Retry and Backoff', () => {
    beforeEach(() => {
      signalingService.initialize();
    });

    it('should retry failed signaling messages', async () => {
      mockWsServer.sendToClient
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(undefined);

      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'test sdp'
      };

      await signalingService.sendOfferWithRetry(testClientId, offer, {
        maxRetries: 3,
        retryDelay: 100
      });

      expect(mockWsServer.sendToClient).toHaveBeenCalledTimes(2);
    });

    it('should give up after max retries', async () => {
      mockWsServer.sendToClient.mockRejectedValue(
        new Error('Persistent failure')
      );

      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'test sdp'
      };

      await expect(
        signalingService.sendOfferWithRetry(testClientId, offer, {
          maxRetries: 3,
          retryDelay: 10
        })
      ).rejects.toThrow('Persistent failure');

      expect(mockWsServer.sendToClient).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it('should use exponential backoff for retries', async () => {
      const timestamps: number[] = [];

      mockWsServer.sendToClient.mockImplementation(async () => {
        timestamps.push(Date.now());
        throw new Error('Failure');
      });

      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: 'test sdp'
      };

      await expect(
        signalingService.sendOfferWithRetry(testClientId, offer, {
          maxRetries: 3,
          retryDelay: 50,
          useExponentialBackoff: true
        })
      ).rejects.toThrow();

      // Verify delays increase exponentially
      const delays = timestamps.slice(1).map((t, i) => t - timestamps[i]);
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
    });
  });

  describe('Connection State Tracking', () => {
    beforeEach(() => {
      signalingService.initialize();
    });

    it('should track signaling state per client', async () => {
      await signalingService.initiateConnection(testClientId);

      const state = signalingService.getSignalingState(testClientId);

      expect(state).toBe('offer-sent');
    });

    it('should update state when answer received', async () => {
      await signalingService.initiateConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'test sdp'
      };

      await signalingService.handleAnswer(testClientId, answer);

      const state = signalingService.getSignalingState(testClientId);

      expect(state).toBe('stable');
    });

    it('should emit state change events', async () => {
      const stateChanges: string[] = [];

      signalingService.on('signalingstatechange', (clientId, state) => {
        if (clientId === testClientId) {
          stateChanges.push(state);
        }
      });

      await signalingService.initiateConnection(testClientId);

      expect(stateChanges).toContain('offer-sent');
    });
  });
});
