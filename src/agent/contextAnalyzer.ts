/**
 * Context Analyzer
 *
 * Automatically extracts and categorizes important information from
 * conversations to intelligently build context without explicit user commands.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';
import { GlobalContextStore } from './globalContextStore.js';
import { ContextScope } from '../types/globalContext.js';
import { MemoryStore } from '../services/memoryStore.js';

export interface ExtractedContext {
  /** Type of information extracted */
  type: 'preference' | 'fact' | 'goal' | 'relationship' | 'skill' | 'constraint' | 'other';

  /** The actual information */
  content: string;

  /** Context key for storage */
  key: string;

  /** Scope: should this be personal or global? */
  scope: ContextScope;

  /** Confidence score (0-1) */
  confidence: number;

  /** Why this was extracted */
  reasoning?: string;
}

export class ContextAnalyzer {
  private anthropic: Anthropic;
  private globalContext: GlobalContextStore;
  private memoryStore?: MemoryStore;
  private analysisModel: string;

  constructor(
    anthropicApiKey: string,
    globalContext: GlobalContextStore,
    memoryStore?: MemoryStore,
    analysisModel: string = 'claude-haiku-4-5-20251001'
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    this.globalContext = globalContext;
    this.memoryStore = memoryStore;
    this.analysisModel = analysisModel;

    logger.info('Context analyzer initialized');
  }

