import { PACEWebSocketServer } from './websocket.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { ClaudeClient } from '../clients/claudeClient.js';
import { MemoryStore } from '../services/memoryStore.js';
import { WeatherService } from '../services/weatherService.js';
import { NewsService } from '../services/newsService.js';
import { WolframService } from '../services/wolframService.js';
import { RoutingService } from '../services/routingService.js';
import { RoutingPredictor } from '../services/routingPredictor.js';
import { ConversationOrchestrator } from '../services/conversationOrchestrator.js';
import { PluginRegistry } from '../plugins/pluginRegistry.js';
import { WeatherPlugin } from '../plugins/core/weatherPlugin.js';
import { NewsPlugin } from '../plugins/core/newsPlugin.js';
import { WolframPlugin } from '../plugins/core/wolframPlugin.js';
import { MemoryPlugin } from '../plugins/core/memoryPlugin.js';
import { DiagnosticPlugin } from '../plugins/core/diagnosticPlugin.js';
import { AgentOrchestrator } from '../agent/agentOrchestrator.js';

/**
 * Main PACE Server Entry Point
 */
class PACEServer {
  private wsServer: PACEWebSocketServer;
  private claudeClient?: ClaudeClient;
  private memoryStore?: MemoryStore;
  private weatherService?: WeatherService;
  private newsService?: NewsService;
  private wolframService?: WolframService;
  private routingService?: RoutingService;
  private routingPredictor?: RoutingPredictor;
  private legacyOrchestrator?: ConversationOrchestrator;
  private agentOrchestrator?: AgentOrchestrator;
  private pluginRegistry?: PluginRegistry;

  constructor() {
    logger.info(`Initializing PACE server in ${config.enableAgentMode ? 'AGENT' : 'LEGACY'} mode`);

    if (config.enableAgentMode) {
      // Agent mode - use plugin system
      this.initializeAgentMode();
    } else {
      // Legacy mode - use existing orchestrator
      this.initializeLegacyMode();
    }

    // Initialize WebSocket server
    this.wsServer = new PACEWebSocketServer({
      port: config.port,
      host: config.host,
    });

    // Set up message handler
    this.wsServer.setMessageHandler(this.handleMessage.bind(this));
  }

  /**
   * Initialize agent mode with plugin system
   */
  private async initializeAgentMode(): Promise<void> {
    logger.info('Initializing agent mode...');

    // Create plugin registry
    this.pluginRegistry = new PluginRegistry();

    // Register core plugins
    const weatherPlugin = new WeatherPlugin();
    const newsPlugin = new NewsPlugin();
    const wolframPlugin = new WolframPlugin();
    const memoryPlugin = new MemoryPlugin();
    const diagnosticPlugin = new DiagnosticPlugin();

    await this.pluginRegistry.register(weatherPlugin);
    await this.pluginRegistry.register(newsPlugin);
    await this.pluginRegistry.register(wolframPlugin);
    await this.pluginRegistry.register(memoryPlugin);
    await this.pluginRegistry.register(diagnosticPlugin);

    // Give diagnostic plugin access to the registry (needed for SystemDiagnostics)
    diagnosticPlugin.setPluginRegistry(this.pluginRegistry);

    logger.info(`Registered ${this.pluginRegistry.getPluginCount()} core plugins`);

    // Create agent orchestrator
    this.agentOrchestrator = new AgentOrchestrator(
      config.anthropicApiKey,
      this.pluginRegistry,
      './data/audit.db',
      config.agentPlanningModel
    );

    // Wire up event handlers for background task completion
    this.setupAgentEventHandlers();

    logger.info('Agent mode initialized successfully');
  }

  /**
   * Setup event handlers for agent system
   */
  private setupAgentEventHandlers(): void {
    if (!this.agentOrchestrator) return;

    const executor = this.agentOrchestrator.getExecutor();

    // Task completed - send final answer to client
    executor.on('task_completed', ({ taskId, clientId, result }) => {
      logger.info(`Task ${taskId} completed, sending result to client ${clientId}`);

      // Broadcast the final answer
      const message = `Task Complete$$${result.finalAnswer}`;
      this.wsServer.broadcast(message);
    });

    // Task failed - send error to client
    executor.on('task_failed', ({ taskId, clientId, error }) => {
      logger.error(`Task ${taskId} failed for client ${clientId}: ${error}`);

      // Broadcast the error
      const message = `Task Failed$$I encountered an error: ${error}`;
      this.wsServer.broadcast(message);
    });

    // Progress updates (optional - for real-time feedback)
    executor.on('progress', ({ planId, update }) => {
      logger.debug(`Progress update for plan ${planId}: ${update.message}`);

      // Optionally broadcast progress updates
      // this.wsServer.broadcast(`Progress$$${update.message}`);
    });
  }

  /**
   * Initialize legacy mode with existing services
   */
  private initializeLegacyMode(): void {
    logger.info('Initializing legacy mode...');

    // Initialize AI and memory systems
    this.claudeClient = new ClaudeClient();
    this.memoryStore = new MemoryStore(config.databasePath);
    this.weatherService = new WeatherService();
    this.newsService = new NewsService();
    this.wolframService = new WolframService();
    this.routingService = new RoutingService();
    this.routingPredictor = new RoutingPredictor();
    this.legacyOrchestrator = new ConversationOrchestrator(
      this.claudeClient,
      this.memoryStore,
      this.weatherService,
      this.newsService,
      this.wolframService,
      this.routingService,
      this.routingPredictor
    );

    logger.info('Legacy mode initialized successfully');
  }

  /**
   * Handle incoming messages from clients
   */
  private async handleMessage(clientId: string, message: string): Promise<string> {
    logger.info(`Processing message from ${clientId}: ${message}`);

    try {
      if (config.enableAgentMode) {
        // Agent mode
        if (!this.agentOrchestrator) {
          throw new Error('Agent orchestrator not initialized');
        }
        return await this.agentOrchestrator.processMessage(clientId, message);
      } else {
        // Legacy mode
        if (!this.legacyOrchestrator) {
          throw new Error('Legacy orchestrator not initialized');
        }

        // Check for special commands first
        const commandResponse = await this.legacyOrchestrator.handleCommand(clientId, message);
        if (commandResponse) {
          return commandResponse;
        }

        // Process message through orchestrator
        return await this.legacyOrchestrator.processMessage(clientId, message);
      }
    } catch (error) {
      logger.error('Error handling message:', error);
      return 'Sorry, I encountered an error. Please try again.';
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting PACE server...');
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Port: ${config.port}`);
      logger.info(`Host: ${config.host}`);

      await this.wsServer.start();

      logger.info('✓ PACE server started successfully');
      logger.info(`WebSocket server listening on ws://${config.host}:${config.port}`);
    } catch (error) {
      logger.error('Failed to start PACE server:', error);
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    logger.info('Stopping PACE server...');
    await this.wsServer.stop();

    if (config.enableAgentMode) {
      // Shutdown agent orchestrator
      if (this.agentOrchestrator) {
        await this.agentOrchestrator.shutdown();
      }
    } else {
      // Close legacy memory store
      if (this.memoryStore) {
        this.memoryStore.close();
      }
    }

    logger.info('✓ PACE server stopped');
  }

  /**
   * Get server instance for testing
   */
  getWebSocketServer(): PACEWebSocketServer {
    return this.wsServer;
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new PACEServer();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Received shutdown signal');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start the server
  server.start().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
}

export { PACEServer };
