import { ClaudeClient } from '../clients/claudeClient.js';
import { MemoryStore } from './memoryStore.js';
import { WeatherService } from './weatherService.js';
import { NewsService } from './newsService.js';
import { WolframService } from './wolframService.js';
import { RoutingService } from './routingService.js';
import { RoutingPredictor } from './routingPredictor.js';
import { ConversationMessage, Memory, SubsystemType } from '../types/index.js';
import { EventBus } from '../events/eventBus.js';
import { EventType, EventPriority } from '../events/types.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Conversation Orchestrator
 * Manages conversation flow, memory integration, and subsystem routing
 */
export class ConversationOrchestrator {
  private claudeClient: ClaudeClient;
  private memoryStore: MemoryStore;
  private weatherService: WeatherService;
  private newsService: NewsService;
  private wolframService: WolframService;
  private routingService: RoutingService;
  private routingPredictor: RoutingPredictor;
  private eventBus: EventBus;
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();

  constructor(
    claudeClient: ClaudeClient,
    memoryStore: MemoryStore,
    weatherService: WeatherService,
    newsService: NewsService,
    wolframService: WolframService,
    routingService: RoutingService,
    routingPredictor: RoutingPredictor,
    eventBus: EventBus
  ) {
    this.claudeClient = claudeClient;
    this.memoryStore = memoryStore;
    this.weatherService = weatherService;
    this.newsService = newsService;
    this.wolframService = wolframService;
    this.routingService = routingService;
    this.routingPredictor = routingPredictor;
    this.eventBus = eventBus;
  }

  /**
   * Process a message and generate a response
   */
  async processMessage(clientId: string, message: string): Promise<string> {
    try {
      const startTime = Date.now();

      // Get or initialize conversation history for this client
      if (!this.conversationHistory.has(clientId)) {
        this.conversationHistory.set(clientId, []);
      }

      const history = this.conversationHistory.get(clientId)!;

      // INTELLIGENT ROUTING with pre-routing validator pattern
      const routingDecision = await this.routingService.getRoutingDecision(message);

      logger.info(
        `Routing decision for "${message}": ${routingDecision.subsystem} (confidence: ${routingDecision.confidence}, cached: ${routingDecision.cached})`
      );

      let response: string;
      let usedSubsystem: SubsystemType;

      // High confidence - direct route to subsystem
      if (this.routingService.shouldRouteDirectly(routingDecision)) {
        response =
          (await this.routeDirectToSubsystem(routingDecision.subsystem, message)) ||
          (await this.fallbackToClaude(message, history));
        usedSubsystem = routingDecision.subsystem;
      } else {
        // Medium/low confidence - validate with pattern matching
        const patternResponse = await this.routeToSubsystem(message);

        if (patternResponse) {
          // Pattern matching succeeded
          response = patternResponse;
          usedSubsystem = this.detectUsedSubsystem(message);
        } else if (routingDecision.subsystem !== 'claude') {
          // Try Haiku's suggestion even with lower confidence
          response =
            (await this.routeDirectToSubsystem(routingDecision.subsystem, message)) ||
            (await this.fallbackToClaude(message, history));
          usedSubsystem = routingDecision.subsystem;
        } else {
          // Fall back to Claude
          response = await this.fallbackToClaude(message, history);
          usedSubsystem = 'claude';
        }
      }

      // Update conversation history
      this.updateConversationHistory(clientId, message, response);

      // Extract and store new memories (only for Claude responses)
      if (usedSubsystem === 'claude') {
        await this.extractAndStoreMemories(message, response);
      }

      // Record routing for session learning
      this.routingPredictor.record(clientId, usedSubsystem);

      const totalTime = Date.now() - startTime;
      logger.info(
        `Processed message in ${totalTime}ms using ${usedSubsystem} (routing: ${routingDecision.cached ? 'cached' : 'Haiku'})`
      );

      // Publish RESPONSE_GENERATED event for voice plugin and other subscribers
      await this.eventBus.publish({
        type: EventType.RESPONSE_GENERATED,
        priority: EventPriority.HIGH,
        source: 'conversation-orchestrator',
        payload: {
          clientId,
          message,
          response,
          subsystem: usedSubsystem,
          timestamp: new Date(),
          processingTime: totalTime
        }
      });

      return response;
    } catch (error) {
      logger.error('Error processing message:', error);
      return 'Sorry, I encountered an error processing your message.';
    }
  }

