# WebRTC TTS Implementation Plan

## Overview
Revert WebSocket-based TTS implementation and replace with production-ready WebRTC solution. Follow test-driven development approach.

## Phase 1: Revert WebSocket TTS Implementation

### 1.1 Server-Side Reverts

**File: [src/server/index.ts](src/server/index.ts)**
- Remove lines 175-194: TTS_CHUNK WebSocket forwarder
- Keep lines 152-163: RESPONSE_GENERATED event publication (needed for WebRTC too)
- Keep line 153: Debug logging

**File: [src/server/websocket.ts](src/server/websocket.ts)**
- Keep HTTP server additions (lines 66-161) - needed for serving client
- Keep /api/health endpoint (lines 142-160)
- Keep system message fix (line 241)
- No WebSocket-specific TTS code to remove here

**File: [src/plugins/interfaces/voiceInterfacePlugin.ts](src/plugins/interfaces/voiceInterfacePlugin.ts)**
- Keep lines 197-205: TTS generation trigger (needed for WebRTC too)
- No WebSocket-specific code to remove

**File: [src/plugins/interfaces/services/ttsService.ts](src/plugins/interfaces/services/ttsService.ts)**
- No changes needed - core service is transport-agnostic
- TTS_CHUNK events will be consumed by WebRTC layer instead of WebSocket

### 1.2 Client-Side Reverts

**File: [public/app.js](public/app.js)**
- Remove lines 11-16: TTS audio playback variables (audioContext, audioQueue, isPlayingAudio, ttsEnabled)
- Remove lines 24: setupTTSControls() call
- Remove lines 170-175: 'tts-audio' WebSocket message handler
- Remove lines 377-379: setupLogoClick() function (now handled by WebRTC)
- Remove lines 414-552: All TTS functions (setupTTSControls, initializeTTS, handleIncomingAudio, playNextAudioChunk, disableTTS, updateTTSStatus)
- Keep line 248: Health polling at 60 seconds
- Keep lines 289-298: Fixed markdown parsing

**File: [public/index.html](public/index.html)**
- Remove lines 27-30: Voice status indicator
- Will be replaced with WebRTC status indicator

**File: [public/styles.css](public/styles.css)**
- Remove lines 215-223: Voice indicator styling
- Will be replaced with WebRTC status styling

### 1.3 Configuration Reverts

**File: [.env](.env)**
- Keep PORT=3000 (correct value)
- Keep ENABLE_VOICE=true
- Keep VOICE_TTS_* settings (still used by ttsService.ts)

### 1.4 Verification After Revert
- Server should start without errors
- Client should load and display UI correctly
- No TTS audio playback (expected)
- No WebSocket TTS messages
- Chat functionality should work
- Health endpoint should work
- No formatting issues

## Phase 2: Write Comprehensive Tests (TDD Approach)

### 2.1 WebRTC Peer Manager Tests

**File: [tests/unit/plugins/interfaces/webrtc/webrtcPeerManager.test.ts](tests/unit/plugins/interfaces/webrtc/webrtcPeerManager.test.ts)**

Test cases to implement:
1. **Peer Connection Lifecycle**
   - `createPeerConnection()` creates RTCPeerConnection with correct config
   - `closePeerConnection()` cleans up connection and data channels
   - Handles multiple concurrent peer connections (multi-client)
   - Rejects invalid peer connection IDs

2. **Data Channel Management**
   - Creates audio data channel with correct config (ordered, reliable)
   - `sendAudioChunk()` queues data when channel not open
   - `sendAudioChunk()` sends immediately when channel open
   - Handles data channel state transitions (connecting → open → closed)
   - Emits events on data channel errors

3. **ICE Candidate Handling**
   - Collects ICE candidates during connection setup
   - `addIceCandidate()` adds remote candidates correctly
   - Handles ICE gathering state changes
   - Emits ICE candidates for signaling

4. **Offer/Answer Exchange**
   - `createOffer()` generates valid SDP offer
   - `setRemoteAnswer()` applies remote SDP answer
   - Handles setLocalDescription() and setRemoteDescription() errors
   - Validates SDP format

5. **Statistics & Monitoring**
   - Tracks active connections count
   - Reports data channel buffered amount
   - Monitors connection state (new, connecting, connected, disconnected, failed)
   - Emits connection state change events

