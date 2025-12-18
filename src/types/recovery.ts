/**
 * Error Recovery and Self-Healing Type Definitions
 */

export enum RecoveryStrategy {
  /** Retry the operation with exponential backoff */
  RETRY = 'retry',

  /** Use cached/fallback data */
  FALLBACK = 'fallback',

  /** Skip the failed component and continue */
  SKIP = 'skip',

  /** Restart the component */
  RESTART = 'restart',

  /** Switch to degraded mode */
  DEGRADE = 'degrade',

  /** Manual intervention required */
  MANUAL = 'manual'
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface RecoveryAction {
  /** Unique action ID */
  id: string;

  /** Strategy to use */
  strategy: RecoveryStrategy;

  /** Component that failed */
  component: string;

  /** Error that triggered recovery */
  error: Error;

  /** When the action was initiated */
  timestamp: Date;

  /** Recovery attempt number */
  attemptNumber: number;

  /** Maximum retry attempts */
  maxAttempts: number;

  /** Execute the recovery action */
  execute: () => Promise<RecoveryResult>;
}

export interface RecoveryResult {
  /** Whether recovery was successful */
  success: boolean;

  /** New health status after recovery */
  newStatus: HealthStatus;

  /** Message describing the outcome */
  message: string;

  /** Additional details */
  details?: string;

  /** Error if recovery failed */
  error?: Error;
}

export interface ComponentHealth {
  /** Component name */
  component: string;

  /** Current health status */
  status: HealthStatus;

  /** Last check timestamp */
  lastCheck: Date;

  /** Consecutive failure count */
  consecutiveFailures: number;

  /** Is component in degraded mode */
  degradedMode: boolean;

  /** Recovery actions in progress */
  activeRecovery?: RecoveryAction;

  /** Last successful check */
  lastSuccess?: Date;

  /** Error history (last 10) */
  errorHistory: Array<{
    error: Error;
    timestamp: Date;
    recovered: boolean;
  }>;
}

export interface Alert {
  /** Unique alert ID */
  id: string;

  /** Alert severity */
  severity: AlertSeverity;

  /** Component that triggered alert */
  component: string;

  /** Alert title */
  title: string;

  /** Alert message */
  message: string;

  /** When alert was created */
  timestamp: Date;

  /** Whether alert has been acknowledged */
  acknowledged: boolean;

  /** When alert was acknowledged */
  acknowledgedAt?: Date;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface HealthMonitorConfig {
  /** How often to run health checks (ms) */
  checkInterval: number;

  /** Failure threshold before triggering recovery */
  failureThreshold: number;

  /** Enable automatic recovery */
  autoRecover: boolean;

  /** Enable degraded mode */
  enableDegradedMode: boolean;

  /** Components to monitor */
  monitoredComponents: string[];

  /** Alert thresholds */
  alertThresholds: {
    warningAfter: number;  // failures
    errorAfter: number;    // failures
    criticalAfter: number; // failures
  };
}

export interface RecoveryMetrics {
  /** Total recovery attempts */
  totalAttempts: number;

  /** Successful recoveries */
  successfulRecoveries: number;

  /** Failed recoveries */
  failedRecoveries: number;

  /** Components currently in degraded mode */
  degradedComponents: string[];

  /** Active alerts */
  activeAlerts: number;

  /** Average recovery time (ms) */
  avgRecoveryTime: number;
}
