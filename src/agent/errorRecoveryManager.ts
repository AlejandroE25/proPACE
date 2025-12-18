/**
 * Error Recovery Manager
 *
 * Handles automatic error recovery, self-healing, and degraded mode operation.
 * Monitors component health and takes corrective actions when failures occur.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import {
  RecoveryStrategy,
  RecoveryAction,
  RecoveryResult,
  ComponentHealth,
  HealthStatus,
  Alert,
  AlertSeverity,
  RecoveryMetrics
} from '../types/recovery';

export class ErrorRecoveryManager extends EventEmitter {
  private componentHealth: Map<string, ComponentHealth>;
  private activeAlerts: Map<string, Alert>;
  private recoveryHistory: Array<{
    action: RecoveryAction;
    result: RecoveryResult;
    timestamp: Date;
  }>;
  private failureThreshold: number;
  private autoRecover: boolean;

  constructor(
    failureThreshold: number = 3,
    autoRecover: boolean = true
  ) {
    super();
    this.componentHealth = new Map();
    this.activeAlerts = new Map();
    this.recoveryHistory = [];
    this.failureThreshold = failureThreshold;
    this.autoRecover = autoRecover;

    logger.info('Error recovery manager initialized', {
      failureThreshold,
      autoRecover
    });
  }

  /**
   * Register a component for health monitoring
   */
  registerComponent(component: string): void {
    if (this.componentHealth.has(component)) {
      logger.warn(`Component ${component} already registered`);
      return;
    }

    this.componentHealth.set(component, {
      component,
      status: HealthStatus.HEALTHY,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      degradedMode: false,
      errorHistory: []
    });

    logger.info(`Registered component for health monitoring: ${component}`);
  }

  /**
   * Record a component failure
   */
  async recordFailure(
    component: string,
    error: Error,
    context?: Record<string, any>
  ): Promise<RecoveryResult | null> {
    let health = this.componentHealth.get(component);

    if (!health) {
      // Auto-register unknown components
      this.registerComponent(component);
      health = this.componentHealth.get(component)!;
    }

    // Update health record
    health.consecutiveFailures++;
    health.lastCheck = new Date();
    health.errorHistory.push({
      error,
      timestamp: new Date(),
      recovered: false
    });

    // Keep only last 10 errors
    if (health.errorHistory.length > 10) {
      health.errorHistory.shift();
    }

    logger.error(`Component failure recorded: ${component}`, {
      error: error.message,
      consecutiveFailures: health.consecutiveFailures,
      context
    });

    // Update health status
    const oldStatus = health.status;
    health.status = this.calculateHealthStatus(health.consecutiveFailures);

    // Emit health status change
    if (oldStatus !== health.status) {
      this.emit('health_status_changed', {
        component,
        oldStatus,
        newStatus: health.status,
        failures: health.consecutiveFailures
      });
    }

    // Create alert if threshold exceeded
    if (health.consecutiveFailures >= this.failureThreshold) {
      this.createAlert(
        component,
        AlertSeverity.ERROR,
        'Component Failure Threshold Exceeded',
        `Component ${component} has failed ${health.consecutiveFailures} times consecutively`,
        { error: error.message, context }
      );
    }

    // Attempt automatic recovery if enabled
    if (this.autoRecover && health.consecutiveFailures >= this.failureThreshold) {
      return await this.attemptRecovery(component, error);
    }

    return null;
  }

  /**
   * Record a successful component operation
   */
  recordSuccess(component: string): void {
    const health = this.componentHealth.get(component);

    if (!health) {
      this.registerComponent(component);
      return;
    }

    // Mark last error as recovered if there was one
    if (health.errorHistory.length > 0) {
      health.errorHistory[health.errorHistory.length - 1].recovered = true;
    }

    health.consecutiveFailures = 0;
    health.lastSuccess = new Date();
    health.lastCheck = new Date();
    health.status = HealthStatus.HEALTHY;
    health.degradedMode = false;

    logger.debug(`Component success recorded: ${component}`);
  }

  /**
   * Attempt automatic recovery
   */
  async attemptRecovery(
    component: string,
    error: Error
  ): Promise<RecoveryResult> {
    const health = this.componentHealth.get(component);
    if (!health) {
      return {
        success: false,
        newStatus: HealthStatus.UNHEALTHY,
        message: 'Component not registered',
        error: new Error('Component not found')
      };
    }

    // Determine recovery strategy
    const strategy = this.selectRecoveryStrategy(component, health);

    const action: RecoveryAction = {
      id: randomUUID(),
      strategy,
      component,
      error,
      timestamp: new Date(),
      attemptNumber: health.consecutiveFailures,
      maxAttempts: 5,
      execute: async () => this.executeRecoveryStrategy(strategy, component)
    };

    health.activeRecovery = action;

    logger.info(`Attempting recovery for ${component}`, {
      strategy,
      attemptNumber: action.attemptNumber
    });

    this.emit('recovery_started', {
      component,
      strategy,
      attemptNumber: action.attemptNumber
    });

    try {
      const result = await action.execute();

      // Update health based on result
      if (result.success) {
        health.consecutiveFailures = 0;
        health.status = result.newStatus;
        health.activeRecovery = undefined;

        logger.info(`Recovery successful for ${component}`, {
          strategy,
          newStatus: result.newStatus
        });

        this.emit('recovery_succeeded', {
          component,
          strategy,
          result
        });
      } else {
        logger.warn(`Recovery failed for ${component}`, {
          strategy,
          error: result.error?.message
        });

        this.emit('recovery_failed', {
          component,
          strategy,
          result
        });
      }

      // Store in history
      this.recoveryHistory.push({
        action,
        result,
        timestamp: new Date()
      });

      // Keep only last 100 recovery attempts
      if (this.recoveryHistory.length > 100) {
        this.recoveryHistory.shift();
      }

      return result;
    } catch (recoveryError) {
      const result: RecoveryResult = {
        success: false,
        newStatus: HealthStatus.UNHEALTHY,
        message: 'Recovery execution failed',
        error: recoveryError as Error
      };

      health.activeRecovery = undefined;

      logger.error(`Recovery execution error for ${component}`, {
        error: recoveryError
      });

      this.emit('recovery_failed', {
        component,
        strategy,
        result
      });

      return result;
    }
  }

  /**
   * Select appropriate recovery strategy
   */
  private selectRecoveryStrategy(
    component: string,
    health: ComponentHealth
  ): RecoveryStrategy {
    // Critical components should try restart
    if (component.includes('plugin_registry') || component.includes('orchestrator')) {
      return RecoveryStrategy.RESTART;
    }

    // Tools should fall back to cached data or skip
    if (component.includes('tool') || component.includes('plugin')) {
      // After 3 failures, enter degraded mode
      if (health.consecutiveFailures >= 3) {
        return RecoveryStrategy.DEGRADE;
      }
      return RecoveryStrategy.FALLBACK;
    }

    // Default: retry with backoff
    return RecoveryStrategy.RETRY;
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecoveryStrategy(
    strategy: RecoveryStrategy,
    component: string
  ): Promise<RecoveryResult> {
    const health = this.componentHealth.get(component)!;

    switch (strategy) {
      case RecoveryStrategy.RETRY:
        // Exponential backoff: wait before considering retry
        const backoffMs = Math.min(1000 * Math.pow(2, health.consecutiveFailures - 1), 30000);
        logger.info(`Will retry ${component} after ${backoffMs}ms backoff`);

        await new Promise(resolve => setTimeout(resolve, backoffMs));

        return {
          success: true,
          newStatus: HealthStatus.DEGRADED,
          message: `Retry scheduled with ${backoffMs}ms backoff`,
          details: 'Next operation will be retried'
        };

      case RecoveryStrategy.FALLBACK:
        logger.info(`Using fallback/cached data for ${component}`);

        return {
          success: true,
          newStatus: HealthStatus.DEGRADED,
          message: 'Switched to fallback mode',
          details: 'Will use cached data when available'
        };

      case RecoveryStrategy.SKIP:
        logger.info(`Skipping failed component: ${component}`);

        return {
          success: true,
          newStatus: HealthStatus.DEGRADED,
          message: 'Component skipped',
          details: 'Operations will continue without this component'
        };

      case RecoveryStrategy.DEGRADE:
        health.degradedMode = true;
        logger.warn(`Component ${component} entering degraded mode`);

        this.createAlert(
          component,
          AlertSeverity.WARNING,
          'Component Degraded',
          `${component} is operating in degraded mode`,
          { consecutiveFailures: health.consecutiveFailures }
        );

        return {
          success: true,
          newStatus: HealthStatus.DEGRADED,
          message: 'Entered degraded mode',
          details: 'Component will operate with reduced functionality'
        };

      case RecoveryStrategy.RESTART:
        logger.warn(`Component restart would be attempted: ${component}`);

        // In a real system, this would restart the component
        // For now, we'll simulate success after a delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        return {
          success: true,
          newStatus: HealthStatus.HEALTHY,
          message: 'Component restart simulated',
          details: 'In production, this would restart the component'
        };

      case RecoveryStrategy.MANUAL:
        this.createAlert(
          component,
          AlertSeverity.CRITICAL,
          'Manual Intervention Required',
          `Component ${component} requires manual intervention`,
          { consecutiveFailures: health.consecutiveFailures }
        );

        return {
          success: false,
          newStatus: HealthStatus.CRITICAL,
          message: 'Manual intervention required',
          details: 'Administrator action needed'
        };

      default:
        return {
          success: false,
          newStatus: health.status,
          message: 'Unknown recovery strategy',
          error: new Error(`Unknown strategy: ${strategy}`)
        };
    }
  }

  /**
   * Calculate health status based on failure count
   */
  private calculateHealthStatus(failures: number): HealthStatus {
    if (failures === 0) return HealthStatus.HEALTHY;
    if (failures < 3) return HealthStatus.DEGRADED;
    if (failures < 5) return HealthStatus.UNHEALTHY;
    return HealthStatus.CRITICAL;
  }

  /**
   * Create an alert
   */
  private createAlert(
    component: string,
    severity: AlertSeverity,
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): Alert {
    const alert: Alert = {
      id: randomUUID(),
      severity,
      component,
      title,
      message,
      timestamp: new Date(),
      acknowledged: false,
      metadata
    };

    this.activeAlerts.set(alert.id, alert);

    logger.warn(`Alert created: ${title}`, {
      alertId: alert.id,
      component,
      severity
    });

    this.emit('alert_created', alert);

    return alert;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);

    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();

    logger.info(`Alert acknowledged: ${alertId}`);

    this.emit('alert_acknowledged', alert);

    return true;
  }

  /**
   * Get component health
   */
  getComponentHealth(component: string): ComponentHealth | undefined {
    return this.componentHealth.get(component);
  }

  /**
   * Get all component health statuses
   */
  getAllHealth(): ComponentHealth[] {
    return Array.from(this.componentHealth.values());
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter(a => !a.acknowledged);
  }

  /**
   * Get all alerts (including acknowledged)
   */
  getAllAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get recovery metrics
   */
  getMetrics(): RecoveryMetrics {
    const total = this.recoveryHistory.length;
    const successful = this.recoveryHistory.filter(h => h.result.success).length;
    const failed = total - successful;

    const degradedComponents = Array.from(this.componentHealth.values())
      .filter(h => h.degradedMode)
      .map(h => h.component);

    const activeAlerts = this.getActiveAlerts().length;

    // Calculate average recovery time
    const avgRecoveryTime = total > 0
      ? this.recoveryHistory.reduce((sum, h) => {
          const duration = h.timestamp.getTime() - h.action.timestamp.getTime();
          return sum + duration;
        }, 0) / total
      : 0;

    return {
      totalAttempts: total,
      successfulRecoveries: successful,
      failedRecoveries: failed,
      degradedComponents,
      activeAlerts,
      avgRecoveryTime
    };
  }

  /**
   * Check if component is in degraded mode
   */
  isComponentDegraded(component: string): boolean {
    const health = this.componentHealth.get(component);
    return health?.degradedMode ?? false;
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): HealthStatus {
    const healths = Array.from(this.componentHealth.values());

    if (healths.length === 0) {
      return HealthStatus.HEALTHY;
    }

    // If any component is critical, system is critical
    if (healths.some(h => h.status === HealthStatus.CRITICAL)) {
      return HealthStatus.CRITICAL;
    }

    // If any component is unhealthy, system is unhealthy
    if (healths.some(h => h.status === HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }

    // If any component is degraded, system is degraded
    if (healths.some(h => h.status === HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * Clear all alerts for a component
   */
  clearComponentAlerts(component: string): number {
    let cleared = 0;

    for (const [id, alert] of this.activeAlerts.entries()) {
      if (alert.component === component) {
        this.activeAlerts.delete(id);
        cleared++;
      }
    }

    logger.info(`Cleared ${cleared} alerts for component ${component}`);

    return cleared;
  }

  /**
   * Reset component health
   */
  resetComponent(component: string): boolean {
    const health = this.componentHealth.get(component);

    if (!health) {
      return false;
    }

    health.consecutiveFailures = 0;
    health.status = HealthStatus.HEALTHY;
    health.degradedMode = false;
    health.activeRecovery = undefined;
    health.errorHistory = [];

    this.clearComponentAlerts(component);

    logger.info(`Component health reset: ${component}`);

    this.emit('component_reset', { component });

    return true;
  }
}