Pattern reference: [tests/unit/plugins/interfaces/services/ttsService.test.ts](tests/unit/plugins/interfaces/services/ttsService.test.ts)

### 2.2 Signaling Service Tests

**File: [tests/unit/plugins/interfaces/webrtc/signalingService.test.ts](tests/unit/plugins/interfaces/webrtc/signalingService.test.ts)**

Test cases to implement:
1. **WebSocket Signaling**
   - Sends WebRTC offers via WebSocket
   - Receives WebRTC answers via WebSocket
   - Sends ICE candidates via WebSocket
   - Receives ICE candidates via WebSocket
   - Handles signaling message validation
   - Rejects malformed signaling messages

2. **Client Session Management**
   - Maps clientId to peer connection
   - Creates new signaling session for new clients
   - Cleans up session on client disconnect
   - Handles concurrent sessions (multiple clients)

3. **Message Formatting**
   - Formats offer messages correctly: `{ type: 'webrtc-offer', sdp, clientId }`
   - Formats ICE candidate messages: `{ type: 'webrtc-ice', candidate, clientId }`
   - Parses incoming answer messages
   - Parses incoming ICE candidate messages

4. **Error Handling**
   - Handles WebSocket disconnection during signaling
   - Retries failed signaling messages (with backoff)
   - Emits signaling errors
   - Falls back gracefully on signaling failure

Pattern reference: [tests/helpers/websocketHelper.ts](tests/helpers/websocketHelper.ts)

### 2.3 Audio Track Processor Tests

**File: [tests/unit/plugins/interfaces/webrtc/audioTrackProcessor.test.ts](tests/unit/plugins/interfaces/webrtc/audioTrackProcessor.test.ts)**

Test cases to implement:
1. **TTS Event Consumption**
   - Subscribes to TTS_CHUNK events
   - Filters events by clientId (client-specific audio)
   - Queues audio chunks from TTS_CHUNK events
   - Processes chunks in order (FIFO)

2. **Audio Streaming**
   - Sends audio chunks via WebRTC data channel
   - Handles data channel backpressure (buffered amount)
   - Chunks large audio data (if > MTU size)
   - Maintains chunk ordering

3. **TTS Lifecycle**
   - Handles TTS_STARTED event (prepare streaming)
   - Handles TTS_CHUNK events (stream audio)
   - Handles TTS_COMPLETED event (flush queue, signal end)
   - Handles TTS_INTERRUPTED event (clear queue, abort)

4. **Client-Specific Routing**
   - Routes audio only to correct client peer connection
   - Handles multiple concurrent TTS streams (different clients)
   - Validates clientId in TTS events
   - Rejects events with missing/invalid clientId

5. **Error Handling**
   - Handles peer connection failure during streaming
   - Handles data channel closure during streaming
   - Clears queue on errors
   - Emits audio processing errors

Pattern reference: [tests/unit/plugins/interfaces/services/ttsService.test.ts](tests/unit/plugins/interfaces/services/ttsService.test.ts) (EventBus subscription patterns)

### 2.4 Integration Tests

**File: [tests/integration/webrtcTTS.test.ts](tests/integration/webrtcTTS.test.ts)**

End-to-end test scenarios:
1. **Full TTS Flow**
   - Client connects → WebRTC offer/answer exchange → Data channel opens
   - User sends message → RESPONSE_GENERATED event → TTS generation
   - TTS chunks → Audio track processor → Data channel → Client receives audio
   - Client playback completes → Connection remains open for next message

2. **Multi-Client TTS**
   - Two clients connect simultaneously
   - Each client sends message
   - Each client receives only their own TTS audio
   - Audio doesn't cross-contaminate between clients

3. **Error Recovery**
   - Client disconnects during TTS → Audio stops, no errors
   - Network interruption → Reconnection → TTS resumes
   - TTS service error → Client receives error message, no crash

4. **Performance**
   - First audio chunk arrives within 500ms of response start
   - No audio buffering gaps (seamless playback)
   - Handles rapid consecutive messages (queue management)

Pattern reference: [tests/integration/](tests/integration/) existing patterns

## Phase 3: Implement WebRTC Infrastructure

### 3.1 WebRTC Peer Manager

