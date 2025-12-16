/**
 * Agent System Type Definitions
 *
 * This module defines types for the agent execution engine, including
 * task planning, execution tracking, permissions, and audit logging.
 */

/**
 * Permission levels for tool execution
 */
export enum PermissionLevel {
  /** Auto-approve execution (read-only operations) */
  AUTO_APPROVE = 'auto_approve',

  /** Require user confirmation (state-changing operations) */
  REQUIRE_CONFIRMATION = 'require_confirmation',

  /** Admin-only operations (dangerous/destructive) */
  ADMIN_ONLY = 'admin_only'
}

/**
 * Execution step status
 */
export enum ExecutionStatus {
  /** Step not yet started */
  PENDING = 'pending',

  /** Step currently executing */
  RUNNING = 'running',

  /** Step completed successfully */
  COMPLETED = 'completed',

  /** Step failed with error */
  FAILED = 'failed',

  /** Step cancelled by user */
  CANCELLED = 'cancelled',

  /** Step waiting for user permission */
  AWAITING_PERMISSION = 'awaiting_permission'
}

/**
 * Audit event types
 */
export enum AuditEventType {
  QUERY_RECEIVED = 'query_received',
  PLAN_CREATED = 'plan_created',
  TOOL_EXECUTED = 'tool_executed',
  PERMISSION_REQUESTED = 'permission_requested',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_DENIED = 'permission_denied',
  CONTEXT_SHARED = 'context_shared',
  EXECUTION_STARTED = 'execution_started',
  EXECUTION_COMPLETED = 'execution_completed',
  EXECUTION_FAILED = 'execution_failed',
  PLUGIN_REGISTERED = 'plugin_registered',
  PLUGIN_FAILED = 'plugin_failed'
}

/**
 * Single execution step in a plan
 */
export interface ExecutionStep {
  /** Unique step identifier */
  id: string;

  /** Tool name to execute */
  toolName: string;

  /** Human-readable description of what this step does */
  description: string;

  /** Parameters to pass to the tool */
  parameters: Record<string, any>;

  /** Step IDs that must complete before this step can run */
  dependencies: string[];

  /** Whether this step requires user permission */
  requiresPermission: boolean;

  /** Estimated duration in milliseconds */
  estimatedDuration?: number;

  /** Whether this step can run in parallel with others */
  parallelizable: boolean;
}

/**
 * Complete execution plan for a query
 */
export interface ExecutionPlan {
  /** Unique plan identifier */
  id: string;

  /** Original user query */
  originalQuery: string;

  /** Execution steps */
  steps: ExecutionStep[];

  /** Estimated total duration in milliseconds */
  estimatedTotalDuration: number;

  /** Whether any step requires user permission */
  requiresUserPermission: boolean;

  /** When plan was created */
  createdAt: Date;
}

/**
 * Execution tracking for a single step
 */
export interface StepExecution {
  /** The step being executed */
  step: ExecutionStep;

  /** Current status */
  status: ExecutionStatus;

  /** When execution started */
  startedAt?: Date;

  /** When execution completed */
  completedAt?: Date;

  /** Result if completed */
  result?: any;

  /** Error if failed */
  error?: Error;

  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Progress update for WebSocket streaming
 */
export interface ProgressUpdate {
  /** When this update occurred */
  timestamp: Date;

  /** Progress message */
  message: string;

  /** Related step ID */
  stepId?: string;

  /** Progress percentage (0-100) */
  percentage: number;
}

/**
 * Complete plan execution tracking
 */
export interface PlanExecution {
  /** Plan ID */
  planId: string;

  /** Client ID executing the plan */
  clientId: string;

  /** Overall execution status */
  status: ExecutionStatus;

  /** Step executions */
  stepExecutions: Map<string, StepExecution>;

  /** Results by step ID */
  results: Map<string, any>;

  /** When execution started */
  startedAt: Date;

  /** When execution completed */
  completedAt?: Date;

  /** Progress updates sent to client */
  progressUpdates: ProgressUpdate[];
}

/**
 * Final execution result
 */
export interface ExecutionResult {
  /** Whether execution was successful */
  success: boolean;

  /** Final answer to user */
  finalAnswer: string;

  /** Results from each step */
  stepResults: Map<string, any>;

  /** Total execution duration in milliseconds */
  duration: number;

  /** Tools that were used */
  toolsUsed: string[];
}

/**
 * Permission request
 */
export interface PermissionRequest {
  /** Unique request ID */
  id: string;

  /** Client requesting permission */
  clientId: string;

  /** Step ID requiring permission */
  stepId: string;

  /** Tool name */
  toolName: string;

  /** Human-readable description of what will happen */
  description: string;

  /** Parameters for the operation */
  parameters: Record<string, any>;

  /** Permission level required */
  level: PermissionLevel;

  /** When request was made */
  requestedAt: Date;

  /** When request expires */
  expiresAt: Date;
}

/**
 * Permission response from user
 */
export interface PermissionResponse {
  /** Request ID */
  requestId: string;

  /** Whether user approved */
  approved: boolean;

  /** When user responded */
  respondedAt: Date;

  /** Optional reason for denial */
  reason?: string;
}

/**
 * Audit log entry
 */
export interface AuditEntry {
  /** Unique entry ID */
  id: string;

  /** When event occurred */
  timestamp: Date;

  /** Client ID */
  clientId: string;

  /** User ID (future) */
  userId?: string;

