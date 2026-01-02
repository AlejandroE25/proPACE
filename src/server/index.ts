import { PACEWebSocketServer } from './websocket.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import * as ui from '../utils/terminalUI.js';
import { EventBus } from '../events/eventBus.js';
import { EventStore } from '../events/eventStore.js';
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
import { SearchPlugin } from '../plugins/core/searchPlugin.js';
import { MemoryPlugin } from '../plugins/core/memoryPlugin.js';
import { DiagnosticPlugin } from '../plugins/core/diagnosticPlugin.js';
import { RecoveryPlugin } from '../plugins/core/recoveryPlugin.js';
import { GlobalContextPlugin } from '../plugins/core/globalContextPlugin.js';
import { VoiceInterfacePlugin } from '../plugins/interfaces/voiceInterfacePlugin.js';
import { AgentOrchestrator } from '../agent/agentOrchestrator.js';
import { EventType, EventPriority } from '../events/types.js';
import { pathToFileURL } from 'url';

/**
 * Main PACE Server Entry Point
 */
class PACEServer {
  private wsServer: PACEWebSocketServer;
  private eventBus: EventBus;
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
  private voicePlugin?: VoiceInterfacePlugin;

  constructor() {
    const mode = config.enableAgentMode ? 'AGENT' : 'LEGACY';

    // Display startup banner
    ui.displayStartupBanner(mode);

    ui.displayInitStep('Initializing EventBus', 'start');
    logger.info(`Initializing PACE server in ${mode} mode`);

    // Initialize EventBus for voice plugin and other event-driven features
    const eventStore = new EventStore(':memory:');
    this.eventBus = new EventBus(eventStore);
    ui.displayInitStep('EventBus initialized', 'success');

    if (config.enableAgentMode) {
      // Agent mode - use plugin system
      this.initializeAgentMode();
    } else {
      // Legacy mode - use existing orchestrator
      this.initializeLegacyMode();
    }

    ui.displayInitStep('Initializing WebSocket server', 'start');
    // Initialize WebSocket server
    this.wsServer = new PACEWebSocketServer({
      port: config.port,
      host: config.host,
    });

    // Set up message handler
    this.wsServer.setMessageHandler(this.handleMessage.bind(this));

    // Set up services for API endpoints (if in legacy mode)
    if (!config.enableAgentMode) {
      if (this.weatherService) {
        this.wsServer.setWeatherService(this.weatherService);
      }
      if (this.newsService) {
        this.wsServer.setNewsService(this.newsService);
      }
    }

    // Set up client connection handlers (for global context)
    if (config.enableAgentMode && this.agentOrchestrator) {
      this.wsServer.setClientConnectedHandler((clientId) => {
        this.agentOrchestrator?.getGlobalContext().registerClient(clientId);
        ui.displayClientConnected(clientId, this.wsServer.getClientCount());
      });

      this.wsServer.setClientDisconnectedHandler((clientId) => {
        this.agentOrchestrator?.getGlobalContext().unregisterClient(clientId);
        ui.displayClientDisconnected(clientId, this.wsServer.getClientCount());
      });
    } else {
      // Legacy mode still needs connection/disconnection display
      this.wsServer.setClientConnectedHandler((clientId) => {
        ui.displayClientConnected(clientId, this.wsServer.getClientCount());
      });

      this.wsServer.setClientDisconnectedHandler((clientId) => {
        ui.displayClientDisconnected(clientId, this.wsServer.getClientCount());
      });
    }
    ui.displayInitStep('WebSocket server initialized', 'success');
  }

