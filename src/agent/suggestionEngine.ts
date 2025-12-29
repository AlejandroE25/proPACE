/**
 * Suggestion Engine
 *
 * Generates context-aware, proactive suggestions based on learned patterns,
 * extracted contexts, and user goals/constraints.
 */

import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import { GlobalContextStore } from './globalContextStore.js';
import { PatternRecognition } from './patternRecognition.js';
import { LearningEngine } from './learningEngine.js';
import {
  ProactiveSuggestion,
  SuggestionType,
  SuggestionPriority,
  SmartReminder
} from '../types/proactive.js';

export class SuggestionEngine extends EventEmitter {
  private anthropic: Anthropic;
  private globalContext: GlobalContextStore;
  private patternRecognition: PatternRecognition;
  private _learningEngine: LearningEngine; // Reserved for future use
  private suggestions: Map<string, ProactiveSuggestion>;
  private reminders: Map<string, SmartReminder>;
  private analysisModel: string;
  private confidenceThreshold: number;

  constructor(
    anthropicApiKey: string,
    globalContext: GlobalContextStore,
    patternRecognition: PatternRecognition,
    learningEngine: LearningEngine,
    analysisModel: string = 'claude-haiku-4-5-20251001',
    confidenceThreshold: number = 0.7
  ) {
    super();
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.globalContext = globalContext;
    this.patternRecognition = patternRecognition;
    this._learningEngine = learningEngine;
    this.suggestions = new Map();
    this.reminders = new Map();
    this.analysisModel = analysisModel;
    this.confidenceThreshold = confidenceThreshold;

    logger.info('Suggestion engine initialized', {
      confidenceThreshold,
      hasLearningEngine: !!this._learningEngine
    });
  }

