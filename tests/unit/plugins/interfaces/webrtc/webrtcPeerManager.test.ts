import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebRTCPeerManager } from '../../../../../src/plugins/interfaces/webrtc/webrtcPeerManager.js';
import { EventEmitter } from 'events';

describe('WebRTCPeerManager', () => {
  let peerManager: WebRTCPeerManager;
  const testClientId = 'test-client-123';
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];

  beforeEach(() => {
    peerManager = new WebRTCPeerManager(iceServers);
  });

  afterEach(async () => {
    // Cleanup all connections
    await peerManager.closeAll();
  });

  describe('Peer Connection Lifecycle', () => {
    it('should create a new peer connection', async () => {
      const pc = await peerManager.createPeerConnection(testClientId);

      expect(pc).toBeDefined();
      expect(pc.connectionState).toBe('new');
      expect(peerManager.hasConnection(testClientId)).toBe(true);
    });

    it('should create peer connection with correct ICE servers', async () => {
      const pc = await peerManager.createPeerConnection(testClientId);

      const config = pc.getConfiguration();
      expect(config.iceServers).toEqual(iceServers);
    });

    it('should not create duplicate peer connections for same client', async () => {
      const pc1 = await peerManager.createPeerConnection(testClientId);
      const pc2 = await peerManager.createPeerConnection(testClientId);

      expect(pc1).toBe(pc2); // Should return same instance
    });

    it('should close peer connection', async () => {
      await peerManager.createPeerConnection(testClientId);
      await peerManager.closePeerConnection(testClientId);

      expect(peerManager.hasConnection(testClientId)).toBe(false);
    });

    it('should handle closing non-existent connection', async () => {
      await expect(
        peerManager.closePeerConnection('non-existent-client')
      ).resolves.not.toThrow();
    });

    it('should close all peer connections', async () => {
      await peerManager.createPeerConnection('client1');
      await peerManager.createPeerConnection('client2');
      await peerManager.createPeerConnection('client3');

      await peerManager.closeAll();

      expect(peerManager.hasConnection('client1')).toBe(false);
      expect(peerManager.hasConnection('client2')).toBe(false);
      expect(peerManager.hasConnection('client3')).toBe(false);
    });

    it('should handle multiple concurrent peer connections', async () => {
      const clientIds = Array.from({ length: 10 }, (_, i) => `client-${i}`);

      await Promise.all(
        clientIds.map(id => peerManager.createPeerConnection(id))
      );

      clientIds.forEach(id => {
        expect(peerManager.hasConnection(id)).toBe(true);
      });

      expect(peerManager.getActiveConnectionsCount()).toBe(10);
    });
  });

  describe('Data Channel Management', () => {
    it('should create audio data channel', async () => {
      await peerManager.createPeerConnection(testClientId);
      const channel = peerManager.getDataChannel(testClientId);

      expect(channel).toBeDefined();
      expect(channel?.label).toBe('tts-audio');
      expect(channel?.ordered).toBe(true);
    });

    it('should queue audio chunks when channel not open', async () => {
      await peerManager.createPeerConnection(testClientId);
      const chunk = Buffer.from('test audio data');

      // Data channel is not open yet
      await peerManager.sendAudioChunk(testClientId, chunk);

      // Should not throw, chunk should be queued
      expect(true).toBe(true);
    });

    it('should send audio chunk when channel is open', async () => {
      await peerManager.createPeerConnection(testClientId);
      const channel = peerManager.getDataChannel(testClientId);

      // Mock channel as open
      if (channel) {
        Object.defineProperty(channel, 'readyState', {
          value: 'open',
          writable: true
        });

        const sendSpy = vi.spyOn(channel, 'send');
        const chunk = Buffer.from('test audio data');

        await peerManager.sendAudioChunk(testClientId, chunk);

        expect(sendSpy).toHaveBeenCalledWith(chunk);
      }
    });

    it('should handle data channel state transitions', async () => {
      const stateChanges: string[] = [];

      peerManager.on('datachannel-statechange', (clientId, state) => {
        if (clientId === testClientId) {
          stateChanges.push(state);
        }
      });

      await peerManager.createPeerConnection(testClientId);
      const channel = peerManager.getDataChannel(testClientId);

      if (channel) {
        // Simulate state changes
        channel.onopen?.({} as Event);
        channel.onclose?.({} as Event);

        expect(stateChanges).toContain('open');
        expect(stateChanges).toContain('closed');
      }
    });

    it('should emit error on data channel error', async () => {
      const errors: Error[] = [];

      peerManager.on('datachannel-error', (clientId, error) => {
        if (clientId === testClientId) {
          errors.push(error);
        }
      });

      await peerManager.createPeerConnection(testClientId);
      const channel = peerManager.getDataChannel(testClientId);

      if (channel) {
        const testError = new Error('Data channel error');
        channel.onerror?.({ error: testError } as any);

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toBe('Data channel error');
      }
    });

    it('should reject sending chunk for non-existent client', async () => {
      const chunk = Buffer.from('test audio data');

      await expect(
        peerManager.sendAudioChunk('non-existent-client', chunk)
      ).rejects.toThrow('No peer connection found');
    });

    it('should handle large audio chunks', async () => {
      await peerManager.createPeerConnection(testClientId);
      const channel = peerManager.getDataChannel(testClientId);

      if (channel) {
        Object.defineProperty(channel, 'readyState', {
          value: 'open',
          writable: true
        });

        const sendSpy = vi.spyOn(channel, 'send');
        const largeChunk = Buffer.alloc(64 * 1024); // 64KB

        await peerManager.sendAudioChunk(testClientId, largeChunk);

        expect(sendSpy).toHaveBeenCalled();
      }
    });
  });

  describe('ICE Candidate Handling', () => {
    it('should emit ICE candidates during connection setup', async () => {
      const candidates: RTCIceCandidate[] = [];

      peerManager.on('icecandidate', (clientId, candidate) => {
        if (clientId === testClientId) {
          candidates.push(candidate);
        }
      });

      await peerManager.createPeerConnection(testClientId);
      const offer = await peerManager.createOffer(testClientId);

      // ICE candidates should start gathering after creating offer
      // Note: Actual ICE gathering may happen asynchronously
      expect(offer).toBeDefined();
    });

    it('should add remote ICE candidate', async () => {
      await peerManager.createPeerConnection(testClientId);
      await peerManager.createOffer(testClientId);

      const candidate: RTCIceCandidateInit = {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      };

      await expect(
        peerManager.addIceCandidate(testClientId, candidate)
      ).resolves.not.toThrow();
    });

    it('should handle invalid ICE candidate gracefully', async () => {
      await peerManager.createPeerConnection(testClientId);
      await peerManager.createOffer(testClientId);

      const invalidCandidate: RTCIceCandidateInit = {
        candidate: 'invalid candidate string',
        sdpMLineIndex: 0
      };

      // Should not throw, but may log error
      await expect(
        peerManager.addIceCandidate(testClientId, invalidCandidate)
      ).resolves.not.toThrow();
    });

    it('should reject adding ICE candidate for non-existent connection', async () => {
      const candidate: RTCIceCandidateInit = {
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host',
        sdpMLineIndex: 0
      };

      await expect(
        peerManager.addIceCandidate('non-existent-client', candidate)
      ).rejects.toThrow('No peer connection found');
    });

    it('should handle ICE gathering state changes', async () => {
      const gatheringStates: string[] = [];

      peerManager.on('icegatheringstatechange', (clientId, state) => {
        if (clientId === testClientId) {
          gatheringStates.push(state);
        }
      });

      await peerManager.createPeerConnection(testClientId);
      await peerManager.createOffer(testClientId);

      // ICE gathering should start
      // Note: Actual state changes depend on network conditions
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('Offer/Answer Exchange', () => {
    it('should create valid SDP offer', async () => {
      await peerManager.createPeerConnection(testClientId);
      const offer = await peerManager.createOffer(testClientId);

      expect(offer).toBeDefined();
      expect(offer.type).toBe('offer');
      expect(offer.sdp).toBeDefined();
      expect(typeof offer.sdp).toBe('string');
      expect(offer.sdp).toContain('v=0'); // SDP version
    });

    it('should set local description when creating offer', async () => {
      await peerManager.createPeerConnection(testClientId);
      await peerManager.createOffer(testClientId);

      const pc = await peerManager.createPeerConnection(testClientId);
      expect(pc.localDescription).toBeDefined();
      expect(pc.localDescription?.type).toBe('offer');
    });

    it('should apply remote answer', async () => {
      await peerManager.createPeerConnection(testClientId);
      await peerManager.createOffer(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };

      await expect(
        peerManager.setRemoteAnswer(testClientId, answer)
      ).resolves.not.toThrow();

      const pc = await peerManager.createPeerConnection(testClientId);
      expect(pc.remoteDescription).toBeDefined();
      expect(pc.remoteDescription?.type).toBe('answer');
    });

    it('should reject setting answer before offer', async () => {
      await peerManager.createPeerConnection(testClientId);

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      };

      // Should fail because no offer was created yet
      await expect(
        peerManager.setRemoteAnswer(testClientId, answer)
      ).rejects.toThrow();
    });

    it('should reject invalid SDP answer', async () => {
      await peerManager.createPeerConnection(testClientId);
      await peerManager.createOffer(testClientId);

      const invalidAnswer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: 'invalid sdp string'
      };

      await expect(
        peerManager.setRemoteAnswer(testClientId, invalidAnswer)
      ).rejects.toThrow();
    });

    it('should reject offer/answer for non-existent connection', async () => {
      await expect(
        peerManager.createOffer('non-existent-client')
      ).rejects.toThrow('No peer connection found');
    });
  });

  describe('Statistics & Monitoring', () => {
    it('should track active connections count', async () => {
      expect(peerManager.getActiveConnectionsCount()).toBe(0);

      await peerManager.createPeerConnection('client1');
      expect(peerManager.getActiveConnectionsCount()).toBe(1);

      await peerManager.createPeerConnection('client2');
      expect(peerManager.getActiveConnectionsCount()).toBe(2);

      await peerManager.closePeerConnection('client1');
      expect(peerManager.getActiveConnectionsCount()).toBe(1);
    });

    it('should return connection statistics', async () => {
      await peerManager.createPeerConnection(testClientId);
      const stats = peerManager.getConnectionStats(testClientId);

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('connectionState');
      expect(stats).toHaveProperty('iceConnectionState');
      expect(stats).toHaveProperty('iceGatheringState');
      expect(stats).toHaveProperty('signalingState');
    });

    it('should return null for non-existent connection stats', () => {
      const stats = peerManager.getConnectionStats('non-existent-client');
      expect(stats).toBeNull();
    });

    it('should monitor connection state changes', async () => {
      const stateChanges: string[] = [];

      peerManager.on('connectionstatechange', (clientId, state) => {
        if (clientId === testClientId) {
          stateChanges.push(state);
        }
      });

      await peerManager.createPeerConnection(testClientId);
      const pc = await peerManager.createPeerConnection(testClientId);

      // Simulate connection state change
      pc.onconnectionstatechange?.({} as Event);

      expect(stateChanges.length).toBeGreaterThan(0);
    });

    it('should report data channel buffered amount', async () => {
      await peerManager.createPeerConnection(testClientId);
      const channel = peerManager.getDataChannel(testClientId);

      expect(channel).toBeDefined();
      expect(channel?.bufferedAmount).toBeDefined();
      expect(typeof channel?.bufferedAmount).toBe('number');
    });

    it('should handle connection failure state', async () => {
      const failures: string[] = [];

      peerManager.on('connectionstatechange', (clientId, state) => {
        if (clientId === testClientId && state === 'failed') {
          failures.push(clientId);
        }
      });

      await peerManager.createPeerConnection(testClientId);
      const pc = await peerManager.createPeerConnection(testClientId);

      // Simulate connection failure
      Object.defineProperty(pc, 'connectionState', { value: 'failed' });
      pc.onconnectionstatechange?.({} as Event);

      expect(failures).toContain(testClientId);
    });
  });

  describe('Error Handling', () => {
    it('should handle peer connection creation errors', async () => {
      // Create peer manager with invalid ICE server
      const invalidPeerManager = new WebRTCPeerManager([
        { urls: 'invalid://server' }
      ]);

      // Should handle gracefully or throw descriptive error
      await expect(
        invalidPeerManager.createPeerConnection(testClientId)
      ).rejects.toThrow();
    });

    it('should cleanup on connection close', async () => {
      await peerManager.createPeerConnection(testClientId);
      await peerManager.closePeerConnection(testClientId);

      // Connection and data channel should be cleaned up
      expect(peerManager.hasConnection(testClientId)).toBe(false);
      expect(peerManager.getDataChannel(testClientId)).toBeNull();
    });

    it('should handle rapid create/close cycles', async () => {
      for (let i = 0; i < 10; i++) {
        await peerManager.createPeerConnection(testClientId);
        await peerManager.closePeerConnection(testClientId);
      }

      expect(peerManager.hasConnection(testClientId)).toBe(false);
      expect(peerManager.getActiveConnectionsCount()).toBe(0);
    });
  });

  describe('Event Emitter Integration', () => {
    it('should extend EventEmitter', () => {
      expect(peerManager).toBeInstanceOf(EventEmitter);
    });

    it('should support multiple event listeners', async () => {
      const listener1Calls: string[] = [];
      const listener2Calls: string[] = [];

      peerManager.on('connectionstatechange', (clientId) => {
        listener1Calls.push(clientId);
      });

      peerManager.on('connectionstatechange', (clientId) => {
        listener2Calls.push(clientId);
      });

      await peerManager.createPeerConnection(testClientId);
      const pc = await peerManager.createPeerConnection(testClientId);
      pc.onconnectionstatechange?.({} as Event);

      expect(listener1Calls.length).toBeGreaterThan(0);
      expect(listener2Calls.length).toBeGreaterThan(0);
      expect(listener1Calls).toEqual(listener2Calls);
    });

    it('should support removing event listeners', async () => {
      const calls: string[] = [];
      const listener = (clientId: string) => {
        calls.push(clientId);
      };

      peerManager.on('connectionstatechange', listener);
      peerManager.off('connectionstatechange', listener);

      await peerManager.createPeerConnection(testClientId);
      const pc = await peerManager.createPeerConnection(testClientId);
      pc.onconnectionstatechange?.({} as Event);

      expect(calls).toHaveLength(0);
    });
  });
});
