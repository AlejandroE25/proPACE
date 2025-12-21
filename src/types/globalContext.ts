/**
 * Global Context Type Definitions
 *
 * Defines types for cross-client awareness and shared context
 */

export enum ContextScope {
  /** Personal context - only visible to this client */
  PERSONAL = 'personal',

  /** Global context - visible to all clients */
  GLOBAL = 'global',

  /** Shared context - visible to specific clients/groups */
  SHARED = 'shared'
}

export enum ContextEventType {
  /** Context value was created */
  CREATED = 'created',

  /** Context value was updated */
  UPDATED = 'updated',

  /** Context value was deleted */
  DELETED = 'deleted',

  /** Client connected */
  CLIENT_CONNECTED = 'client_connected',

  /** Client disconnected */
  CLIENT_DISCONNECTED = 'client_disconnected',

  /** Cross-client message */
  MESSAGE = 'message'
}

export interface ContextValue {
  /** Unique key for this context value */
  key: string;

  /** The actual value */
  value: any;

  /** Scope of this context */
  scope: ContextScope;

  /** Client ID that owns this (for PERSONAL scope) */
  clientId?: string;

  /** Client IDs that can access this (for SHARED scope) */
  sharedWith?: string[];

  /** When this was created */
  createdAt: Date;

  /** When this was last updated */
  updatedAt: Date;

  /** Who created this */
  createdBy: string;

  /** Metadata about this context value */
  metadata?: {
    /** Description of what this represents */
    description?: string;

    /** Tags for categorization */
    tags?: string[];

    /** Time-to-live in milliseconds */
    ttl?: number;

    /** Expiration timestamp */
    expiresAt?: Date;

    /** Additional custom metadata */
    [key: string]: any;
  };
}

export interface GlobalContextSnapshot {
  /** All global context values */
  globalValues: ContextValue[];

  /** Active client IDs */
  activeClients: string[];

  /** Client metadata */
  clientMetadata: Map<string, ClientMetadata>;

  /** Snapshot timestamp */
  timestamp: Date;
}

export interface ClientMetadata {
  /** Client ID */
  clientId: string;

  /** When client connected */
  connectedAt: Date;

  /** Last activity timestamp */
  lastActivity: Date;

  /** User identifier (if authenticated) */
  userId?: string;

  /** Client name/label */
  name?: string;

  /** Custom metadata */
  metadata?: Record<string, any>;
}

export interface ContextEvent {
  /** Event type */
  type: ContextEventType;

  /** Event timestamp */
  timestamp: Date;

  /** Client that triggered this event */
  clientId: string;

  /** Context value affected (if applicable) */
  contextValue?: ContextValue;

  /** Old value (for updates) */
  oldValue?: any;

  /** Message (for MESSAGE events) */
  message?: string;

  /** Target client IDs (for targeted messages) */
  targetClients?: string[];

  /** Additional event data */
  data?: Record<string, any>;
}

export interface CrossClientMessage {
  /** Unique message ID */
  id: string;

  /** Sender client ID */
  from: string;

  /** Recipient client ID(s) */
  to: string | string[];

  /** Message content */
  message: string;

  /** Message type/category */
  type?: string;

  /** When message was sent */
  timestamp: Date;

  /** Whether message was delivered */
  delivered?: boolean;

  /** Additional message data */
  data?: Record<string, any>;
}

export interface ContextSubscription {
  /** Subscription ID */
  id: string;

  /** Client ID that subscribed */
  clientId: string;

  /** Context key pattern (supports wildcards) */
  keyPattern: string;

  /** Scope to watch */
  scope?: ContextScope;

  /** Callback when context changes */
  callback: (event: ContextEvent) => void;
}

export interface GlobalContextStats {
  /** Total context values */
  totalValues: number;

  /** Values by scope */
  valuesByScope: {
    personal: number;
    global: number;
    shared: number;
  };

  /** Active clients */
  activeClients: number;

  /** Total events processed */
  totalEvents: number;

  /** Active subscriptions */
  activeSubscriptions: number;

  /** Memory usage estimate (bytes) */
  memoryUsage: number;
}