**File: [src/plugins/interfaces/webrtc/webrtcPeerManager.ts](src/plugins/interfaces/webrtc/webrtcPeerManager.ts)**

**Purpose**: Manages RTCPeerConnection instances and data channels for each client.

**Class: WebRTCPeerManager**

Properties:
- `peerConnections: Map<string, RTCPeerConnection>` - clientId → peer connection
- `dataChannels: Map<string, RTCDataChannel>` - clientId → audio data channel
- `iceServers: RTCIceServer[]` - STUN/TURN servers from config
- `logger: Logger` - Logging instance

Methods:
```typescript
// Create new peer connection for client
async createPeerConnection(clientId: string): Promise<RTCPeerConnection>

// Create WebRTC offer (SDP)
async createOffer(clientId: string): Promise<RTCSessionDescriptionInit>

// Apply remote answer
async setRemoteAnswer(clientId: string, answer: RTCSessionDescriptionInit): Promise<void>

// Add ICE candidate
async addIceCandidate(clientId: string, candidate: RTCIceCandidateInit): Promise<void>

// Send audio chunk via data channel
async sendAudioChunk(clientId: string, chunk: Buffer): Promise<void>

// Close peer connection
async closePeerConnection(clientId: string): Promise<void>

// Get connection statistics
getConnectionStats(clientId: string): ConnectionStats | null

// Event emitters (using EventEmitter)
on(event: 'icecandidate', listener: (clientId: string, candidate: RTCIceCandidate) => void): void
on(event: 'connectionstatechange', listener: (clientId: string, state: RTCPeerConnectionState) => void): void
on(event: 'datachannel-open', listener: (clientId: string) => void): void
on(event: 'datachannel-error', listener: (clientId: string, error: Error) => void): void
```

**Data Channel Configuration**:
```typescript
const dataChannelConfig: RTCDataChannelInit = {
  ordered: true,        // Maintain chunk order
  maxRetransmits: 3,    // Retry failed sends
};
```

**ICE Server Configuration** (from .env VOICE_ICE_SERVERS):
```typescript
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' }
];
```

**Key Implementation Details**:
- Use Node.js `wrtc` package for server-side WebRTC (already installed)
- Data channel label: 'tts-audio'
- Handle bufferedAmountLowThreshold for backpressure
- Emit ICE candidates as they're gathered
- Track connection state changes (failed → cleanup)

### 3.2 Signaling Service

**File: [src/plugins/interfaces/webrtc/signalingService.ts](src/plugins/interfaces/webrtc/signalingService.ts)**

**Purpose**: Handles WebRTC signaling via WebSocket (offer/answer/ICE exchange).

**Class: SignalingService**

Properties:
- `wsServer: WebSocketServer` - WebSocket server instance
- `peerManager: WebRTCPeerManager` - Peer connection manager
- `logger: Logger` - Logging instance

Methods:
```typescript
// Initialize signaling handlers
initialize(): void

// Send WebRTC offer to client
async sendOffer(clientId: string, offer: RTCSessionDescriptionInit): Promise<void>

// Handle incoming answer from client
async handleAnswer(clientId: string, answer: RTCSessionDescriptionInit): Promise<void>

// Send ICE candidate to client
async sendIceCandidate(clientId: string, candidate: RTCIceCandidate): Promise<void>

// Handle incoming ICE candidate from client
async handleIceCandidate(clientId: string, candidate: RTCIceCandidateInit): Promise<void>

// Cleanup signaling session
async cleanupSession(clientId: string): Promise<void>
```

**WebSocket Message Format**:

Server → Client (Offer):
```json
{
  "type": "webrtc-offer",
  "sdp": "<SDP offer string>",
  "clientId": "client-uuid"
}
```

Client → Server (Answer):
```json
{
  "type": "webrtc-answer",
  "sdp": "<SDP answer string>"
}
```

Server ↔ Client (ICE Candidate):
```json
{
  "type": "webrtc-ice",
  "candidate": {
    "candidate": "candidate:...",
    "sdpMLineIndex": 0,
    "sdpMid": "0"
  }
}
```