  /**
   * Analyze context and generate proactive suggestions
   */
  async generateSuggestions(
    clientId: string,
    recentMessages: string[],
    currentContextKeys: string[] = []
  ): Promise<ProactiveSuggestion[]> {
    try {
      // Get relevant contexts
      const contexts = currentContextKeys.map(key => {
        const ctx = this.globalContext.get(key, clientId);
        return ctx ? `${ctx.key}: ${ctx.value}` : null;
      }).filter(c => c !== null);

      // Get detected patterns
      const patterns = this.patternRecognition.getPatterns()
        .filter(p => p.confidence >= 0.5)
        .slice(0, 5); // Top 5 patterns

      // Build analysis prompt
      const prompt = this.buildSuggestionPrompt(
        recentMessages,
        contexts as string[],
        patterns.map(p => p.description)
      );

      // Call Claude to generate suggestions
      const response = await this.anthropic.messages.create({
        model: this.analysisModel,
        max_tokens: 500,
        temperature: 0.3, // Some creativity but stay focused
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return [];
      }

      // Parse suggestions
      const suggestions = this.parseSuggestions(content.text, clientId, recentMessages);

      // Store suggestions
      for (const suggestion of suggestions) {
        if (suggestion.confidence >= this.confidenceThreshold) {
          this.suggestions.set(suggestion.id, suggestion);
          this.emit('suggestion_generated', suggestion);
        }
      }

      logger.info('Generated proactive suggestions', {
        clientId,
        count: suggestions.length,
        highConfidence: suggestions.filter(s => s.confidence >= this.confidenceThreshold).length
      });

      return suggestions.filter(s => s.confidence >= this.confidenceThreshold);
    } catch (error) {
      logger.error('Error generating suggestions', { error, clientId });
      return [];
    }
  }

  /**
   * Build suggestion generation prompt
   */
  private buildSuggestionPrompt(
    recentMessages: string[],
    contexts: string[],
    patterns: string[]
  ): string {
    const messagesContext = recentMessages.length > 0
      ? `\n\nRecent conversation:\n${recentMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : '';

    const contextsInfo = contexts.length > 0
      ? `\n\nKnown context about user:\n${contexts.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';

    const patternsInfo = patterns.length > 0
      ? `\n\nDetected patterns:\n${patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : '';

    return `You are a proactive assistant analyzing conversation context to generate helpful suggestions.

${messagesContext}${contextsInfo}${patternsInfo}

Based on the conversation, context, and patterns, generate up to 3 proactive suggestions that would be genuinely helpful to the user.

For each suggestion, consider:
1. **Actions**: Things the user might want to do next
2. **Information**: Relevant facts or data the user might need
3. **Reminders**: Things related to their goals or constraints
4. **Insights**: Patterns or observations that might be valuable
5. **Follow-ups**: Natural next questions or topics

Return your suggestions as a JSON array with this format:
[
  {
    "type": "action|information|reminder|insight|followup",
    "priority": "low|medium|high|urgent",
    "content": "The actual suggestion text",
    "reasoning": "Why this suggestion is relevant",
    "confidence": 0.0-1.0
  }
]

IMPORTANT:
- Only suggest things that are genuinely helpful and relevant
- Don't suggest things the user just did or asked about
- Confidence should reflect how certain you are this is useful
- Be selective - quality over quantity
- If nothing seems helpful, return []

Return ONLY the JSON array, nothing else.`;
  }

  /**
   * Parse suggestions from Claude response
   */
  private parseSuggestions(
    text: string,
    _clientId: string,
    recentMessages: string[]
  ): ProactiveSuggestion[] {
    try {
      // Strip markdown code fences
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        logger.warn('Suggestions response is not an array');
        return [];
      }

      return parsed
        .filter((item: any) => {
          return (
            item.type &&
            item.priority &&
            item.content &&
            item.reasoning &&
            typeof item.confidence === 'number'
          );
        })
        .map((item: any) => {
          const suggestion: ProactiveSuggestion = {
            id: randomUUID(),
            type: this.mapSuggestionType(item.type),
            priority: this.mapSuggestionPriority(item.priority),
            content: item.content,
            reasoning: item.reasoning,
            confidence: item.confidence,
            triggerContext: {
              recentMessages: recentMessages.slice(-3)
            },
            timestamp: new Date(),
            seen: false
          };

          return suggestion;
        });
    } catch (error) {
      logger.error('Error parsing suggestions', { error });
      return [];
    }
  }

  /**
   * Map suggestion type string to enum
   */
  private mapSuggestionType(type: string): SuggestionType {
    const typeMap: Record<string, SuggestionType> = {
      action: SuggestionType.ACTION,
      information: SuggestionType.INFORMATION,
      reminder: SuggestionType.REMINDER,
      insight: SuggestionType.INSIGHT,
      followup: SuggestionType.FOLLOWUP
    };

    return typeMap[type.toLowerCase()] || SuggestionType.INFORMATION;
  }

  /**
   * Map priority string to enum
   */
  private mapSuggestionPriority(priority: string): SuggestionPriority {
    const priorityMap: Record<string, SuggestionPriority> = {
      low: SuggestionPriority.LOW,
      medium: SuggestionPriority.MEDIUM,
      high: SuggestionPriority.HIGH,
      urgent: SuggestionPriority.URGENT
    };

    return priorityMap[priority.toLowerCase()] || SuggestionPriority.LOW;
  }

  /**
   * Create a smart reminder based on goals/constraints
   */
  createReminder(
    content: string,
    relatedContext: {
      type: 'goal' | 'constraint' | 'preference';
      key: string;
      value: string;
    },
    trigger: SmartReminder['trigger'],
    priority: SuggestionPriority = SuggestionPriority.MEDIUM
  ): SmartReminder {
    const reminder: SmartReminder = {
      id: randomUUID(),
      content,
      relatedContext,
      trigger,
      priority,
      shown: false,
      createdAt: new Date()
    };

    this.reminders.set(reminder.id, reminder);

    logger.info('Smart reminder created', {
      id: reminder.id,
      type: relatedContext.type,
      trigger: trigger.type
    });

    this.emit('reminder_created', reminder);

    return reminder;
  }

  /**
   * Check for triggered reminders
   */
  checkReminders(
    currentTime: Date = new Date(),
    currentContexts: string[] = []
  ): SmartReminder[] {
    const triggered: SmartReminder[] = [];

    for (const reminder of this.reminders.values()) {
      if (reminder.shown) continue;

      let shouldTrigger = false;

      switch (reminder.trigger.type) {
        case 'time':
          if (reminder.trigger.condition.timestamp) {
            shouldTrigger = currentTime >= reminder.trigger.condition.timestamp;
          }
          break;

        case 'context':
          if (reminder.trigger.condition.requiredContext) {
            const hasAllContexts = reminder.trigger.condition.requiredContext.every(
              ctx => currentContexts.includes(ctx)
            );
            shouldTrigger = hasAllContexts;
          }
          break;

        case 'pattern':
          // Pattern-based triggers checked elsewhere
          break;
      }

      if (shouldTrigger) {
        reminder.shown = true;
        reminder.lastShownAt = currentTime;
        triggered.push(reminder);

        logger.info('Reminder triggered', { id: reminder.id });

        this.emit('reminder_triggered', reminder);
      }
    }

    return triggered;
  }

  /**
   * Record user action on suggestion
   */
  recordSuggestionAction(
    suggestionId: string,
    action: 'accepted' | 'rejected' | 'ignored'
  ): void {
    const suggestion = this.suggestions.get(suggestionId);

    if (!suggestion) {
      logger.warn('Suggestion not found', { suggestionId });
      return;
    }

    suggestion.userAction = action;
    suggestion.seen = true;

    logger.info('Suggestion action recorded', {
      suggestionId,
      action,
      type: suggestion.type
    });

    this.emit('suggestion_action', { suggestion, action });
  }

  /**
   * Get active suggestions
   */
  getActiveSuggestions(): ProactiveSuggestion[] {
    const now = new Date();

    return Array.from(this.suggestions.values()).filter(s => {
      // Filter out expired suggestions
      if (s.expiresAt && s.expiresAt < now) {
        return false;
      }

      // Only return unseen or accepted suggestions
      return !s.seen || s.userAction === 'accepted';
    });
  }

  /**
   * Get suggestions by priority
   */
  getSuggestionsByPriority(priority: SuggestionPriority): ProactiveSuggestion[] {
    return this.getActiveSuggestions().filter(s => s.priority === priority);
  }

  /**
   * Get active reminders
   */
  getActiveReminders(): SmartReminder[] {
    return Array.from(this.reminders.values()).filter(r => !r.shown);
  }

  /**
   * Get suggestion statistics
   */
  getStatistics(): {
    totalSuggestions: number;
    activeSuggestions: number;
    acceptanceRate: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    activeReminders: number;
  } {
    const all = Array.from(this.suggestions.values());
    const active = this.getActiveSuggestions();

    const withAction = all.filter(s => s.userAction);
    const accepted = withAction.filter(s => s.userAction === 'accepted').length;
    const acceptanceRate = withAction.length > 0 ? accepted / withAction.length : 0;

    const byType: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const suggestion of all) {
      byType[suggestion.type] = (byType[suggestion.type] || 0) + 1;
      byPriority[suggestion.priority] = (byPriority[suggestion.priority] || 0) + 1;
    }

    return {
      totalSuggestions: all.length,
      activeSuggestions: active.length,
      acceptanceRate,
      byType,
      byPriority,
      activeReminders: this.getActiveReminders().length
    };
  }

  /**
   * Clear old suggestions
   */
  pruneSuggestions(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = new Date();
    let pruned = 0;

    for (const [id, suggestion] of this.suggestions.entries()) {
      const age = now.getTime() - suggestion.timestamp.getTime();

      if (age > maxAge || (suggestion.expiresAt && suggestion.expiresAt < now)) {
        this.suggestions.delete(id);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.info('Pruned old suggestions', { count: pruned });
    }

    return pruned;
  }

  /**
   * Clear all suggestions and reminders
   */
  clear(): void {
    this.suggestions.clear();
    this.reminders.clear();

    logger.warn('All suggestions and reminders cleared');

    this.emit('data_cleared');
  }
}
