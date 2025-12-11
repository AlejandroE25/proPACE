import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeatherService } from '../../../src/services/weatherService.js';

// Mock fetch
global.fetch = vi.fn();

describe('WeatherService', () => {
  let weatherService: WeatherService;

  beforeEach(() => {
    vi.clearAllMocks();
    weatherService = new WeatherService('test_api_key');
  });

  describe('getLocation', () => {
    it('should get location from IP geolocation API', async () => {
      const mockLocationResponse = {
        lat: 42.3601,
        lon: -71.0589,
        city: 'Boston',
        country: 'US',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockLocationResponse,
      });

      const location = await weatherService.getLocation();

      expect(location).toEqual({
        lat: 42.3601,
        lon: -71.0589,
        city: 'Boston',
      });
      expect(global.fetch).toHaveBeenCalledWith('http://ip-api.com/json');
    });

    it('should throw error when location API fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(weatherService.getLocation()).rejects.toThrow('Failed to fetch location');
    });
  });

  describe('getWeather', () => {
    it('should get weather data from OpenWeatherMap API', async () => {
      const mockLocationResponse = {
        lat: 42.3601,
        lon: -71.0589,
        city: 'Boston',
      };

      const mockWeatherResponse = {
        weather: [{ description: 'clear sky' }],
        main: {
          temp: 72,
          feels_like: 68,
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLocationResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockWeatherResponse,
        });

      const weather = await weatherService.getWeather();

      expect(weather).toEqual({
        city: 'Boston',
        weather: 'clear sky',
        temp: 72,
        feelsLike: 68,
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.openweathermap.org/data/2.5/weather')
      );
    });

    it('should use provided coordinates if given', async () => {
      const mockWeatherResponse = {
        weather: [{ description: 'partly cloudy' }],
        main: {
          temp: 65,
          feels_like: 62,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockWeatherResponse,
      });

      const weather = await weatherService.getWeather(40.7128, -74.006, 'New York');

      expect(weather.city).toBe('New York');
      expect(weather.weather).toBe('partly cloudy');
      expect(global.fetch).toHaveBeenCalledTimes(1); // Should not call location API
    });

    it('should throw error when weather API fails', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ lat: 0, lon: 0, city: 'Test' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

      await expect(weatherService.getWeather()).rejects.toThrow('Failed to fetch weather');
    });
  });

  describe('getWeatherFormatted', () => {
    it('should return formatted weather string', async () => {
      const mockLocationResponse = {
        lat: 42.3601,
        lon: -71.0589,
        city: 'Boston',
      };

      const mockWeatherResponse = {
        weather: [{ description: 'clear sky' }],
        main: {
          temp: 72,
          feels_like: 68,
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLocationResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockWeatherResponse,
        });

      const formatted = await weatherService.getWeatherFormatted();

      expect(formatted).toContain('Boston');
      expect(formatted).toContain('72');
      expect(formatted).toContain('clear sky');
    });
  });

  describe('caching', () => {
    it('should cache weather results', async () => {
      const mockLocationResponse = {
        lat: 42.3601,
        lon: -71.0589,
        city: 'Boston',
      };

      const mockWeatherResponse = {
        weather: [{ description: 'clear sky' }],
        main: {
          temp: 72,
          feels_like: 68,
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLocationResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockWeatherResponse,
        });

      // First call
      await weatherService.getWeather();
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Second call should use cache
      await weatherService.getWeather();
      expect(global.fetch).toHaveBeenCalledTimes(2); // No additional calls
    });

    it('should clear cache when requested', async () => {
      const mockLocationResponse = {
        lat: 42.3601,
        lon: -71.0589,
        city: 'Boston',
      };

      const mockWeatherResponse = {
        weather: [{ description: 'clear sky' }],
        main: {
          temp: 72,
          feels_like: 68,
        },
      };

      (global.fetch as any)
        .mockResolvedValue({
          ok: true,
          json: async () => mockLocationResponse,
        })
        .mockResolvedValue({
          ok: true,
          json: async () => mockWeatherResponse,
        });

      // First call
      await weatherService.getWeather();

      // Clear cache
      weatherService.clearCache();

      // Should fetch again after cache clear
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLocationResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockWeatherResponse,
        });

      await weatherService.getWeather();
      expect(global.fetch).toHaveBeenCalledTimes(4); // 2 + 2 after cache clear
    });
  });

  describe('check', () => {
    it('should return true when API is working', async () => {
      const mockLocationResponse = {
        lat: 42.3601,
        lon: -71.0589,
        city: 'Boston',
      };

      const mockWeatherResponse = {
        weather: [{ description: 'clear sky' }],
        main: {
          temp: 72,
          feels_like: 68,
        },
      };

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLocationResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockWeatherResponse,
        });

      const result = await weatherService.check();
      expect(result).toBe(true);
    });

    it('should return false when API fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const result = await weatherService.check();
      expect(result).toBe(false);
    });
  });
});
