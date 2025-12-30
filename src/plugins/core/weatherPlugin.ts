/**
 * Weather Plugin
 *
 * Adapter for the Weather service to work with the plugin system
 */

import {
  Plugin,
  PluginMetadata,
  PluginTool,
  PluginCapability,
  ExecutionContext,
  ToolResult
} from '../../types/plugin.js';
import { WeatherService } from '../../services/weatherService.js';
import { logger } from '../../utils/logger.js';

export class WeatherPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'core.weather',
    name: 'Weather Service',
    version: '1.0.0',
    author: 'proPACE',
    description: 'Provides current weather information using IP-based geolocation or city name',
    tags: ['weather', 'core', 'information']
  };

  private weatherService?: WeatherService;

  tools: PluginTool[] = [
    {
      name: 'get_weather',
      description: 'Get current weather conditions for a location. Uses IP-based geolocation if no city is specified.',
      category: 'weather',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'city',
          type: 'string',
          description: 'City name (optional - uses IP location if not provided)',
          required: false
        }
      ],
      execute: async (params: Record<string, any>, _context: ExecutionContext): Promise<ToolResult> => {
        const startTime = Date.now();

        try {
          if (!this.weatherService) {
            throw new Error('Weather service not initialized');
          }

          const city = params.city as string | undefined;
          const weather = city
            ? await this.weatherService.getWeather(undefined, undefined, city)
            : await this.weatherService.getWeather();

          const duration = Date.now() - startTime;

          return {
            success: true,
            data: {
              city: weather.city,
              temperature: weather.temp,
              feelsLike: weather.feelsLike,
              conditions: weather.weather,
              formatted: this.formatWeatherData(weather)
            },
            metadata: {
              duration,
              cached: false, // Weather service handles its own caching
              source: 'OpenWeatherMap'
            }
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Weather plugin execution error:', error);

          return {
            success: false,
            error: `Failed to get weather: ${(error as Error).message}`,
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
   * Initialize the weather plugin
   */
  async initialize(config: Record<string, any>): Promise<void> {
    try {
      const apiKey = config.apiKey as string | undefined;
      this.weatherService = new WeatherService(apiKey);

      logger.info('Weather plugin initialized');
    } catch (error) {
      logger.error('Failed to initialize weather plugin:', error);
      throw error;
    }
  }

  /**
   * Get the weather service instance (for API endpoints)
   */
  getWeatherService(): WeatherService | undefined {
    return this.weatherService;
  }

  /**
   * Health check for the weather service
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.weatherService) {
        return false;
      }

      // Try to get location as a health check
      await this.weatherService.getLocation();
      return true;
    } catch (error) {
      logger.warn('Weather service health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    logger.info('Weather plugin shutting down');
    this.weatherService = undefined;
  }

  /**
   * Format weather data for human-readable output
   */
  private formatWeatherData(weather: any): string {
    return `${weather.weather} in ${weather.city}, ${Math.round(weather.temp)}°F (feels like ${Math.round(weather.feelsLike)}°F)`;
  }
}
