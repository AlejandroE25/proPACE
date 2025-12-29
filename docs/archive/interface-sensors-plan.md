# Interface Sensors - Implementation Plan

## Overview

Interface sensors enable user interaction with proPACE through various input modalities (voice, vision, touch, etc.). Unlike monitoring sensors that collect time-series data, interface sensors are **event-driven plugins** that process user input in real-time.

## Architectural Principles

### Why Separate from Monitoring Sensors?

**Monitoring Sensors** (Temperature, Motion, etc.):
- Continuous numeric readings
- Time-series storage
- Historical analysis and trends
- Polling-based collection
- Statistical anomaly detection

**Interface Sensors** (Microphone, Camera, etc.):
- Discrete interaction events
- Rich payloads (audio, images, video)
- Real-time processing
- Event-driven (triggered by user action)
- AI/ML-based interpretation

### Event Flow

```
User Input → Interface Sensor Plugin → Event Processing → EventBus
                                           ↓
                                    Decision Engine → Actions
```

## Interface Sensor Types

### 1. Voice Input (Microphone)

**Purpose**: Speech-to-text, voice commands, speaker identification

**Event Types**:
- `USER_SPEECH` - Transcribed speech
- `VOICE_COMMAND` - Recognized command
- `SPEAKER_IDENTIFIED` - Speaker recognition result
- `LISTENING_STARTED` / `LISTENING_STOPPED` - Microphone state

**Event Payload Example**:
```typescript
{
  type: EventType.USER_SPEECH,
  priority: EventPriority.HIGH,
  source: 'microphone-plugin',
  payload: {
    transcript: "Hey Pace, turn on the living room lights",
    confidence: 0.95,
    speakerId: "user-123",
    speakerName: "John",
    language: "en-US",
    duration: 2.5,
    timestamp: new Date(),
    audioMetadata: {
      sampleRate: 16000,
      channels: 1
    }
  }
}
```

**Technologies**:
- **Speech-to-Text**: OpenAI Whisper, Google Cloud Speech-to-Text, Web Speech API
- **Speaker Recognition**: Azure Speaker Recognition, Resemblyzer
- **Wake Word Detection**: Porcupine, Snowboy

**Plugin Configuration**:
```json
{
  "microphone-plugin": {
    "enabled": true,
    "settings": {
      "wakeWord": "hey pace",
      "language": "en-US",
      "continuousListening": false,
      "speakerRecognition": true,
      "noiseReduction": true,
      "sampleRate": 16000,
      "silenceThreshold": 0.01,
      "silenceDuration": 1500
    }
  }
}
```

### 2. Visual Input (Camera)

**Purpose**: Face recognition, gesture detection, presence monitoring

**Event Types**:
- `FACE_DETECTED` - Face detected in frame
- `PERSON_IDENTIFIED` - Person recognized
- `GESTURE_DETECTED` - Hand gesture recognized
- `PRESENCE_CHANGED` - Person entered/left room
- `EMOTION_DETECTED` - Facial expression analysis

**Event Payload Example**:
```typescript
{
  type: EventType.PERSON_IDENTIFIED,
  priority: EventPriority.MEDIUM,
  source: 'camera-plugin',
  payload: {
    personId: "user-123",
    personName: "John",
    confidence: 0.92,
    location: "living_room",
    boundingBox: {
      x: 150,
      y: 200,
      width: 100,
      height: 120
    },
    attributes: {
      age: 35,
      emotion: "happy",
      glasses: true
    },
    timestamp: new Date(),
    cameraId: "cam-livingroom-1"
  }
}
```

**Technologies**:
- **Face Recognition**: face-api.js, DeepFace, Azure Face API
- **Gesture Detection**: MediaPipe, TensorFlow.js
- **Object Detection**: YOLO, TensorFlow Object Detection

**Plugin Configuration**:
```json
{
  "camera-plugin": {
    "enabled": true,
    "settings": {
      "cameras": [
        {
          "id": "cam-livingroom-1",
          "device": "/dev/video0",
          "location": "living_room",
          "fps": 15,
          "resolution": "1280x720"
        }
      ],
      "faceRecognition": true,
      "gestureDetection": false,
      "privacyMode": true,
      "processingInterval": 500,
      "confidenceThreshold": 0.85
    }
  }
}
```

### 3. Text Input (Keyboard/Chat)

**Purpose**: Text commands, chat interface, keyboard shortcuts

**Event Types**:
- `TEXT_COMMAND` - Text-based command
- `CHAT_MESSAGE` - User chat message
- `KEYBOARD_SHORTCUT` - Hotkey pressed

**Event Payload Example**:
```typescript
{
  type: EventType.TEXT_COMMAND,
  priority: EventPriority.NORMAL,
  source: 'keyboard-plugin',
  payload: {
    text: "show me the temperature history",
    userId: "user-123",
    source: "web-ui",
    timestamp: new Date(),
    context: {
      previousCommand: "turn on lights",
      conversationId: "conv-456"
    }
  }
}
```

### 4. Biometric Input

**Purpose**: Authentication, presence detection

