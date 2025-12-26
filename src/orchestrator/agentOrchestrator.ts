/**
 * Agent Orchestrator
 *
 * Central coordinator for the autonomous proPACE system.
 * Manages lifecycle, health monitoring, and component coordination.
 */

import { EventBus } from '../events/eventBus';
import { EventStore } from '../events/eventStore';
import { DataPipeline } from '../data/dataPipeline';
import { DataStorage } from '../data/dataStorage';
import { PluginManager } from '../plugins/pluginManager';
import { DecisionEngine } from '../decision/decisionEngine';
import { TemperatureSensorPlugin } from '../plugins/sensors/temperatureSensorPlugin';
import {
  SystemState,
  SystemHealth,
  SystemMetrics,
  ComponentHealth,
  ErrorSummary,
  AgentOrchestratorConfig
} from './types';

/**
 * Agent Orchestrator
 * Coordinates all system components
 */
export class AgentOrchestrator {
  private config: AgentOrchestratorConfig;
  private state: SystemState;
  private startTime?: Date;

  // Core components
  private eventStore: EventStore;
  private eventBus: EventBus;
  private dataStorage: DataStorage;
  private dataPipeline: DataPipeline;
  private pluginManager: PluginManager;
  private decisionEngine: DecisionEngine;

  // Health monitoring
  private healthCheckInterval?: NodeJS.Timeout;
  private errors: ErrorSummary[];
  // @ts-ignore - Reserved for future health check tracking
  private lastHealthCheck?: Date;

  // Metrics tracking
  private metricsSnapshot: {
    eventsProcessed: number;
    dataPointsIngested: number;
    decisionsMade: number;
    lastSnapshotTime: number;
  };

  constructor(config: AgentOrchestratorConfig) {
    if (!config) {
      throw new Error('Configuration is required');
    }

    this.config = config;
    this.state = SystemState.STOPPED;
    this.errors = [];

    this.metricsSnapshot = {
      eventsProcessed: 0,
      dataPointsIngested: 0,
      decisionsMade: 0,
      lastSnapshotTime: Date.now()
    };

    // Initialize core components (but don't start them yet)
    this.eventStore = new EventStore(config.eventStorePath);
    this.eventBus = new EventBus(this.eventStore);
    this.dataStorage = new DataStorage(config.dataStoragePath);
    this.dataPipeline = new DataPipeline(this.dataStorage, this.eventBus);
    this.pluginManager = new PluginManager(this.eventBus, this.dataPipeline);
    this.decisionEngine = new DecisionEngine(this.eventBus, {
      ...config.decisionEngine
    });
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    try {
      this.state = SystemState.INITIALIZING;

      // Components are already constructed, just configure them

      // Load decision rules
      for (const rule of this.config.rules) {
        this.decisionEngine.addRule(rule);
      }

      // Register plugins
      for (const [pluginId, pluginConfig] of Object.entries(this.config.plugins)) {
        if (!pluginConfig.enabled) {
          continue;
        }

        // Create plugin instance based on ID
        if (pluginId === 'temperature-sensor') {
          const plugin = new TemperatureSensorPlugin(pluginConfig.settings as any || {});
          await this.pluginManager.register(plugin, {
            enabled: true,
            pollInterval: pluginConfig.pollInterval || 30000,
            settings: pluginConfig.settings
          });
        }
        // Additional plugins would be registered here
      }

      this.state = SystemState.STOPPED;
    } catch (err) {
      this.state = SystemState.ERROR;
      this.recordError('orchestrator', err);
      throw err;
    }
  }

  /**
   * Start all components
   */
  async start(): Promise<void> {
    try {
      this.state = SystemState.STARTING;
      this.startTime = new Date();

      // Start components in dependency order
      // EventBus is already constructed, just mark it ready
      // (EventBus starts automatically when events are published)

      // Start DataPipeline
      // (DataPipeline doesn't need explicit start, it's always ready)

      // Start PluginManager and all plugins
      await this.pluginManager.startAll();

      // Start DecisionEngine
      await this.decisionEngine.start();

      // Start health monitoring
      this.startHealthMonitoring();

      this.state = SystemState.RUNNING;
    } catch (err) {
      this.state = SystemState.ERROR;
      this.recordError('orchestrator', err);
      throw err;
    }
  }

