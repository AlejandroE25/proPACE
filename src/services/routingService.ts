import Anthropic from '@anthropic-ai/sdk';
import { RoutingDecision, SubsystemType } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { RoutingCache } from '../utils/routingCache.js';
import { config } from '../config/index.js';
import type { PluginRegistry } from '../plugins/pluginRegistry.js';

/**
 * Intelligent Routing Service
 * Uses Claude 3.5 Haiku for fast, accurate subsystem routing decisions
 * Dynamically builds subsystem list from registered plugins
 */
export class RoutingService {
  private client: Anthropic;
  private cache: RoutingCache;
  private model: string;
  private confidenceThreshold: number;
  private pluginRegistry?: PluginRegistry;
  private validSubsystems: Set<string>;

  // Base routing prompt template - subsystems will be injected dynamically
  private readonly ROUTING_PROMPT_TEMPLATE = `You are a routing classifier for a conversational AI system. Analyze the user's message and determine which subsystem should handle it.

SUBSYSTEMS:
{SUBSYSTEMS}

ROUTING PRIORITY (CRITICAL - Follow this order):
1. MATH/CALCULATIONS → ALWAYS use wolfram (numbers, equations, "what is X * Y", "calculate", unit conversions, scientific constants, population stats)
2. WEATHER queries → Use weather
3. NEWS queries → Use news
4. FACTUAL KNOWLEDGE → Use google_search (how-to, explanations, definitions, facts, history, tutorials)
5. CONVERSATION → Use claude (opinions, jokes, creative tasks, greetings, advice)

CRITICAL RULES:
- ANY query with numbers, math operations, or "calculate" MUST route to wolfram
- "What is 2+2" → wolfram (NOT claude, even though it seems conversational)
- "How tall is the Eiffel Tower" → google_search (factual lookup)
- "Tell me about the Eiffel Tower" → google_search (factual knowledge)
- "How are you?" → claude (conversational greeting)

Respond with ONLY a JSON object in this exact format:
{"subsystem":"<name>","confidence":<0-1>}

Examples:
{EXAMPLES}`;

  constructor(apiKey?: string, pluginRegistry?: PluginRegistry) {
    this.client = new Anthropic({
      apiKey: apiKey || config.anthropicApiKey,
    });
    this.cache = new RoutingCache(config.routingCacheTTL);
    this.model = config.routingModel;
    this.confidenceThreshold = config.routingConfidenceThreshold;
    this.pluginRegistry = pluginRegistry;
    this.validSubsystems = new Set(['claude']); // Claude is always valid

    // Build initial subsystem list
    this.updateSubsystemList();

    // Periodic cache cleanup
    setInterval(() => {
      this.cache.cleanExpired();
    }, 60000); // Every minute
  }

  /**
   * Update the list of valid subsystems from the plugin registry
   */
  private updateSubsystemList(): void {
    if (!this.pluginRegistry) {
      // Fallback to hardcoded list if no registry
      this.validSubsystems = new Set(['weather', 'news', 'wolfram', 'google_search', 'claude']);
      return;
    }

    // Always include claude
    this.validSubsystems = new Set(['claude']);

    // Add all tools from registry as valid subsystems
    const tools = this.pluginRegistry.getAllTools();
    for (const tool of tools) {
      this.validSubsystems.add(tool.name);
    }

    logger.debug(`Updated valid subsystems: ${Array.from(this.validSubsystems).join(', ')}`);
  }

  /**
   * Build the routing prompt dynamically based on registered plugins
   */
  private buildRoutingPrompt(): string {
    // Static subsystem descriptions (could be extracted from plugin metadata in the future)
    const subsystemDescriptions: Record<string, string> = {
      weather: 'Temperature, forecast, weather conditions (PACE\'s weather sensor/plugin)',
      news: 'Headlines, current events, "what\'s happening", latest news (PACE\'s news sensor/plugin)',
      wolfram: 'ONLY pure math calculations, equations, scientific constants, unit conversions, population statistics',
      google_search: 'External factual knowledge - "how do", "how to", "what is", "who is", "explain", historical facts, recipes, tutorials, general knowledge NOT covered by PACE\'s sensors',
      claude: 'General conversation, opinions, jokes, creative tasks, advice, personal questions'
    };

    const examples: Record<string, string> = {
      weather: '"What\'s the weather?" → {"subsystem":"weather","confidence":0.95}',
      news: '"Tell me the news" → {"subsystem":"news","confidence":0.95}',
      wolfram: '"Calculate 5 * 8" → {"subsystem":"wolfram","confidence":0.98}\n"What is 2+2" → {"subsystem":"wolfram","confidence":0.98}\n"What\'s 15% of 200" → {"subsystem":"wolfram","confidence":0.98}\n"Convert 5 miles to kilometers" → {"subsystem":"wolfram","confidence":0.95}',
      google_search: '"How do you make coffee?" → {"subsystem":"google_search","confidence":0.9}\n"What is quantum computing?" → {"subsystem":"google_search","confidence":0.9}\n"Explain photosynthesis" → {"subsystem":"google_search","confidence":0.85}',
      claude: '"How are you?" → {"subsystem":"claude","confidence":0.9}\n"Tell me a joke" → {"subsystem":"claude","confidence":0.95}'
    };

    // Build subsystem list
    const subsystemLines = Array.from(this.validSubsystems)
      .map(name => `- ${name}: ${subsystemDescriptions[name] || 'Custom plugin tool'}`)
      .join('\n');

    // Build examples
    const exampleLines = Array.from(this.validSubsystems)
      .filter(name => examples[name])
      .map(name => examples[name])
      .join('\n');

    return this.ROUTING_PROMPT_TEMPLATE
      .replace('{SUBSYSTEMS}', subsystemLines)
      .replace('{EXAMPLES}', exampleLines);
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
      system: this.buildRoutingPrompt(), // Dynamic prompt based on registered plugins
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
    return this.validSubsystems.has(subsystem);
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