**Event Types**:
- `FINGERPRINT_VERIFIED` - Fingerprint authentication
- `FACIAL_AUTH` - Face authentication
- `BIOMETRIC_FAILED` - Authentication failed

**Event Payload Example**:
```typescript
{
  type: EventType.FINGERPRINT_VERIFIED,
  priority: EventPriority.HIGH,
  source: 'biometric-plugin',
  payload: {
    userId: "user-123",
    method: "fingerprint",
    confidence: 0.98,
    timestamp: new Date(),
    deviceId: "fingerprint-reader-1"
  }
}
```

## Implementation Structure

### Plugin Base Structure

```typescript
// src/plugins/interface/baseInterfacePlugin.ts

import { Plugin, PluginCapability, PluginConfig } from '../types';
import { EventBus } from '../../events/eventBus';
import { EventType, EventPriority } from '../../events/types';

/**
 * Base class for interface sensor plugins
 */
export abstract class BaseInterfacePlugin implements Plugin {
  protected eventBus!: EventBus;
  protected config!: PluginConfig;

  abstract readonly metadata: PluginMetadata;

  constructor() {
    // Interface plugins always have INTERFACE capability
    this.metadata.capability = PluginCapability.INTERFACE;
  }

  /**
   * Publish interface event
   */
  protected publishEvent(
    eventType: EventType,
    payload: any,
    priority: EventPriority = EventPriority.NORMAL
  ): void {
    this.eventBus.publish({
      type: eventType,
      priority,
      source: this.metadata.id,
      payload,
      timestamp: new Date()
    });
  }

  /**
   * Process user input (implemented by each plugin)
   */
  abstract processInput(input: any): Promise<void>;
}
```

### Example: Microphone Plugin

```typescript
// src/plugins/interface/microphonePlugin.ts

export class MicrophonePlugin extends BaseInterfacePlugin {
  readonly metadata: PluginMetadata = {
    id: 'microphone',
    name: 'Microphone Input',
    version: '1.0.0',
    description: 'Voice input and speech recognition',
    author: 'proPACE',
    capability: PluginCapability.INTERFACE
  };

  private whisperClient?: WhisperClient;
  private isListening = false;

  async initialize(
    eventBus: EventBus,
    dataPipeline: DataPipeline,
    config: PluginConfig
  ): Promise<void> {
    this.eventBus = eventBus;
    this.config = config;

    // Initialize Whisper for speech-to-text
    this.whisperClient = new WhisperClient({
      model: config.settings?.model || 'base',
      language: config.settings?.language || 'en'
    });
  }

  async start(): Promise<void> {
    // Start listening for wake word
    this.startWakeWordDetection();
  }

  async stop(): Promise<void> {
    this.stopListening();
  }

  async processInput(audioBuffer: Buffer): Promise<void> {
    // Transcribe audio
    const result = await this.whisperClient.transcribe(audioBuffer);

    // Publish speech event
    this.publishEvent(EventType.USER_SPEECH, {
      transcript: result.text,
      confidence: result.confidence,
      language: result.language,
      duration: audioBuffer.length / 16000,
      timestamp: new Date()
    }, EventPriority.HIGH);

    // Check if it's a command
    if (this.isCommand(result.text)) {
      this.publishEvent(EventType.VOICE_COMMAND, {
        command: this.parseCommand(result.text),
        rawText: result.text,
        confidence: result.confidence
      }, EventPriority.HIGH);
    }
  }

  private isCommand(text: string): boolean {
    // Command detection logic
    return text.toLowerCase().includes('pace');
  }

  private parseCommand(text: string): any {
    // Command parsing logic
    return {
      intent: 'unknown',
      entities: []
    };
  }
}
```

## Decision Rules for Interface Sensors

### Voice Command Example

```json
{
  "id": "voice-command-lights",
  "name": "Voice Control Lights",
  "description": "Control lights via voice commands",
  "conditions": {
    "eventType": "voice_command",
    "payload": {
      "command.intent": "control_lights"
    }
  },
  "action": {
    "type": "execute_plugin_action",
    "pluginId": "smart-lights",
    "action": "toggle",
    "params": {
      "room": "${event.payload.command.entities.room}",
      "state": "${event.payload.command.entities.state}"
    }
  },
  "autonomyLevel": "fully_autonomous",
  "riskLevel": "low",
  "priority": 10,
  "enabled": true
}
```

### Face Recognition Example

```json
{
  "id": "person-arrived-home",
  "name": "Person Arrived Home",
  "description": "Welcome user when face is detected",
  "conditions": {
    "eventType": "person_identified",
    "payload": {
      "location": "front_door"
    }
  },
  "action": {
    "type": "sequence",
    "actions": [
      {
        "type": "notify_user",
        "message": "Welcome home, ${event.payload.personName}!"
      },
      {
        "type": "execute_plugin_action",
        "pluginId": "smart-lights",
        "action": "turn_on",
        "params": {
          "room": "entrance"
        }
      }
    ]
  },
  "autonomyLevel": "fully_autonomous",
  "riskLevel": "low",
  "priority": 8,
  "enabled": true
}
```