**Integration with WebSocket Server**:
- Hook into existing WebSocket message handler in [src/server/websocket.ts](src/server/websocket.ts)
- Add message types: 'webrtc-answer', 'webrtc-ice'
- Trigger offer creation on client connection (after welcome message)
- Handle client disconnection (cleanup peer connection)

### 3.3 Audio Track Processor

**File: [src/plugins/interfaces/webrtc/audioTrackProcessor.ts](src/plugins/interfaces/webrtc/audioTrackProcessor.ts)**

**Purpose**: Consumes TTS_CHUNK events and streams audio to clients via WebRTC data channels.

**Class: AudioTrackProcessor**

Properties:
- `eventBus: EventBus` - Event bus instance
- `peerManager: WebRTCPeerManager` - Peer connection manager
- `audioQueues: Map<string, Buffer[]>` - clientId → audio chunks queue
- `isStreaming: Map<string, boolean>` - clientId → streaming state
- `logger: Logger` - Logging instance

Methods:
```typescript
// Initialize event subscriptions
initialize(): void

// Handle TTS_STARTED event
private async handleTTSStarted(event: Event): Promise<void>

// Handle TTS_CHUNK event
private async handleTTSChunk(event: Event): Promise<void>

// Handle TTS_COMPLETED event
private async handleTTSCompleted(event: Event): Promise<void>

// Handle TTS_INTERRUPTED event
private async handleTTSInterrupted(event: Event): Promise<void>

// Stream audio chunk to client
private async streamChunk(clientId: string, chunk: Buffer): Promise<void>

// Process audio queue for client
private async processQueue(clientId: string): Promise<void>

// Cleanup client audio state
private async cleanupClient(clientId: string): Promise<void>
```

**Event Subscription**:
```typescript
// Subscribe to all TTS events
this.eventBus.subscribe([
  EventType.TTS_STARTED,
  EventType.TTS_CHUNK,
  EventType.TTS_COMPLETED,
  EventType.TTS_INTERRUPTED
], {
  id: 'webrtc-audio-processor',
  priority: EventPriority.NORMAL,
  canHandle: (event) => [
    EventType.TTS_STARTED,
    EventType.TTS_CHUNK,
    EventType.TTS_COMPLETED,
    EventType.TTS_INTERRUPTED
  ].includes(event.type),
  handle: async (event) => {
    // Route to appropriate handler based on event type
  }
});
```

**Audio Streaming Logic**:
1. TTS_STARTED → Prepare streaming, clear any existing queue
2. TTS_CHUNK → Add chunk to queue, process queue if data channel open
3. TTS_COMPLETED → Flush remaining queue, send end marker
4. TTS_INTERRUPTED → Clear queue immediately, send abort marker

**Backpressure Handling**:
```typescript
// Check data channel buffered amount before sending
const channel = this.peerManager.getDataChannel(clientId);
if (channel.bufferedAmount > HIGH_WATER_MARK) {
  // Wait for bufferedAmountLow event
  await new Promise(resolve => {
    channel.onbufferedamountlow = resolve;
  });
}
channel.send(chunk);
```

**Client-Specific Routing**:
- Extract `clientId` from TTS event payload
- Only send audio to matching peer connection
- Handle missing clientId (broadcast to all? or error?)

### 3.4 Integration into Voice Plugin

**File: [src/plugins/interfaces/voiceInterfacePlugin.ts](src/plugins/interfaces/voiceInterfacePlugin.ts)**

**Changes Required**:

1. Import WebRTC components:
```typescript
import { WebRTCPeerManager } from './webrtc/webrtcPeerManager.js';
import { SignalingService } from './webrtc/signalingService.js';
import { AudioTrackProcessor } from './webrtc/audioTrackProcessor.js';
```

2. Add properties:
```typescript
private peerManager?: WebRTCPeerManager;
private signalingService?: SignalingService;
private audioProcessor?: AudioTrackProcessor;
```

3. Initialize in `onLoad()`:
```typescript
async onLoad(): Promise<void> {
  // Existing TTS service initialization...

  // Initialize WebRTC components
  this.peerManager = new WebRTCPeerManager(iceServers, this.logger);
  this.signalingService = new SignalingService(wsServer, this.peerManager, this.logger);
  this.audioProcessor = new AudioTrackProcessor(this.eventBus, this.peerManager, this.logger);

  this.signalingService.initialize();
  this.audioProcessor.initialize();

  this.logger.info('WebRTC TTS initialized');
}
```