  /**
   * Route directly to a specific subsystem
   */
  private async routeDirectToSubsystem(
    subsystem: SubsystemType,
    message: string
  ): Promise<string | null> {
    try {
      switch (subsystem) {
        case 'weather':
          return await this.weatherService.getWeatherFormatted();

        case 'news':
          return await this.newsService.getNewsFormatted();

        case 'wolfram':
          const wolframAnswer = await this.wolframService.getFormattedAnswer(message);
          // Check if Wolfram actually found an answer
          if (
            !wolframAnswer.includes("couldn't find") &&
            !wolframAnswer.includes('encountered an error')
          ) {
            return wolframAnswer;
          }
          return null; // Fallback to Claude

        case 'claude':
          return null; // Will be handled by fallbackToClaude

        default:
          logger.warn(`Unknown subsystem: ${subsystem}`);
          return null;
      }
    } catch (error) {
      logger.error(`Error routing to ${subsystem}:`, error);
      return null;
    }
  }

  /**
   * Fallback to Claude for general conversation
   */
  private async fallbackToClaude(
    message: string,
    history: ConversationMessage[]
  ): Promise<string> {
    // Search for relevant memories
    const relevantMemories = this.searchRelevantMemories(message);

    // Build system prompt with memories
    const systemPrompt = this.buildSystemPrompt(relevantMemories);

    // Generate response from Claude
    return await this.claudeClient.generateResponse(message, history, systemPrompt);
  }

  /**
   * Detect which subsystem was used (for pattern-based routing)
   */
  private detectUsedSubsystem(message: string): SubsystemType {
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('weather') ||
      lowerMessage.includes('temperature') ||
      lowerMessage.includes('forecast')
    ) {
      return 'weather';
    }

    if (lowerMessage.includes('news') || lowerMessage.includes('headlines')) {
      return 'news';
    }

    if (this.wolframService.isSuitableQuery(message)) {
      return 'wolfram';
    }

