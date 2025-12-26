/**
 * TTS Service
 *
 * Wrapper for OpenAI Text-to-Speech API with chunked streaming,
 * interruption support, and event publishing.
 *
 * Features:
 * - Generates speech from text using OpenAI TTS API
 * - Streams audio in chunks via EventBus
 * - Supports interruption via AbortSignal
 * - Publishes TTS_STARTED, TTS_CHUNK, TTS_COMPLETED, TTS_INTERRUPTED events
 * - Tracks statistics (generations, bytes, errors)
 */

import OpenAI from 'openai';
import { EventBus } from '../../../events/eventBus';
import { EventType, EventPriority } from '../../../events/types';

/**
 * TTS configuration
 */
export interface TTSConfig {
  apiKey: string;
  voice?: string;            // OpenAI voice (alloy, echo, fable, onyx, nova, shimmer)
  model?: string;            // tts-1 or tts-1-hd
  eventBus: EventBus;
  openAIClient?: any;        // For testing - inject mock client
}

/**
 * Generation result
 */
export interface TTSResult {
  success: boolean;
  responseId: string;
  error?: string;
  audioBytes?: number;
}

/**
 * TTS statistics
 */
export interface TTSStatistics {
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  interruptedGenerations: number;
  totalAudioBytes: number;
}

/**
 * TTS Service
 */
export class TTSService {
  private openai: OpenAI;
  private voice: string;
  private model: string;
  private eventBus: EventBus;
  private stats: TTSStatistics;

  private readonly CHUNK_SIZE = 16384; // 16KB chunks
  private readonly MAX_INPUT_LENGTH = 4096; // OpenAI limit

  constructor(config: TTSConfig) {
    this.openai = config.openAIClient || new OpenAI({ apiKey: config.apiKey });
    this.voice = config.voice || 'onyx';
    this.model = config.model || 'tts-1';
    this.eventBus = config.eventBus;

    this.stats = {
      totalGenerations: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      interruptedGenerations: 0,
      totalAudioBytes: 0
    };
  }

  /**
   * Generate speech from text
   */
  async generate(
    text: string,
    responseId: string,
    clientId?: string,
    abortSignal?: AbortSignal
  ): Promise<TTSResult> {
    this.stats.totalGenerations++;

    // Validate input
    if (!text || text.trim().length === 0) {
      this.stats.failedGenerations++;
      return {
        success: false,
        responseId,
        error: 'Cannot generate TTS for empty text'
      };
    }

    // Check if already aborted
    if (abortSignal?.aborted) {
      this.stats.interruptedGenerations++;
      await this.publishInterruptedEvent(responseId, clientId);
      return {
        success: false,
        responseId,
        error: 'Generation aborted before starting'
      };
    }

    try {
      // Truncate text if too long
      const truncatedText = text.length > this.MAX_INPUT_LENGTH
        ? text.substring(0, this.MAX_INPUT_LENGTH)
        : text;

      // Publish TTS_STARTED event
      await this.publishStartedEvent(responseId, truncatedText, clientId);

      // Generate audio
      const response = await this.openai.audio.speech.create({
        model: this.model,
        voice: this.voice as any,
        input: truncatedText,
        response_format: 'mp3'
      });

      // Check if aborted during generation
      if (abortSignal?.aborted) {
        this.stats.interruptedGenerations++;
        await this.publishInterruptedEvent(responseId, clientId);
        return {
          success: false,
          responseId,
          error: 'Generation aborted during processing'
        };
      }

      // Stream audio in chunks
      const audioBuffer = response.body as any;
      const audioBytes = await this.streamAudioChunks(audioBuffer, responseId, clientId, abortSignal);

      // Check if aborted during streaming
      if (abortSignal?.aborted) {
        this.stats.interruptedGenerations++;
        await this.publishInterruptedEvent(responseId, clientId);
        return {
          success: false,
          responseId,
          error: 'Generation aborted during streaming'
        };
      }

      // Publish TTS_COMPLETED event
      await this.publishCompletedEvent(responseId, audioBytes, clientId);

      this.stats.successfulGenerations++;
      this.stats.totalAudioBytes += audioBytes;

      return {
        success: true,
        responseId,
        audioBytes
      };

    } catch (error: any) {
      // Check if it was an abort
      if (abortSignal?.aborted || error.name === 'AbortError') {
        this.stats.interruptedGenerations++;
        await this.publishInterruptedEvent(responseId, clientId);
        return {
          success: false,
          responseId,
          error: 'Generation aborted'
        };
      }

      // Handle rate limiting
      if (error.status === 429) {
        this.stats.failedGenerations++;
        return {
          success: false,
          responseId,
          error: 'Rate limit exceeded - please try again later'
        };
      }

      // General error
      this.stats.failedGenerations++;
      return {
        success: false,
        responseId,
        error: `OpenAI TTS error: ${error.message || 'Unknown error'}`
      };
    }
  }