4. Update `handleResponseGenerated()`:
- Keep existing TTS generation call (lines 197-205)
- Pass `clientId` to TTS service (currently missing):
```typescript
if (this.ttsService) {
  await this.ttsService.generate(response, responseId, clientId); // Add clientId parameter
}
```

5. Cleanup in `onUnload()`:
```typescript
async onUnload(): Promise<void> {
  // Close all peer connections
  this.peerManager?.closeAll();
  this.signalingService?.cleanup();

  // Existing cleanup...
}
```

### 3.5 Update TTS Service for Client-Specific Audio

**File: [src/plugins/interfaces/services/ttsService.ts](src/plugins/interfaces/services/ttsService.ts)**

**Changes Required**:

1. Update `generate()` method signature:
```typescript
async generate(text: string, responseId: string, clientId: string): Promise<void>
```

2. Include `clientId` in TTS event payloads:
```typescript
// TTS_STARTED event
await this.eventBus.publish({
  type: EventType.TTS_STARTED,
  priority: EventPriority.NORMAL,
  source: 'tts-service',
  payload: {
    responseId,
    clientId,  // ADD THIS
    text
  }
});

// TTS_CHUNK event
await this.eventBus.publish({
  type: EventType.TTS_CHUNK,
  priority: EventPriority.NORMAL,
  source: 'tts-service',
  payload: {
    responseId,
    clientId,  // ADD THIS
    chunk
  }
});

// TTS_COMPLETED event
await this.eventBus.publish({
  type: EventType.TTS_COMPLETED,
  priority: EventPriority.NORMAL,
  source: 'tts-service',
  payload: {
    responseId,
    clientId,  // ADD THIS
    totalBytes,
    duration
  }
});

// TTS_INTERRUPTED event
await this.eventBus.publish({
  type: EventType.TTS_INTERRUPTED,
  priority: EventPriority.NORMAL,
  source: 'tts-service',
  payload: {
    responseId,
    clientId,  // ADD THIS
    reason
  }
});
```

3. Update event type definitions if needed:
- Check [src/events/types.ts](src/events/types.ts)
- Ensure TTS event payload interfaces include `clientId?: string`

## Phase 4: Client-Side WebRTC Implementation

### 4.1 WebRTC Client Manager

**File: [public/webrtc.js](public/webrtc.js)** (new file)

**Purpose**: Client-side WebRTC peer connection and audio playback.

**Functions**:

```javascript
// Global state
let peerConnection = null;
let audioDataChannel = null;
let audioContext = null;
let audioQueue = [];
let isPlayingAudio = false;

// Initialize WebRTC when signaling offer received
async function initializeWebRTC(offer) {
  console.log('Initializing WebRTC with offer:', offer);

  // Create peer connection
  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  });

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignalingMessage({
        type: 'webrtc-ice',
        candidate: event.candidate
      });
    }
  };

  // Handle data channel from server
  peerConnection.ondatachannel = (event) => {
    audioDataChannel = event.channel;
    audioDataChannel.binaryType = 'arraybuffer';

    audioDataChannel.onopen = () => {
      console.log('Audio data channel opened');
      updateTTSStatus(true);
    };

    audioDataChannel.onmessage = (event) => {
      handleIncomingAudio(event.data);
    };

    audioDataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      updateTTSStatus(false);
    };

    audioDataChannel.onclose = () => {
      console.log('Audio data channel closed');
      updateTTSStatus(false);
    };
  };

  // Set remote description (offer)
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  // Create answer
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  // Send answer to server
  sendSignalingMessage({
    type: 'webrtc-answer',
    sdp: answer.sdp
  });

  // Initialize audio context (requires user interaction)
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  console.log('WebRTC initialized, answer sent');
}

// Handle incoming ICE candidate from server
async function handleIceCandidate(candidate) {
  if (peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

// Handle incoming audio data
function handleIncomingAudio(arrayBuffer) {
  if (!audioContext) {
    console.warn('AudioContext not initialized');
    return;
  }

  // Add to queue
  audioQueue.push(arrayBuffer);

  // Start playback if not already playing
  if (!isPlayingAudio) {
    playNextAudioChunk();
  }
}

// Play next audio chunk from queue
async function playNextAudioChunk() {
  if (audioQueue.length === 0) {
    isPlayingAudio = false;
    return;
  }

  isPlayingAudio = true;
  const audioData = audioQueue.shift();

  try {
    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(audioData);

    // Create source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    // Play
    source.start(0);

    // Play next chunk when done
    source.onended = () => {
      playNextAudioChunk();
    };
  } catch (error) {
    console.error('Error playing audio:', error);
    // Continue with next chunk
    playNextAudioChunk();
  }
}

// Send signaling message via WebSocket
function sendSignalingMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error('WebSocket not connected, cannot send signaling message');
  }
}

// Update TTS status indicator
function updateTTSStatus(active) {
  const logo = document.getElementById('pace_logo');
  const statusIndicator = document.getElementById('tts-status');

  if (active) {
    logo.style.boxShadow = '0 0 30px rgba(16, 185, 129, 0.8)';
    if (statusIndicator) {
      statusIndicator.textContent = 'TTS Active';
      statusIndicator.style.color = '#10b981';
    }
  } else {
    logo.style.boxShadow = '';
    if (statusIndicator) {
      statusIndicator.textContent = 'TTS Inactive';
      statusIndicator.style.color = '#6b7280';
    }
  }
}

// Cleanup WebRTC connection
function cleanupWebRTC() {
  if (audioDataChannel) {
    audioDataChannel.close();
    audioDataChannel = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  audioQueue = [];
  isPlayingAudio = false;
  updateTTSStatus(false);
}
```