    return 'claude';
  }

  /**
   * Route message to appropriate subsystem if applicable
   * (Legacy pattern-based routing for validation)
   */
  private async routeToSubsystem(message: string): Promise<string | null> {
    const lowerMessage = message.toLowerCase();

    // Weather queries
    if (
      lowerMessage.includes('weather') ||
      lowerMessage.includes('temperature') ||
      lowerMessage.includes('forecast') ||
      lowerMessage.match(/how'?s it (outside|out)/i) ||
      lowerMessage.match(/what'?s it like outside/i)
    ) {
      logger.info('Routing to Weather subsystem');
      return await this.weatherService.getWeatherFormatted();
    }

    // News queries
    if (
      lowerMessage.includes('news') ||
      lowerMessage.includes('headlines') ||
      lowerMessage.includes('latest') ||
      lowerMessage.match(/what'?s (happening|going on)/i)
    ) {
      logger.info('Routing to News subsystem');
      return await this.newsService.getNewsFormatted();
    }

    // Wolfram Alpha queries (computational/factual)
    if (this.wolframService.isSuitableQuery(message)) {
      logger.info('Routing to Wolfram Alpha subsystem');
      const answer = await this.wolframService.getFormattedAnswer(message);
      // If Wolfram couldn't answer, fall through to Claude
      if (!answer.includes("couldn't find") && !answer.includes('encountered an error')) {
        return answer;
      }
    }

    // No subsystem match
    return null;
  }

  /**
   * Search for relevant memories based on the message
   */
  private searchRelevantMemories(message: string): Memory[] {
    // Extract keywords from message (simple approach)
    const keywords = message
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3); // Only words longer than 3 chars

    const allRelevantMemories: Memory[] = [];

    // Search by keywords
    for (const keyword of keywords.slice(0, 3)) {
      // Limit to first 3 keywords
      const memories = this.memoryStore.search({ keyword }, 2);
      allRelevantMemories.push(...memories);
    }

    // Get high-importance memories
    const importantMemories = this.memoryStore.getByImportance(8, 3);
    allRelevantMemories.push(...importantMemories);

    // Deduplicate by ID
    const uniqueMemories = Array.from(
      new Map(allRelevantMemories.map((m) => [m.id, m])).values()
    );

    // Sort by importance and return top N
    return uniqueMemories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, config.memorySearchLimit);
  }

  /**
   * Build system prompt with relevant memories
   */
  private buildSystemPrompt(memories: Memory[]): string {
    let prompt = `You are PACE, a helpful AI assistant with persistent memory, much like JARVIS. You remember important details about the user and can recall them in future conversations.

Be helpful, but understand that that sometimes means being concise. When appropriate, use information from your memories to provide personalized responses.`;

    if (memories.length > 0) {
      prompt += '\n\nWhat you remember:\n';
      memories.forEach((memory) => {
        prompt += `- ${memory.content} (${memory.topic})\n`;
      });
    }

    prompt += '\n\nWhen the user shares important information (preferences, personal details, facts), acknowledge it naturally in your response.';

    return prompt;
  }

  /**
   * Update conversation history for a client
   */
  private updateConversationHistory(
    clientId: string,
    userMessage: string,
    assistantMessage: string
  ): void {
    const history = this.conversationHistory.get(clientId)!;

    history.push(
      { role: 'user', content: userMessage, timestamp: new Date() },
      { role: 'assistant', content: assistantMessage, timestamp: new Date() }
    );

    // Keep only the last N messages
    if (history.length > config.maxConversationHistory * 2) {
      history.splice(0, history.length - config.maxConversationHistory * 2);
    }

    this.conversationHistory.set(clientId, history);
  }

  /**
   * Extract and store important information from the conversation
   */
  private async extractAndStoreMemories(
    userMessage: string,
    _assistantResponse: string
  ): Promise<void> {
    // Check for explicit "remember" commands
    if (userMessage.toLowerCase().includes('remember')) {
      const content = userMessage.replace(/remember\s+(that\s+)?/i, '').trim();
      if (content.length > 0) {
        this.memoryStore.store({
          topic: 'user_request',
          content: content,
          importance: 8,
          tags: 'explicit,user_request',
          metadata: { source: 'explicit_remember' },
        });
        logger.info(`Stored explicit memory: ${content}`);
      }
    }

    // Extract preferences (simple pattern matching)
    this.extractPreferences(userMessage);

    // TODO: In the future, use Claude to extract important information
    // For now, we use simple pattern matching
  }

  /**
   * Extract preferences from user messages
   */
  private extractPreferences(message: string): void {

    // Match "my favorite X is Y" patterns
    const favoritePattern = /my favorite (\w+) is (.+?)(?:\.|$)/i;
    const favoriteMatch = message.match(favoritePattern);
    if (favoriteMatch) {
      this.memoryStore.store({
        topic: 'user_preferences',
        content: `User's favorite ${favoriteMatch[1]} is ${favoriteMatch[2]}`,
        importance: 7,
        tags: `favorite,${favoriteMatch[1]},preference`,
        metadata: { type: 'preference', category: favoriteMatch[1] },
      });
    }

    // Match "I like X" patterns
    const likePattern = /I (?:like|love|enjoy) (.+?)(?:\.|$)/i;
    const likeMatch = message.match(likePattern);
    if (likeMatch) {
      this.memoryStore.store({
        topic: 'user_preferences',
        content: `User likes ${likeMatch[1]}`,
        importance: 6,
        tags: 'like,preference',
        metadata: { type: 'preference' },
      });
    }

    // Match "I am X" patterns
    const identityPattern = /I am (?:a |an )?(.+?)(?:\.|$)/i;
    const identityMatch = message.match(identityPattern);
    if (identityMatch && identityMatch[1].split(' ').length <= 5) {
      this.memoryStore.store({
        topic: 'user_info',
        content: `User is ${identityMatch[1]}`,
        importance: 8,
        tags: 'identity,personal',
        metadata: { type: 'identity' },
      });
    }
  }

  /**
   * Handle special commands
   */
  async handleCommand(_clientId: string, command: string): Promise<string | null> {
    const lowerCommand = command.toLowerCase().trim();

    // What do you remember about me?
    if (lowerCommand.includes('what do you remember') || lowerCommand.includes('what do you know about me')) {
      const memories = this.memoryStore.getAll(50);
      if (memories.length === 0) {
        return "I don't have any memories stored yet. As we talk, I'll remember important details you share with me.";
      }

      let summary = "Here's what I remember about you:\n\n";
      memories.forEach((memory, index) => {
        summary += `${index + 1}. ${memory.content}\n`;
      });

      return summary.trim();
    }

    // Forget command
    if (lowerCommand.startsWith('forget')) {
      // For now, just acknowledge
      return "I understand you want me to forget something. In a future update, you'll be able to specify what to forget.";
    }

    // No command matched
    return null;
  }

  /**
   * Get conversation history for a client
   */
  getConversationHistory(clientId: string): ConversationMessage[] {
    return this.conversationHistory.get(clientId) || [];
  }

  /**
   * Clear conversation history for a client
   */
  clearConversationHistory(clientId: string): void {
    this.conversationHistory.delete(clientId);
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): { totalMemories: number; recentMemories: number } {
    return {
      totalMemories: this.memoryStore.count(),
      recentMemories: this.memoryStore.getRecent(10).length,
    };
  }
}
