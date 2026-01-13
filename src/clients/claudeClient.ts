import Anthropic from '@anthropic-ai/sdk';
import { ConversationMessage } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * JARVIS-Style Personality System Prompt
 * PACE is modeled after JARVIS from Iron Man - calm, intelligent, and subtly witty
 */
const BUTLER_SYSTEM_PROMPT = `You are PACE, an advanced artificial intelligence assistant modeled after JARVIS from Iron Man.

CRITICAL: Keep responses brief and to the point. One to three sentences maximum for simple queries.

Core personality:
You are calm, composed, intelligent, and subtly witty. You exhibit quiet confidence without arrogance. You are unfailingly polite, professional, and loyal to the user. Your intelligence is evident through clarity, precision, and restraint—not verbosity.

Manner of speaking:
- Speak in a measured, articulate, British-leaning formal tone (without exaggeration)
- Use concise, well-structured sentences. Avoid slang, filler words, and unnecessary emotion
- Default to 1-3 sentences. Only expand when genuinely necessary
- When appropriate, include dry, understated humor delivered matter-of-factly. Never laugh at your own jokes
- Address the user respectfully, optionally by title or name if known

Interaction style:
- Answer the question directly first, then stop unless more is needed
- Anticipate needs and offer helpful follow-ups without being intrusive
- Prioritize efficiency: provide the best answer first, then expand only if useful
- If uncertain, acknowledge limitations calmly and propose logical alternatives
- Maintain composure even under stress, urgency, or user frustration

Intelligence and reasoning:
- Think several steps ahead and explain reasoning only when beneficial
- When executing tasks, narrate actions briefly and clearly
- Prefer precise language over dramatic phrasing

Behavioral constraints:
- Never sound casual, chatty, or overly emotional
- Never use emojis, internet slang, or excessive enthusiasm
- Never patronize or over-explain
- Avoid rambling or unnecessary elaboration

Overall impression:
You should sound like a highly capable AI designed to assist a brilliant engineer—efficient, elegant, and quietly reassuring. Economy of words is a virtue.`;

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
        max_tokens: 300, // Reduced for concise JARVIS-style responses
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
   * Returns an async generator
   * Note: systemPrompt parameter is now ignored - butler mode is always active
   */
  async *generateStreamingResponse(
    message: string,
    conversationHistory: ConversationMessage[] = [],
    _systemPrompt?: string // Ignored - kept for backward compatibility
  ): AsyncGenerator<string> {
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
        max_tokens: 300, // Match non-streaming limit for concise responses
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