### 4.2 Update Client WebSocket Handler

**File: [public/app.js](public/app.js)**

**Changes Required**:

1. Include webrtc.js script:
```html
<!-- In index.html, after app.js -->
<script src="webrtc.js"></script>
```

2. Update WebSocket message handler:
```javascript
ws.onmessage = (event) => {
  try {
    const message = JSON.parse(event.data);
    handleMessage(message);
  } catch (error) {
    handleLegacyMessage(event.data);
  }
};

function handleMessage(message) {
  switch (message.type) {
    case 'welcome':
      console.log('Welcome:', message);
      break;

    case 'webrtc-offer':
      // Initialize WebRTC with offer from server
      initializeWebRTC(message);
      break;

    case 'webrtc-ice':
      // Handle ICE candidate from server
      handleIceCandidate(message.candidate);
      break;

    case 'health':
      updateHealth(message.data);
      break;

    case 'event':
      handleEvent(message.event);
      break;

    case 'response':
      addSystemMessage(message.text || message.message);
      break;

    case 'error':
      addSystemMessage(message.message || 'An error occurred');
      break;

    default:
      console.warn('Unknown message type:', message.type);
  }
}
```

3. Handle client disconnection:
```javascript
ws.onclose = () => {
  onDisconnected();
  cleanupWebRTC(); // Cleanup WebRTC connection
};
```

### 4.3 Update Client UI

**File: [public/index.html](public/index.html)**

**Changes Required**:

1. Add TTS status indicator:
```html
<div class="status-bar">
  <!-- Existing status items -->

  <!-- TTS Status -->
  <span class="status-item">
    <span class="status-dot" id="tts-status-dot"></span>
    <span id="tts-status">TTS Inactive</span>
  </span>
</div>
```

2. Add webrtc.js script:
```html
<script src="app.js"></script>
<script src="webrtc.js"></script>
```

**File: [public/styles.css](public/styles.css)**

**Changes Required**:

1. Add TTS status styling:
```css
/* TTS Status Indicator */
#tts-status {
  font-size: 0.9rem;
  transition: color 0.3s ease;
}

#tts-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
  background: #6b7280; /* Gray when inactive */
  transition: background 0.3s ease;
}

#tts-status-dot.active {
  background: #10b981; /* Green when active */
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

## Phase 5: Testing & Verification

### 5.1 Run Unit Tests

```bash
# Run all new WebRTC tests
npm test -- webrtcPeerManager.test.ts
npm test -- signalingService.test.ts
npm test -- audioTrackProcessor.test.ts

# Run integration tests
npm test -- webrtcTTS.test.ts

# Run all tests
npm test

