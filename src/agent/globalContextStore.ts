/**
 * Global Context Store
 *
 * Manages shared context across all clients, enabling cross-client
 * awareness and collaborative features.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import {
  ContextValue,
  ContextScope,
  ContextEvent,
  ContextEventType,
  ClientMetadata,
  GlobalContextSnapshot,
  CrossClientMessage,
  ContextSubscription,
  GlobalContextStats
} from '../types/globalContext';

export class GlobalContextStore extends EventEmitter {
  private contextValues: Map<string, ContextValue>;
  private clients: Map<string, ClientMetadata>;
  private subscriptions: Map<string, ContextSubscription>;
  private eventHistory: ContextEvent[];
  private maxEventHistory: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(maxEventHistory: number = 1000) {
    super();
    this.contextValues = new Map();
    this.clients = new Map();
    this.subscriptions = new Map();
    this.eventHistory = [];
    this.maxEventHistory = maxEventHistory;

    // Start cleanup interval for expired values
    this.cleanupInterval = setInterval(() => this.cleanupExpiredValues(), 60000); // 1 minute

    logger.info('Global context store initialized');
  }

  /**
   * Register a client
   */
  registerClient(clientId: string, metadata?: Partial<ClientMetadata>): void {
    const clientMetadata: ClientMetadata = {
      clientId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      ...metadata
    };

    this.clients.set(clientId, clientMetadata);

    // Emit client connected event
    this.emitEvent({
      type: ContextEventType.CLIENT_CONNECTED,
      timestamp: new Date(),
      clientId,
      data: { metadata: clientMetadata }
    });

    logger.info('Client registered', { clientId, metadata });
  }

  /**
   * Unregister a client
   */
  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);

    // Remove client's subscriptions
    for (const [subId, sub] of this.subscriptions.entries()) {
      if (sub.clientId === clientId) {
        this.subscriptions.delete(subId);
      }
    }

    // Emit client disconnected event
    this.emitEvent({
      type: ContextEventType.CLIENT_DISCONNECTED,
      timestamp: new Date(),
      clientId
    });

    logger.info('Client unregistered', { clientId });
  }

  /**
   * Update client activity
   */
  updateClientActivity(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastActivity = new Date();
    }
  }

  /**
   * Set context value
   */
  set(
    key: string,
    value: any,
    clientId: string,
    scope: ContextScope = ContextScope.PERSONAL,
    metadata?: ContextValue['metadata']
  ): ContextValue {
    this.updateClientActivity(clientId);

    const existing = this.contextValues.get(key);
    const now = new Date();

    const contextValue: ContextValue = {
      key,
      value,
      scope,
      clientId: scope === ContextScope.PERSONAL ? clientId : undefined,
      sharedWith: scope === ContextScope.SHARED ? metadata?.sharedWith : undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || clientId,
      metadata
    };

    this.contextValues.set(key, contextValue);

    // Emit event
    this.emitEvent({
      type: existing ? ContextEventType.UPDATED : ContextEventType.CREATED,
      timestamp: now,
      clientId,
      contextValue,
      oldValue: existing?.value
    });

    logger.debug('Context value set', { key, scope, clientId });

    return contextValue;
  }

  /**
   * Get context value
   */
  get(key: string, clientId: string): ContextValue | undefined {
    this.updateClientActivity(clientId);

    const value = this.contextValues.get(key);

    if (!value) {
      return undefined;
    }

    // Check access permissions
    if (!this.hasAccess(value, clientId)) {
      logger.warn('Access denied to context value', { key, clientId, scope: value.scope });
      return undefined;
    }

    return value;
  }

  /**
   * Delete context value
   */
  delete(key: string, clientId: string): boolean {
    this.updateClientActivity(clientId);

    const value = this.contextValues.get(key);

    if (!value) {
      return false;
    }

    // Only creator or global scope can delete
    if (value.scope === ContextScope.PERSONAL && value.clientId !== clientId) {
      logger.warn('Access denied to delete context value', { key, clientId });
      return false;
    }

    this.contextValues.delete(key);

    // Emit event
    this.emitEvent({
      type: ContextEventType.DELETED,
      timestamp: new Date(),
      clientId,
      contextValue: value
    });

    logger.debug('Context value deleted', { key, clientId });

    return true;
  }

  /**
   * Get all values accessible to a client
   */
  getAll(clientId: string, scope?: ContextScope): ContextValue[] {
    this.updateClientActivity(clientId);

    const values: ContextValue[] = [];

    for (const value of this.contextValues.values()) {
      // Filter by scope if specified
      if (scope && value.scope !== scope) {
        continue;
      }

      // Check access
      if (this.hasAccess(value, clientId)) {
        values.push(value);
      }
    }

    return values;
  }

  /**
   * Search context values by key pattern
   */
  search(pattern: string, clientId: string): ContextValue[] {
    this.updateClientActivity(clientId);

    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const values: ContextValue[] = [];

    for (const value of this.contextValues.values()) {
      if (regex.test(value.key) && this.hasAccess(value, clientId)) {
        values.push(value);
      }
    }

    return values;
  }

  /**
   * Check if client has access to context value
   */
  private hasAccess(value: ContextValue, clientId: string): boolean {
    switch (value.scope) {
      case ContextScope.GLOBAL:
        return true;

      case ContextScope.PERSONAL:
        return value.clientId === clientId;

      case ContextScope.SHARED:
        return value.sharedWith?.includes(clientId) || value.createdBy === clientId;

      default:
        return false;
    }
  }

  /**
   * Send message to other client(s)
   */
  sendMessage(
    from: string,
    to: string | string[],
    message: string,
    data?: Record<string, any>
  ): CrossClientMessage {
    this.updateClientActivity(from);

    const msg: CrossClientMessage = {
      id: randomUUID(),
      from,
      to,
      message,
      timestamp: new Date(),
      delivered: false,
      data
    };

    // Emit message event
    this.emitEvent({
      type: ContextEventType.MESSAGE,
      timestamp: msg.timestamp,
      clientId: from,
      message,
      targetClients: Array.isArray(to) ? to : [to],
      data: { messageId: msg.id, ...data }
    });

    logger.info('Cross-client message sent', {
      from,
      to,
      messageId: msg.id
    });

    return msg;
  }

  /**
   * Subscribe to context changes
   */
  subscribe(
    clientId: string,
    keyPattern: string,
    callback: (event: ContextEvent) => void,
    scope?: ContextScope
  ): string {
    const subId = randomUUID();

    const subscription: ContextSubscription = {
      id: subId,
      clientId,
      keyPattern,
      scope,
      callback
    };

    this.subscriptions.set(subId, subscription);

    logger.debug('Context subscription created', {
      subId,
      clientId,
      keyPattern,
      scope
    });

    return subId;
  }

  /**
   * Unsubscribe from context changes
   */
  unsubscribe(subscriptionId: string): boolean {
    const result = this.subscriptions.delete(subscriptionId);

    if (result) {
      logger.debug('Context subscription removed', { subscriptionId });
    }

    return result;
  }

  /**
   * Emit a context event
   */
  private emitEvent(event: ContextEvent): void {
    // Add to history
    this.eventHistory.push(event);

    // Trim history if needed
    if (this.eventHistory.length > this.maxEventHistory) {
      this.eventHistory.shift();
    }

    // Emit to event emitter
    this.emit('context_event', event);

    // Notify subscriptions
    for (const sub of this.subscriptions.values()) {
      // Check if event matches subscription
      if (this.matchesSubscription(event, sub)) {
        try {
          sub.callback(event);
        } catch (error) {
          logger.error('Subscription callback error', {
            subId: sub.id,
            error
          });
        }
      }
    }
  }

  /**
   * Check if event matches subscription
   */
  private matchesSubscription(
    event: ContextEvent,
    sub: ContextSubscription
  ): boolean {
    // Check scope filter
    if (sub.scope && event.contextValue?.scope !== sub.scope) {
      return false;
    }

    // Check key pattern
    if (event.contextValue) {
      const regex = new RegExp(sub.keyPattern.replace(/\*/g, '.*'));
      return regex.test(event.contextValue.key);
    }

    return false;
  }

  /**
   * Clean up expired context values
   */
  private cleanupExpiredValues(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [key, value] of this.contextValues.entries()) {
      if (value.metadata?.expiresAt && value.metadata.expiresAt < now) {
        this.contextValues.delete(key);
        cleaned++;

        logger.debug('Expired context value cleaned up', { key });
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up expired context values', { count: cleaned });
    }
  }

  /**
   * Get snapshot of global context
   */
  getSnapshot(): GlobalContextSnapshot {
    return {
      globalValues: Array.from(this.contextValues.values()).filter(
        v => v.scope === ContextScope.GLOBAL
      ),
      activeClients: Array.from(this.clients.keys()),
      clientMetadata: new Map(this.clients),
      timestamp: new Date()
    };
  }

  /**
   * Get active clients
   */
  getActiveClients(): ClientMetadata[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get client metadata
   */
  getClient(clientId: string): ClientMetadata | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get event history
   */
  getEventHistory(limit?: number): ContextEvent[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * Get statistics
   */
  getStats(): GlobalContextStats {
    const valuesByScope = {
      personal: 0,
      global: 0,
      shared: 0
    };

    for (const value of this.contextValues.values()) {
      valuesByScope[value.scope]++;
    }

    // Rough memory usage estimate
    const memoryUsage = JSON.stringify(Array.from(this.contextValues.values())).length;

    return {
      totalValues: this.contextValues.size,
      valuesByScope,
      activeClients: this.clients.size,
      totalEvents: this.eventHistory.length,
      activeSubscriptions: this.subscriptions.size,
      memoryUsage
    };
  }

  /**
   * Clear all context (for testing/reset)
   */
  clear(): void {
    this.contextValues.clear();
    this.eventHistory = [];

    logger.warn('Global context cleared');
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    logger.info('Global context store shut down');
  }
}
