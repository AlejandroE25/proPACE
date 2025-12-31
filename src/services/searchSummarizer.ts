/**
 * Search Summarizer
 *
 * Uses Claude 3.5 Haiku to summarize Google search results with Pace's butler personality.
 * Fast summarization (~200-400ms) that adds character to factual search results.
 *
 * Key Features:
 * - Haiku model for speed (<500ms typically)
 * - Butler personality injection (curt, dry wit, helpful)
 * - Concise summaries focused on answering the query
 * - Citation of sources when relevant
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { SearchResponse } from './googleSearchService.js';

/**
 * Search Summarizer using Claude Haiku
 */
export class SearchSummarizer {
  private client: Anthropic;
  private readonly model = 'claude-3-5-haiku-20241022';
  private readonly maxTokens = 300; // Keep responses concise
  private readonly temperature = 0.7; // Personality without randomness

  // Butler personality system prompt
  private readonly BUTLER_PROMPT = `You are Pace, a sophisticated British butler AI assistant. You are knowledgeable and genuinely helpful, but with a dry wit and curt delivery.

When summarizing search results:
- Be concise and direct - get to the point
- Use dry British humor occasionally, but don't overdo it
- Answer the question clearly and factually
- You may cite sources if particularly relevant, but don't list them all
- Avoid excessive politeness or chattiness
- Professional but with personality

Think Jarvis - refined, slightly condescending in a charming way, always helpful despite the terseness.`;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || config.anthropicApiKey
    });
  }

  /**
   * Summarize search results with butler personality
   */
  async summarizeWithPersonality(
    query: string,
    searchResponse: SearchResponse
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // Handle empty results
      if (searchResponse.results.length === 0) {
        return this.generateNoResultsResponse(query);
      }

      // Format search results as context
      const searchContext = this.formatSearchContext(searchResponse);

      // Build user prompt
      const userPrompt = `User question: "${query}"

Search results:
${searchContext}

Summarize the answer to the user's question based on these search results. Be helpful but curt.`;

      logger.info('Summarizing search results with Haiku', {
        query,
        resultCount: searchResponse.results.length
      });

      // Call Haiku for fast summarization
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: this.BUTLER_PROMPT,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const summary = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      const elapsed = Date.now() - startTime;

      logger.info('Search summarization completed', {
        query,
        elapsed,
        model: this.model
      });

      return summary;

    } catch (error: any) {
      logger.error('Search summarization failed', {
        query,
        error: error.message
      });

      // Fallback to basic summary without personality
      return this.generateFallbackSummary(query, searchResponse);
    }
  }

  /**
   * Format search results as context for Haiku
   */
  private formatSearchContext(searchResponse: SearchResponse): string {
    return searchResponse.results
      .map((result, index) => {
        return `[${index + 1}] ${result.title}
${result.snippet}
(Source: ${result.displayLink || result.link})`;
      })
      .join('\n\n');
  }

  /**
   * Generate butler-style response for no results
   */
  private generateNoResultsResponse(query: string): string {
    const responses = [
      `I'm afraid I couldn't find anything useful about "${query}". Perhaps try rephrasing?`,
      `My search turned up nothing of substance regarding "${query}". How unfortunate.`,
      `No relevant results for "${query}", I'm afraid. You may need to be more specific, sir.`,
      `The search came up empty for "${query}". Not terribly helpful, I know.`
    ];

    // Rotate through responses based on query length (simple determinism)
    const index = query.length % responses.length;
    return responses[index];
  }

  /**
   * Generate fallback summary without AI (if Haiku call fails)
   */
  private generateFallbackSummary(query: string, searchResponse: SearchResponse): string {
    if (searchResponse.results.length === 0) {
      return this.generateNoResultsResponse(query);
    }

    // Just return the top result's snippet with minimal formatting
    const topResult = searchResponse.results[0];
    return `Based on ${topResult.displayLink || topResult.link}: ${topResult.snippet}`;
  }
}