# Check coverage
npm run test:coverage
```

**Success Criteria**:
- All tests pass ✅
- Code coverage > 80% for new files
- No TypeScript errors
- No ESLint warnings

### 5.2 Manual Testing

**Test Scenario 1: Basic TTS Flow**
1. Start server: `npm run dev`
2. Open client: http://localhost:3000
3. Verify WebRTC offer received in console
4. Type message: "Hello, can you hear me?"
5. Verify:
   - Text response appears in chat ✅
   - Audio plays through speakers ✅
   - TTS status shows "TTS Active" ✅
   - No errors in console ✅

**Test Scenario 2: Multi-Client Isolation**
1. Open two browser tabs/windows
2. Send message in Tab 1: "This is tab one"
3. Send message in Tab 2: "This is tab two"
4. Verify:
   - Tab 1 hears only "This is tab one" audio ✅
   - Tab 2 hears only "This is tab two" audio ✅
   - No audio cross-contamination ✅

**Test Scenario 3: Reconnection**
1. Connect client, send message, verify audio works
2. Stop server (Ctrl+C)
3. Restart server: `npm run dev`
4. Client should auto-reconnect
5. Send message
6. Verify audio works again ✅

**Test Scenario 4: Error Handling**
1. Connect client
2. Disconnect network (browser dev tools → offline)
3. Send message
4. Verify:
   - Graceful error message ✅
   - No console errors/crashes ✅
5. Reconnect network
6. Verify auto-reconnection ✅

### 5.3 Performance Testing

**Metrics to Measure**:
1. **Audio Latency**: Time from response start to first audio chunk
   - Target: < 500ms
   - Measure: Console.time() in handleIncomingAudio()

2. **Data Channel Throughput**: Bytes per second
   - Target: > 50 KB/s (sufficient for TTS streaming)
   - Measure: Track bytes sent over time

3. **Memory Usage**: Client and server memory
   - Target: Stable (no leaks)
   - Measure: Chrome DevTools Memory Profiler

4. **Connection Stability**: Continuous operation time
   - Target: > 1 hour without errors
   - Test: Long-running conversation

**Performance Test Script**:
```bash
# Send 50 consecutive messages, measure average audio latency
for i in {1..50}; do
  echo "Message $i: What is the weather?"
  sleep 5
done
```

### 5.4 Browser Compatibility Testing

**Test Browsers**:
- ✅ Chrome 80+ (Linux, macOS, Windows)
- ✅ Firefox 70+ (Linux, macOS, Windows)
- ✅ Safari 14+ (macOS, iOS)
- ✅ Edge 80+ (Windows)

**Test Mobile**:
- ✅ Chrome Mobile (Android)
- ✅ Safari Mobile (iOS)

**Known WebRTC Limitations**:
- Safari: Requires HTTPS for getUserMedia (not needed for TTS-only)
- Firefox: May require manual permissions for data channels (test)
- Mobile: Audio playback may require user interaction (test auto-play policies)

## Phase 6: Documentation & Deployment

### 6.1 Update Documentation

**File: [docs/TTS_CLIENT_USAGE.md](docs/TTS_CLIENT_USAGE.md)**

Update sections:
- "How It Works" → Explain WebRTC architecture
- "Audio Processing" → Update to WebRTC data channels
- "Troubleshooting" → Add WebRTC-specific issues
- "Technical Details" → Update architecture diagram

**File: [CLAUDE.md](CLAUDE.md)**

Add section:
- "WebRTC TTS Architecture" → Document peer connection lifecycle
- "Future Enhancements" → Note STT addition will reuse WebRTC infrastructure

**File: [README.md](README.md)**

Update:
- Features section → Add "WebRTC-based TTS streaming"
- Architecture diagram → Include WebRTC components

### 6.2 Configuration Guide

**File: [.env.example](.env.example)**

Add WebRTC configuration:
```bash
# Voice Interface Configuration (WebRTC)
ENABLE_VOICE=true
VOICE_TTS_VOICE=onyx
VOICE_TTS_CACHE_SIZE=100
VOICE_TTS_CACHE_TTL=3600000
VOICE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
```

**File: [docs/WEBRTC_CONFIGURATION.md](docs/WEBRTC_CONFIGURATION.md)** (new)

Document:
- ICE server configuration (STUN/TURN)
- Data channel settings (ordered, maxRetransmits)
- Audio codec preferences
- Firewall/NAT considerations
- TURN server setup for production (if needed)

### 6.3 Deployment Checklist

**Production Readiness**:
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Manual testing completed on all browsers
- [ ] Performance metrics meet targets
- [ ] No memory leaks detected
- [ ] Documentation updated
- [ ] Configuration guide written
- [ ] Error handling comprehensive
- [ ] Logging sufficient for debugging
- [ ] Security review completed (no exposed credentials, XSS prevention)

**TURN Server Setup (Optional)**:
- For production deployments behind restrictive NATs/firewalls
- Consider: [Coturn](https://github.com/coturn/coturn) open-source TURN server
- Or cloud service: Twilio TURN, Xirsys, etc.
- Update VOICE_ICE_SERVERS in .env with TURN credentials

**Deployment Steps**:
```bash
# 1. Run all tests
npm run test
npm run typecheck

