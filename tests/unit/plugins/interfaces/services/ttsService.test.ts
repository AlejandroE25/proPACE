/**
 * TTSService Test Suite
 *
 * Tests OpenAI TTS integration including audio generation,
 * chunked streaming, interruption via AbortSignal, and caching.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TTSService } from '../../../../../src/plugins/interfaces/services/ttsService';
import { EventBus } from '../../../../../src/events/eventBus';
import { EventStore } from '../../../../../src/events/eventStore';
import { EventType } from '../../../../../src/events/types';

describe('TTSService', () => {
  let service: TTSService;
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
        speech: {
          create: vi.fn()
        }
      }
    };

    service = new TTSService({
      apiKey: 'test-api-key',
      voice: 'onyx',
      model: 'tts-1',
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

    it('should accept custom voice configuration', () => {
      const customService = new TTSService({
        apiKey: 'test-key',
        voice: 'alloy',
        model: 'tts-1-hd',
        eventBus
      });

      expect(customService).toBeDefined();
    });

    it('should default to onyx voice', () => {
      const defaultService = new TTSService({
        apiKey: 'test-key',
        eventBus
      });

      expect(defaultService).toBeDefined();
    });
  });

  describe('Audio Generation', () => {
    it('should generate audio from text', async () => {
      // Mock OpenAI response
      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      const result = await service.generate('Hello, world!', 'response-123');

      expect(mockOpenAI.audio.speech.create).toHaveBeenCalledWith({
        model: 'tts-1',
        voice: 'onyx',
        input: 'Hello, world!',
        response_format: 'mp3'
      });

      expect(result.success).toBe(true);
      expect(result.responseId).toBe('response-123');
    });

    it('should handle empty text', async () => {
      const result = await service.generate('', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should handle very long text', async () => {
      const longText = 'a'.repeat(5000); // 5000 characters

      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      const result = await service.generate(longText, 'response-123');

      expect(result.success).toBe(true);
    });

    it('should truncate text exceeding 4096 characters', async () => {
      const tooLongText = 'a'.repeat(5000);

      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate(tooLongText, 'response-123');

      const callArgs = mockOpenAI.audio.speech.create.mock.calls[0][0];
      expect(callArgs.input.length).toBeLessThanOrEqual(4096);
    });
  });

  describe('Chunked Streaming', () => {
    it('should publish TTS_STARTED event', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.TTS_STARTED], {
        id: 'test-subscriber',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate('Hello!', 'response-123');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(EventType.TTS_STARTED);
      expect(events[0].payload.responseId).toBe('response-123');
    });

    it('should publish TTS_CHUNK events', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.TTS_CHUNK], {
        id: 'test-subscriber',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      // Create mock audio buffer large enough for multiple chunks
      const largeAudioBuffer = Buffer.alloc(32768); // 32KB
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: largeAudioBuffer
      });

      await service.generate('Hello!', 'response-123');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(EventType.TTS_CHUNK);
      expect(events[0].payload.responseId).toBe('response-123');
      expect(events[0].payload.chunk).toBeDefined();
    });

    it('should publish TTS_COMPLETED event', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.TTS_COMPLETED], {
        id: 'test-subscriber',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate('Hello!', 'response-123');
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.length).toBeGreaterThan(0);
      const completedEvent = events.find(e => e.type === EventType.TTS_COMPLETED);
      expect(completedEvent).toBeDefined();
      expect(completedEvent.payload.responseId).toBe('response-123');
    });
  });

  describe('Interruption Handling', () => {
    it('should accept AbortSignal', async () => {
      const abortController = new AbortController();

      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      const result = await service.generate('Hello!', 'response-123', abortController.signal);

      expect(result.success).toBe(true);
    });

    it('should handle aborted generation', async () => {
      const abortController = new AbortController();

      // Mock a slow generation
      mockOpenAI.audio.speech.create.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { body: Buffer.from('fake-audio') };
      });

      // Abort immediately
      abortController.abort();

      const result = await service.generate('Hello!', 'response-123', abortController.signal);

      expect(result.success).toBe(false);
      expect(result.error).toContain('abort');
    });

    it('should publish TTS_INTERRUPTED event on abort', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.TTS_INTERRUPTED], {
        id: 'test-subscriber',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      const abortController = new AbortController();

      mockOpenAI.audio.speech.create.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        throw new Error('Aborted');
      });

      abortController.abort();

      await service.generate('Hello!', 'response-123', abortController.signal);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.some(e => e.type === EventType.TTS_INTERRUPTED)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle OpenAI API errors', async () => {
      mockOpenAI.audio.speech.create.mockRejectedValue(
        new Error('OpenAI API error')
      );

      const result = await service.generate('Hello!', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('OpenAI');
    });

    it('should handle network errors', async () => {
      mockOpenAI.audio.speech.create.mockRejectedValue(
        new Error('Network error')
      );

      const result = await service.generate('Hello!', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      mockOpenAI.audio.speech.create.mockRejectedValue(rateLimitError);

      const result = await service.generate('Hello!', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });
  });

  describe('Statistics', () => {
    it('should track total generations', async () => {
      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate('Hello!', 'response-1');
      await service.generate('Hi there!', 'response-2');

      const stats = service.getStatistics();
      expect(stats.totalGenerations).toBe(2);
    });

    it('should track successful generations', async () => {
      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate('Hello!', 'response-1');

      const stats = service.getStatistics();
      expect(stats.successfulGenerations).toBe(1);
    });

    it('should track failed generations', async () => {
      mockOpenAI.audio.speech.create.mockRejectedValue(
        new Error('API error')
      );

      await service.generate('Hello!', 'response-1');

      const stats = service.getStatistics();
      expect(stats.failedGenerations).toBe(1);
    });

    it('should track interrupted generations', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await service.generate('Hello!', 'response-1', abortController.signal);

      const stats = service.getStatistics();
      expect(stats.interruptedGenerations).toBe(1);
    });

    it('should track total audio bytes generated', async () => {
      const mockAudioStream = Buffer.from('fake-audio-data-1234567890');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate('Hello!', 'response-1');

      const stats = service.getStatistics();
      expect(stats.totalAudioBytes).toBeGreaterThan(0);
    });
  });

  describe('Voice Configuration', () => {
    it('should use configured voice', async () => {
      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate('Hello!', 'response-123');

      const callArgs = mockOpenAI.audio.speech.create.mock.calls[0][0];
      expect(callArgs.voice).toBe('onyx');
    });

    it('should support changing voice', async () => {
      service.setVoice('alloy');

      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate('Hello!', 'response-123');

      const callArgs = mockOpenAI.audio.speech.create.mock.calls[0][0];
      expect(callArgs.voice).toBe('alloy');
    });

    it('should support all OpenAI voices', async () => {
      const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

      for (const voice of voices) {
        service.setVoice(voice);

        const mockAudioStream = Buffer.from('fake-audio-data');
        mockOpenAI.audio.speech.create.mockResolvedValue({
          body: mockAudioStream
        });

        await service.generate('Hello!', `response-${voice}`);

        const callArgs = mockOpenAI.audio.speech.create.mock.calls[mockOpenAI.audio.speech.create.mock.calls.length - 1][0];
        expect(callArgs.voice).toBe(voice);
      }
    });
  });

  describe('Model Configuration', () => {
    it('should use tts-1 model by default', async () => {
      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await service.generate('Hello!', 'response-123');

      const callArgs = mockOpenAI.audio.speech.create.mock.calls[0][0];
      expect(callArgs.model).toBe('tts-1');
    });

    it('should support tts-1-hd model', async () => {
      const hdService = new TTSService({
        apiKey: 'test-key',
        voice: 'onyx',
        model: 'tts-1-hd',
        eventBus,
        openAIClient: mockOpenAI
      });

      const mockAudioStream = Buffer.from('fake-audio-data');
      mockOpenAI.audio.speech.create.mockResolvedValue({
        body: mockAudioStream
      });

      await hdService.generate('Hello!', 'response-123');

      const callArgs = mockOpenAI.audio.speech.create.mock.calls[0][0];
      expect(callArgs.model).toBe('tts-1-hd');
    });
  });
});
