/**
 * Agent Orchestrator Types
 *
 * Type definitions for system orchestration, component coordination,
 * and health monitoring.
 */

import { DecisionRule } from '../decision/types';
import { AutonomyLevel, RiskLevel } from '../decision/types';

/**
 * System state
 */
export enum SystemState {
  INITIALIZING = 'initializing',
  STARTING = 'starting',
  RUNNING = 'running',
  DEGRADED = 'degraded',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * Component health status
 */
export interface ComponentHealth {
  healthy: boolean;
  state: string;
  errorCount: number;
  lastError?: string;
  lastErrorTime?: Date;
  metrics?: Record<string, any>;
}

/**
 * System health status
 */
export interface SystemHealth {
  state: SystemState;
  healthy: boolean;
  uptime: number; // milliseconds
  components: {
    eventBus: ComponentHealth;
    dataPipeline: ComponentHealth;
    pluginManager: ComponentHealth;
    decisionEngine: ComponentHealth;
  };
  metrics: SystemMetrics;
  errors: ErrorSummary[];
}

/**
 * System performance metrics
 */
export interface SystemMetrics {
  eventsProcessedPerSecond: number;
  dataPointsIngestedPerSecond: number;
  decisionsPerMinute: number;
  averageLatencyMs: number;
  uptime: number; // milliseconds
}

/**
 * Error summary
 */
export interface ErrorSummary {
  component: string;
  message: string;
  timestamp: Date;
  count: number;
}

/**
 * Plugin configuration map
 */
export interface PluginConfigMap {
  [pluginId: string]: {
    enabled: boolean;
    pollInterval?: number;
    settings?: Record<string, any>;
  };
}

/**
 * Decision engine configuration
 */
export interface DecisionEngineConfig {
  defaultAutonomyLevel: AutonomyLevel;
  maxRiskLevel: RiskLevel;
  approvalTimeoutMs: number;
}

/**
 * Agent orchestrator configuration
 */
export interface AgentOrchestratorConfig {
  // Storage paths
  dataStoragePath: string;
  eventStorePath: string;

  // Decision engine config
  decisionEngine: DecisionEngineConfig;

  // Plugin configurations
  plugins: PluginConfigMap;

  // Decision rules
  rules: DecisionRule[];

  // Health monitoring
  healthCheckIntervalMs: number;
  errorThreshold: number;
}

/**
 * Component lifecycle interface
 */
export interface LifecycleComponent {
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Component with health reporting
 */
export interface HealthReportingComponent extends LifecycleComponent {
  getHealth(): ComponentHealth;
}
