import Anthropic from '@anthropic-ai/sdk';
import { RoutingDecision, SubsystemType } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { RoutingCache } from '../utils/routingCache.js';
import { config } from '../config/index.js';

/**
 * Intelligent Routing Service
 * Uses Claude 3.5 Haiku for fast, accurate subsystem routing decisions
 */
export class RoutingService {
  private client: Anthropic;
  private cache: RoutingCache;
  private model: string;
  private confidenceThreshold: number;

  // Optimized system prompt for fast routing
  private readonly ROUTING_PROMPT = `You are a routing classifier for a conversational AI system. Analyze the user's message and determine which subsystem should handle it.

SUBSYSTEMS:
- weather: Temperature, forecast, weather conditions (PACE's weather sensor/plugin)
- news: Headlines, current events, "what's happening", latest news (PACE's news sensor/plugin)
- wolfram: ONLY pure math calculations, equations, scientific constants, unit conversions, population statistics
- google_search: External factual knowledge - "how do", "how to", "what is", "who is", "explain", historical facts, recipes, tutorials, general knowledge NOT covered by PACE's sensors
- claude: General conversation, opinions, jokes, creative tasks, advice, personal questions

ROUTING PRIORITY:
1. If query is about weather/news/pure-math → Use PACE's built-in sensors (weather/news/wolfram)
2. If query needs current/factual external knowledge → Use google_search
3. If query is conversational/creative/opinion → Use claude

CRITICAL: Respond with ONLY a JSON object in this exact format:
{"subsystem":"<name>","confidence":<0-1>}

Examples:
"What's the weather?" → {"subsystem":"weather","confidence":0.95}
"Calculate 5 * 8" → {"subsystem":"wolfram","confidence":0.95}
"Tell me the news" → {"subsystem":"news","confidence":0.95}
"How do you make coffee?" → {"subsystem":"google_search","confidence":0.9}
"What is quantum computing?" → {"subsystem":"google_search","confidence":0.9}
"Explain photosynthesis" → {"subsystem":"google_search","confidence":0.85}
"How are you?" → {"subsystem":"claude","confidence":0.9}
"Tell me a joke" → {"subsystem":"claude","confidence":0.95}
"What's 2+2 and how's the weather?" → {"subsystem":"claude","confidence":0.7}`;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || config.anthropicApiKey,
    });
    this.cache = new RoutingCache(config.routingCacheTTL);
    this.model = config.routingModel;
    this.confidenceThreshold = config.routingConfidenceThreshold;

    // Periodic cache cleanup
    setInterval(() => {
      this.cache.cleanExpired();
    }, 60000); // Every minute
  }

  /**
   * Get routing decision for a message
   * Returns cached result if available, otherwise calls Haiku
   */
  async getRoutingDecision(message: string): Promise<RoutingDecision> {
    const startTime = Date.now();

    // Check exact match cache
    const cached = this.cache.get(message);
    if (cached) {
      const elapsed = Date.now() - startTime;
      logger.debug(`Routing decision from cache in ${elapsed}ms`);

      return {
        subsystem: cached.subsystem,
        confidence: cached.confidence,
        cached: true,
      };
    }

    // Check similar queries
    const similar = this.cache.findSimilar(message, 0.75);
    if (similar && similar.confidence >= 0.85) {
      const elapsed = Date.now() - startTime;
      logger.debug(`Routing decision from similar cache in ${elapsed}ms`);

      return {
        subsystem: similar.subsystem,
        confidence: similar.confidence * 0.95, // Slight penalty for similarity
        cached: true,
      };
    }

    // Call Haiku for routing decision
    try {
      const decision = await this.callHaikuRouter(message);
      const elapsed = Date.now() - startTime;

      logger.info(
        `Routing decision from Haiku in ${elapsed}ms: ${decision.subsystem} (${decision.confidence})`
      );

      // Cache the decision
      this.cache.set(message, decision.subsystem, decision.confidence);

      return decision;
    } catch (error) {
      logger.error('Error getting routing decision from Haiku:', error);

      // Fallback to Claude for general conversation
      return {
        subsystem: 'claude',
        confidence: 0.5,
        cached: false,
        reasoning: 'Error in routing - defaulting to Claude',
      };
    }
  }

  /**
   * Call Claude 3.5 Haiku for routing decision
   * Optimized for sub-200ms latency
   */
  private async callHaikuRouter(message: string): Promise<RoutingDecision> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 50, // Minimal tokens needed for JSON response
      temperature: 0, // Deterministic routing
      system: this.ROUTING_PROMPT,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Haiku');
    }

    let responseText = textContent.text.trim();

    // Remove markdown code fences if present
    responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    responseText = responseText.trim();

    // Parse JSON response
    try {
      const parsed = JSON.parse(responseText);

      if (!this.isValidSubsystem(parsed.subsystem)) {
        logger.warn(`Invalid subsystem from Haiku: ${parsed.subsystem}, defaulting to claude`);
        parsed.subsystem = 'claude';
      }

      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        logger.warn(`Invalid confidence from Haiku: ${parsed.confidence}, setting to 0.5`);
        parsed.confidence = 0.5;
      }

      return {
        subsystem: parsed.subsystem as SubsystemType,
        confidence: parsed.confidence,
        cached: false,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      logger.error(`Failed to parse Haiku routing response: ${responseText}`, error);

      // Try to extract subsystem from text
      const extractedSubsystem = this.extractSubsystemFromText(responseText);

      return {
        subsystem: extractedSubsystem,
        confidence: 0.6,
        cached: false,
        reasoning: 'Fallback extraction from malformed response',
      };
    }
  }

  /**
   * Validate subsystem type
   */
  private isValidSubsystem(subsystem: string): subsystem is SubsystemType {
    return ['weather', 'news', 'wolfram', 'google_search', 'claude'].includes(subsystem);
  }

  /**
   * Extract subsystem from malformed text response
   */
  private extractSubsystemFromText(text: string): SubsystemType {
    const lower = text.toLowerCase();

    if (lower.includes('weather')) return 'weather';
    if (lower.includes('news')) return 'news';
    if (lower.includes('wolfram')) return 'wolfram';
    if (lower.includes('google') || lower.includes('search')) return 'google_search';

    return 'claude'; // Safe default
  }

  /**
   * Check if confidence is high enough for direct routing
   */
  shouldRouteDirectly(decision: RoutingDecision): boolean {
    return decision.confidence >= this.confidenceThreshold;
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear routing cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
