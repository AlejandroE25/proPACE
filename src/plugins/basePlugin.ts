/**
 * Base Plugin Implementation
 *
 * Provides common functionality for all plugins including lifecycle management,
 * health monitoring, error tracking, and polling (for MonitoringPlugins).
 */

import { EventBus } from '../events/eventBus';
import { DataPipeline } from '../data/dataPipeline';
import { Event } from '../events/types';
import { SensorReading } from '../data/types';
import {
  Plugin,
  MonitoringPlugin,
  PluginConfig,
  PluginState,
  PluginMetadata,
  PluginHealth
} from './types';

export abstract class BasePlugin implements Plugin, MonitoringPlugin {
  public readonly metadata: PluginMetadata;
  private _state: PluginState;
  private _config?: PluginConfig;
  private _eventBus?: EventBus;
  private _dataPipeline?: DataPipeline;
  private _startTime?: Date;
  private _errorCount: number;
  private _lastError?: Error;
  private _pollInterval?: NodeJS.Timeout;

  constructor(metadata: PluginMetadata) {
    this.metadata = metadata;
    this._state = PluginState.STOPPED;
    this._errorCount = 0;
  }

  /**
   * Current plugin state
   */
  get state(): PluginState {
    return this._state;
  }

  /**
   * Initialize the plugin
   */
  async initialize(eventBus: EventBus, dataPipeline: DataPipeline, config: PluginConfig): Promise<void> {
    this._eventBus = eventBus;
    this._dataPipeline = dataPipeline;
    this._config = config;
    this._state = PluginState.STOPPED;
  }

  /**
   * Start the plugin
   */
  async start(): Promise<void> {
    if (this._state === PluginState.RUNNING) {
      throw new Error(`Plugin ${this.metadata.id} is already running`);
    }

    try {
      this._state = PluginState.STARTING;
      this._startTime = new Date();
      this._errorCount = 0;
      this._lastError = undefined;

      // Call subclass start logic
      await this.onStart();

      this._state = PluginState.RUNNING;

      // Start polling if configured
      if (this._config?.pollInterval) {
        this._startPolling();
      }
    } catch (error) {
      this._state = PluginState.ERROR;
      this._lastError = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  /**
   * Stop the plugin
   */
  async stop(): Promise<void> {
    if (this._state !== PluginState.RUNNING) {
      throw new Error(`Plugin ${this.metadata.id} is not running`);
    }

    try {
      this._state = PluginState.STOPPING;

      // Stop polling
      this._stopPolling();

      // Call subclass stop logic
      await this.onStop();

      this._state = PluginState.STOPPED;
    } catch (error) {
      this._state = PluginState.ERROR;
      this._lastError = error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  /**
   * Get plugin health
   */
  getHealth(): PluginHealth {
    const uptime = this._startTime ? Date.now() - this._startTime.getTime() : 0;

    return {
      pluginId: this.metadata.id,
      state: this._state,
      healthy: this._state === PluginState.RUNNING && this._errorCount < 10,
      lastCheck: new Date(),
      errorCount: this._errorCount,
      uptime,
      message: this._lastError?.message
    };
  }

  /**
   * Update plugin configuration
   */
  async updateConfig(config: Partial<PluginConfig>): Promise<void> {
    const wasRunning = this._state === PluginState.RUNNING;

    // Update stored config
    this._config = {
      ...this._config!,
      ...config
    };

    // If running and poll interval changed, restart polling
    if (wasRunning && config.pollInterval !== undefined) {
      this._stopPolling();
      await this.stop();
      await this.start();
    }
  }

  /**
   * Poll for updates (for MonitoringPlugins)
   * Subclasses should override this method
   */
  async poll(): Promise<void> {
    // Default implementation does nothing
    // Subclasses override this for their specific polling logic
  }

  /**
   * Start polling at configured interval
   */
  private _startPolling(): void {
    if (!this._config?.pollInterval) {
      return;
    }

    this._pollInterval = setInterval(async () => {
      try {
        await this.poll();
      } catch (error) {
        this.recordError(error instanceof Error ? error : new Error(String(error)));
      }
    }, this._config.pollInterval);
  }

  /**
   * Stop polling
   */
  private _stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = undefined;
    }
  }

  /**
   * Record an error
   */
  protected recordError(error: Error): void {
    this._errorCount++;
    this._lastError = error;
  }

  /**
   * Publish an event to the EventBus
   */
  protected async publishEvent(event: Event): Promise<void> {
    if (!this._eventBus) {
      throw new Error('Plugin not initialized');
    }
    await this._eventBus.publish(event);
  }

  /**
   * Ingest sensor data via DataPipeline
   */
  protected async ingestData(reading: SensorReading): Promise<void> {
    if (!this._dataPipeline) {
      throw new Error('Plugin not initialized');
    }
    await this._dataPipeline.ingest(reading);
  }

  /**
   * Get EventBus instance (for subclasses)
   */
  protected get eventBus(): EventBus {
    if (!this._eventBus) {
      throw new Error('Plugin not initialized');
    }
    return this._eventBus;
  }

  /**
   * Get DataPipeline instance (for subclasses)
   */
  protected get dataPipeline(): DataPipeline {
    if (!this._dataPipeline) {
      throw new Error('Plugin not initialized');
    }
    return this._dataPipeline;
  }

  /**
   * Get plugin configuration (for subclasses)
   */
  protected get config(): PluginConfig {
    if (!this._config) {
      throw new Error('Plugin not initialized');
    }
    return this._config;
  }

  /**
   * Called when plugin starts (subclasses override this)
   */
  protected abstract onStart(): Promise<void>;

  /**
   * Called when plugin stops (subclasses override this)
   */
  protected abstract onStop(): Promise<void>;
}
