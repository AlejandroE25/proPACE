/**
 * AgentOrchestrator Event Publishing Test
 *
 * Tests that AgentOrchestrator publishes RESPONSE_GENERATED events
 * for all response paths (fast-path, simple query, background task).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentOrchestrator } from '../../../src/agent/agentOrchestrator';
import { PluginRegistry } from '../../../src/plugins/pluginRegistry';
import { EventBus } from '../../../src/events/eventBus';
import { EventStore } from '../../../src/events/eventStore';
import { EventType } from '../../../src/events/types';

describe('AgentOrchestrator Event Publishing', () => {
  let orchestrator: AgentOrchestrator;
  let pluginRegistry: PluginRegistry;
  let eventBus: EventBus;
  let eventStore: EventStore;
  const TEST_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';

  beforeEach(async () => {
    // Create dependencies
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);
    pluginRegistry = new PluginRegistry();

    // Create orchestrator
    orchestrator = new AgentOrchestrator(
      TEST_API_KEY,
      pluginRegistry,
      eventBus,
      ':memory:',
      'claude-haiku-4-5-20251001'
    );
  });

  afterEach(async () => {
    await orchestrator.shutdown();
    await eventBus.shutdown();
    eventStore.close();
  });

  it('should publish RESPONSE_GENERATED event for simple queries', async () => {
    // Track published events
    const publishedEvents: any[] = [];

    await eventBus.subscribe([EventType.RESPONSE_GENERATED], {
      id: 'test-event-tracker',
      handle: async (event) => {
        publishedEvents.push(event);
      },
      canHandle: () => true,
      priority: 0
    });

    // Process a simple conversational query
    await orchestrator.processMessage('test-client', 'Hello, how are you?');

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify RESPONSE_GENERATED event was published
    const responseEvents = publishedEvents.filter(e => e.type === EventType.RESPONSE_GENERATED);
    expect(responseEvents.length).toBeGreaterThan(0);

    const event = responseEvents[0];
    expect(event.source).toBe('agent-orchestrator');
    expect(event.payload.clientId).toBe('test-client');
    expect(event.payload.message).toBe('Hello, how are you?');
    expect(event.payload.response).toBeDefined();
    expect(event.payload.subsystem).toBe('claude');
  }, 15000);

  it('should include correct payload fields in RESPONSE_GENERATED event', async () => {
    const publishedEvents: any[] = [];

    await eventBus.subscribe([EventType.RESPONSE_GENERATED], {
      id: 'test-payload-tracker',
      handle: async (event) => {
        publishedEvents.push(event);
      },
      canHandle: () => true,
      priority: 0
    });

    await orchestrator.processMessage('test-client-2', 'What is 2+2?');

    await new Promise(resolve => setTimeout(resolve, 100));

    const responseEvents = publishedEvents.filter(e => e.type === EventType.RESPONSE_GENERATED);
    expect(responseEvents.length).toBeGreaterThan(0);

    const event = responseEvents[0];
    expect(event.payload).toHaveProperty('clientId');
    expect(event.payload).toHaveProperty('message');
    expect(event.payload).toHaveProperty('response');
    expect(event.payload).toHaveProperty('subsystem');
    expect(event.payload).toHaveProperty('timestamp');
    expect(event.payload.timestamp).toBeInstanceOf(Date);
  }, 15000);

  it('should publish events for multiple consecutive messages', async () => {
    const publishedEvents: any[] = [];

    await eventBus.subscribe([EventType.RESPONSE_GENERATED], {
      id: 'test-multi-tracker',
      handle: async (event) => {
        publishedEvents.push(event);
      },
      canHandle: () => true,
      priority: 0
    });

    // Send multiple messages
    await orchestrator.processMessage('test-client-3', 'First message');
    await new Promise(resolve => setTimeout(resolve, 50));

    await orchestrator.processMessage('test-client-3', 'Second message');
    await new Promise(resolve => setTimeout(resolve, 50));

    await orchestrator.processMessage('test-client-3', 'Third message');
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify all events were published
    const responseEvents = publishedEvents.filter(e => e.type === EventType.RESPONSE_GENERATED);
    expect(responseEvents.length).toBeGreaterThanOrEqual(3);

    // Verify messages are in order
    expect(responseEvents[0].payload.message).toBe('First message');
    expect(responseEvents[1].payload.message).toBe('Second message');
    expect(responseEvents[2].payload.message).toBe('Third message');
  }, 20000);
});
