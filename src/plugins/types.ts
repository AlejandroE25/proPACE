/**
 * Plugin System Types
 *
 * Type definitions for the plugin architecture that enables extensible
 * monitoring and automation capabilities.
 */

import { EventBus } from '../events/eventBus';
import { DataPipeline } from '../data/dataPipeline';

/**
 * Plugin lifecycle states
 */
export enum PluginState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error'
}

/**
 * Plugin capabilities/categories
 */
export enum PluginCapability {
  MONITORING = 'monitoring',      // Passive monitoring (sensors, logs)
  AUTOMATION = 'automation',       // Active automation (lights, locks)
  COMMUNICATION = 'communication', // External communication (email, SMS)
  INTEGRATION = 'integration',     // Third-party integrations (calendar, weather)
  INTERFACE = 'interface'          // User interface (voice, camera)
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  enabled: boolean;
  pollInterval?: number;  // Polling interval in ms (for polling-based plugins)
  settings?: Record<string, any>;  // Plugin-specific settings
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  capability: PluginCapability;
  dependencies?: string[];  // IDs of required plugins
}

/**
 * Plugin health status
 */
export interface PluginHealth {
  pluginId: string;
  state: PluginState;
  healthy: boolean;
  lastCheck: Date;
  errorCount: number;
  uptime: number;  // Milliseconds since start
  message?: string;
}

/**
 * Base plugin interface
 * All plugins must implement this interface
 */
export interface Plugin {
  /**
   * Plugin metadata
   */
  readonly metadata: PluginMetadata;

  /**
   * Current plugin state
   */
  readonly state: PluginState;

  /**
   * Initialize the plugin with dependencies
   */
  initialize(eventBus: EventBus, dataPipeline: DataPipeline, config: PluginConfig): Promise<void>;

  /**
   * Start the plugin (begin monitoring/automation)
   */
  start(): Promise<void>;

  /**
   * Stop the plugin (cleanup resources)
   */
  stop(): Promise<void>;

  /**
   * Get plugin health status
   */
  getHealth(): PluginHealth;

  /**
   * Update plugin configuration
   */
  updateConfig(config: Partial<PluginConfig>): Promise<void>;
}

/**
 * Monitoring plugin interface
 * For plugins that continuously monitor external systems
 */
export interface MonitoringPlugin extends Plugin {
  /**
   * Poll for updates (called at pollInterval)
   */
  poll(): Promise<void>;
}

/**
 * Plugin registration info
 */
export interface PluginRegistration {
  plugin: Plugin;
  config: PluginConfig;
  registeredAt: Date;
}

/**
 * Plugin manager statistics
 */
export interface PluginManagerStats {
  totalPlugins: number;
  runningPlugins: number;
  erroredPlugins: number;
  stoppedPlugins: number;
}