  /**
   * Shutdown all components
   */
  async shutdown(): Promise<void> {
    try {
      this.state = SystemState.STOPPING;

      // Stop health monitoring
      this.stopHealthMonitoring();

      // Stop components in reverse order
      await this.decisionEngine.shutdown();
      await this.pluginManager.shutdown();

      // Shutdown EventBus (waits for pending events)
      await this.eventBus.shutdown();

      // Close storage
      this.dataStorage.close();
      this.eventStore.close();

      this.state = SystemState.STOPPED;
      this.startTime = undefined;
    } catch (err) {
      this.state = SystemState.ERROR;
      this.recordError('orchestrator', err);
      throw err;
    }
  }

  /**
   * Get current system state
   */
  getState(): SystemState {
    return this.state;
  }

  /**
   * Get system health
   */
  getHealth(): SystemHealth {
    const now = Date.now();
    const uptime = this.startTime ? now - this.startTime.getTime() : 0;

    // Get component health
    const eventBusHealth = this.getEventBusHealth();
    const dataPipelineHealth = this.getDataPipelineHealth();
    const pluginManagerHealth = this.getPluginManagerHealth();
    const decisionEngineHealth = this.getDecisionEngineHealth();

    // Calculate metrics
    const metrics = this.calculateMetrics();

    // Determine overall health
    const allHealthy =
      eventBusHealth.healthy &&
      dataPipelineHealth.healthy &&
      pluginManagerHealth.healthy &&
      decisionEngineHealth.healthy;

    const anyUnhealthy =
      !eventBusHealth.healthy ||
      !dataPipelineHealth.healthy ||
      !pluginManagerHealth.healthy ||
      !decisionEngineHealth.healthy;

    // Adjust state based on component health
    let currentState = this.state;
    if (this.state === SystemState.RUNNING && anyUnhealthy) {
      currentState = SystemState.DEGRADED;
    }

    return {
      state: currentState,
      healthy: allHealthy,
      uptime,
      components: {
        eventBus: eventBusHealth,
        dataPipeline: dataPipelineHealth,
        pluginManager: pluginManagerHealth,
        decisionEngine: decisionEngineHealth
      },
      metrics,
      errors: this.getRecentErrors(10)
    };
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    this.lastHealthCheck = new Date();

    // Health status is available via getHealth() for logging/alerting if needed

    // Check error threshold
    const recentErrors = this.getRecentErrors(100);
    if (recentErrors.length >= this.config.errorThreshold) {
      // Consider shutting down or alerting
      // For now, just log
    }

    // Additional health check logic could go here
  }

  /**
   * Get EventBus health
   */
  private getEventBusHealth(): ComponentHealth {
    try {
      // EventBus doesn't have a built-in health method
      // Check if it's in a good state
      const isShutdown = (this.eventBus as any).isShutdown;

      // EventBus is healthy if it's not shut down, or if we're in STOPPED state (initialized but not started)
      const isHealthy = !isShutdown || this.state === SystemState.STOPPED || this.state === SystemState.INITIALIZING;

      return {
        healthy: isHealthy,
        state: isShutdown ? 'shutdown' : (this.state === SystemState.RUNNING ? 'running' : 'stopped'),
        errorCount: this.getComponentErrorCount('eventBus')
      };
    } catch (err) {
      return {
        healthy: false,
        state: 'error',
        errorCount: this.getComponentErrorCount('eventBus'),
        lastError: String(err),
        lastErrorTime: new Date()
      };
    }
  }

  /**
   * Get DataPipeline health
   */
  private getDataPipelineHealth(): ComponentHealth {
    try {
      // DataPipeline doesn't have health method
      // Check if storage is accessible
      // DataPipeline is healthy if initialized (doesn't need to be running)
      const isHealthy = this.state !== SystemState.ERROR;

      return {
        healthy: isHealthy,
        state: this.state === SystemState.RUNNING ? 'running' : 'stopped',
        errorCount: this.getComponentErrorCount('dataPipeline')
      };
    } catch (err) {
      return {
        healthy: false,
        state: 'error',
        errorCount: this.getComponentErrorCount('dataPipeline'),
        lastError: String(err),
        lastErrorTime: new Date()
      };
    }
  }

