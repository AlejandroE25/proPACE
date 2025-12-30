/**
 * News Plugin
 *
 * Adapter for the News service to work with the plugin system
 */

import {
  Plugin,
  PluginMetadata,
  PluginTool,
  PluginCapability,
  ExecutionContext,
  ToolResult
} from '../../types/plugin.js';
import { NewsService } from '../../services/newsService.js';
import { logger } from '../../utils/logger.js';

export class NewsPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'core.news',
    name: 'News Service',
    version: '1.0.0',
    author: 'proPACE',
    description: 'Provides latest news headlines from Wikinews',
    tags: ['news', 'core', 'information']
  };

  private newsService?: NewsService;

  tools: PluginTool[] = [
    {
      name: 'get_news',
      description: 'Get latest news headlines from Wikinews. Returns top headlines from current events.',
      category: 'news',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'count',
          type: 'number',
          description: 'Number of headlines to return (default: 5)',
          required: false,
          default: 5,
          validation: (value: any) => {
            const num = Number(value);
            return !isNaN(num) && num > 0 && num <= 30;
          }
        }
      ],
      execute: async (params: Record<string, any>, _context: ExecutionContext): Promise<ToolResult> => {
        const startTime = Date.now();

        try {
          if (!this.newsService) {
            throw new Error('News service not initialized');
          }

          const count = (params.count as number) || 5;
          const allNews = await this.newsService.getNews();

          // Get top N headlines
          const headlines = allNews.slice(0, count);

          const duration = Date.now() - startTime;

          return {
            success: true,
            data: {
              headlines: headlines.map(item => ({
                title: item.title,
                link: item.link,
                published: item.published
              })),
              count: headlines.length,
              formatted: this.formatNews(headlines)
            },
            metadata: {
              duration,
              cached: false, // News service handles its own caching
              source: 'Wikinews'
            }
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('News plugin execution error:', error);

          return {
            success: false,
            error: `Failed to get news: ${(error as Error).message}`,
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
   * Get the news service instance (for API endpoints)
   */
  getNewsService(): NewsService | undefined {
    return this.newsService;
  }

  /**
   * Initialize the news plugin
   */
  async initialize(_config: Record<string, any>): Promise<void> {
    try {
      this.newsService = new NewsService();
      logger.info('News plugin initialized');
    } catch (error) {
      logger.error('Failed to initialize news plugin:', error);
      throw error;
    }
  }

  /**
   * Health check for the news service
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.newsService) {
        return false;
      }

      // Try to fetch news as a health check
      await this.newsService.getNews();
      return true;
    } catch (error) {
      logger.warn('News service health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    logger.info('News plugin shutting down');
    this.newsService = undefined;
  }

  /**
   * Format news for human-readable output
   */
  private formatNews(news: any[]): string {
    return news.map((item, index) => `${index + 1}. ${item.title}`).join('\n');
  }
}
