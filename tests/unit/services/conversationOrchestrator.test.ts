/**
 * ConversationOrchestrator Test Suite
 *
 * Tests the conversation orchestrator's event publishing,
 * particularly the RESPONSE_GENERATED event for voice plugin integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConversationOrchestrator } from '../../../src/services/conversationOrchestrator';
import { ClaudeClient } from '../../../src/clients/claudeClient';
import { MemoryStore } from '../../../src/services/memoryStore';
import { WeatherService } from '../../../src/services/weatherService';
import { NewsService } from '../../../src/services/newsService';
import { WolframService } from '../../../src/services/wolframService';
import { RoutingService } from '../../../src/services/routingService';
import { RoutingPredictor } from '../../../src/services/routingPredictor';
import { EventBus } from '../../../src/events/eventBus';
import { EventStore } from '../../../src/events/eventStore';
import { EventType } from '../../../src/events/types';

describe('ConversationOrchestrator', () => {
  let orchestrator: ConversationOrchestrator;
  let claudeClient: ClaudeClient;
  let memoryStore: MemoryStore;
  let weatherService: WeatherService;
  let newsService: NewsService;
  let wolframService: WolframService;
  let routingService: RoutingService;
  let routingPredictor: RoutingPredictor;
  let eventBus: EventBus;
  let eventStore: EventStore;

  beforeEach(() => {
    // Create dependencies
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);

    // Mock Claude client
    claudeClient = {
      generateResponse: vi.fn().mockResolvedValue('Test response from Claude'),
      isConfigured: vi.fn().mockReturnValue(true)
    } as any;

    memoryStore = new MemoryStore(':memory:');
    weatherService = new WeatherService();
    newsService = new NewsService();
    wolframService = new WolframService();
    routingService = new RoutingService();
    routingPredictor = new RoutingPredictor();

    orchestrator = new ConversationOrchestrator(
      claudeClient,
      memoryStore,
      weatherService,
      newsService,
      wolframService,
      routingService,
      routingPredictor,
      eventBus
    );
  });

  afterEach(async () => {
    await eventBus.shutdown();
    eventStore.close();
    memoryStore.close();
  });

  describe('RESPONSE_GENERATED Event', () => {
    it('should publish RESPONSE_GENERATED event after processing message', async () => {
      // Arrange
      const clientId = 'test-client-1';
      const userMessage = 'Hello, how are you?';
      const events: any[] = [];

      // Subscribe to RESPONSE_GENERATED events
      eventBus.subscribe([EventType.RESPONSE_GENERATED], {
        id: 'test-subscriber',
        handle: async (event) => {
          events.push(event);
        },
        canHandle: (event) => true,
        priority: 1
      });

      // Act
      const response = await orchestrator.processMessage(clientId, userMessage);

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(response).toBe('Test response from Claude');
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.type).toBe(EventType.RESPONSE_GENERATED);
      expect(event.source).toBe('conversation-orchestrator');
      expect(event.payload.clientId).toBe(clientId);
      expect(event.payload.message).toBe(userMessage);
      expect(event.payload.response).toBe('Test response from Claude');
      expect(event.payload.subsystem).toBe('claude');
      expect(event.payload.processingTime).toBeGreaterThan(0);
    });

    it('should include correct subsystem in event payload', async () => {
      // Arrange
      const clientId = 'test-client-2';
      const userMessage = "What's the weather?";
      const events: any[] = [];

      // Mock routing to return weather subsystem
      routingService.getRoutingDecision = vi.fn().mockResolvedValue({
        subsystem: 'weather',
        confidence: 0.95,
        cached: false
      });

      routingService.shouldRouteDirectly = vi.fn().mockReturnValue(true);

      // Mock weather service
      weatherService.getCurrentWeather = vi.fn().mockResolvedValue({
        temperature: 72,
        conditions: 'Sunny',
        location: 'San Francisco'
      });

      eventBus.subscribe([EventType.RESPONSE_GENERATED], {
        id: 'test-subscriber-2',
        handle: async (event) => {
          events.push(event);
        },
        canHandle: (event) => true,
        priority: 1
      });

      // Act
      await orchestrator.processMessage(clientId, userMessage);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].payload.subsystem).toBe('weather');
    });

    it('should emit event even when using cached routing', async () => {
      // Arrange
      const clientId = 'test-client-3';
      const userMessage = 'Tell me a joke';
      const events: any[] = [];

      routingService.getRoutingDecision = vi.fn().mockResolvedValue({
        subsystem: 'claude',
        confidence: 0.9,
        cached: true  // Routing decision from cache
      });

      eventBus.subscribe([EventType.RESPONSE_GENERATED], {
        id: 'test-subscriber-3',
        handle: async (event) => {
          events.push(event);
        },
        canHandle: (event) => true,
        priority: 1
      });

      // Act
      await orchestrator.processMessage(clientId, userMessage);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(EventType.RESPONSE_GENERATED);
    });
  });
});
