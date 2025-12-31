import Anthropic from '@anthropic-ai/sdk';
import { ConversationMessage } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Permanent butler personality system prompt
 * Pace is always a sophisticated British butler - curt, helpful, with dry wit
 */
const BUTLER_SYSTEM_PROMPT = `You are Pace, a sophisticated British butler AI assistant. You are knowledgeable and genuinely helpful, but with a dry wit and curt delivery. Channel the personality of Jarvis - refined, slightly condescending in a charming way, and always ready with a terse remark.

Key traits:
- Be concise and direct - you're busy
- Use dry British humor when appropriate
- Never be overly chatty or effusive
- Professional but with personality
- "Sir" or "Madam" occasionally, but not excessively

Avoid:
- Long-winded explanations
- Excessive enthusiasm
- Over-politeness
- Apologizing unnecessarily`;

/**
 * Claude AI Client
 * Handles communication with Anthropic Claude API
 */
export class ClaudeClient {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-5';
  private readonly temperature: number = 0.7; // Personality without excessive randomness

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || config.anthropicApiKey,
    });

    if (!apiKey && !config.anthropicApiKey) {
      logger.warn('Anthropic API key not configured. Claude AI will not work.');
    }
  }

  /**
   * Generate a response from Claude with permanent butler personality
   * Note: systemPrompt parameter is now ignored - butler mode is always active
   */
  async generateResponse(
    message: string,
    conversationHistory: ConversationMessage[] = [],
    _systemPrompt?: string // Ignored - kept for backward compatibility
  ): Promise<string> {
    try {
      // Build messages array
      const messages: Anthropic.MessageParam[] = [
        ...conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: message,
        },
      ];

      // Create the request with permanent butler personality
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        temperature: this.temperature,
        system: BUTLER_SYSTEM_PROMPT, // Always use butler personality
        messages,
      });

      // Extract text from response
      const textContent = response.content.find((block) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in response');
      }

      logger.debug(`Claude response generated (${response.usage.input_tokens} in, ${response.usage.output_tokens} out)`);

      return textContent.text;
    } catch (error: any) {
      logger.error('Error calling Claude API:', error);

      if (error.status === 401) {
        return 'Error: Invalid API key. Please check your Anthropic API key configuration.';
      } else if (error.status === 429) {
        return 'Error: Rate limit exceeded. Please try again in a moment.';
      } else if (error.status === 529) {
        return 'Error: Claude is currently overloaded. Please try again shortly.';
      }

      return `Error: Failed to generate response. ${error.message || 'Unknown error'}`;
    }
  }

  /**
   * Generate a streaming response from Claude with permanent butler personality
   * Returns an async iterator
   * Note: systemPrompt parameter is now ignored - butler mode is always active
   */
  async *generateStreamingResponse(
    message: string,
    conversationHistory: ConversationMessage[] = [],
    _systemPrompt?: string // Ignored - kept for backward compatibility
  ): AsyncIterator<string> {
    try {
      const messages: Anthropic.MessageParam[] = [
        ...conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: message,
        },
      ];

      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        temperature: this.temperature,
        system: BUTLER_SYSTEM_PROMPT, // Always use butler personality
        messages,
        stream: true,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (error: any) {
      logger.error('Error in Claude streaming API:', error);
      yield `Error: ${error.message || 'Failed to generate streaming response'}`;
    }
  }

  /**
   * Check if the API key is configured
   */
  isConfigured(): boolean {
    return !!config.anthropicApiKey;
  }
}
