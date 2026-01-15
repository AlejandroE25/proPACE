/**
 * PiperTTSService Test Suite
 *
 * Tests local Piper TTS integration including audio generation,
 * chunked streaming, interruption via AbortSignal, and process management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PiperTTSService } from '../../../../../src/plugins/interfaces/services/piperTtsService';
import { EventBus } from '../../../../../src/events/eventBus';
import { EventStore } from '../../../../../src/events/eventStore';
import { EventType } from '../../../../../src/events/types';
import type { ChildProcess } from 'child_process';

describe('PiperTTSService', () => {
  let service: PiperTTSService;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let mockSpawn: any;
  let mockProcess: any;

  beforeEach(() => {
    // Create EventBus for event publishing
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);

    // Mock child process
    mockProcess = {
      stdin: {
        write: vi.fn(),
        end: vi.fn()
      },
      stdout: {
        on: vi.fn()
      },
      stderr: {
        on: vi.fn()
      },
      on: vi.fn(),
      kill: vi.fn()
    };

    // Mock spawn function
    mockSpawn = vi.fn(() => mockProcess);

    service = new PiperTTSService({
      eventBus,
      piperPath: '/usr/local/bin/piper',
      modelPath: '/usr/local/share/piper/voices/en_US-lessac-medium.onnx',
      spawnFn: mockSpawn
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

    it('should accept custom piper and model paths', () => {
      const customService = new PiperTTSService({
        eventBus,
        piperPath: '/custom/path/piper',
        modelPath: '/custom/path/model.onnx'
      });

      expect(customService).toBeDefined();
    });

    it('should use default paths if not provided', () => {
      const defaultService = new PiperTTSService({
        eventBus
      });

      expect(defaultService).toBeDefined();
    });
  });

  describe('Audio Generation', () => {
    it('should generate audio from text using Piper', async () => {
      // Mock successful Piper execution
      const mockAudioData = Buffer.from('fake-wav-audio-data');

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(mockAudioData);
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0); // Exit code 0 = success
        }
      });

      const result = await service.generate('Hello, world!', 'response-123');

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/piper',
        ['--model', '/usr/local/share/piper/voices/en_US-lessac-medium.onnx', '--output-file', '-'],
        expect.any(Object)
      );

      expect(mockProcess.stdin.write).toHaveBeenCalledWith('Hello, world!');
      expect(mockProcess.stdin.end).toHaveBeenCalled();

      expect(result.success).toBe(true);
      expect(result.responseId).toBe('response-123');
    });

    it('should handle empty text', async () => {
      const result = await service.generate('', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should handle whitespace-only text', async () => {
      const result = await service.generate('   \n\t  ', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should truncate text longer than max length', async () => {
      const longText = 'a'.repeat(5000);

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('audio'));
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await service.generate(longText, 'response-123');

      // Should truncate to 4096 characters
      expect(mockProcess.stdin.write).toHaveBeenCalledWith('a'.repeat(4096));
    });
  });

  describe('Process Management', () => {
    it('should handle Piper process errors', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          callback(new Error('Piper not found'));
        }
      });

      const result = await service.generate('Hello', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Piper not found');
    });

    it('should handle non-zero exit codes', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1); // Exit code 1 = error
        }
      });

      mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('Model file not found'));
        }
      });

      const result = await service.generate('Hello', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('exited with code 1');
    });

    it('should capture stderr output on error', async () => {
      const stderrMessages: string[] = [];

      mockProcess.stderr.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('Error: Model incompatible'));
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1);
        }
      });

      const result = await service.generate('Hello', 'response-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Model incompatible');
    });
  });

  describe('AbortSignal Support', () => {
    it('should respect abort signal before generation', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await service.generate(
        'Hello',
        'response-123',
        'client-123',
        abortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should kill process when aborted during generation', async () => {
      const abortController = new AbortController();

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          // Abort during data streaming
          abortController.abort();
          callback(Buffer.from('partial-audio'));
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      const result = await service.generate(
        'Hello',
        'response-123',
        'client-123',
        abortController.signal
      );

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain('aborted');
    });
  });

  describe('Event Publishing', () => {
    it('should publish TTS_STARTED event', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.TTS_STARTED], {
        id: 'test-listener',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('audio'));
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await service.generate('Hello', 'response-123', 'client-123');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(EventType.TTS_STARTED);
      expect(events[0].payload.responseId).toBe('response-123');
      expect(events[0].payload.clientId).toBe('client-123');
    });

    it('should publish TTS_CHUNK events for audio data', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.TTS_CHUNK], {
        id: 'test-listener',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      const audioChunk = Buffer.from('audio-chunk-data');

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(audioChunk);
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await service.generate('Hello', 'response-123', 'client-123');

      await new Promise(resolve => setTimeout(resolve, 50));

      const chunkEvents = events.filter(e => e.type === EventType.TTS_CHUNK);
      expect(chunkEvents.length).toBeGreaterThan(0);
      expect(chunkEvents[0].payload.chunk).toBeDefined();
    });

    it('should publish TTS_COMPLETED event on success', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.TTS_COMPLETED], {
        id: 'test-listener',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('audio'));
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await service.generate('Hello', 'response-123', 'client-123');

      await new Promise(resolve => setTimeout(resolve, 50));

      const completedEvents = events.filter(e => e.type === EventType.TTS_COMPLETED);
      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].payload.responseId).toBe('response-123');
    });

    it('should publish TTS_INTERRUPTED event on abort', async () => {
      const events: any[] = [];
      eventBus.subscribe([EventType.TTS_INTERRUPTED], {
        id: 'test-listener',
        handle: async (event) => { events.push(event); },
        canHandle: () => true,
        priority: 1
      });

      const abortController = new AbortController();
      abortController.abort();

      await service.generate('Hello', 'response-123', 'client-123', abortController.signal);

      await new Promise(resolve => setTimeout(resolve, 50));

      const interruptedEvents = events.filter(e => e.type === EventType.TTS_INTERRUPTED);
      expect(interruptedEvents.length).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track successful generations', async () => {
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('audio'));
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await service.generate('Hello', 'response-123');

      const stats = service.getStatistics();
      expect(stats.totalGenerations).toBe(1);
      expect(stats.successfulGenerations).toBe(1);
    });

    it('should track failed generations', async () => {
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(1); // Error exit code
        }
      });

      await service.generate('Hello', 'response-123');

      const stats = service.getStatistics();
      expect(stats.totalGenerations).toBe(1);
      expect(stats.failedGenerations).toBe(1);
    });

    it('should track interrupted generations', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await service.generate('Hello', 'response-123', 'client-123', abortController.signal);

      const stats = service.getStatistics();
      expect(stats.totalGenerations).toBe(1);
      expect(stats.interruptedGenerations).toBe(1);
    });

    it('should track total audio bytes', async () => {
      const audioData = Buffer.from('a'.repeat(1000));

      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(audioData);
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await service.generate('Hello', 'response-123');

      const stats = service.getStatistics();
      expect(stats.totalAudioBytes).toBe(1000);
    });

    it('should reset statistics', async () => {
      mockProcess.stdout.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'data') {
          callback(Buffer.from('audio'));
        }
      });

      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          callback(0);
        }
      });

      await service.generate('Hello', 'response-123');

      service.resetStatistics();

      const stats = service.getStatistics();
      expect(stats.totalGenerations).toBe(0);
      expect(stats.successfulGenerations).toBe(0);
    });
  });
});