  /**
   * Initialize agent mode with plugin system
   */
  private async initializeAgentMode(): Promise<void> {
    ui.displayInitStep('Initializing agent mode', 'start');
    logger.info('Initializing agent mode...');

    // Create plugin registry
    this.pluginRegistry = new PluginRegistry();

    // Register core plugins
    const weatherPlugin = new WeatherPlugin();
    const newsPlugin = new NewsPlugin();
    const wolframPlugin = new WolframPlugin();
    const searchPlugin = new SearchPlugin();
    const memoryPlugin = new MemoryPlugin();
    const diagnosticPlugin = new DiagnosticPlugin();
    const recoveryPlugin = new RecoveryPlugin();
    const globalContextPlugin = new GlobalContextPlugin();
    this.voicePlugin = new VoiceInterfacePlugin();

    await this.pluginRegistry.register(weatherPlugin);
    await this.pluginRegistry.register(newsPlugin);
    await this.pluginRegistry.register(wolframPlugin);
    await this.pluginRegistry.register(searchPlugin);
    await this.pluginRegistry.register(memoryPlugin);
    await this.pluginRegistry.register(diagnosticPlugin);
    await this.pluginRegistry.register(recoveryPlugin);
    await this.pluginRegistry.register(globalContextPlugin);
    // VoiceInterfacePlugin extends BasePlugin (old plugin system) but is compatible with new registry
    await this.pluginRegistry.register(this.voicePlugin as any);

    // Give diagnostic plugin access to the registry (needed for SystemDiagnostics)
    diagnosticPlugin.setPluginRegistry(this.pluginRegistry);

    logger.info(`Registered ${this.pluginRegistry.getPluginCount()} core plugins`);
    ui.displayPluginStatus(this.pluginRegistry.getPluginCount());

    // Create agent orchestrator
    this.agentOrchestrator = new AgentOrchestrator(
      config.anthropicApiKey,
      this.pluginRegistry,
      './data/audit.db',
      config.agentPlanningModel,
      config.updateMonitor
    );

    // Give recovery plugin access to recovery system
    recoveryPlugin.setRecoverySystem(
      this.agentOrchestrator.getRecoveryManager(),
      this.agentOrchestrator.getHealthMonitor()
    );

    // Give global context plugin access to context store
    globalContextPlugin.setContextStore(
      this.agentOrchestrator.getGlobalContext()
    );

    // Give diagnostic plugin access to orchestrator (for update monitor)
    diagnosticPlugin.setOrchestrator(this.agentOrchestrator);

    // Wire up event handlers for background task completion
    this.setupAgentEventHandlers();

    // Set agent orchestrator for API endpoints (update trigger/status)
    this.wsServer.setAgentOrchestrator(this.agentOrchestrator);

    // Set services for API endpoints (get from plugins)
    if (weatherPlugin.getWeatherService) {
      const weatherService = weatherPlugin.getWeatherService();
      if (weatherService) {
        this.wsServer.setWeatherService(weatherService);
      }
    }
    if (newsPlugin.getNewsService) {
      const newsService = newsPlugin.getNewsService();
      if (newsService) {
        this.wsServer.setNewsService(newsService);
      }
    }

    logger.info('Agent mode initialized successfully');
    ui.displayInitStep('Agent mode initialized', 'success');
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
      ui.displayTaskStatus(taskId, 'completed');

      // Publish RESPONSE_GENERATED event for TTS
      logger.info(`Publishing RESPONSE_GENERATED event for TTS`, { clientId, responseLength: result.finalAnswer?.length });
      this.eventBus.publish({
        type: EventType.RESPONSE_GENERATED,
        priority: EventPriority.MEDIUM,
        source: 'agent-orchestrator',
        payload: {
          clientId,
          response: result.finalAnswer,
          taskId
        }
      });

      // Send the final answer to the specific client
      // This is needed because processMessage() returns immediately with "Working on it..."
      // and the actual response comes later via this event
      const responseMessage = {
        type: 'message',
        query: '', // Query was already sent, no need to repeat
        response: result.finalAnswer,
        timestamp: new Date().toISOString(),
        status: 'complete'
      };
      this.wsServer.sendToClient(clientId, JSON.stringify(responseMessage));
      ui.displayOutgoingResponse(clientId, result.finalAnswer);
    });

    // Task failed - send error to client
    executor.on('task_failed', ({ taskId, clientId, error }) => {
      logger.error(`Task ${taskId} failed for client ${clientId}: ${error}`);
      ui.displayTaskStatus(taskId, 'failed');

      // Send error to the specific client
      const errorMessage = {
        type: 'message',
        query: '',
        response: `Sorry, an error occurred: ${error}`,
        timestamp: new Date().toISOString(),
        status: 'error',
        error
      };
      this.wsServer.sendToClient(clientId, JSON.stringify(errorMessage));
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
    ui.displayInitStep('Initializing legacy mode', 'start');
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
      this.routingPredictor,
      this.eventBus
    );

    logger.info('Legacy mode initialized successfully');
    ui.displayInitStep('Legacy mode initialized', 'success');
  }

  /**
   * Handle incoming messages from clients
   */
  private async handleMessage(clientId: string, message: string): Promise<string> {
    ui.displayIncomingMessage(clientId, message);
    logger.info(`Processing message from ${clientId}: ${message}`);

    try {
      if (config.enableAgentMode) {
        // Agent mode
        if (!this.agentOrchestrator) {
          throw new Error('Agent orchestrator not initialized');
        }
        const response = await this.agentOrchestrator.processMessage(clientId, message);
        ui.displayOutgoingResponse(clientId, response);
        return response;
      } else {
        // Legacy mode
        if (!this.legacyOrchestrator) {
          throw new Error('Legacy orchestrator not initialized');
        }

        // Check for special commands first
        const commandResponse = await this.legacyOrchestrator.handleCommand(clientId, message);
        if (commandResponse) {
          ui.displayOutgoingResponse(clientId, commandResponse);
          return commandResponse;
        }

        // Process message through orchestrator
        const response = await this.legacyOrchestrator.processMessage(clientId, message);
        ui.displayOutgoingResponse(clientId, response);
        return response;
      }
    } catch (error) {
      logger.error('Error handling message:', error);
      ui.displayError('Error handling message', error);
      return 'Sorry, I encountered an error. Please try again.';
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      ui.displayServerConfig({
        environment: config.nodeEnv,
        host: config.host,
        port: config.port,
        logLevel: config.logLevel
      });

      logger.info('Starting PACE server...');
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Port: ${config.port}`);
      logger.info(`Host: ${config.host}`);

      ui.displayInitStep('Starting WebSocket server', 'start');
      await this.wsServer.start();
      ui.displayInitStep('WebSocket server started', 'success');

      // Initialize voice plugin WebRTC components (if voice plugin exists)
      if (this.voicePlugin) {
        ui.displayInitStep('Initializing WebRTC TTS components', 'start');
        this.voicePlugin.setWebSocketServer(this.wsServer, this.eventBus);
        ui.displayInitStep('WebRTC TTS components initialized', 'success');
      }

      logger.info('✓ PACE server started successfully');
      logger.info(`WebSocket server listening on ws://${config.host}:${config.port}`);

      ui.displayServerStarted(`ws://${config.host}:${config.port}`);
    } catch (error) {
      logger.error('Failed to start PACE server:', error);
      ui.displayError('Failed to start PACE server', error);
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    ui.displayShutdown();
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
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
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