  /**
   * Analyze conversation and extract important context automatically
   */
  async analyzeConversation(
    clientId: string,
    userMessage: string,
    assistantResponse: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<ExtractedContext[]> {
    try {
      // Build analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(
        userMessage,
        assistantResponse,
        conversationHistory
      );

      // Call Claude to extract important information
      const response = await this.anthropic.messages.create({
        model: this.analysisModel,
        max_tokens: 1000,
        temperature: 0,
        messages: [{ role: 'user', content: analysisPrompt }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return [];
      }

      // Parse the extracted contexts
      const extracted = this.parseExtractedContexts(content.text);

      // Store the extracted contexts
      await this.storeContexts(clientId, extracted);

      if (extracted.length > 0) {
        logger.info('Automatically extracted contexts', {
          clientId,
          count: extracted.length,
          types: extracted.map(e => e.type)
        });
      }

      return extracted;
    } catch (error) {
      logger.error('Error analyzing conversation for context:', error);
      return [];
    }
  }

  /**
   * Build analysis prompt for Claude
   */
  private buildAnalysisPrompt(
    userMessage: string,
    assistantResponse: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    // Include recent conversation for context
    const recentHistory = conversationHistory.slice(-6); // Last 3 exchanges
    let historyContext = '';
    if (recentHistory.length > 0) {
      historyContext = '\n\nRecent conversation context:\n';
      for (const msg of recentHistory) {
        historyContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      }
    }

    return `You are a context extraction system. Your job is to identify important, memorable information from conversations that should be saved for future reference.

${historyContext}

Latest exchange:
User: ${userMessage}
Assistant: ${assistantResponse}

Analyze this conversation and extract ANY important information that should be remembered. Look for:

1. **Preferences**: User likes/dislikes, settings, choices (e.g., "I prefer dark mode", "Call me Alex")
2. **Facts**: Important information about the user or their situation (e.g., "I live in Seattle", "I'm a software engineer")
3. **Goals**: User's objectives or things they want to accomplish (e.g., "I want to learn Python", "Planning a trip to Japan")
4. **Relationships**: Information about other people (e.g., "My wife's name is Sarah", "My team is in engineering")
5. **Skills**: User's abilities or expertise (e.g., "I know JavaScript", "I've used Docker before")
6. **Constraints**: Limitations or requirements (e.g., "I'm allergic to peanuts", "I can't work weekends")

For each piece of information, determine:
- Should it be PERSONAL (only for this user) or GLOBAL (useful for everyone)?
- Use PERSONAL for most things (preferences, facts about the user)
- Use GLOBAL only for universal facts, team info, or system-wide settings

Return your analysis as a JSON array. Each item should have:
{
  "type": "preference|fact|goal|relationship|skill|constraint",
  "content": "The actual information to remember",
  "key": "A short key (e.g., 'user.name', 'preference.theme', 'goal.learn_python')",
  "scope": "personal|global",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation why this is important"
}

IMPORTANT:
- Only extract genuinely useful information that would be helpful to remember
- Be selective - don't extract everything
- If there's nothing important to remember, return an empty array []
- Use snake_case for keys
- Keep content concise but clear

Return ONLY the JSON array, nothing else.`;
  }

  /**
   * Parse extracted contexts from Claude's response
   */
  private parseExtractedContexts(text: string): ExtractedContext[] {
    try {
      // Strip markdown code fences if present
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        logger.warn('Extracted contexts is not an array');
        return [];
      }

      // Validate and filter
      return parsed.filter((item: any) => {
        return (
          item.type &&
          item.content &&
          item.key &&
          item.scope &&
          typeof item.confidence === 'number' &&
          item.confidence >= 0.5 // Only keep high-confidence extractions
        );
      }).map((item: any) => ({
        type: item.type,
        content: item.content,
        key: item.key,
        scope: item.scope === 'global' ? ContextScope.GLOBAL : ContextScope.PERSONAL,
        confidence: item.confidence,
        reasoning: item.reasoning
      }));
    } catch (error) {
      logger.error('Error parsing extracted contexts:', error);
      return [];
    }
  }

  /**
   * Store extracted contexts
   */
  private async storeContexts(
    clientId: string,
    contexts: ExtractedContext[]
  ): Promise<void> {
    for (const ctx of contexts) {
      try {
        // Store in global context
        this.globalContext.set(
          ctx.key,
          ctx.content,
          clientId,
          ctx.scope,
          {
            description: ctx.reasoning,
            tags: [ctx.type, 'auto-extracted'],
            confidence: ctx.confidence
          }
        );

        // Also store in memory store for personal contexts (if available)
        if (ctx.scope === ContextScope.PERSONAL && this.memoryStore) {
          this.memoryStore.store({
            topic: ctx.type,
            content: ctx.content,
            importance: Math.round(ctx.confidence * 10), // Convert 0-1 to 0-10 importance
            tags: `${ctx.type},auto-extracted`,
            metadata: {
              key: ctx.key,
              reasoning: ctx.reasoning,
              autoExtracted: true
            }
          });
        }

        logger.debug('Stored extracted context', {
          key: ctx.key,
          type: ctx.type,
          scope: ctx.scope,
          confidence: ctx.confidence
        });
      } catch (error) {
        logger.error('Error storing extracted context:', {
          key: ctx.key,
          error
        });
      }
    }
  }

  /**
   * Get relevant contexts for a query
   */
  async getRelevantContexts(
    clientId: string,
    query: string
  ): Promise<string[]> {
    try {
      // Search for relevant contexts
      const allContexts = this.globalContext.getAll(clientId);

      if (allContexts.length === 0) {
        return [];
      }

      // Use Claude to determine which contexts are relevant
      const relevancePrompt = `Given this user query: "${query}"

Available contexts:
${allContexts.map((ctx, i) => `${i + 1}. ${ctx.key}: ${ctx.value}`).join('\n')}

Which contexts are relevant to answering this query? Return the numbers of relevant contexts as a JSON array of numbers.
Return ONLY the JSON array, nothing else. If none are relevant, return [].`;

      const response = await this.anthropic.messages.create({
        model: this.analysisModel,
        max_tokens: 100,
        temperature: 0,
        messages: [{ role: 'user', content: relevancePrompt }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return [];
      }

      // Parse relevant indices
      let cleaned = content.text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
      }

      const indices: number[] = JSON.parse(cleaned);

      return indices.map(i => {
        const ctx = allContexts[i - 1];
        return ctx ? `${ctx.key}: ${ctx.value}` : '';
      }).filter(s => s.length > 0);
    } catch (error) {
      logger.error('Error getting relevant contexts:', error);
      return [];
    }
  }
}
