/**
 * STT Service (Speech-to-Text)
 *
 * Wrapper for OpenAI Whisper API for speech-to-text transcription.
 * Server-side implementation prioritizing accuracy over lowest latency.
 *
 * Features:
 * - Transcribes audio using OpenAI Whisper API
 * - Publishes USER_SPEECH events to EventBus
 * - Supports multiple languages
 * - Tracks statistics (transcriptions, bytes, latency)
 * - Target latency: <600ms total (upload + processing)
 */

import OpenAI from 'openai';
import { EventBus } from '../../../events/eventBus';
import { EventType, EventPriority } from '../../../events/types';

/**
 * STT configuration
 */
export interface STTConfig {
  apiKey: string;
  language?: string;         // Language code (en, es, fr, etc.)
  eventBus: EventBus;
  openAIClient?: any;        // For testing - inject mock client
}

/**
 * Transcription result
 */
export interface STTResult {
  success: boolean;
  clientId: string;
  text?: string;
  confidence?: number;
  error?: string;
  processingTime?: number;
}

/**
 * STT statistics
 */
export interface STTStatistics {
  totalTranscriptions: number;
  successfulTranscriptions: number;
  failedTranscriptions: number;
  totalAudioBytes: number;
  averageTranscriptionTime: number;
}

/**
 * STT Service
 */
export class STTService {
  private openai: OpenAI;
  private language: string;
  private eventBus: EventBus;
  private stats: STTStatistics;
  private transcriptionTimes: number[];

  private readonly MIN_AUDIO_SIZE = 1000; // 1KB minimum

  constructor(config: STTConfig) {
    this.openai = config.openAIClient || new OpenAI({ apiKey: config.apiKey });
    this.language = config.language || 'en';
    this.eventBus = config.eventBus;

    this.stats = {
      totalTranscriptions: 0,
      successfulTranscriptions: 0,
      failedTranscriptions: 0,
      totalAudioBytes: 0,
      averageTranscriptionTime: 0
    };

    this.transcriptionTimes = [];
  }

  /**
   * Transcribe audio to text
   */
  async transcribe(audioBuffer: Buffer, clientId: string): Promise<STTResult> {
    const startTime = Date.now();
    this.stats.totalTranscriptions++;

    // Validate input
    if (!audioBuffer || audioBuffer.length === 0) {
      this.stats.failedTranscriptions++;
      return {
        success: false,
        clientId,
        error: 'Cannot transcribe empty audio buffer'
      };
    }

    if (audioBuffer.length < this.MIN_AUDIO_SIZE) {
      this.stats.failedTranscriptions++;
      return {
        success: false,
        clientId,
        error: 'Audio buffer too small - likely contains no speech'
      };
    }

    try {
      // Create a file-like object from the buffer
      // In production, FormData will handle this properly
      // For testing, the mock client will receive this directly
      const audioFile: any = audioBuffer;
      audioFile.name = 'audio.webm';
      audioFile.type = 'audio/webm';

      // Call Whisper API
      const response = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: this.language,
        response_format: 'json'
      });

      const processingTime = Date.now() - startTime;
      this.transcriptionTimes.push(processingTime);
      this.updateAverageTime();

      // Track statistics
      this.stats.successfulTranscriptions++;
      this.stats.totalAudioBytes += audioBuffer.length;

      // Publish USER_SPEECH event
      await this.publishUserSpeechEvent(clientId, response.text, audioBuffer.length);

      return {
        success: true,
        clientId,
        text: response.text,
        confidence: (response as any).confidence,
        processingTime
      };

    } catch (error: any) {
      this.stats.failedTranscriptions++;

      // Handle rate limiting
      if (error.status === 429) {
        return {
          success: false,
          clientId,
          error: 'Rate limit exceeded - please try again later'
        };
      }

      // General error
      return {
        success: false,
        clientId,
        error: `Whisper API error: ${error.message || 'Unknown error'}`
      };
    }
  }

  /**
   * Publish USER_SPEECH event
   */
  private async publishUserSpeechEvent(
    clientId: string,
    text: string,
    audioSize: number
  ): Promise<void> {
    await this.eventBus.publish({
      type: EventType.USER_SPEECH,
      priority: EventPriority.HIGH,
      source: 'stt-service',
      payload: {
        clientId,
        text,
        audioSize,
        timestamp: new Date()
      }
    });
  }

  /**
   * Set language for transcription
   */
  setLanguage(language: string): void {
    this.language = language;
  }

  /**
   * Update average transcription time
   */
  private updateAverageTime(): void {
    if (this.transcriptionTimes.length === 0) {
      this.stats.averageTranscriptionTime = 0;
      return;
    }

    // Keep only last 100 times to avoid unbounded growth
    if (this.transcriptionTimes.length > 100) {
      this.transcriptionTimes = this.transcriptionTimes.slice(-100);
    }

    const sum = this.transcriptionTimes.reduce((acc, time) => acc + time, 0);
    this.stats.averageTranscriptionTime = sum / this.transcriptionTimes.length;
  }

  /**
   * Get statistics
   */
  getStatistics(): STTStatistics {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      totalTranscriptions: 0,
      successfulTranscriptions: 0,
      failedTranscriptions: 0,
      totalAudioBytes: 0,
      averageTranscriptionTime: 0
    };
    this.transcriptionTimes = [];
  }
}
