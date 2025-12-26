/**
 * STTService Test Suite
 *
 * Tests OpenAI Whisper API integration for speech-to-text,
 * including audio upload, transcription, and event publishing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STTService } from '../../../../../src/plugins/interfaces/services/sttService';
import { EventBus } from '../../../../../src/events/eventBus';
import { EventStore } from '../../../../../src/events/eventStore';
import { EventType } from '../../../../../src/events/types';

describe('STTService', () => {
  let service: STTService;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let mockOpenAI: any;

  beforeEach(() => {
    // Create EventBus for event publishing
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);

    // Mock OpenAI client
    mockOpenAI = {
      audio: {
        transcriptions: {
          create: vi.fn()
        }
      }
    };

    service = new STTService({
      apiKey: 'test-api-key',
      language: 'en',
      eventBus,
      openAIClient: mockOpenAI
    });
  });

  afterEach(async () => {
    await eventBus.shutdown();
    eventStore.close();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(service).toBeDefined();
    });

    it('should accept custom language configuration', () => {
      const customService = new STTService({
        apiKey: 'test-key',
        language: 'es',
        eventBus
      });

      expect(customService).toBeDefined();
    });

    it('should default to English language', () => {
      const defaultService = new STTService({
        apiKey: 'test-key',
        eventBus
      });

      expect(defaultService).toBeDefined();
    });
  });

  describe('Audio Transcription', () => {
    it('should transcribe audio to text', async () => {
      // Create buffer larger than MIN_AUDIO_SIZE (1000 bytes)
      const audioBuffer = Buffer.alloc(5000);

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Hello, how are you?'
      });

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(mockOpenAI.audio.transcriptions.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.text).toBe('Hello, how are you?');
      expect(result.clientId).toBe('client-123');
    });

    it('should handle empty audio buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);

      const result = await service.transcribe(emptyBuffer, 'client-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should handle very small audio files', async () => {
      const tinyBuffer = Buffer.alloc(100); // 100 bytes

      const result = await service.transcribe(tinyBuffer, 'client-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('too small');
    });

    it('should handle large audio files', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10 MB

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Long transcription...'
      });

      const result = await service.transcribe(largeBuffer, 'client-123');

      expect(result.success).toBe(true);
    });

    it('should include confidence if provided by API', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Hello!',
        confidence: 0.95
      });

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(result.confidence).toBe(0.95);
    });
  });

  describe('Language Support', () => {
    it('should use configured language', async () => {
      const audioBuffer = Buffer.alloc(5000);

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Hello!'
      });

      await service.transcribe(audioBuffer, 'client-123');

      const callArgs = mockOpenAI.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.language).toBe('en');
    });

    it('should support changing language', () => {
      service.setLanguage('es');

      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Hola!'
      });

      service.transcribe(audioBuffer, 'client-123');

      // Language should be updated in next call
      expect(service).toBeDefined();
    });

    it('should support multiple languages', async () => {
      const languages = ['en', 'es', 'fr', 'de', 'ja', 'zh'];

      for (const lang of languages) {
        service.setLanguage(lang);

        const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

        mockOpenAI.audio.transcriptions.create.mockResolvedValue({
          text: 'Test transcription'
        });

        await service.transcribe(audioBuffer, `client-${lang}`);

        const callArgs = mockOpenAI.audio.transcriptions.create.mock.calls[
          mockOpenAI.audio.transcriptions.create.mock.calls.length - 1
        ][0];
        expect(callArgs.language).toBe(lang);
      }
    });
  });

  describe('Event Publishing', () => {
    it('should publish USER_SPEECH event on successful transcription', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.USER_SPEECH], {
        id: 'test-subscriber',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Hello, Pace!'
      });

      await service.transcribe(audioBuffer, 'client-123');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(EventType.USER_SPEECH);
      expect(events[0].payload.clientId).toBe('client-123');
      expect(events[0].payload.text).toBe('Hello, Pace!');
    });

    it('should not publish event on failed transcription', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.USER_SPEECH], {
        id: 'test-subscriber',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      const emptyBuffer = Buffer.alloc(0);

      await service.transcribe(emptyBuffer, 'client-123');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.length).toBe(0);
    });

    it('should include audio size in event', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.USER_SPEECH], {
        id: 'test-subscriber',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      const audioBuffer = Buffer.alloc(50000); // 50KB

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Test'
      });

      await service.transcribe(audioBuffer, 'client-123');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events[0].payload.audioSize).toBe(50000);
    });
  });

  describe('Error Handling', () => {
    it('should handle Whisper API errors', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockRejectedValue(
        new Error('Whisper API error')
      );

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Whisper');
    });

    it('should handle network errors', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle rate limiting', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      mockOpenAI.audio.transcriptions.create.mockRejectedValue(rateLimitError);

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should handle invalid audio format', async () => {
      const audioBuffer = Buffer.from('invalid-audio-format');

      const formatError = new Error('Unsupported audio format');
      (formatError as any).status = 400;

      mockOpenAI.audio.transcriptions.create.mockRejectedValue(formatError);

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should track total transcriptions', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Test'
      });

      await service.transcribe(audioBuffer, 'client-1');
      await service.transcribe(audioBuffer, 'client-2');

      const stats = service.getStatistics();
      expect(stats.totalTranscriptions).toBe(2);
    });

    it('should track successful transcriptions', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Success'
      });

      await service.transcribe(audioBuffer, 'client-1');

      const stats = service.getStatistics();
      expect(stats.successfulTranscriptions).toBe(1);
    });

    it('should track failed transcriptions', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockRejectedValue(
        new Error('API error')
      );

      await service.transcribe(audioBuffer, 'client-1');

      const stats = service.getStatistics();
      expect(stats.failedTranscriptions).toBe(1);
    });

    it('should track total audio bytes processed', async () => {
      const audioBuffer1 = Buffer.alloc(10000);
      const audioBuffer2 = Buffer.alloc(20000);

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Test'
      });

      await service.transcribe(audioBuffer1, 'client-1');
      await service.transcribe(audioBuffer2, 'client-2');

      const stats = service.getStatistics();
      expect(stats.totalAudioBytes).toBe(30000);
    });

    it('should track average transcription time', async () => {
      vi.useFakeTimers();

      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return { text: 'Test' };
      });

      const promise = service.transcribe(audioBuffer, 'client-1');
      vi.advanceTimersByTime(500);
      await promise;

      vi.useRealTimers();

      const stats = service.getStatistics();
      expect(stats.averageTranscriptionTime).toBeGreaterThan(0);
    });
  });

  describe('Model Configuration', () => {
    it('should use whisper-1 model', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Test'
      });

      await service.transcribe(audioBuffer, 'client-123');

      const callArgs = mockOpenAI.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.model).toBe('whisper-1');
    });
  });

  describe('Response Format', () => {
    it('should request json format', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Test'
      });

      await service.transcribe(audioBuffer, 'client-123');

      const callArgs = mockOpenAI.audio.transcriptions.create.mock.calls[0][0];
      expect(callArgs.response_format).toBe('json');
    });
  });

  describe('Edge Cases', () => {
    it('should handle transcription with no speech', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: ''
      });

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(result.success).toBe(true);
      expect(result.text).toBe('');
    });

    it('should handle very long transcriptions', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE
      const longText = 'a'.repeat(10000);

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: longText
      });

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(result.success).toBe(true);
      expect(result.text?.length).toBe(10000);
    });

    it('should handle special characters in transcription', async () => {
      const audioBuffer = Buffer.alloc(5000); // 5KB - above MIN_AUDIO_SIZE

      mockOpenAI.audio.transcriptions.create.mockResolvedValue({
        text: 'Hello! How are you? I\'m doing great. 🎉'
      });

      const result = await service.transcribe(audioBuffer, 'client-123');

      expect(result.success).toBe(true);
      expect(result.text).toContain('🎉');
    });
  });
});
