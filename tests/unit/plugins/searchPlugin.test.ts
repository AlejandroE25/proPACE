import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchPlugin } from '../../../src/plugins/core/searchPlugin.js';

// Mock the services
vi.mock('../../../src/services/googleSearchService.js', () => ({
  GoogleSearchService: vi.fn().mockImplementation(() => ({
    isConfigured: vi.fn().mockReturnValue(true),
    search: vi.fn(),
    clearCache: vi.fn()
  }))
}));

vi.mock('../../../src/services/searchSummarizer.js', () => ({
  SearchSummarizer: vi.fn().mockImplementation(() => ({
    summarizeWithPersonality: vi.fn()
  }))
}));

describe('SearchPlugin', () => {
  let plugin: SearchPlugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = new SearchPlugin();
  });

  describe('Metadata', () => {
    it('should have correct plugin metadata', () => {
      expect(plugin.metadata.id).toBe('core.search');
      expect(plugin.metadata.name).toBe('Google Search Service');
      expect(plugin.metadata.version).toBe('1.0.0');
      expect(plugin.metadata.description).toContain('Google Custom Search');
      expect(plugin.metadata.tags).toContain('search');
      expect(plugin.metadata.tags).toContain('knowledge');
    });
  });

  describe('Tools', () => {
    it('should register google_search tool', () => {
      expect(plugin.tools).toHaveLength(1);
      expect(plugin.tools[0].name).toBe('google_search');
      expect(plugin.tools[0].category).toBe('search');
    });

    it('should have correct tool description', () => {
      const tool = plugin.tools[0];
      expect(tool.description).toContain('Google');
      expect(tool.description).toContain('butler personality');
      expect(tool.description).toContain('how do you');
    });

    it('should have required query parameter', () => {
      const tool = plugin.tools[0];
      const queryParam = tool.parameters.find(p => p.name === 'query');

      expect(queryParam).toBeDefined();
      expect(queryParam?.type).toBe('string');
      expect(queryParam?.required).toBe(true);
    });
  });

  describe('initialize()', () => {
    it('should initialize with provided config', async () => {
      const config = {
        apiKey: 'test-key',
        engineId: 'test-engine',
        anthropicKey: 'anthropic-key'
      };

      await plugin.initialize(config);

      expect(plugin.getSearchService()).toBeDefined();
      expect(plugin.getSummarizer()).toBeDefined();
    });

    it('should initialize with empty config', async () => {
      await plugin.initialize({});

      expect(plugin.getSearchService()).toBeDefined();
      expect(plugin.getSummarizer()).toBeDefined();
    });
  });

  describe('google_search tool execution', () => {
    beforeEach(async () => {
      await plugin.initialize({
        apiKey: 'test-key',
        engineId: 'test-engine',
        anthropicKey: 'anthropic-key'
      });
    });

    it('should execute search and return summarized results', async () => {
      const mockSearchResults = {
        query: 'test query',
        results: [
          {
            title: 'Result 1',
            link: 'https://example.com/1',
            snippet: 'First result',
            displayLink: 'example.com'
          }
        ],
        totalResults: 100,
        searchTime: 500,
        cached: false
      };

      const mockSummary = 'Here is the answer, sir.';

      const searchService = plugin.getSearchService();
      const summarizer = plugin.getSummarizer();

      (searchService as any).search = vi.fn().mockResolvedValue(mockSearchResults);
      (summarizer as any).summarizeWithPersonality = vi.fn().mockResolvedValue(mockSummary);

      const tool = plugin.tools[0];
      const result = await tool.execute(
        { query: 'test query' },
        { clientId: 'test', conversationHistory: [], previousStepResults: new Map() }
      );

      expect(result.success).toBe(true);
      expect(result.data?.summary).toBe(mockSummary);
      expect(result.data?.resultCount).toBe(1);
      expect(result.metadata?.source).toContain('Google Custom Search');
    });

    it('should return error when query is missing', async () => {
      const tool = plugin.tools[0];
      const result = await tool.execute(
        {},
        { clientId: 'test', conversationHistory: [], previousStepResults: new Map() }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Query parameter is required');
    });

    it('should return error when query is empty', async () => {
      const tool = plugin.tools[0];
      const result = await tool.execute(
        { query: '' },
        { clientId: 'test', conversationHistory: [], previousStepResults: new Map() }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Query parameter is required');
    });

    it('should handle search service errors', async () => {
      const searchService = plugin.getSearchService();
      (searchService as any).search = vi.fn().mockRejectedValue(new Error('API Error'));

      const tool = plugin.tools[0];
      const result = await tool.execute(
        { query: 'test' },
        { clientId: 'test', conversationHistory: [], previousStepResults: new Map() }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Search failed');
    });

    it('should include top 3 sources in result', async () => {
      const mockSearchResults = {
        query: 'test',
        results: [
          { title: 'R1', link: 'https://1.com', snippet: 'S1', displayLink: '1.com' },
          { title: 'R2', link: 'https://2.com', snippet: 'S2', displayLink: '2.com' },
          { title: 'R3', link: 'https://3.com', snippet: 'S3', displayLink: '3.com' },
          { title: 'R4', link: 'https://4.com', snippet: 'S4', displayLink: '4.com' }
        ],
        totalResults: 100,
        searchTime: 500,
        cached: false
      };

      const searchService = plugin.getSearchService();
      const summarizer = plugin.getSummarizer();

      (searchService as any).search = vi.fn().mockResolvedValue(mockSearchResults);
      (summarizer as any).summarizeWithPersonality = vi.fn().mockResolvedValue('Summary');

      const tool = plugin.tools[0];
      const result = await tool.execute(
        { query: 'test' },
        { clientId: 'test', conversationHistory: [], previousStepResults: new Map() }
      );

      expect(result.success).toBe(true);
      expect(result.data?.sources).toHaveLength(3); // Only top 3
      expect(result.data?.sources[0].title).toBe('R1');
    });

    it('should mark cached results in metadata', async () => {
      const mockSearchResults = {
        query: 'test',
        results: [],
        totalResults: 0,
        searchTime: 10,
        cached: true
      };

      const searchService = plugin.getSearchService();
      const summarizer = plugin.getSummarizer();

      (searchService as any).search = vi.fn().mockResolvedValue(mockSearchResults);
      (summarizer as any).summarizeWithPersonality = vi.fn().mockResolvedValue('No results');

      const tool = plugin.tools[0];
      const result = await tool.execute(
        { query: 'test' },
        { clientId: 'test', conversationHistory: [], previousStepResults: new Map() }
      );

      expect(result.metadata?.cached).toBe(true);
    });
  });

  describe('healthCheck()', () => {
    it('should return true when service is configured', async () => {
      await plugin.initialize({
        apiKey: 'test-key',
        engineId: 'test-engine'
      });

      const healthy = await plugin.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return false when service is not configured', async () => {
      const searchService = plugin.getSearchService();
      if (searchService) {
        (searchService as any).isConfigured = vi.fn().mockReturnValue(false);
      }

      const healthy = await plugin.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('shutdown()', () => {
    it('should clear cache on shutdown', async () => {
      await plugin.initialize({});

      const searchService = plugin.getSearchService();
      const clearCacheSpy = vi.spyOn(searchService as any, 'clearCache');

      await plugin.shutdown();

      expect(clearCacheSpy).toHaveBeenCalled();
    });
  });

  describe('getCacheStats()', () => {
    it('should return cache statistics', () => {
      const stats = plugin.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('ttl');
    });
  });
});
