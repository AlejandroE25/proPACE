/**
 * proPACE Main Entry Point
 *
 * Production-ready main entry point with:
 * - Configuration loading
 * - Graceful shutdown handling
 * - Signal handlers
 * - Error recovery
 */

import { AgentOrchestrator } from './orchestrator/agentOrchestrator';
import { ConfigLoader, ConfigFile } from './config/productionConfig';
import { SystemState } from './orchestrator/types';
import { ApiServer } from './api/apiServer';
import { DataRetentionService } from './data/dataRetention';
import { initializeLogger, Logger } from './utils/productionLogger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global orchestrator instance
 */
let orchestrator: AgentOrchestrator | null = null;
let apiServer: ApiServer | null = null;
let dataRetention: DataRetentionService | null = null;
let config: ConfigFile | null = null;

/**
 * Shutdown flag to prevent multiple shutdowns
 */
let isShuttingDown = false;

/**
 * Initialize the system
 */
async function initialize(): Promise<void> {
  console.log('🚀 proPACE v2.0 - Autonomous Personal Assistant');
  console.log('==============================================\n');

  try {
    // Load configuration
    console.log('📋 Loading configuration...');
    const configPath = process.argv[2]; // Optional config file path
    config = await ConfigLoader.load(configPath);
    console.log(`✓ Configuration loaded (environment: ${config.environment})\n`);

    // Initialize logger
    console.log('📝 Initializing logger...');
    initializeLogger(config);
    Logger.info('proPACE starting', { environment: config.environment, version: config.version });
    console.log('✓ Logger initialized\n');

    // Ensure storage directories exist
    ensureDirectories(config);

    // Create orchestrator
    console.log('🔧 Initializing Agent Orchestrator...');
    const orchestratorConfig = ConfigLoader.toOrchestratorConfig(config);
    orchestrator = new AgentOrchestrator(orchestratorConfig);

    // Initialize components
    await orchestrator.initialize();
    console.log('✓ Components initialized\n');

    // Start the system
    console.log('▶️  Starting system...');
    await orchestrator.start();
    console.log('✓ System started successfully\n');

    // Start API server
    if (config.api?.enabled) {
      console.log('🌐 Starting API server...');
      const eventBus = (orchestrator as any).eventBus;
      apiServer = new ApiServer(orchestrator, config, eventBus);
      await apiServer.start();
      console.log(`✓ API server available at http://${config.api.host}:${config.api.port}\n`);
    }

    // Start data retention
    if (config.dataRetention?.enabled) {
      console.log('🗑️  Starting data retention service...');
      const dataStorage = (orchestrator as any).dataStorage;
      const eventStore = (orchestrator as any).eventStore;
      dataRetention = new DataRetentionService(config.dataRetention);
      dataRetention.initialize(dataStorage, eventStore);
      dataRetention.start();
      console.log('✓ Data retention service started\n');
    }

    // Display health status
    displayHealthStatus();

    // Setup periodic health monitoring
    if (config.monitoring.healthCheckIntervalMs > 0) {
      setInterval(() => {
        displayHealthStatus();
      }, config.monitoring.healthCheckIntervalMs);
    }

    console.log('✅ proPACE is now running');
    console.log('Press Ctrl+C to shutdown gracefully\n');

  } catch (error) {
    console.error('❌ Failed to initialize proPACE:', error);
    process.exit(1);
  }
}

/**
 * Ensure storage directories exist
 */
