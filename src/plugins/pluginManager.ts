/**
 * Plugin Manager
 *
 * Manages the lifecycle, health monitoring, and dependency resolution
 * of all plugins in the system.
 */

import { EventBus } from '../events/eventBus';
import { DataPipeline } from '../data/dataPipeline';
import {
  Plugin,
  PluginConfig,
  PluginState,
  PluginCapability,
  PluginMetadata,
  PluginHealth,
  PluginRegistration,
  PluginManagerStats
} from './types';

export class PluginManager {
  private eventBus: EventBus;
  private dataPipeline: DataPipeline;
  private plugins: Map<string, PluginRegistration>;

  constructor(eventBus: EventBus, dataPipeline: DataPipeline) {
    this.eventBus = eventBus;
    this.dataPipeline = dataPipeline;
    this.plugins = new Map();
  }

  /**
   * Register a plugin
   */
  async register(plugin: Plugin, config: PluginConfig): Promise<void> {
    const pluginId = plugin.metadata.id;

    // Check if already registered
    if (this.plugins.has(pluginId)) {
      throw new Error(`Plugin ${pluginId} is already registered`);
    }

    // Initialize the plugin
    await plugin.initialize(this.eventBus, this.dataPipeline, config);

    // Store registration
    this.plugins.set(pluginId, {
      plugin,
      config,
      registeredAt: new Date()
    });
  }

  /**
   * Start a plugin
   */
  async startPlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);
    if (!registration) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Check dependencies
    const dependencies = registration.plugin.metadata.dependencies || [];
    for (const depId of dependencies) {
      const depRegistration = this.plugins.get(depId);
      if (!depRegistration) {
        throw new Error(`Plugin ${pluginId} has missing dependencies: ${depId}`);
      }
      if (depRegistration.plugin.state !== PluginState.RUNNING) {
        throw new Error(`Plugin ${pluginId} requires ${depId} to be running`);
      }
    }

    await registration.plugin.start();
  }

  /**
   * Stop a plugin
   */
  async stopPlugin(pluginId: string): Promise<void> {
    const registration = this.plugins.get(pluginId);
    if (!registration) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    try {
      await registration.plugin.stop();
    } catch (error) {
      // Log error but mark plugin as errored
      console.error(`Error stopping plugin ${pluginId}:`, error);
      // Plugin should handle state transition to ERROR in its stop method
    }
  }

  /**
   * Restart a plugin
   */
  async restartPlugin(pluginId: string): Promise<void> {
    await this.stopPlugin(pluginId);
    await this.startPlugin(pluginId);
  }

  /**
   * Start all enabled plugins
   */
  async startAll(): Promise<void> {
    for (const [pluginId, registration] of this.plugins) {
      if (registration.config.enabled) {
        try {
          await this.startPlugin(pluginId);
        } catch (error) {
          console.error(`Failed to start plugin ${pluginId}:`, error);
        }
      }
    }
  }

  /**
   * Get plugin health
   */
  getPluginHealth(pluginId: string): PluginHealth | undefined {
    const registration = this.plugins.get(pluginId);
    if (!registration) {
      return undefined;
    }

    return registration.plugin.getHealth();
  }

  /**
   * Get health for all plugins
   */
  getAllPluginHealth(): PluginHealth[] {
    const health: PluginHealth[] = [];
    for (const registration of this.plugins.values()) {
      health.push(registration.plugin.getHealth());
    }
    return health;
  }

  /**
   * Update plugin configuration
   */
  async updatePluginConfig(pluginId: string, config: Partial<PluginConfig>): Promise<void> {
    const registration = this.plugins.get(pluginId);
    if (!registration) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // Update stored config
    registration.config = {
      ...registration.config,
      ...config
    };

    // Update plugin config
    await registration.plugin.updateConfig(config);

    // If disabled, stop the plugin
    if (config.enabled === false && registration.plugin.state === PluginState.RUNNING) {
      await this.stopPlugin(pluginId);
    }
  }

  /**
   * List all registered plugins
   */
  listPlugins(): PluginMetadata[] {
    const plugins: PluginMetadata[] = [];
    for (const registration of this.plugins.values()) {
      plugins.push(registration.plugin.metadata);
    }
    return plugins;
  }

  /**
   * Get all plugins (full plugin objects)
   */
  getPlugins(): Plugin[] {
    const plugins: Plugin[] = [];
    for (const registration of this.plugins.values()) {
      plugins.push(registration.plugin);
    }
    return plugins;
  }

  /**
   * List plugins by capability
   */
  listPluginsByCapability(capability: PluginCapability): PluginMetadata[] {
    const plugins: PluginMetadata[] = [];
    for (const registration of this.plugins.values()) {
      if (registration.plugin.metadata.capability === capability) {
        plugins.push(registration.plugin.metadata);
      }
    }
    return plugins;
  }

  /**
   * Get plugin by ID
   */
  getPlugin(pluginId: string): PluginMetadata | undefined {
    const registration = this.plugins.get(pluginId);
    if (!registration) {
      return undefined;
    }
    return registration.plugin.metadata;
  }

  /**
   * Get plugin manager statistics
   */
  getStatistics(): PluginManagerStats {
    let runningPlugins = 0;
    let erroredPlugins = 0;
    let stoppedPlugins = 0;

    for (const registration of this.plugins.values()) {
      const state = registration.plugin.state;
      switch (state) {
        case PluginState.RUNNING:
          runningPlugins++;
          break;
        case PluginState.ERROR:
          erroredPlugins++;
          break;
        case PluginState.STOPPED:
          stoppedPlugins++;
          break;
      }
    }

    return {
      totalPlugins: this.plugins.size,
      runningPlugins,
      erroredPlugins,
      stoppedPlugins
    };
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const [pluginId, registration] of this.plugins) {
      if (registration.plugin.state === PluginState.RUNNING) {
        stopPromises.push(
          this.stopPlugin(pluginId).catch(error => {
            console.error(`Error stopping plugin ${pluginId} during shutdown:`, error);
          })
        );
      }
    }

    await Promise.all(stopPromises);
  }
}
