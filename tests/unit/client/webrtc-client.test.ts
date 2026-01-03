/**
 * WebRTC Client Test Suite
 *
 * Tests browser-side WebRTC peer connection management,
 * signaling protocol, and data channel handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load the WebRTC client code
const webrtcClientCode = readFileSync(
  join(process.cwd(), 'public/webrtc-client.js'),
  'utf-8'
);

// Mock browser APIs
const createMockWebRTC = () => {
  const mockPeerConnection = {
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    createAnswer: vi.fn().mockResolvedValue({ sdp: 'mock-answer-sdp' }),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    onicecandidate: null,
    oniceconnectionstatechange: null,
    ondatachannel: null,
    iceConnectionState: 'new'
  };

  const mockDataChannel = {
    label: 'tts-audio',
    readyState: 'connecting',
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    close: vi.fn()
  };

  return { mockPeerConnection, mockDataChannel };
};

describe('WebRTCClient', () => {
  let WebRTCClient: any;
  let mockWebSocket: any;
  let mockStateChangeHandler: any;
  let { mockPeerConnection, mockDataChannel } = createMockWebRTC();

  beforeEach(() => {
    // Reset mocks
    ({ mockPeerConnection, mockDataChannel } = createMockWebRTC());

    // Mock global WebRTC APIs
    global.RTCPeerConnection = vi.fn(() => mockPeerConnection) as any;
    global.RTCSessionDescription = vi.fn((desc) => desc) as any;
    global.RTCIceCandidate = vi.fn((candidate) => ({
      ...candidate,
      toJSON: () => candidate
    })) as any;

    // Mock WebSocket
    mockWebSocket = {
      send: vi.fn(),
      readyState: 1 // OPEN
    };

    // Mock state change handler
    mockStateChangeHandler = vi.fn();

    // Mock window object with WebRTC APIs
    (global as any).window = {
      RTCPeerConnection: global.RTCPeerConnection,
      RTCSessionDescription: global.RTCSessionDescription,
      RTCIceCandidate: global.RTCIceCandidate
    };

    // Evaluate the WebRTC client code to get the class
    eval(webrtcClientCode);
    WebRTCClient = (global as any).window.WebRTCClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should create WebRTCClient instance', () => {
      const client = new WebRTCClient('test-client', mockWebSocket, mockStateChangeHandler);
      expect(client).toBeDefined();
      expect(client.clientId).toBe('test-client');
    });

    it('should initialize with null clientId', () => {
      const client = new WebRTCClient(null, mockWebSocket, mockStateChangeHandler);
      expect(client).toBeDefined();
      expect(client.clientId).toBeNull();
    });

    it('should create RTCPeerConnection on initialize', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      expect(global.RTCPeerConnection).toHaveBeenCalled();
      expect(mockStateChangeHandler).toHaveBeenCalledWith('webrtc-initializing');
    });

    it('should configure STUN server', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      expect(global.RTCPeerConnection).toHaveBeenCalledWith({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
    });
  });

  describe('Signaling Protocol', () => {
    it('should handle WebRTC offer', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      const offerMessage = {
        type: 'webrtc-offer',
        sdp: 'mock-offer-sdp',
        clientId: 'server-assigned-id'
      };

      await client.handleSignalingMessage(offerMessage);

      expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalled();
      expect(mockPeerConnection.createAnswer).toHaveBeenCalled();
      expect(mockPeerConnection.setLocalDescription).toHaveBeenCalled();
      expect(mockWebSocket.send).toHaveBeenCalled();
    });

    it('should send answer with correct format', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      const offerMessage = {
        type: 'webrtc-offer',
        sdp: 'mock-offer-sdp',
        clientId: 'server-id'
      };

      await client.handleSignalingMessage(offerMessage);

      expect(mockWebSocket.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
      expect(sentMessage).toMatchObject({
        type: 'webrtc-answer',
        sdp: 'mock-answer-sdp'
      });
    });

    it('should handle ICE candidates after remote description is set', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      // Set remote description first
      mockPeerConnection.remoteDescription = { sdp: 'mock-remote-sdp' };

      const iceMessage = {
        type: 'webrtc-ice',
        candidate: { candidate: 'mock-ice-candidate', sdpMid: '0', sdpMLineIndex: 0 }
      };

      await client.handleSignalingMessage(iceMessage);

      expect(mockPeerConnection.addIceCandidate).toHaveBeenCalled();
    });

    it('should queue ICE candidates received before remote description', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      // No remote description set
      mockPeerConnection.remoteDescription = null;

      const iceMessage = {
        type: 'webrtc-ice',
        candidate: { candidate: 'mock-ice-candidate', sdpMid: '0', sdpMLineIndex: 0 }
      };

      await client.handleSignalingMessage(iceMessage);

      // Should NOT have been added yet
      expect(mockPeerConnection.addIceCandidate).not.toHaveBeenCalled();
      // Should be queued
      expect(client.iceCandidateQueue.length).toBe(1);
    });

    it('should process queued ICE candidates after offer is handled', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      // Simulate ICE candidate arriving before offer
      mockPeerConnection.remoteDescription = null;
      const iceMessage = {
        type: 'webrtc-ice',
        candidate: { candidate: 'mock-ice-candidate', sdpMid: '0', sdpMLineIndex: 0 }
      };
      await client.handleSignalingMessage(iceMessage);

      expect(client.iceCandidateQueue.length).toBe(1);

      // Now handle the offer
      const offerMessage = {
        type: 'webrtc-offer',
        sdp: 'mock-offer-sdp',
        clientId: 'test-client'
      };

      // Mock setRemoteDescription to update remoteDescription
      mockPeerConnection.setRemoteDescription.mockImplementation((desc) => {
        mockPeerConnection.remoteDescription = desc;
        return Promise.resolve();
      });

      await client.handleSignalingMessage(offerMessage);

      // Queue should be processed and cleared
      expect(client.iceCandidateQueue.length).toBe(0);
      expect(mockPeerConnection.addIceCandidate).toHaveBeenCalled();
    });

    it('should send ICE candidates to server', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      // Simulate ICE candidate event
      const mockCandidate = {
        candidate: 'mock-candidate',
        sdpMid: '0',
        sdpMLineIndex: 0,
        toJSON: () => ({ candidate: 'mock-candidate', sdpMid: '0', sdpMLineIndex: 0 })
      };

      mockPeerConnection.onicecandidate({ candidate: mockCandidate });

      expect(mockWebSocket.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('webrtc-ice');
      expect(sentMessage.candidate).toBeDefined();
    });
  });

  describe('Data Channel Management', () => {
    it('should setup data channel from server', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      // Simulate ondatachannel event
      mockPeerConnection.ondatachannel({ channel: mockDataChannel });

      expect(mockDataChannel.onopen).toBeDefined();
      expect(mockDataChannel.onmessage).toBeDefined();
      expect(mockDataChannel.onerror).toBeDefined();
      expect(mockDataChannel.onclose).toBeDefined();
    });

    it('should emit state change when data channel opens', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      mockPeerConnection.ondatachannel({ channel: mockDataChannel });
      mockDataChannel.onopen();

      expect(mockStateChangeHandler).toHaveBeenCalledWith('datachannel-open');
    });

    it('should forward audio chunks via state change', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      mockPeerConnection.ondatachannel({ channel: mockDataChannel });

      const mockAudioData = new ArrayBuffer(16000);
      mockDataChannel.onmessage({ data: mockAudioData });

      expect(mockStateChangeHandler).toHaveBeenCalledWith('audio-chunk-received', mockAudioData);
    });

    it('should only handle "tts-audio" channel', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      const wrongChannel = { ...mockDataChannel, label: 'wrong-channel' };
      mockPeerConnection.ondatachannel({ channel: wrongChannel });

      expect(wrongChannel.onopen).toBeNull();
    });
  });

  describe('Connection State Management', () => {
    it('should track connection state', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      expect(client.isConnected).toBe(false);

      // Simulate connection
      mockPeerConnection.iceConnectionState = 'connected';
      mockPeerConnection.oniceconnectionstatechange();

      expect(client.isConnected).toBe(true);
      expect(mockStateChangeHandler).toHaveBeenCalledWith('webrtc-connected');
    });

    it('should detect connection failure', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      mockPeerConnection.iceConnectionState = 'failed';
      mockPeerConnection.oniceconnectionstatechange();

      expect(mockStateChangeHandler).toHaveBeenCalledWith('webrtc-failed');
    });

    it('should retry on connection failure', async () => {
      vi.useFakeTimers();

      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      expect(client.retryCount).toBe(0);

      // Trigger failure
      mockPeerConnection.iceConnectionState = 'failed';
      mockPeerConnection.oniceconnectionstatechange();

      // Fast-forward retry delay
      await vi.advanceTimersByTimeAsync(2000);

      expect(client.retryCount).toBe(1);

      vi.useRealTimers();
    });

    it('should stop retrying after max attempts', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      client.maxRetries = 0; // Disable retries for this test

      await client.initialize();

      mockPeerConnection.iceConnectionState = 'failed';
      mockPeerConnection.oniceconnectionstatechange();

      expect(mockStateChangeHandler).toHaveBeenCalledWith('webrtc-max-retries-reached');
    });
  });

  describe('Connection Cleanup', () => {
    it('should close peer connection', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      mockPeerConnection.ondatachannel({ channel: mockDataChannel });

      client.close();

      expect(mockDataChannel.close).toHaveBeenCalled();
      expect(mockPeerConnection.close).toHaveBeenCalled();
      expect(client.isConnected).toBe(false);
    });

    it('should emit closed state', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      client.close();

      expect(mockStateChangeHandler).toHaveBeenCalledWith('webrtc-closed');
    });
  });

  describe('Error Handling', () => {
    it('should handle signaling errors', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      const invalidMessage = { type: 'invalid' };
      await client.handleSignalingMessage(invalidMessage);

      // Should not crash
      expect(client).toBeDefined();
    });

    it('should report signaling errors via state change', async () => {
      const client = new WebRTCClient('test', mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      mockPeerConnection.setRemoteDescription.mockRejectedValue(new Error('Test error'));

      const offerMessage = {
        type: 'webrtc-offer',
        sdp: 'bad-sdp'
      };

      await client.handleSignalingMessage(offerMessage);

      expect(mockStateChangeHandler).toHaveBeenCalledWith(
        'signaling-error',
        expect.any(Error)
      );
    });
  });

  describe('Client ID Management', () => {
    it('should update client ID from server offer', async () => {
      const client = new WebRTCClient(null, mockWebSocket, mockStateChangeHandler);
      await client.initialize();

      const offerMessage = {
        type: 'webrtc-offer',
        sdp: 'mock-sdp',
        clientId: 'server-assigned-id'
      };

      await client.handleSignalingMessage(offerMessage);

      expect(client.clientId).toBe('server-assigned-id');
    });
  });
});