function ensureDirectories(config: ConfigFile): void {
  const paths = [
    config.storage.dataPath,
    config.storage.eventPath
  ];

  // Add log directory if file logging is enabled
  if (config.logging?.file?.enabled && config.logging.file.path) {
    paths.push(config.logging.file.path);
  }

  for (const filePath of paths) {
    // Skip :memory: databases
    if (filePath === ':memory:') {
      continue;
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      console.log(`  Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Display current health status
 */
function displayHealthStatus(): void {
  if (!orchestrator) {
    return;
  }

  const health = orchestrator.getHealth();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 System Health Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`State: ${getStateIcon(health.state)} ${health.state.toUpperCase()}`);
  console.log(`Overall Health: ${health.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  console.log(`Uptime: ${formatUptime(health.uptime)}`);
  console.log();

  console.log('Components:');
  console.log(`  EventBus:       ${getHealthIcon(health.components.eventBus)} ${health.components.eventBus.state}`);
  console.log(`  DataPipeline:   ${getHealthIcon(health.components.dataPipeline)} ${health.components.dataPipeline.state}`);
  console.log(`  PluginManager:  ${getHealthIcon(health.components.pluginManager)} ${health.components.pluginManager.state}`);
  console.log(`  DecisionEngine: ${getHealthIcon(health.components.decisionEngine)} ${health.components.decisionEngine.state}`);
  console.log();

  console.log('Metrics:');
  console.log(`  Events/sec:      ${health.metrics.eventsProcessedPerSecond.toFixed(2)}`);
  console.log(`  Data points/sec: ${health.metrics.dataPointsIngestedPerSecond.toFixed(2)}`);
  console.log(`  Decisions/min:   ${health.metrics.decisionsPerMinute.toFixed(2)}`);
  console.log();

  if (health.errors.length > 0) {
    console.log('Recent Errors:');
    health.errors.slice(-5).forEach(error => {
      console.log(`  [${error.component}] ${error.message} (count: ${error.count})`);
    });
    console.log();
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Get icon for system state
 */
function getStateIcon(state: SystemState): string {
  const icons: Record<SystemState, string> = {
    [SystemState.INITIALIZING]: '🔄',
    [SystemState.STARTING]: '▶️',
    [SystemState.RUNNING]: '✅',
    [SystemState.DEGRADED]: '⚠️',
    [SystemState.STOPPING]: '⏹️',
    [SystemState.STOPPED]: '⏸️',
    [SystemState.ERROR]: '❌'
  };
  return icons[state] || '❓';
}

/**
 * Get icon for component health
 */
function getHealthIcon(health: { healthy: boolean }): string {
  return health.healthy ? '✅' : '❌';
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  // Prevent multiple shutdown calls
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);

  if (!orchestrator) {
    console.log('✓ No orchestrator to shutdown');
    process.exit(0);
  }

  try {
    // Set a timeout for shutdown
    const shutdownTimeout = setTimeout(() => {
      console.error('❌ Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000); // 30 second timeout

    // Stop data retention
    if (dataRetention) {
      console.log('  Stopping data retention service...');
      Logger.info('Stopping data retention service');
      dataRetention.stop();
    }

    // Stop API server
    if (apiServer) {
      console.log('  Stopping API server...');
      Logger.info('Stopping API server');
      await apiServer.stop();
    }

    console.log('  Stopping orchestrator...');
    Logger.info('Stopping orchestrator');
    await orchestrator.shutdown();

    // Shutdown logger
    Logger.info('proPACE shutdown complete');
    await Logger.shutdown();

    clearTimeout(shutdownTimeout);

    console.log('✓ Shutdown complete');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Handle uncaught errors
 */
function handleUncaughtError(error: Error): void {
  console.error('\n❌ Uncaught error:', error);

  if (orchestrator) {
    const health = orchestrator.getHealth();
    if (health.state === SystemState.RUNNING || health.state === SystemState.DEGRADED) {
      console.log('System is still running in degraded mode');
      console.log('Press Ctrl+C to shutdown');
      return;
    }
  }

  console.log('Initiating emergency shutdown...');
  shutdown('UNCAUGHT_ERROR').catch(() => {
    process.exit(1);
  });
}

/**
 * Setup signal handlers
 */
function setupSignalHandlers(): void {
  // Handle termination signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', handleUncaughtError);
  process.on('unhandledRejection', (reason) => {
    handleUncaughtError(new Error(`Unhandled Promise Rejection: ${reason}`));
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  setupSignalHandlers();
  await initialize();
}

// Run main (this file is always the entry point)
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

// Export for testing
export { initialize, shutdown, orchestrator };
