/**
 * Search Plugin
 *
 * Adapter for Google Search + Haiku summarization to work with the plugin system.
 * Provides fast external knowledge queries (~700-900ms) with butler personality.
 */

import {
  Plugin,
  PluginMetadata,
  PluginTool,
  PluginCapability,
  ExecutionContext,
  ToolResult
} from '../../types/plugin.js';
import { GoogleSearchService } from '../../services/googleSearchService.js';
import { SearchSummarizer } from '../../services/searchSummarizer.js';
import { logger } from '../../utils/logger.js';

export class SearchPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'core.search',
    name: 'Google Search Service',
    version: '1.0.0',
    author: 'proPACE',
    description: 'Provides external knowledge via Google Custom Search with AI-powered summarization',
    tags: ['search', 'core', 'knowledge', 'google']
  };

  private searchService?: GoogleSearchService;
  private summarizer?: SearchSummarizer;

  tools: PluginTool[] = [
    {
      name: 'google_search',
      description: 'Search Google for external knowledge and return an AI-summarized answer with butler personality. Use for "how do you", "what is", "explain", factual questions, recipes, tutorials, and current information not in PACE\'s sensors.',
      category: 'search',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'The search query',
          required: true
        }
      ],
      execute: async (params: Record<string, any>, _context: ExecutionContext): Promise<ToolResult> => {
        const startTime = Date.now();

        try {
          if (!this.searchService || !this.summarizer) {
            throw new Error('Search service not initialized');
          }

          const query = params.query as string;

          if (!query || query.trim().length === 0) {
            throw new Error('Query parameter is required');
          }

          logger.info('Executing Google search', { query });

          // Step 1: Search Google (~300-500ms)
          const searchResponse = await this.searchService.search(query);

          // Step 2: Summarize with Haiku + butler personality (~200-400ms)
          const summary = await this.summarizer.summarizeWithPersonality(query, searchResponse);

          const duration = Date.now() - startTime;

          logger.info('Search plugin execution completed', {
            query,
            resultCount: searchResponse.results.length,
            duration,
            cached: searchResponse.cached
          });

          return {
            success: true,
            data: {
              query,
              summary,
              resultCount: searchResponse.results.length,
              totalResults: searchResponse.totalResults,
              sources: searchResponse.results.slice(0, 3).map(r => ({
                title: r.title,
                url: r.link,
                snippet: r.snippet
              }))
            },
            metadata: {
              duration,
              cached: searchResponse.cached,
              source: 'Google Custom Search + Claude Haiku'
            }
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Search plugin execution error:', error);

          return {
            success: false,
            error: `Search failed: ${(error as Error).message}`,
            metadata: {
              duration,
              cached: false
            }
          };
        }
      }
    }
  ];

  /**
   * Initialize the search plugin
   */
  async initialize(config: Record<string, any>): Promise<void> {
    try {
      const apiKey = config.apiKey as string | undefined;
      const engineId = config.engineId as string | undefined;
      const anthropicKey = config.anthropicKey as string | undefined;

      this.searchService = new GoogleSearchService(apiKey, engineId);
      this.summarizer = new SearchSummarizer(anthropicKey);

      if (!this.searchService.isConfigured()) {
        logger.warn('Google Search API not configured - plugin will return errors');
      } else {
        logger.info('Search plugin initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize search plugin:', error);
      throw error;
    }
  }

  /**
   * Get the search service instance (for direct access if needed)
   */
  getSearchService(): GoogleSearchService | undefined {
    return this.searchService;
  }

  /**
   * Get the summarizer instance (for direct access if needed)
   */
  getSummarizer(): SearchSummarizer | undefined {
    return this.summarizer;
  }

  /**
   * Health check for the search service
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.searchService) {
        return false;
      }

      return this.searchService.isConfigured();
    } catch (error) {
      logger.warn('Search service health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    logger.info('Search plugin shutting down');

    if (this.searchService) {
      this.searchService.clearCache();
    }

    this.searchService = undefined;
    this.summarizer = undefined;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.searchService?.getCacheStats() || { size: 0, ttl: 0 };
  }
}