  /**
   * Stream audio buffer in chunks
   */
  private async streamAudioChunks(
    audioBuffer: Buffer,
    responseId: string,
    clientId?: string,
    abortSignal?: AbortSignal
  ): Promise<number> {
    let totalBytes = 0;
    let offset = 0;

    while (offset < audioBuffer.length) {
      // Check for abort
      if (abortSignal?.aborted) {
        break;
      }

      // Extract chunk
      const chunkEnd = Math.min(offset + this.CHUNK_SIZE, audioBuffer.length);
      const chunk = audioBuffer.subarray(offset, chunkEnd);

      // Publish chunk event
      await this.publishChunkEvent(responseId, chunk, offset, audioBuffer.length, clientId);

      totalBytes += chunk.length;
      offset = chunkEnd;

      // Small delay to prevent overwhelming the event bus
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return totalBytes;
  }

  /**
   * Publish TTS_STARTED event
   */
  private async publishStartedEvent(responseId: string, text: string, clientId?: string): Promise<void> {
    await this.eventBus.publish({
      type: EventType.TTS_STARTED,
      priority: EventPriority.HIGH,
      source: 'tts-service',
      payload: {
        responseId,
        clientId,
        text: text.substring(0, 100), // First 100 chars for logging
        timestamp: new Date()
      }
    });
  }

  /**
   * Publish TTS_CHUNK event
   */
  private async publishChunkEvent(
    responseId: string,
    chunk: Buffer,
    offset: number,
    totalSize: number,
    clientId?: string
  ): Promise<void> {
    await this.eventBus.publish({
      type: EventType.TTS_CHUNK,
      priority: EventPriority.HIGH,
      source: 'tts-service',
      payload: {
        responseId,
        clientId,
        chunk,
        offset,
        totalSize,
        timestamp: new Date()
      }
    });
  }

  /**
   * Publish TTS_COMPLETED event
   */
  private async publishCompletedEvent(responseId: string, totalBytes: number, clientId?: string): Promise<void> {
    await this.eventBus.publish({
      type: EventType.TTS_COMPLETED,
      priority: EventPriority.HIGH,
      source: 'tts-service',
      payload: {
        responseId,
        clientId,
        totalBytes,
        timestamp: new Date()
      }
    });
  }

  /**
   * Publish TTS_INTERRUPTED event
   */
  private async publishInterruptedEvent(responseId: string, clientId?: string): Promise<void> {
    await this.eventBus.publish({
      type: EventType.TTS_INTERRUPTED,
      priority: EventPriority.URGENT,
      source: 'tts-service',
      payload: {
        responseId,
        clientId,
        timestamp: new Date()
      }
    });
  }

  /**
   * Set voice
   */
  setVoice(voice: string): void {
    this.voice = voice;
  }

  /**
   * Get statistics
   */
  getStatistics(): TTSStatistics {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      totalGenerations: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      interruptedGenerations: 0,
      totalAudioBytes: 0
    };
  }
}
