import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GoogleSearchService } from '../../../src/services/googleSearchService.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('GoogleSearchService', () => {
  let service: GoogleSearchService;
  const mockApiKey = 'test-api-key';
  const mockEngineId = 'test-engine-id';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoogleSearchService(mockApiKey, mockEngineId);
  });

  describe('Constructor', () => {
    it('should initialize with provided credentials', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should warn when credentials are missing', () => {
      const emptyService = new GoogleSearchService('', '');
      expect(emptyService.isConfigured()).toBe(false);
    });
  });

  describe('search()', () => {
    const mockQuery = 'how do you make coffee';
    const mockSearchResponse = {
      items: [
        {
          title: 'How to Make Coffee',
          link: 'https://example.com/coffee',
          snippet: 'Step 1: Boil water. Step 2: Add coffee grounds.',
          displayLink: 'example.com'
        },
        {
          title: 'Coffee Brewing Guide',
          link: 'https://guide.com/brew',
          snippet: 'The perfect cup requires proper temperature and timing.',
          displayLink: 'guide.com'
        }
      ],
      searchInformation: {
        totalResults: '1000000'
      }
    };

    it('should return search results successfully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      });

      const result = await service.search(mockQuery);

      expect(result.query).toBe(mockQuery);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe('How to Make Coffee');
      expect(result.results[0].snippet).toBe('Step 1: Boil water. Step 2: Add coffee grounds.');
      expect(result.totalResults).toBe(1000000);
      expect(result.cached).toBe(false);
      expect(result.searchTime).toBeGreaterThanOrEqual(0);
    });

    it('should cache search results', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      });

      // First call - should hit API
      const result1 = await service.search(mockQuery);
      expect(result1.cached).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call - should hit cache
      const result2 = await service.search(mockQuery);
      expect(result2.cached).toBe(true);
      expect(result2.results).toHaveLength(2);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should handle empty search results', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], searchInformation: { totalResults: '0' } })
      });

      const result = await service.search('nonexistent query');

      expect(result.results).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      const result = await service.search(mockQuery);

      expect(result.results).toHaveLength(0);
      expect(result.totalResults).toBe(0);
      expect(result.cached).toBe(false);
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await service.search(mockQuery);

      expect(result.results).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('should throw error when not configured', async () => {
      const unconfiguredService = new GoogleSearchService('', '');

      await expect(unconfiguredService.search(mockQuery)).rejects.toThrow(
        'Google Search API not configured'
      );
    });

    it('should build correct API URL with parameters', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResponse
      });

      await service.search(mockQuery);

      const fetchCall = (global.fetch as any).mock.calls[0][0];
      expect(fetchCall).toContain('https://www.googleapis.com/customsearch/v1');
      expect(fetchCall).toContain(`key=${mockApiKey}`);
      expect(fetchCall).toContain(`cx=${mockEngineId}`);
      expect(fetchCall).toContain('q=how'); // Query is present (+ or %20 both valid for spaces)
      expect(fetchCall).toContain('num=5');
    });
  });

  describe('formatResultsAsContext()', () => {
    it('should format search results as text context', () => {
      const searchResponse = {
        query: 'test query',
        results: [
          {
            title: 'Result 1',
            link: 'https://example.com/1',
            snippet: 'This is result 1',
            displayLink: 'example.com'
          },
          {
            title: 'Result 2',
            link: 'https://example.com/2',
            snippet: 'This is result 2',
            displayLink: 'example.com'
          }
        ],
        totalResults: 100,
        searchTime: 500,
        cached: false
      };

      const context = service.formatResultsAsContext(searchResponse);

      expect(context).toContain('[1] Result 1');
      expect(context).toContain('Source: example.com');
      expect(context).toContain('This is result 1');
      expect(context).toContain('[2] Result 2');
      expect(context).toContain('This is result 2');
    });

    it('should handle empty results', () => {
      const emptyResponse = {
        query: 'test',
        results: [],
        totalResults: 0,
        searchTime: 100,
        cached: false
      };

      const context = service.formatResultsAsContext(emptyResponse);
      expect(context).toBe('No search results found.');
    });
  });

  describe('getCacheStats()', () => {
    it('should return cache statistics', () => {
      const stats = service.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('ttl');
      expect(stats.ttl).toBe(3600000); // 1 hour
    });
  });

  describe('clearCache()', () => {
    it('should clear the cache', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], searchInformation: { totalResults: '0' } })
      });

      // Add item to cache
      await service.search('test query');
      expect(service.getCacheStats().size).toBeGreaterThan(0);

      // Clear cache
      service.clearCache();
      expect(service.getCacheStats().size).toBe(0);
    });
  });
});