# 2. Build for production
npm run build

# 3. Set production environment
export NODE_ENV=production

# 4. Start server
npm start

# 5. Verify health endpoint
curl http://localhost:3000/api/health

# 6. Monitor logs
tail -f logs/pace.log
```

## Implementation Timeline Estimates

**Phase 1 (Revert)**: 1-2 hours
- Straightforward code removal
- Verify server/client still works

**Phase 2 (Tests)**: 4-6 hours
- Write 3 unit test files (~150-200 tests total)
- Write 1 integration test file (~10-15 tests)
- Most time-consuming phase (but essential for TDD)

**Phase 3 (Server WebRTC)**: 3-4 hours
- Implement 3 new classes
- Integrate into voice plugin
- Update TTS service

**Phase 4 (Client WebRTC)**: 2-3 hours
- Client-side peer connection setup
- Audio playback logic
- UI updates

**Phase 5 (Testing)**: 2-3 hours
- Run tests, fix issues
- Manual testing scenarios
- Performance testing

**Phase 6 (Documentation)**: 1-2 hours
- Update docs
- Configuration guide
- Deployment checklist

**Total: 13-20 hours** (spread across 2-3 days for production-ready implementation)

## Risk Mitigation

### Risk 1: WebRTC Compatibility Issues
**Mitigation**: Comprehensive browser testing, fallback error messages, TURN server for NAT traversal

### Risk 2: Audio Playback Gaps
**Mitigation**: Proper queue management, buffering strategy, test with various network conditions

### Risk 3: Multi-Client Audio Cross-Contamination
**Mitigation**: Rigorous clientId tracking, unit tests for client-specific routing

### Risk 4: Memory Leaks in Long-Running Connections
**Mitigation**: Proper cleanup on disconnection, memory profiling, leak detection tests

### Risk 5: OpenAI API Rate Limits
**Mitigation**: Existing TTS caching (already implemented), rate limiting on client requests

## Success Criteria

✅ **Functional Requirements Met**:
- User can enable TTS by clicking proPACE logo
- PACE's responses are spoken aloud via WebRTC
- Audio is client-specific (no cross-talk)
- Reconnection works gracefully
- Works on Chrome, Firefox, Safari, Edge

✅ **Non-Functional Requirements Met**:
- Audio latency < 500ms
- No memory leaks
- Comprehensive test coverage (>80%)
- Production-ready architecture
- Proper error handling and logging

✅ **User Acceptance**:
- "I want this to be as it would for production" → Using WebRTC (production-ready transport)
- "Write tests to ensure functionality" → TDD approach with comprehensive tests
- "Forget the websocket implementation" → Reverted and replaced

## Next Steps After Implementation

1. **Monitor Production Usage**:
   - Track audio latency metrics
   - Monitor WebRTC connection success rate
   - Log client errors for debugging

2. **Iterate Based on Feedback**:
   - Adjust audio quality settings
   - Optimize chunk sizes
   - Tune buffering strategy

3. **Future STT Integration**:
   - Reuse WebRTC infrastructure
   - Add microphone permissions
   - Implement bidirectional audio (TTS + STT)

4. **Scale for Multi-User**:
   - Test with 10+ concurrent clients
   - Consider WebRTC SFU (Selective Forwarding Unit) for larger deployments
   - Load testing and optimization