/**
 * Piper TTS Service
 *
 * Local TTS wrapper for Piper (https://github.com/rhasspy/piper)
 * Fast, high-quality neural text-to-speech that runs locally.
 *
 * Features:
 * - Low latency (~200-500ms on CPU)
 * - No API costs or rate limits
 * - Works offline
 * - Same interface as OpenAI TTS for drop-in replacement
 * - Streams audio in chunks via EventBus
 * - Supports interruption via AbortSignal
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventBus } from '../../../events/eventBus.js';
import { EventType, EventPriority } from '../../../events/types.js';
import { logger } from '../../../utils/logger.js';

/**
 * Piper TTS configuration
 */
export interface PiperTTSConfig {
  eventBus: EventBus;
  piperPath?: string;       // Path to piper executable (default: /usr/local/bin/piper)
  modelPath?: string;       // Path to voice model .onnx file
  spawnFn?: any;            // For testing - inject mock spawn function
}

/**
 * Generation result (same interface as OpenAI TTS)
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
 * Piper TTS Service
 */
export class PiperTTSService {
  private eventBus: EventBus;
  private piperPath: string;
  private modelPath: string;
  private stats: TTSStatistics;
  private spawnFn: any;

  private readonly CHUNK_SIZE = 16384; // 16KB chunks (same as OpenAI)
  private readonly MAX_INPUT_LENGTH = 4096;

  constructor(config: PiperTTSConfig) {
    this.eventBus = config.eventBus;
    // Default paths based on platform
    const defaultPiperPath = process.platform === 'win32'
      ? 'C:\\Program Files\\Piper\\piper.exe'
      : '/usr/local/bin/piper';
    const defaultModelPath = process.platform === 'win32'
      ? 'C:\\Program Files\\Piper\\voices\\en_US-lessac-medium.onnx'
      : '/usr/local/share/piper/voices/en_US-lessac-medium.onnx';

    this.piperPath = config.piperPath || defaultPiperPath;
    this.modelPath = config.modelPath || defaultModelPath;
    this.spawnFn = config.spawnFn || spawn;

    this.stats = {
      totalGenerations: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      interruptedGenerations: 0,
      totalAudioBytes: 0
    };

    logger.info('[PiperTTS] Initialized', {
      piperPath: this.piperPath,
      modelPath: this.modelPath
    });
  }

  /**
   * Generate speech from text using Piper
   */
  async generate(
    text: string,
    responseId: string,
    clientId?: string,
    abortSignal?: AbortSignal
  ): Promise<TTSResult> {
    this.stats.totalGenerations++;
    logger.info(`[PiperTTS] Starting generation for ${clientId || 'unknown'}: "${text.substring(0, 50)}..."`);

    // Validate input
    if (!text || text.trim().length === 0) {
      this.stats.failedGenerations++;
      logger.warn(`[PiperTTS] Generation failed: empty text for ${clientId}`);
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

      // Generate audio using Piper
      logger.info(`[PiperTTS] Spawning Piper process: ${this.piperPath}`);
      const audioBytes = await this.runPiper(truncatedText, responseId, clientId, abortSignal);

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

      // Publish TTS_COMPLETED event
      await this.publishCompletedEvent(responseId, audioBytes, clientId);

      this.stats.successfulGenerations++;
      this.stats.totalAudioBytes += audioBytes;

      logger.info(`[PiperTTS] Generation successful for ${clientId}: ${audioBytes} bytes`);
      return {
        success: true,
        responseId,
        audioBytes
      };

    } catch (error: any) {
      logger.error(`[PiperTTS] Generation error for ${clientId}:`, error);

      // Check if it was an abort
      if (abortSignal?.aborted || error.message?.includes('aborted')) {
        this.stats.interruptedGenerations++;
        await this.publishInterruptedEvent(responseId, clientId);
        return {
          success: false,
          responseId,
          error: 'Generation aborted'
        };
      }

      // General error
      this.stats.failedGenerations++;
      logger.error(`[PiperTTS] Error: ${error.message || 'Unknown error'}`);
      return {
        success: false,
        responseId,
        error: `Piper TTS error: ${error.message || 'Unknown error'}`
      };
    }
  }