  /**
   * Get PluginManager health
   */
  private getPluginManagerHealth(): ComponentHealth {
    try {
      const stats = this.pluginManager.getStatistics();
      const healthyPlugins = stats.runningPlugins;
      const totalPlugins = stats.totalPlugins;

      // PluginManager is healthy if:
      // - No plugins registered (totalPlugins === 0)
      // - At least one plugin is running (healthyPlugins > 0)
      // - No plugins are errored (erroredPlugins === 0)
      const isHealthy = (totalPlugins === 0) || (healthyPlugins > 0) || (stats.erroredPlugins === 0);

      return {
        healthy: isHealthy,
        state: 'running',
        errorCount: this.getComponentErrorCount('pluginManager'),
        metrics: {
          totalPlugins,
          healthyPlugins,
          erroredPlugins: stats.erroredPlugins
        }
      };
    } catch (err) {
      return {
        healthy: false,
        state: 'error',
        errorCount: this.getComponentErrorCount('pluginManager'),
        lastError: String(err),
        lastErrorTime: new Date()
      };
    }
  }

  /**
   * Get DecisionEngine health
   */
  private getDecisionEngineHealth(): ComponentHealth {
    try {
      const stats = this.decisionEngine.getStatistics();

      return {
        healthy: true,
        state: 'running',
        errorCount: this.getComponentErrorCount('decisionEngine'),
        metrics: stats
      };
    } catch (err) {
      return {
        healthy: false,
        state: 'error',
        errorCount: this.getComponentErrorCount('decisionEngine'),
        lastError: String(err),
        lastErrorTime: new Date()
      };
    }
  }

  /**
   * Calculate system metrics
   */
  private calculateMetrics(): SystemMetrics {
    const now = Date.now();
    const timeDelta = (now - this.metricsSnapshot.lastSnapshotTime) / 1000; // seconds

    // Get current counts (with error handling)
    let decisionStats;
    let eventsProcessed = 0;
    let dataPointsIngested = 0;

    try {
      decisionStats = this.decisionEngine.getStatistics();
    } catch {
      decisionStats = {
        totalDecisions: this.metricsSnapshot.decisionsMade
      };
    }

    try {
      eventsProcessed = (this.eventBus as any).eventsProcessed || 0;
    } catch {
      eventsProcessed = this.metricsSnapshot.eventsProcessed;
    }

    try {
      // Get total count across all sensors (pass empty string to count all)
      const stmt = (this.dataStorage as any).db.prepare('SELECT COUNT(*) as count FROM sensor_readings');
      const row = stmt.get() as any;
      dataPointsIngested = row.count || 0;
    } catch {
      dataPointsIngested = this.metricsSnapshot.dataPointsIngested;
    }

    // Calculate rates
    const eventsProcessedPerSecond = timeDelta > 0
      ? (eventsProcessed - this.metricsSnapshot.eventsProcessed) / timeDelta
      : 0;

    const dataPointsIngestedPerSecond = timeDelta > 0
      ? (dataPointsIngested - this.metricsSnapshot.dataPointsIngested) / timeDelta
      : 0;

    const decisionsPerMinute = timeDelta > 0
      ? ((decisionStats.totalDecisions - this.metricsSnapshot.decisionsMade) / timeDelta) * 60
      : 0;

    // Update snapshot
    this.metricsSnapshot = {
      eventsProcessed,
      dataPointsIngested,
      decisionsMade: decisionStats.totalDecisions,
      lastSnapshotTime: now
    };

    const uptime = this.startTime ? now - this.startTime.getTime() : 0;

    return {
      eventsProcessedPerSecond,
      dataPointsIngestedPerSecond,
      decisionsPerMinute,
      averageLatencyMs: 0, // TODO: Implement latency tracking
      uptime
    };
  }

  /**
   * Record error
   */
  private recordError(component: string, err: any): void {
    const message = err instanceof Error ? err.message : String(err);

    // Check if error already exists
    const existing = this.errors.find(e => e.component === component && e.message === message);

    if (existing) {
      existing.count++;
      existing.timestamp = new Date();
    } else {
      this.errors.push({
        component,
        message,
        timestamp: new Date(),
        count: 1
      });
    }

    // Limit error history
    if (this.errors.length > 1000) {
      this.errors = this.errors.slice(-500);
    }
  }

  /**
   * Get component error count
   */
  private getComponentErrorCount(component: string): number {
    return this.errors
      .filter(e => e.component === component)
      .reduce((sum, e) => sum + e.count, 0);
  }

  /**
   * Get recent errors
   */
  private getRecentErrors(limit: number): ErrorSummary[] {
    return this.errors.slice(-limit);
  }
}
