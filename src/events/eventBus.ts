/**
 * EventBus Implementation
 *
 * Central event routing system with priority queues, subscriptions,
 * filtering, and event persistence.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { EventStore } from './eventStore';
import {
  Event,
  EventType,
  EventPriority,
  EventSubscriber
} from './types';

interface QueuedEvent {
  event: Event;
  priority: number; // Numeric priority for sorting
}

const PRIORITY_VALUES: Record<EventPriority, number> = {
  [EventPriority.URGENT]: 4,
  [EventPriority.HIGH]: 3,
  [EventPriority.MEDIUM]: 2,
  [EventPriority.LOW]: 1
};

export class EventBus extends EventEmitter {
  private eventStore: EventStore;
  private subscribers: Map<EventType, EventSubscriber[]>;
  private eventQueue: QueuedEvent[];
  private isProcessing: boolean;
  private isShutdown: boolean;
  private processingInterval: NodeJS.Timeout | null;

  constructor(eventStore: EventStore, processingIntervalMs: number = 10) {
    super();
    this.eventStore = eventStore;
    this.subscribers = new Map();
    this.eventQueue = [];
    this.isProcessing = false;
    this.isShutdown = false;
    this.processingInterval = null;

    // Start background event processing
    this.startProcessing(processingIntervalMs);

    logger.info('EventBus initialized');
  }

  /**
   * Publish an event to the bus
   */
  async publish(event: Event): Promise<boolean> {
    if (this.isShutdown) {
      logger.warn('EventBus is shut down, rejecting event', { eventType: event.type });
      return false;
    }

    // Validate event type
    if (!Object.values(EventType).includes(event.type)) {
      throw new Error(`Invalid event type: ${event.type}`);
    }

    // Auto-generate ID if not provided
    if (!event.id) {
      event.id = randomUUID();
    }

    // Auto-set timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = new Date();
    }

    // Set default priority if not provided
    if (!event.priority) {
      event.priority = EventPriority.MEDIUM;
    }

    try {
      // Store event for historical queries
      this.eventStore.store(event);

      // Add to processing queue
      const priorityValue = PRIORITY_VALUES[event.priority];
      this.eventQueue.push({ event, priority: priorityValue });

      // Sort queue by priority (highest first)
      this.eventQueue.sort((a, b) => b.priority - a.priority);

      logger.debug('Event published', {
        id: event.id,
        type: event.type,
        priority: event.priority,
        queueSize: this.eventQueue.length
      });

      // Trigger processing if not already running
      if (!this.isProcessing) {
        setImmediate(() => this.processQueue());
      }

      return true;
    } catch (error) {
      logger.error('Error publishing event', { error, event });
      throw error;
    }
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventTypes: EventType[], subscriber: EventSubscriber): void {
    for (const eventType of eventTypes) {
      if (!this.subscribers.has(eventType)) {
        this.subscribers.set(eventType, []);
      }

      const subscribers = this.subscribers.get(eventType)!;

      // Check if already subscribed
      if (subscribers.find(s => s.id === subscriber.id)) {
        logger.warn('Subscriber already registered', {
          subscriberId: subscriber.id,
          eventType
        });
        continue;
      }

      subscribers.push(subscriber);

      // Sort subscribers by priority (highest first)
      subscribers.sort((a, b) => b.priority - a.priority);

      logger.debug('Subscriber registered', {
        subscriberId: subscriber.id,
        eventType,
        priority: subscriber.priority
      });
    }
  }

  /**
   * Unsubscribe a subscriber from all event types
   */
  unsubscribe(subscriberId: string): void {
    let removed = false;

    for (const [eventType, subscribers] of this.subscribers.entries()) {
      const index = subscribers.findIndex(s => s.id === subscriberId);
      if (index !== -1) {
        subscribers.splice(index, 1);
        removed = true;

        logger.debug('Subscriber removed', {
          subscriberId,
          eventType
        });
      }
    }

    if (!removed) {
      logger.warn('Subscriber not found', { subscriberId });
    }
  }

  /**
   * Get recent events from store
   */
  async getRecentEvents(limit: number = 10): Promise<Event[]> {
    return this.eventStore.query({ limit });
  }

  /**
   * Get events by type
   */
  async getEventsByType(type: EventType, limit: number = 10): Promise<Event[]> {
    return this.eventStore.query({ type, limit });
  }

  /**
   * Get events by source
   */
  async getEventsBySource(source: string, limit: number = 10): Promise<Event[]> {
    return this.eventStore.query({ source, limit });
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(): number {
    let count = 0;
    for (const subscribers of this.subscribers.values()) {
      count += subscribers.length;
    }
    return count;
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.subscribers.clear();
    logger.info('All subscriptions cleared');
  }

  /**
   * Shutdown the event bus
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;

    // Stop processing interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Process remaining events
    await this.processQueue();

    logger.info('EventBus shut down', {
      remainingEvents: this.eventQueue.length
    });
  }

  /**
   * Start background event processing
   */
  private startProcessing(intervalMs: number): void {
    this.processingInterval = setInterval(() => {
      if (!this.isProcessing && this.eventQueue.length > 0) {
        this.processQueue();
      }
    }, intervalMs);
  }

  /**
   * Process events from the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.eventQueue.length > 0) {
        const queuedEvent = this.eventQueue.shift();
        if (!queuedEvent) continue;

        await this.processEvent(queuedEvent.event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: Event): Promise<void> {
    const subscribers = this.subscribers.get(event.type) || [];

    if (subscribers.length === 0) {
      logger.debug('No subscribers for event type', { type: event.type });
      return;
    }

    logger.debug('Processing event', {
      id: event.id,
      type: event.type,
      subscriberCount: subscribers.length
    });

    // Process subscribers in priority order
    for (const subscriber of subscribers) {
      try {
        // Check if subscriber can handle this event
        if (!subscriber.canHandle(event)) {
          continue;
        }

        // Call handler
        await subscriber.handle(event);

        logger.debug('Event handled', {
          eventId: event.id,
          subscriberId: subscriber.id
        });
      } catch (error) {
        logger.error('Subscriber handler error', {
          eventId: event.id,
          subscriberId: subscriber.id,
          error
        });

        // Emit error event but continue processing
        this.emit('error', {
          error,
          event,
          subscriberId: subscriber.id
        });
      }
    }
  }
}