  /**
   * Run Piper process and stream audio chunks
   */
  private async runPiper(
    text: string,
    responseId: string,
    clientId?: string,
    abortSignal?: AbortSignal
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      let totalBytes = 0;
      let audioBuffer = Buffer.alloc(0);
      let stderrOutput = '';
      let processAborted = false;

      // Spawn Piper process
      // Output raw PCM audio (--output-raw) for faster processing
      const piperProcess: ChildProcess = this.spawnFn(
        this.piperPath,
        [
          '--model', this.modelPath,
          '--output-raw'  // Raw PCM output (faster than WAV)
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe']
        }
      );

      // Handle abort signal
      const abortHandler = () => {
        if (!processAborted) {
          processAborted = true;
          logger.info(`[PiperTTS] Killing Piper process due to abort signal`);
          piperProcess.kill('SIGTERM');
          reject(new Error('Generation aborted during processing'));
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', abortHandler);
      }

      // Collect audio data from stdout
      piperProcess.stdout?.on('data', async (chunk: Buffer) => {
        if (processAborted || abortSignal?.aborted) {
          return;
        }

        audioBuffer = Buffer.concat([audioBuffer, chunk]);
        totalBytes += chunk.length;

        // Stream in chunks
        while (audioBuffer.length >= this.CHUNK_SIZE) {
          const chunkToSend = audioBuffer.subarray(0, this.CHUNK_SIZE);
          audioBuffer = audioBuffer.subarray(this.CHUNK_SIZE);

          await this.publishChunkEvent(
            responseId,
            chunkToSend,
            totalBytes - audioBuffer.length,
            totalBytes,
            clientId
          );

          // Small delay to prevent overwhelming the event bus
          await new Promise(r => setTimeout(r, 10));
        }
      });

      // Collect stderr for error messages
      piperProcess.stderr?.on('data', (data: Buffer) => {
        stderrOutput += data.toString();
      });

      // Handle process errors
      piperProcess.on('error', (error) => {
        if (abortSignal) {
          abortSignal.removeEventListener('abort', abortHandler);
        }
        logger.error('[PiperTTS] Process error:', error);
        reject(error);
      });

      // Handle process completion
      piperProcess.on('close', async (code) => {
        if (abortSignal) {
          abortSignal.removeEventListener('abort', abortHandler);
        }

        if (processAborted) {
          return; // Already handled by abort
        }

        if (code !== 0) {
          logger.error(`[PiperTTS] Process exited with code ${code}`, { stderr: stderrOutput });
          reject(new Error(`Piper process exited with code ${code}: ${stderrOutput}`));
          return;
        }

        // Send remaining audio data
        if (audioBuffer.length > 0) {
          await this.publishChunkEvent(
            responseId,
            audioBuffer,
            totalBytes - audioBuffer.length,
            totalBytes,
            clientId
          );
        }

        resolve(totalBytes);
      });

      // Write text to stdin and close
      piperProcess.stdin?.write(text);
      piperProcess.stdin?.end();
    });
  }

  /**
   * Publish TTS_STARTED event
   */
  private async publishStartedEvent(responseId: string, text: string, clientId?: string): Promise<void> {
    await this.eventBus.publish({
      type: EventType.TTS_STARTED,
      priority: EventPriority.HIGH,
      source: 'piper-tts-service',
      payload: {
        responseId,
        clientId,
        text: text.substring(0, 100),
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
      source: 'piper-tts-service',
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
    logger.info(`[PiperTTS] Publishing TTS_COMPLETED event for ${clientId}: ${totalBytes} bytes`);
    await this.eventBus.publish({
      type: EventType.TTS_COMPLETED,
      priority: EventPriority.HIGH,
      source: 'piper-tts-service',
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
      source: 'piper-tts-service',
      payload: {
        responseId,
        clientId,
        timestamp: new Date()
      }
    });
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
