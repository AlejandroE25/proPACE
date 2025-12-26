/**
 * TTSCache Test Suite
 *
 * Tests LRU cache for TTS audio with TTL expiration,
 * warmup capabilities, and cache statistics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TTSCache } from '../../../../../src/plugins/interfaces/utils/ttsCache';

describe('TTSCache', () => {
  let cache: TTSCache;

  beforeEach(() => {
    cache = new TTSCache({
      maxEntries: 100,
      ttlMs: 3600000 // 1 hour
    });
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultCache = new TTSCache();
      expect(defaultCache).toBeDefined();
    });

    it('should initialize with custom max entries', () => {
      const customCache = new TTSCache({ maxEntries: 50 });
      expect(customCache).toBeDefined();
    });

    it('should initialize with custom TTL', () => {
      const customCache = new TTSCache({ ttlMs: 1800000 }); // 30 minutes
      expect(customCache).toBeDefined();
    });
  });

  describe('Cache Operations', () => {
    it('should store and retrieve audio', () => {
      const audio = Buffer.from('fake-audio-data');

      cache.set('Hello, world!', audio);
      const retrieved = cache.get('Hello, world!');

      expect(retrieved).toBeDefined();
      expect(retrieved?.equals(audio)).toBe(true);
    });

    it('should return undefined for non-existent key', () => {
      const retrieved = cache.get('non-existent-key');
      expect(retrieved).toBeUndefined();
    });

    it('should handle empty text key', () => {
      const audio = Buffer.from('fake-audio-data');

      cache.set('', audio);
      const retrieved = cache.get('');

      expect(retrieved).toBeDefined();
    });

    it('should handle very long text keys', () => {
      const longText = 'a'.repeat(5000);
      const audio = Buffer.from('fake-audio-data');

      cache.set(longText, audio);
      const retrieved = cache.get(longText);

      expect(retrieved).toBeDefined();
    });

    it('should normalize whitespace in keys', () => {
      const audio = Buffer.from('fake-audio-data');

      cache.set('Hello,  world!  ', audio);
      const retrieved = cache.get('Hello, world!');

      expect(retrieved).toBeDefined();
    });

    it('should be case-sensitive', () => {
      const audio = Buffer.from('fake-audio-data');

      cache.set('Hello, World!', audio);
      const retrieved = cache.get('hello, world!');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('LRU Eviction', () => {
    beforeEach(() => {
      cache = new TTSCache({ maxEntries: 3, ttlMs: 3600000 });
    });

    it('should evict least recently used entry when full', () => {
      const audio1 = Buffer.from('audio-1');
      const audio2 = Buffer.from('audio-2');
      const audio3 = Buffer.from('audio-3');
      const audio4 = Buffer.from('audio-4');

      cache.set('text-1', audio1);
      cache.set('text-2', audio2);
      cache.set('text-3', audio3);

      // Cache is now full (3 entries)
      // Add 4th entry, should evict text-1
      cache.set('text-4', audio4);

      expect(cache.get('text-1')).toBeUndefined(); // Evicted
      expect(cache.get('text-2')).toBeDefined();
      expect(cache.get('text-3')).toBeDefined();
      expect(cache.get('text-4')).toBeDefined();
    });

    it('should update LRU order on access', () => {
      const audio1 = Buffer.from('audio-1');
      const audio2 = Buffer.from('audio-2');
      const audio3 = Buffer.from('audio-3');
      const audio4 = Buffer.from('audio-4');

      cache.set('text-1', audio1);
      cache.set('text-2', audio2);
      cache.set('text-3', audio3);

      // Access text-1, making it most recently used
      cache.get('text-1');

      // Add text-4, should evict text-2 (now least recently used)
      cache.set('text-4', audio4);

      expect(cache.get('text-1')).toBeDefined(); // Still present
      expect(cache.get('text-2')).toBeUndefined(); // Evicted
      expect(cache.get('text-3')).toBeDefined();
      expect(cache.get('text-4')).toBeDefined();
    });

    it('should update LRU order on set', () => {
      const audio1 = Buffer.from('audio-1');
      const audio2 = Buffer.from('audio-2');

      cache.set('text-1', audio1);
      cache.set('text-2', audio2);
      cache.set('text-3', Buffer.from('audio-3'));

      // Update text-1 (makes it most recent)
      cache.set('text-1', audio1);

      // Add text-4, should evict text-2
      cache.set('text-4', Buffer.from('audio-4'));

      expect(cache.get('text-1')).toBeDefined();
      expect(cache.get('text-2')).toBeUndefined(); // Evicted
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', () => {
      vi.useFakeTimers();

      cache = new TTSCache({ maxEntries: 100, ttlMs: 1000 }); // 1 second TTL
      const audio = Buffer.from('fake-audio-data');

      cache.set('Hello!', audio);

      // Immediately accessible
      expect(cache.get('Hello!')).toBeDefined();

      // Advance time past TTL
      vi.advanceTimersByTime(1100);

      // Should be expired
      expect(cache.get('Hello!')).toBeUndefined();

      vi.useRealTimers();
    });

    it('should not expire entries before TTL', () => {
      vi.useFakeTimers();

      cache = new TTSCache({ maxEntries: 100, ttlMs: 1000 });
      const audio = Buffer.from('fake-audio-data');

      cache.set('Hello!', audio);

      // Advance time but not past TTL
      vi.advanceTimersByTime(500);

      // Should still be accessible
      expect(cache.get('Hello!')).toBeDefined();

      vi.useRealTimers();
    });

    it('should handle infinite TTL (0)', () => {
      cache = new TTSCache({ maxEntries: 100, ttlMs: 0 });
      const audio = Buffer.from('fake-audio-data');

      cache.set('Hello!', audio);

      // Should never expire
      expect(cache.get('Hello!')).toBeDefined();
    });
  });

  describe('Cache Warmup', () => {
    it('should pre-populate common phrases', async () => {
      const commonPhrases = [
        'Hello!',
        'How can I help you?',
        'Is there anything else?'
      ];

      const mockGenerator = vi.fn(async (text: string) => {
        return Buffer.from(`audio-${text}`);
      });

      await cache.warmup(commonPhrases, mockGenerator);

      // All phrases should be cached
      expect(cache.get('Hello!')).toBeDefined();
      expect(cache.get('How can I help you?')).toBeDefined();
      expect(cache.get('Is there anything else?')).toBeDefined();

      // Generator should have been called for each phrase
      expect(mockGenerator).toHaveBeenCalledTimes(3);
    });

    it('should handle warmup errors gracefully', async () => {
      const commonPhrases = ['Hello!', 'Error phrase', 'Goodbye!'];

      const mockGenerator = vi.fn(async (text: string) => {
        if (text === 'Error phrase') {
          throw new Error('Generation failed');
        }
        return Buffer.from(`audio-${text}`);
      });

      await cache.warmup(commonPhrases, mockGenerator);

      // Non-error phrases should be cached
      expect(cache.get('Hello!')).toBeDefined();
      expect(cache.get('Goodbye!')).toBeDefined();

      // Error phrase should not be cached
      expect(cache.get('Error phrase')).toBeUndefined();
    });

    it('should skip empty phrases during warmup', async () => {
      const phrases = ['Hello!', '', '  ', 'Goodbye!'];

      const mockGenerator = vi.fn(async (text: string) => {
        return Buffer.from(`audio-${text}`);
      });

      await cache.warmup(phrases, mockGenerator);

      expect(mockGenerator).toHaveBeenCalledTimes(2); // Only non-empty phrases
      expect(cache.get('Hello!')).toBeDefined();
      expect(cache.get('Goodbye!')).toBeDefined();
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits', () => {
      const audio = Buffer.from('fake-audio-data');
      cache.set('Hello!', audio);

      cache.get('Hello!'); // Hit
      cache.get('Hello!'); // Hit

      const stats = cache.getStatistics();
      expect(stats.hits).toBe(2);
    });

    it('should track cache misses', () => {
      cache.get('non-existent-1'); // Miss
      cache.get('non-existent-2'); // Miss

      const stats = cache.getStatistics();
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate', () => {
      const audio = Buffer.from('fake-audio-data');
      cache.set('Hello!', audio);

      cache.get('Hello!');        // Hit
      cache.get('non-existent');  // Miss
      cache.get('Hello!');        // Hit

      const stats = cache.getStatistics();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2); // 2/3 = 0.667
    });

    it('should track current size', () => {
      cache.set('text-1', Buffer.from('audio-1'));
      cache.set('text-2', Buffer.from('audio-2'));

      const stats = cache.getStatistics();
      expect(stats.currentSize).toBe(2);
    });

    it('should track max size', () => {
      const stats = cache.getStatistics();
      expect(stats.maxSize).toBe(100);
    });

    it('should track evictions', () => {
      cache = new TTSCache({ maxEntries: 2, ttlMs: 3600000 });

      cache.set('text-1', Buffer.from('audio-1'));
      cache.set('text-2', Buffer.from('audio-2'));
      cache.set('text-3', Buffer.from('audio-3')); // Evicts text-1

      const stats = cache.getStatistics();
      expect(stats.evictions).toBe(1);
    });

    it('should handle zero hits and misses', () => {
      const stats = cache.getStatistics();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('Cache Clearing', () => {
    it('should clear all entries', () => {
      cache.set('text-1', Buffer.from('audio-1'));
      cache.set('text-2', Buffer.from('audio-2'));

      cache.clear();

      expect(cache.get('text-1')).toBeUndefined();
      expect(cache.get('text-2')).toBeUndefined();

      const stats = cache.getStatistics();
      expect(stats.currentSize).toBe(0);
    });

    it('should reset statistics on clear', () => {
      const audio = Buffer.from('fake-audio-data');
      cache.set('Hello!', audio);
      cache.get('Hello!'); // Hit
      cache.get('miss'); // Miss

      cache.clear();

      const stats = cache.getStatistics();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  describe('Has Method', () => {
    it('should return true for existing keys', () => {
      cache.set('Hello!', Buffer.from('audio'));
      expect(cache.has('Hello!')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    it('should return false for expired keys', () => {
      vi.useFakeTimers();

      cache = new TTSCache({ maxEntries: 100, ttlMs: 1000 });
      cache.set('Hello!', Buffer.from('audio'));

      vi.advanceTimersByTime(1100);

      expect(cache.has('Hello!')).toBe(false);

      vi.useRealTimers();
    });

    it('should not count as hit or miss', () => {
      cache.set('Hello!', Buffer.from('audio'));

      cache.has('Hello!');
      cache.has('non-existent');

      const stats = cache.getStatistics();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Delete Method', () => {
    it('should remove specific entry', () => {
      cache.set('Hello!', Buffer.from('audio'));

      const deleted = cache.delete('Hello!');

      expect(deleted).toBe(true);
      expect(cache.get('Hello!')).toBeUndefined();
    });

    it('should return false for non-existent key', () => {
      const deleted = cache.delete('non-existent');
      expect(deleted).toBe(false);
    });

    it('should update size after deletion', () => {
      cache.set('text-1', Buffer.from('audio-1'));
      cache.set('text-2', Buffer.from('audio-2'));

      cache.delete('text-1');

      const stats = cache.getStatistics();
      expect(stats.currentSize).toBe(1);
    });
  });
});