## Event Types to Add

Add to `src/events/types.ts`:

```typescript
export enum EventType {
  // ... existing types ...

  // Interface Sensor Events
  USER_SPEECH = 'user_speech',
  VOICE_COMMAND = 'voice_command',
  SPEAKER_IDENTIFIED = 'speaker_identified',
  LISTENING_STARTED = 'listening_started',
  LISTENING_STOPPED = 'listening_stopped',

  FACE_DETECTED = 'face_detected',
  PERSON_IDENTIFIED = 'person_identified',
  GESTURE_DETECTED = 'gesture_detected',
  PRESENCE_CHANGED = 'presence_changed',
  EMOTION_DETECTED = 'emotion_detected',

  TEXT_COMMAND = 'text_command',
  CHAT_MESSAGE = 'chat_message',
  KEYBOARD_SHORTCUT = 'keyboard_shortcut',

  FINGERPRINT_VERIFIED = 'fingerprint_verified',
  FACIAL_AUTH = 'facial_auth',
  BIOMETRIC_FAILED = 'biometric_failed'
}
```

## Privacy and Security Considerations

### Privacy-First Design

1. **Local Processing**: Process audio/video locally when possible
2. **No Storage**: Don't store raw audio/video unless explicitly needed
3. **Privacy Mode**: Disable cameras/mics when not needed
4. **User Consent**: Explicit consent for each sensor type
5. **Data Minimization**: Only extract necessary information

### Security Measures

1. **Authentication**: Verify user identity before sensitive actions
2. **Encryption**: Encrypt biometric data at rest and in transit
3. **Access Control**: Restrict who can enable/disable sensors
4. **Audit Logging**: Log all sensor activations and recognitions
5. **Fallback Auth**: Don't rely solely on biometrics

### Configuration Example

```json
{
  "microphone-plugin": {
    "enabled": true,
    "settings": {
      "privacy": {
        "localProcessing": true,
        "storageEnabled": false,
        "autoDisable": true,
        "disableAfterSeconds": 300,
        "muteKeyword": "privacy mode"
      },
      "security": {
        "requireAuthentication": true,
        "multiFactorAuth": false,
        "encryptData": true
      }
    }
  }
}
```

## Implementation Phases

### Phase 1: Text Input (Easiest)
- Keyboard/chat interface plugin
- Text command parsing
- Integration with existing decision engine
- **Estimated effort**: 1-2 days

### Phase 2: Voice Input (Most Useful)
- Microphone plugin
- Speech-to-text integration (Whisper)
- Wake word detection
- Voice command parsing
- **Estimated effort**: 3-5 days

### Phase 3: Face Recognition (Security)
- Camera plugin
- Face detection
- Person identification
- Privacy controls
- **Estimated effort**: 5-7 days

### Phase 4: Advanced Features
- Gesture detection
- Emotion recognition
- Speaker identification
- Multi-modal fusion
- **Estimated effort**: 7-10 days

## Testing Strategy

### Unit Tests
- Plugin initialization
- Event publishing
- Input processing
- Error handling

### Integration Tests
- End-to-end voice command flow
- Face recognition → action execution
- Multi-sensor coordination
- Privacy mode behavior

### Privacy Tests
- Data not stored when disabled
- Local processing verification
- Encryption validation
- Access control enforcement

## Dependencies

### Voice Input
```bash
npm install @openai/whisper
npm install node-record-lpcm16  # Audio recording
npm install @picovoice/porcupine-node  # Wake word
```

### Camera Input
```bash
npm install face-api.js
npm install @tensorflow/tfjs-node
npm install node-webcam
```

### Text Processing
```bash
npm install natural  # NLP
npm install compromise  # Text parsing
```

## API Integration

### OpenAI Whisper API
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Use Claude for command interpretation
const result = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{
    role: 'user',
    content: `Parse this voice command: "${transcript}"`
  }]
});
```

### Face Recognition
```typescript
import * as faceapi from 'face-api.js';

const detections = await faceapi
  .detectAllFaces(image)
  .withFaceLandmarks()
  .withFaceDescriptors();
```

## Future Enhancements

1. **Multi-Modal Fusion**: Combine voice + face for better recognition
2. **Context Awareness**: Use location/time for better command interpretation
3. **Learning**: Improve recognition based on user feedback
4. **Offline Mode**: Full functionality without internet
5. **Custom Wake Words**: User-defined activation phrases
6. **Voice Synthesis**: Text-to-speech responses from Pace

## Success Criteria

- ✅ Voice commands recognized with >90% accuracy
- ✅ Face recognition with <1% false positive rate
- ✅ <500ms latency from input to event published
- ✅ Zero raw audio/video storage in privacy mode
- ✅ All tests passing
- ✅ Complete documentation
- ✅ Privacy controls functional

## Next Steps

When ready to implement:

1. Choose which sensor to implement first (recommend: text input)
2. Create base interface plugin class
3. Implement specific plugin
4. Add event types
5. Create decision rules
6. Test end-to-end
7. Document usage
8. Deploy to production
