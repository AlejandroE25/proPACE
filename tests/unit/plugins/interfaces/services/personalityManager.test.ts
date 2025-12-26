/**
 * PersonalityManager Test Suite
 *
 * Tests dynamic personality detection and switching based on
 * conversation context (urgency, depth, cadence, explicit cues).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PersonalityManager, PersonalityMode } from '../../../../../src/plugins/interfaces/services/personalityManager';

describe('PersonalityManager', () => {
  let manager: PersonalityManager;

  beforeEach(() => {
    manager = new PersonalityManager(true); // personalityEnabled = true
  });

  describe('Initialization', () => {
    it('should initialize with personality enabled', () => {
      const enabledManager = new PersonalityManager(true);
      expect(enabledManager.isEnabled()).toBe(true);
    });

    it('should initialize with personality disabled', () => {
      const disabledManager = new PersonalityManager(false);
      expect(disabledManager.isEnabled()).toBe(false);
    });

    it('should start in professional mode by default', () => {
      const mode = manager.getCurrentMode();
      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });
  });

  describe('Urgency Detection', () => {
    it('should detect urgent keywords', () => {
      const mode = manager.analyzeContext({
        message: 'Quick! What is the weather?',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should detect "asap" as urgent', () => {
      const mode = manager.analyzeContext({
        message: 'I need this asap',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should detect "urgent" as urgent', () => {
      const mode = manager.analyzeContext({
        message: 'This is urgent',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should detect "hurry" as urgent', () => {
      const mode = manager.analyzeContext({
        message: 'Hurry up and tell me',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });
  });

  describe('Conversation Depth Tracking', () => {
    it('should switch to butler mode for extended conversations', () => {
      const mode = manager.analyzeContext({
        message: 'Tell me more about that',
        conversationDepth: 6, // More than 5 exchanges
        messageCount: 12,
        timeSinceLastMessage: 30000 // 30 seconds
      });

      expect(mode).toBe(PersonalityMode.BUTLER);
    });

    it('should stay professional for brief conversations', () => {
      const mode = manager.analyzeContext({
        message: 'What is the time?',
        conversationDepth: 2,
        messageCount: 2,
        timeSinceLastMessage: 5000
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should consider conversation depth as primary factor', () => {
      // Even without urgency keywords, short conversations should be professional
      const mode = manager.analyzeContext({
        message: 'Hello there',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });
  });

  describe('Message Cadence Analysis', () => {
    it('should detect rapid-fire questions as urgent', () => {
      const mode = manager.analyzeContext({
        message: 'And what about this?',
        conversationDepth: 3,
        messageCount: 5,
        timeSinceLastMessage: 2000 // 2 seconds - very quick
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should detect relaxed pace for butler mode', () => {
      const mode = manager.analyzeContext({
        message: 'Tell me a story about that',
        conversationDepth: 8,
        messageCount: 16,
        timeSinceLastMessage: 60000 // 1 minute - relaxed pace
      });

      expect(mode).toBe(PersonalityMode.BUTLER);
    });
  });

  describe('Explicit Cue Detection', () => {
    it('should detect "be brief" cue for professional mode', () => {
      const mode = manager.analyzeContext({
        message: 'Can you be brief about this?',
        conversationDepth: 5,
        messageCount: 10,
        timeSinceLastMessage: 30000
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should detect "keep it short" cue for professional mode', () => {
      const mode = manager.analyzeContext({
        message: 'Keep it short please',
        conversationDepth: 7,
        messageCount: 14,
        timeSinceLastMessage: 40000
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should detect "let\'s chat" cue for butler mode', () => {
      const mode = manager.analyzeContext({
        message: 'Let\'s chat about this',
        conversationDepth: 2,
        messageCount: 4,
        timeSinceLastMessage: 10000
      });

      expect(mode).toBe(PersonalityMode.BUTLER);
    });

    it('should detect "tell me more" cue for butler mode', () => {
      const mode = manager.analyzeContext({
        message: 'Tell me more about quantum physics',
        conversationDepth: 3,
        messageCount: 6,
        timeSinceLastMessage: 20000
      });

      expect(mode).toBe(PersonalityMode.BUTLER);
    });
  });

  describe('Mode Persistence', () => {
    it('should track current mode', () => {
      manager.analyzeContext({
        message: 'Quick question',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(manager.getCurrentMode()).toBe(PersonalityMode.PROFESSIONAL);

      manager.analyzeContext({
        message: 'Let\'s have a nice long chat',
        conversationDepth: 10,
        messageCount: 20,
        timeSinceLastMessage: 60000
      });

      expect(manager.getCurrentMode()).toBe(PersonalityMode.BUTLER);
    });

    it('should return mode statistics', () => {
      manager.analyzeContext({
        message: 'Quick',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      manager.analyzeContext({
        message: 'Another quick one',
        conversationDepth: 2,
        messageCount: 2,
        timeSinceLastMessage: 3000
      });

      const stats = manager.getStatistics();
      expect(stats.totalAnalyses).toBe(2);
      expect(stats.professionalCount).toBeGreaterThan(0);
    });
  });

  describe('Temperature Mapping', () => {
    it('should return 0.3 temperature for professional mode', () => {
      manager.analyzeContext({
        message: 'Quick question',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(manager.getTemperature()).toBe(0.3);
    });

    it('should return 0.7 temperature for butler mode', () => {
      manager.analyzeContext({
        message: 'Let\'s chat',
        conversationDepth: 10,
        messageCount: 20,
        timeSinceLastMessage: 60000
      });

      expect(manager.getTemperature()).toBe(0.7);
    });
  });

  describe('System Prompt Generation', () => {
    it('should generate professional system prompt', () => {
      manager.analyzeContext({
        message: 'Urgent question',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      const prompt = manager.getSystemPrompt();
      expect(prompt).toContain('concise');
      expect(prompt).toContain('professional');
      expect(prompt.toLowerCase()).not.toContain('sarcastic');
    });

    it('should generate butler system prompt', () => {
      manager.analyzeContext({
        message: 'Tell me more',
        conversationDepth: 10,
        messageCount: 20,
        timeSinceLastMessage: 60000
      });

      const prompt = manager.getSystemPrompt();
      expect(prompt).toContain('British butler');
      expect(prompt.toLowerCase()).toContain('sarcastic');
    });
  });

  describe('Disabled Personality Mode', () => {
    beforeEach(() => {
      manager = new PersonalityManager(false);
    });

    it('should always return professional mode when disabled', () => {
      const mode = manager.analyzeContext({
        message: 'Let\'s have a long chat',
        conversationDepth: 15,
        messageCount: 30,
        timeSinceLastMessage: 120000
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
      expect(manager.getTemperature()).toBe(0.3);
    });

    it('should ignore explicit cues when disabled', () => {
      const mode = manager.analyzeContext({
        message: 'Let\'s chat',
        conversationDepth: 10,
        messageCount: 20,
        timeSinceLastMessage: 60000
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', () => {
      const mode = manager.analyzeContext({
        message: '',
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should handle very long message', () => {
      const longMessage = 'a'.repeat(10000);
      const mode = manager.analyzeContext({
        message: longMessage,
        conversationDepth: 1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(mode).toBeDefined();
    });

    it('should handle negative conversation depth gracefully', () => {
      const mode = manager.analyzeContext({
        message: 'Hello',
        conversationDepth: -1,
        messageCount: 1,
        timeSinceLastMessage: 0
      });

      expect(mode).toBe(PersonalityMode.PROFESSIONAL);
    });

    it('should handle very large conversation depth', () => {
      const mode = manager.analyzeContext({
        message: 'Hello',
        conversationDepth: 1000,
        messageCount: 2000,
        timeSinceLastMessage: 1000000
      });

      expect(mode).toBe(PersonalityMode.BUTLER);
    });
  });
});