  /** Event type */
  eventType: AuditEventType;

  /** Event data */
  data: Record<string, any>;

  /** Correlation ID for linking related events */
  correlationId?: string;
}

/**
 * Audit query criteria
 */
export interface AuditQueryCriteria {
  /** Filter by client ID */
  clientId?: string;

  /** Filter by event type */
  eventType?: AuditEventType;

  /** Filter by correlation ID */
  correlationId?: string;

  /** Start time */
  startTime?: Date;

  /** End time */
  endTime?: Date;

  /** Max results */
  limit?: number;
}

/**
 * Context entry for cross-client sharing
 */
export interface ContextEntry {
  /** Unique entry ID */
  id: string;

  /** Source client ID */
  sourceClientId: string;

  /** When context was created */
  timestamp: Date;

  /** Context topic */
  topic: string;

  /** Context content */
  content: string;

  /** Relevance score (0-1) */
  relevanceScore: number;

  /** Tags for categorization */
  tags: string[];

  /** When context expires */
  expiresAt?: Date;

  /** Additional metadata */
  metadata: Record<string, any>;
}

/**
 * Relevance match result
 */
export interface RelevanceMatch {
  /** The matching context entry */
  entry: ContextEntry;

  /** Relevance score for this query (0-1) */
  relevanceScore: number;

  /** Reason for match */
  reason: string;
}

/**
 * Planning context passed to agent planner
 */
export interface PlanningContext {
  /** Client ID */
  clientId: string;

  /** Conversation history */
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;

  /** Relevant memories */
  memories: Array<{
    topic: string;
    content: string;
    importance: number;
  }>;

  /** Cross-client context */
  globalContext: RelevanceMatch[];

  /** Available tool names */
  availableTools: string[];
}

/**
 * System health status
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown'
}

/**
 * Tool health check result
 */
export interface ToolHealthCheck {
  /** Tool name */
  toolName: string;

  /** Overall health status */
  status: HealthStatus;

  /** Last check timestamp */
  lastChecked: Date;

  /** Response time in milliseconds */
  responseTime?: number;

  /** Error message if unhealthy */
  error?: string;

  /** Additional details */
  details?: Record<string, any>;
}

/**
 * Plugin health status
 */
export interface PluginHealthStatus {
  /** Plugin ID */
  pluginId: string;

  /** Plugin name */
  pluginName: string;

  /** Overall health */
  status: HealthStatus;

  /** Tool health checks */
  tools: ToolHealthCheck[];

  /** Last health check */
  lastChecked: Date;

  /** Is plugin currently available */
  available: boolean;
}

/**
 * System capability description
 */
export interface CapabilityDescription {
  /** Category name */
  category: string;

  /** Health status */
  status: HealthStatus;

  /** Available tools in this category */
  tools: Array<{
    name: string;
    description: string;
    requiresSetup: boolean;
    configured: boolean;
  }>;

  /** Configuration requirements if not fully available */
  requirements?: string[];
}

/**
 * Knowledge boundary description
 */
export interface KnowledgeBoundary {
  /** Domain/topic */
  domain: string;

  /** Whether Pace has access to this domain */
  hasAccess: boolean;

  /** What data is available */
  availableData?: string[];

  /** What would be needed for access */
  requirements?: string[];

  /** Related memories or context */
  relatedInfo?: string[];
}

/**
 * Meta-query types for self-awareness
 */
export enum MetaQueryType {
  CAPABILITY_LIST = 'capability_list',
  SYSTEM_STATUS = 'system_status',
  TOOL_HEALTH = 'tool_health',
  KNOWLEDGE_BOUNDARY = 'knowledge_boundary',
  WHAT_CAN_YOU_DO = 'what_can_you_do',
  PLUGIN_INFO = 'plugin_info'
}

/**
 * Task state for concurrent execution tracking
 */
export enum TaskState {
  /** Task created but not started */
  PENDING = 'pending',

  /** Task currently executing */
  ACTIVE = 'active',

  /** Task paused (e.g., waiting for permission or processing context update) */
  PAUSED = 'paused',

  /** Task completed successfully */
  COMPLETED = 'completed',

  /** Task failed with error */
  FAILED = 'failed',

  /** Task cancelled by user or system */
  CANCELLED = 'cancelled'
}

/**
 * Active task tracking for concurrent execution
 */
export interface ActiveTask {
  /** Unique task identifier */
  taskId: string;

  /** Client ID */
  clientId: string;

  /** Original user query */
  query: string;

  /** Current task state */
  state: TaskState;

  /** Execution plan ID */
  planId?: string;

  /** Plan execution tracker */
  execution?: PlanExecution;

  /** When task was created */
  createdAt: Date;

  /** When task started execution */
  startedAt?: Date;

  /** When task completed */
  completedAt?: Date;

  /** Context updates received during execution */
  contextUpdates: ContextUpdate[];

  /** Task topic/category for relevance matching */
  topic?: string;

  /** Promise for background execution */
  executionPromise?: Promise<ExecutionResult>;
}

/**
 * Context update from user during task execution
 */
export interface ContextUpdate {
  /** Update ID */
  id: string;

  /** Task this update applies to */
  taskId: string;

  /** New user message */
  message: string;

  /** When update was received */
  timestamp: Date;

  /** Whether this update was processed */
  processed: boolean;

  /** How the update affected the plan */
  impact?: 'plan_modified' | 'no_change' | 'task_cancelled';
}
