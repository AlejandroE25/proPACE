/**
 * Health Monitor
 *
 * Runs periodic health checks on system components and triggers
 * diagnostics to proactively detect and recover from issues.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { SystemDiagnostics, DiagnosticLevel, DiagnosticStatus } from './diagnostics';
import { ErrorRecoveryManager } from './errorRecoveryManager';
import { HealthMonitorConfig } from '../types/recovery';

export class HealthMonitor extends EventEmitter {
  private diagnostics: SystemDiagnostics;
  private recoveryManager: ErrorRecoveryManager;
  private config: HealthMonitorConfig;
  private intervalHandle?: NodeJS.Timeout;
  private isRunning: boolean;

  constructor(
    diagnostics: SystemDiagnostics,
    recoveryManager: ErrorRecoveryManager,
    config?: Partial<HealthMonitorConfig>
  ) {
    super();
    this.diagnostics = diagnostics;
    this.recoveryManager = recoveryManager;
    this.isRunning = false;

    this.config = {
      checkInterval: config?.checkInterval ?? 60000, // 1 minute
      failureThreshold: config?.failureThreshold ?? 3,
      autoRecover: config?.autoRecover ?? true,
      enableDegradedMode: config?.enableDegradedMode ?? true,
      monitoredComponents: config?.monitoredComponents ?? [
        'plugin_registry',
        'weather_tool',
        'news_tool',
        'memory_tools',
        'wolfram_tool'
      ],
      alertThresholds: config?.alertThresholds ?? {
        warningAfter: 1,
        errorAfter: 3,
        criticalAfter: 5
      }
    };

    logger.info('Health monitor initialized', {
      checkInterval: this.config.checkInterval,
      autoRecover: this.config.autoRecover
    });
  }

  /**
   * Start periodic health monitoring
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Health monitor already running');
      return;
    }

    this.isRunning = true;

    logger.info('Starting health monitor', {
      interval: this.config.checkInterval
    });

    // Run initial health check
    this.runHealthCheck();

    // Schedule periodic checks
    this.intervalHandle = setInterval(
      () => this.runHealthCheck(),
      this.config.checkInterval
    );

    this.emit('monitor_started');
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    logger.info('Health monitor stopped');

    this.emit('monitor_stopped');
  }

  /**
   * Run health check
   */
  private async runHealthCheck(): Promise<void> {
    logger.debug('Running periodic health check');

    try {
      // Run quick diagnostics
      const report = await this.diagnostics.runDiagnostics(DiagnosticLevel.QUICK);

      this.emit('health_check_completed', {
        timestamp: report.timestamp,
        summary: report.summary
      });

      // Process each test result
      for (const result of report.results) {
        const component = this.mapTestIdToComponent(result.testId);

        if (result.status === DiagnosticStatus.PASS) {
          // Record success
          this.recoveryManager.recordSuccess(component);
        } else if (result.status === DiagnosticStatus.FAIL) {
          // Record failure and attempt recovery
          const error = result.error || new Error(result.message);
          await this.recoveryManager.recordFailure(component, error, {
            testId: result.testId,
            details: result.details
          });
        } else if (result.status === DiagnosticStatus.WARN) {
          // Warning - don't record as failure but emit event
          this.emit('component_warning', {
            component,
            message: result.message,
            details: result.details
          });
        }
      }

      // Check overall system health
      const overallHealth = this.recoveryManager.getOverallHealth();
      this.emit('health_status', overallHealth);

      logger.debug('Health check complete', {
        overallHealth,
        passed: report.summary.passed,
        failed: report.summary.failed,
        warnings: report.summary.warnings
      });
    } catch (error) {
      logger.error('Health check failed', { error });

      this.emit('health_check_failed', {
        error: error as Error,
        timestamp: new Date()
      });
    }
  }

  /**
   * Map diagnostic test ID to component name
   */
  private mapTestIdToComponent(testId: string): string {
    // Map test IDs to standardized component names
    const mapping: Record<string, string> = {
      'plugin_registry_loaded': 'plugin_registry',
      'weather_tool_available': 'weather_tool',
      'news_tool_available': 'news_tool',
      'memory_tools_available': 'memory_tools',
      'wolfram_tool_available': 'wolfram_tool',
      'tool_parameters_valid': 'tool_validation'
    };

    return mapping[testId] || testId;
  }

  /**
   * Manually trigger a health check
   */
  async checkNow(): Promise<void> {
    logger.info('Manual health check triggered');
    await this.runHealthCheck();
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isRunning: boolean;
    config: HealthMonitorConfig;
    nextCheck?: Date;
  } {
    const nextCheck = this.isRunning && this.intervalHandle
      ? new Date(Date.now() + this.config.checkInterval)
      : undefined;

    return {
      isRunning: this.isRunning,
      config: this.config,
      nextCheck
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<HealthMonitorConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig
    };

    logger.info('Health monitor configuration updated', newConfig);

    // Restart if interval changed and monitor is running
    if (newConfig.checkInterval && this.isRunning) {
      this.stop();
      this.start();
    }
  }
}
