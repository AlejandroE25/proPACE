/**
 * Google Search Service
 *
 * Integrates Google Custom Search JSON API for external knowledge queries.
 * Provides fast search results (~300-500ms) with caching to reduce API calls.
 *
 * Usage:
 * - "How do you make coffee?" → Search Google → Return top results
 * - "Tell me about Paris" → Search Google → Return context snippets
 * - "What is quantum computing?" → Search Google → Return authoritative sources
 */

import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Search result structure
 */
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink?: string;
}

/**
 * Structured search response
 */
export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  searchTime: number;
  cached: boolean;
}

/**
 * Google Search Service
 */
export class GoogleSearchService {
  private apiKey: string;
  private searchEngineId: string;
  private cache: Map<string, { data: SearchResponse; timestamp: number }>;
  private readonly MAX_RESULTS = 5;
  private readonly CACHE_TTL = 3600000; // 1 hour
  private readonly API_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

  constructor(apiKey?: string, searchEngineId?: string) {
    this.apiKey = apiKey || config.googleSearch.apiKey;
    this.searchEngineId = searchEngineId || config.googleSearch.engineId;
    this.cache = new Map();

    if (!this.apiKey || !this.searchEngineId) {
      logger.warn('Google Search API credentials not configured - search will be unavailable');
    }
  }

  /**
   * Check if service is configured and ready
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.searchEngineId);
  }

  /**
   * Search Google and return structured results
   */
  async search(query: string): Promise<SearchResponse> {
    const startTime = Date.now();

    // Check cache first
    const cached = this.cache.get(query);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info('Google search cache hit', { query });
      return {
        ...cached.data,
        cached: true,
        searchTime: Date.now() - startTime
      };
    }

    // Validate configuration
    if (!this.isConfigured()) {
      throw new Error('Google Search API not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID');
    }

    try {
      logger.info('Executing Google search', { query });

      // Build URL with query parameters
      const url = new URL(this.API_ENDPOINT);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('cx', this.searchEngineId);
      url.searchParams.set('q', query);
      url.searchParams.set('num', this.MAX_RESULTS.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Google Search API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;

      const items = data.items || [];
      const results: SearchResult[] = items.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        displayLink: item.displayLink
      }));

      const searchResponse: SearchResponse = {
        query,
        results,
        totalResults: parseInt(data.searchInformation?.totalResults || '0', 10),
        searchTime: Date.now() - startTime,
        cached: false
      };

      // Cache the response
      this.cache.set(query, { data: searchResponse, timestamp: Date.now() });

      logger.info('Google search completed', {
        query,
        resultCount: results.length,
        searchTime: searchResponse.searchTime
      });

      return searchResponse;

    } catch (error: any) {
      logger.error('Google search failed', {
        query,
        error: error.message
      });

      // Return empty results on error
      return {
        query,
        results: [],
        totalResults: 0,
        searchTime: Date.now() - startTime,
        cached: false
      };
    }
  }

  /**
   * Format search results as text context for AI summarization
   */
  formatResultsAsContext(searchResponse: SearchResponse): string {
    if (searchResponse.results.length === 0) {
      return 'No search results found.';
    }

    const contextParts = searchResponse.results.map((result, index) => {
      return `[${index + 1}] ${result.title}
Source: ${result.displayLink || result.link}
${result.snippet}`;
    });

    return contextParts.join('\n\n');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      ttl: this.CACHE_TTL
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Google search cache cleared');
  }
}
