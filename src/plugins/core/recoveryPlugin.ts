/**
 * Recovery Plugin
 *
 * Provides tools for Pace to monitor system health, view alerts,
 * and trigger recovery actions.
 */

import {
  Plugin,
  PluginMetadata,
  PluginTool,
  PluginCapability,
  ExecutionContext,
  ToolResult
} from '../../types/plugin';
import { ErrorRecoveryManager } from '../../agent/errorRecoveryManager';
import { HealthMonitor } from '../../agent/healthMonitor';
import { HealthStatus, AlertSeverity } from '../../types/recovery';
import { logger } from '../../utils/logger';

export class RecoveryPlugin implements Plugin {
  readonly metadata: PluginMetadata = {
    id: 'pace.core.recovery',
    name: 'Recovery Plugin',
    version: '1.0.0',
    description: 'System health monitoring, alerts, and error recovery capabilities',
    author: 'PACE Core Team',
    tags: ['recovery', 'health', 'monitoring', 'alerts']
  };

  private recoveryManager?: ErrorRecoveryManager;
  private healthMonitor?: HealthMonitor;

  tools: PluginTool[] = [
    {
      name: 'get_system_health',
      description: 'Get overall system health status and component health details',
      category: 'recovery',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.getSystemHealth.bind(this)
    },
    {
      name: 'get_component_health',
      description: 'Get health status for a specific component',
      category: 'recovery',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'component',
          type: 'string',
          description: 'Component name (e.g., "weather_tool", "plugin_registry")',
          required: true
        }
      ],
      execute: this.getComponentHealth.bind(this)
    },
    {
      name: 'get_active_alerts',
      description: 'Get all active (unacknowledged) alerts',
      category: 'recovery',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.getActiveAlerts.bind(this)
    },
    {
      name: 'acknowledge_alert',
      description: 'Acknowledge an alert to mark it as seen',
      category: 'recovery',
      capabilities: [PluginCapability.STATE_CHANGING],
      parameters: [
        {
          name: 'alert_id',
          type: 'string',
          description: 'The ID of the alert to acknowledge',
          required: true
        }
      ],
      execute: this.acknowledgeAlert.bind(this)
    },
    {
      name: 'get_recovery_metrics',
      description: 'Get recovery system metrics and statistics',
      category: 'recovery',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.getRecoveryMetrics.bind(this)
    },
    {
      name: 'trigger_health_check',
      description: 'Manually trigger an immediate health check',
      category: 'recovery',
      capabilities: [PluginCapability.STATE_CHANGING],
      parameters: [],
      execute: this.triggerHealthCheck.bind(this)
    },
    {
      name: 'reset_component',
      description: 'Reset a component\'s health status and clear its alerts',
      category: 'recovery',
      capabilities: [PluginCapability.STATE_CHANGING],
      parameters: [
        {
          name: 'component',
          type: 'string',
          description: 'Component name to reset',
          required: true
        }
      ],
      execute: this.resetComponent.bind(this)
    }
  ];

  async initialize(_config: Record<string, any>): Promise<void> {
    logger.info('Recovery plugin initialized');
  }

  /**
   * Set recovery manager and health monitor
   */
  setRecoverySystem(
    recoveryManager: ErrorRecoveryManager,
    healthMonitor: HealthMonitor
  ): void {
    this.recoveryManager = recoveryManager;
    this.healthMonitor = healthMonitor;
  }

  async shutdown(): Promise<void> {
    logger.info('Recovery plugin shut down');
  }

  /**
   * Get overall system health
   */
  private async getSystemHealth(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.recoveryManager) {
      return {
        success: false,
        error: 'Recovery manager not initialized'
      };
    }

    try {
      const overallHealth = this.recoveryManager.getOverallHealth();
      const allHealth = this.recoveryManager.getAllHealth();

      // Format output
      let output = `**Overall System Health: ${this.formatHealthStatus(overallHealth)}**\n\n`;
      output += '**Component Status:**\n';

      for (const health of allHealth) {
        const icon = this.getHealthIcon(health.status);
        const degradedFlag = health.degradedMode ? ' [DEGRADED MODE]' : '';

        output += `${icon} **${health.component}:**${degradedFlag}\n`;
        output += `  Status: ${health.status}\n`;
        output += `  Consecutive Failures: ${health.consecutiveFailures}\n`;

        if (health.lastSuccess) {
          const timeSince = Date.now() - health.lastSuccess.getTime();
          output += `  Last Success: ${this.formatTimeSince(timeSince)} ago\n`;
        }

        if (health.errorHistory.length > 0) {
          const recentErrors = health.errorHistory.slice(-3);
          output += `  Recent Errors: ${recentErrors.length}\n`;
        }

        output += '\n';
      }

      return {
        success: true,
        data: {
          overallHealth,
          components: allHealth,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error getting system health:', error);
      return {
        success: false,
        error: `Failed to get system health: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get component health
   */
  private async getComponentHealth(
    params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.recoveryManager) {
      return {
        success: false,
        error: 'Recovery manager not initialized'
      };
    }

    const component = params.component as string;

    if (!component) {
      return {
        success: false,
        error: 'component parameter is required'
      };
    }

    try {
      const health = this.recoveryManager.getComponentHealth(component);

      if (!health) {
        return {
          success: false,
          error: `Component '${component}' not found`
        };
      }

      // Format output
      let output = `**Component: ${health.component}**\n\n`;
      output += `Status: ${this.getHealthIcon(health.status)} ${health.status}\n`;
      output += `Degraded Mode: ${health.degradedMode ? 'YES' : 'NO'}\n`;
      output += `Consecutive Failures: ${health.consecutiveFailures}\n`;
      output += `Last Check: ${health.lastCheck.toISOString()}\n`;

      if (health.lastSuccess) {
        output += `Last Success: ${health.lastSuccess.toISOString()}\n`;
      }

      if (health.activeRecovery) {
        output += `\n**Active Recovery:**\n`;
        output += `  Strategy: ${health.activeRecovery.strategy}\n`;
        output += `  Attempt: ${health.activeRecovery.attemptNumber}/${health.activeRecovery.maxAttempts}\n`;
      }

      if (health.errorHistory.length > 0) {
        output += `\n**Recent Errors:**\n`;
        for (const err of health.errorHistory.slice(-5)) {
          const recoveredFlag = err.recovered ? '✓' : '✗';
          output += `  ${recoveredFlag} ${err.error.message} (${err.timestamp.toISOString()})\n`;
        }
      }

      return {
        success: true,
        data: {
          health,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error getting component health:', error);
      return {
        success: false,
        error: `Failed to get component health: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get active alerts
   */
  private async getActiveAlerts(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.recoveryManager) {
      return {
        success: false,
        error: 'Recovery manager not initialized'
      };
    }

    try {
      const alerts = this.recoveryManager.getActiveAlerts();

      if (alerts.length === 0) {
        return {
          success: true,
          data: {
            alerts: [],
            count: 0,
            formatted: '**No active alerts** - All systems normal'
          }
        };
      }

      // Format output
      let output = `**Active Alerts (${alerts.length})**\n\n`;

      for (const alert of alerts) {
        const icon = this.getAlertIcon(alert.severity);

        output += `${icon} **${alert.title}**\n`;
        output += `  ID: ${alert.id}\n`;
        output += `  Component: ${alert.component}\n`;
        output += `  Severity: ${alert.severity}\n`;
        output += `  Message: ${alert.message}\n`;
        output += `  Time: ${alert.timestamp.toISOString()}\n`;

        if (alert.metadata) {
          output += `  Details: ${JSON.stringify(alert.metadata)}\n`;
        }

        output += '\n';
      }

      return {
        success: true,
        data: {
          alerts,
          count: alerts.length,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error getting active alerts:', error);
      return {
        success: false,
        error: `Failed to get active alerts: ${(error as Error).message}`
      };
    }
  }

  /**
   * Acknowledge alert
   */
  private async acknowledgeAlert(
    params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.recoveryManager) {
      return {
        success: false,
        error: 'Recovery manager not initialized'
      };
    }

    const alertId = params.alert_id as string;

    if (!alertId) {
      return {
        success: false,
        error: 'alert_id parameter is required'
      };
    }

    try {
      const acknowledged = this.recoveryManager.acknowledgeAlert(alertId);

      if (!acknowledged) {
        return {
          success: false,
          error: `Alert '${alertId}' not found`
        };
      }

      return {
        success: true,
        data: {
          alertId,
          acknowledged: true,
          formatted: `✓ Alert ${alertId} acknowledged`
        }
      };
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      return {
        success: false,
        error: `Failed to acknowledge alert: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get recovery metrics
   */
  private async getRecoveryMetrics(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.recoveryManager) {
      return {
        success: false,
        error: 'Recovery manager not initialized'
      };
    }

    try {
      const metrics = this.recoveryManager.getMetrics();

      // Format output
      let output = '**Recovery System Metrics**\n\n';
      output += `Total Recovery Attempts: ${metrics.totalAttempts}\n`;
      output += `Successful: ${metrics.successfulRecoveries}\n`;
      output += `Failed: ${metrics.failedRecoveries}\n`;

      if (metrics.totalAttempts > 0) {
        const successRate = ((metrics.successfulRecoveries / metrics.totalAttempts) * 100).toFixed(1);
        output += `Success Rate: ${successRate}%\n`;
      }

      output += `\nAverage Recovery Time: ${metrics.avgRecoveryTime.toFixed(0)}ms\n`;
      output += `Active Alerts: ${metrics.activeAlerts}\n`;

      if (metrics.degradedComponents.length > 0) {
        output += `\n**Components in Degraded Mode:**\n`;
        for (const component of metrics.degradedComponents) {
          output += `  • ${component}\n`;
        }
      } else {
        output += `\nNo components in degraded mode\n`;
      }

      return {
        success: true,
        data: {
          metrics,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error getting recovery metrics:', error);
      return {
        success: false,
        error: `Failed to get recovery metrics: ${(error as Error).message}`
      };
    }
  }

  /**
   * Trigger health check
   */
  private async triggerHealthCheck(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.healthMonitor) {
      return {
        success: false,
        error: 'Health monitor not initialized'
      };
    }

    try {
      logger.info('Manual health check triggered via recovery plugin');
      await this.healthMonitor.checkNow();

      return {
        success: true,
        data: {
          message: 'Health check completed',
          formatted: '✓ Health check completed successfully'
        }
      };
    } catch (error) {
      logger.error('Error triggering health check:', error);
      return {
        success: false,
        error: `Failed to trigger health check: ${(error as Error).message}`
      };
    }
  }

  /**
   * Reset component
   */
  private async resetComponent(
    params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.recoveryManager) {
      return {
        success: false,
        error: 'Recovery manager not initialized'
      };
    }

    const component = params.component as string;

    if (!component) {
      return {
        success: false,
        error: 'component parameter is required'
      };
    }

    try {
      const reset = this.recoveryManager.resetComponent(component);

      if (!reset) {
        return {
          success: false,
          error: `Component '${component}' not found`
        };
      }

      return {
        success: true,
        data: {
          component,
          reset: true,
          formatted: `✓ Component ${component} reset successfully`
        }
      };
    } catch (error) {
      logger.error('Error resetting component:', error);
      return {
        success: false,
        error: `Failed to reset component: ${(error as Error).message}`
      };
    }
  }

  /**
   * Helper: Format health status
   */
  private formatHealthStatus(status: HealthStatus): string {
    const icon = this.getHealthIcon(status);
    return `${icon} ${status.toUpperCase()}`;
  }

  /**
   * Helper: Get health icon
   */
  private getHealthIcon(status: HealthStatus): string {
    switch (status) {
      case HealthStatus.HEALTHY:
        return '✓';
      case HealthStatus.DEGRADED:
        return '⚠️';
      case HealthStatus.UNHEALTHY:
        return '✗';
      case HealthStatus.CRITICAL:
        return '🔴';
      default:
        return '?';
    }
  }

  /**
   * Helper: Get alert icon
   */
  private getAlertIcon(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.INFO:
        return 'ℹ️';
      case AlertSeverity.WARNING:
        return '⚠️';
      case AlertSeverity.ERROR:
        return '✗';
      case AlertSeverity.CRITICAL:
        return '🔴';
      default:
        return '?';
    }
  }

  /**
   * Helper: Format time since
   */
  private formatTimeSince(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }
}
