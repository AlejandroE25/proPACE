import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchSummarizer } from '../../../src/services/searchSummarizer.js';
import type { SearchResponse } from '../../../src/services/googleSearchService.js';

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn()
      }
    }))
  };
});

describe('SearchSummarizer', () => {
  let summarizer: SearchSummarizer;
  let mockAnthropicClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    summarizer = new SearchSummarizer('test-api-key');
    mockAnthropicClient = (summarizer as any).client;
  });

  describe('Constructor', () => {
    it('should initialize with API key', () => {
      expect(summarizer).toBeDefined();
    });
  });

  describe('summarizeWithPersonality()', () => {
    const mockQuery = 'How do you make coffee?';
    const mockSearchResponse: SearchResponse = {
      query: mockQuery,
      results: [
        {
          title: 'Coffee Brewing Guide',
          link: 'https://example.com/coffee',
          snippet: 'Boil water to 200°F, add 2 tablespoons of ground coffee per 6oz water, steep for 4 minutes.',
          displayLink: 'example.com'
        },
        {
          title: 'Perfect Coffee Method',
          link: 'https://coffee.com/method',
          snippet: 'Use freshly ground beans, proper water temperature, and precise timing for best results.',
          displayLink: 'coffee.com'
        }
      ],
      totalResults: 1000,
      searchTime: 500,
      cached: false
    };

    it('should summarize search results with butler personality', async () => {
      const mockSummary = 'Boil water to 200°F, add coffee grounds, steep for 4 minutes. Hardly rocket science, sir.';

      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: mockSummary
          }
        ]
      });

      const result = await summarizer.summarizeWithPersonality(mockQuery, mockSearchResponse);

      expect(result).toBe(mockSummary);
      expect(mockAnthropicClient.messages.create).toHaveBeenCalledTimes(1);

      // Verify correct model and parameters
      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-3-5-haiku-20241022');
      expect(callArgs.temperature).toBe(0.7);
      expect(callArgs.max_tokens).toBe(300);
      expect(callArgs.system).toContain('Pace');
      expect(callArgs.system).toContain('butler');
    });

    it('should pass search results context to Haiku', async () => {
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Summary' }]
      });

      await summarizer.summarizeWithPersonality(mockQuery, mockSearchResponse);

      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      const userMessage = callArgs.messages[0].content;

      expect(userMessage).toContain(mockQuery);
      expect(userMessage).toContain('Coffee Brewing Guide');
      expect(userMessage).toContain('Boil water to 200°F');
      expect(userMessage).toContain('example.com');
    });

    it('should handle empty search results', async () => {
      const emptyResponse: SearchResponse = {
        query: 'nonexistent topic',
        results: [],
        totalResults: 0,
        searchTime: 300,
        cached: false
      };

      const result = await summarizer.summarizeWithPersonality('test', emptyResponse);

      // Should return one of the no-results responses
      expect(result).toMatch(/couldn't find|turned up nothing|came up empty|search came up empty/i);
    });

    it('should rotate through no-results responses deterministically', async () => {
      const emptyResponse: SearchResponse = {
        query: '',
        results: [],
        totalResults: 0,
        searchTime: 100,
        cached: false
      };

      // Different query lengths should get different responses
      const result1 = await summarizer.summarizeWithPersonality('a', emptyResponse);
      const result2 = await summarizer.summarizeWithPersonality('ab', emptyResponse);
      const result3 = await summarizer.summarizeWithPersonality('abc', emptyResponse);
      const result4 = await summarizer.summarizeWithPersonality('abcd', emptyResponse);

      // At least some should be different (based on modulo of query length)
      const uniqueResponses = new Set([result1, result2, result3, result4]);
      expect(uniqueResponses.size).toBeGreaterThan(1);
    });

    it('should handle API errors gracefully', async () => {
      mockAnthropicClient.messages.create.mockRejectedValueOnce(new Error('API Error'));

      const result = await summarizer.summarizeWithPersonality(mockQuery, mockSearchResponse);

      // Should fall back to basic summary
      expect(result).toContain('example.com');
      expect(result).toContain('Boil water');
    });

    it('should handle non-text response content', async () => {
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [
          {
            type: 'image', // Non-text type
            data: 'base64data'
          }
        ]
      });

      const result = await summarizer.summarizeWithPersonality(mockQuery, mockSearchResponse);

      // Should return empty string when no text content
      expect(result).toBe('');
    });

    it('should use correct butler system prompt', async () => {
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Test' }]
      });

      await summarizer.summarizeWithPersonality(mockQuery, mockSearchResponse);

      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      const systemPrompt = callArgs.system;

      // Verify butler personality traits
      expect(systemPrompt).toContain('Pace');
      expect(systemPrompt).toContain('British butler');
      expect(systemPrompt).toContain('concise and direct');
      expect(systemPrompt).toContain('dry wit');
      expect(systemPrompt).toContain('Jarvis');
    });

    it('should format search context properly', async () => {
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Summary' }]
      });

      await summarizer.summarizeWithPersonality(mockQuery, mockSearchResponse);

      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      const userMessage = callArgs.messages[0].content;

      // Should have numbered results
      expect(userMessage).toContain('[1]');
      expect(userMessage).toContain('[2]');

      // Should have source citations
      expect(userMessage).toContain('Source: example.com');
      expect(userMessage).toContain('Source: coffee.com');
    });
  });
});
