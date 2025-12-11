// @ts-ignore - No types available for feedparser
import FeedParser from 'feedparser';
import { NewsItem } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { Cache } from '../utils/cache.js';
import { config } from '../config/index.js';

const WIKINEWS_RSS_URL =
  'https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&notcategories=No%20publish%7CArchived%7CAutoArchived%7Cdisputed&namespace=0&count=30&hourcount=124&ordermethod=categoryadd&stablepages=only';

/**
 * News Service
 * Fetches latest news from Wikinews RSS feed
 */
export class NewsService {
  private cache: Cache<NewsItem[]>;

  constructor() {
    this.cache = new Cache<NewsItem[]>();
  }

  /**
   * Get news from Wikinews RSS feed
   */
  async getNews(): Promise<NewsItem[]> {
    // Check cache first
    const cached = this.cache.get('news');
    if (cached) {
      logger.debug('Using cached news');
      return cached;
    }

    try {
      const response = await fetch(WIKINEWS_RSS_URL);

      if (!response.ok) {
        throw new Error(`Failed to fetch news: ${response.status}`);
      }

      const news = await this.parseRSSFeed(response.body);

      // Cache for 1 hour
      this.cache.set('news', news, config.newsCacheTTL);

      logger.debug(`Fetched ${news.length} news items`);
      return news;
    } catch (error) {
      logger.error('Error fetching news:', error);
      throw new Error('Failed to fetch news');
    }
  }

  /**
   * Parse RSS feed using feedparser
   */
  private parseRSSFeed(stream: any): Promise<NewsItem[]> {
    return new Promise((resolve, reject) => {
      const feedparser = new FeedParser({});
      const items: NewsItem[] = [];

      feedparser.on('error', (error: Error) => {
        logger.error('Feed parser error:', error);
        reject(new Error('Failed to parse RSS feed'));
      });

      feedparser.on('readable', function (this: any) {
        let item;
        while ((item = this.read())) {
          items.push({
            title: item.title,
            link: item.link,
            published: item.pubdate,
          });
        }
      });

      feedparser.on('end', () => {
        resolve(items);
      });

      // Pipe the response stream to feedparser
      if (stream && typeof stream.pipe === 'function') {
        stream.pipe(feedparser);
      } else {
        reject(new Error('Invalid stream'));
      }
    });
  }

  /**
   * Get formatted news string
   */
  async getNewsFormatted(limit = 5): Promise<string> {
    try {
      const news = await this.getNews();
      const headlines = news.slice(0, limit).map((item) => item.title);

      if (headlines.length === 0) {
        return 'No news available at this time.';
      }

      return `Here are the latest headlines: ${headlines.join('. ')}.`;
    } catch (error) {
      logger.error('Error getting formatted news:', error);
      return 'Sorry, I could not fetch the news at this time.';
    }
  }

  /**
   * Get news as JSON array (for GUIs)
   */
  async getNewsJSON(): Promise<NewsItem[]> {
    try {
      return await this.getNews();
    } catch (error) {
      logger.error('Error getting news JSON:', error);
      return [];
    }
  }

  /**
   * Clear news cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('News cache cleared');
  }

  /**
   * Check if news service is working
   */
  async check(): Promise<boolean> {
    try {
      const news = await this.getNews();
      return news.length > 0;
    } catch (error) {
      logger.error('News service check failed:', error);
      return false;
    }
  }
}
