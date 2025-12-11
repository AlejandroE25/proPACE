import { WeatherData } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { Cache } from '../utils/cache.js';
import { config } from '../config/index.js';

interface Location {
  lat: number;
  lon: number;
  city: string;
}

/**
 * Weather Service
 * Fetches weather data using IP geolocation and OpenWeatherMap API
 */
export class WeatherService {
  private apiKey: string;
  private cache: Cache<WeatherData>;
  private locationCache: Cache<Location>;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.openWeatherMapApiKey;
    this.cache = new Cache<WeatherData>();
    this.locationCache = new Cache<Location>();
  }

  /**
   * Get user location from IP geolocation
   */
  async getLocation(): Promise<Location> {
    // Check cache first
    const cached = this.locationCache.get('location');
    if (cached) {
      logger.debug('Using cached location');
      return cached;
    }

    try {
      const response = await fetch('http://ip-api.com/json');

      if (!response.ok) {
        throw new Error(`Failed to fetch location: ${response.status}`);
      }

      const data = (await response.json()) as any;

      const location: Location = {
        lat: data.lat,
        lon: data.lon,
        city: data.city,
      };

      // Cache for 1 hour
      this.locationCache.set('location', location, 3600000);

      logger.debug(`Location detected: ${location.city}`);
      return location;
    } catch (error) {
      logger.error('Error fetching location:', error);
      throw new Error('Failed to fetch location');
    }
  }

  /**
   * Get weather data from OpenWeatherMap API
   */
  async getWeather(lat?: number, lon?: number, city?: string): Promise<WeatherData> {
    // Check cache first
    const cacheKey = lat && lon ? `${lat},${lon}` : 'current';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('Using cached weather data');
      return cached;
    }

    try {
      let location: Location;

      if (lat !== undefined && lon !== undefined) {
        location = { lat, lon, city: city || 'Unknown' };
      } else {
        location = await this.getLocation();
      }

      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lon}&units=imperial&appid=${this.apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch weather: ${response.status}`);
      }

      const data = (await response.json()) as any;

      const weatherData: WeatherData = {
        city: location.city,
        weather: data.weather[0].description,
        temp: data.main.temp,
        feelsLike: data.main.feels_like,
      };

      // Cache for 15 minutes
      this.cache.set(cacheKey, weatherData, config.weatherCacheTTL);

      logger.debug(`Weather fetched for ${weatherData.city}: ${weatherData.temp}°F`);
      return weatherData;
    } catch (error) {
      logger.error('Error fetching weather:', error);
      throw new Error('Failed to fetch weather');
    }
  }

  /**
   * Get formatted weather string
   */
  async getWeatherFormatted(): Promise<string> {
    try {
      const weather = await this.getWeather();
      return `It's ${Math.round(weather.temp)}°F and ${weather.weather} in ${weather.city}. Feels like ${Math.round(weather.feelsLike)}°F.`;
    } catch (error) {
      logger.error('Error getting formatted weather:', error);
      return 'Sorry, I could not fetch the weather information at this time.';
    }
  }

  /**
   * Clear weather cache
   */
  clearCache(): void {
    this.cache.clear();
    this.locationCache.clear();
    logger.debug('Weather cache cleared');
  }

  /**
   * Check if weather service is working
   */
  async check(): Promise<boolean> {
    try {
      await this.getWeather();
      return true;
    } catch (error) {
      logger.error('Weather service check failed:', error);
      return false;
    }
  }
}
