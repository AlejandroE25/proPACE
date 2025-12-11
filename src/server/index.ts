import { PACEWebSocketServer } from './websocket.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { ClaudeClient } from '../clients/claudeClient.js';
import { MemoryStore } from '../services/memoryStore.js';
import { WeatherService } from '../services/weatherService.js';
import { NewsService } from '../services/newsService.js';
import { ConversationOrchestrator } from '../services/conversationOrchestrator.js';

/**
 * Main PACE Server Entry Point
 */
class PACEServer {
  private wsServer: PACEWebSocketServer;
  private claudeClient: ClaudeClient;
  private memoryStore: MemoryStore;
  private weatherService: WeatherService;
  private newsService: NewsService;
  private orchestrator: ConversationOrchestrator;

  constructor() {
    // Initialize AI and memory systems
    this.claudeClient = new ClaudeClient();
    this.memoryStore = new MemoryStore(config.databasePath);
    this.weatherService = new WeatherService();
    this.newsService = new NewsService();
    this.orchestrator = new ConversationOrchestrator(
      this.claudeClient,
      this.memoryStore,
      this.weatherService,
      this.newsService
    );

    // Initialize WebSocket server
    this.wsServer = new PACEWebSocketServer({
      port: config.port,
      host: config.host,
    });

    // Set up message handler
    this.wsServer.setMessageHandler(this.handleMessage.bind(this));
  }

  /**
   * Handle incoming messages from clients
   */
  private async handleMessage(clientId: string, message: string): Promise<string> {
    logger.info(`Processing message from ${clientId}: ${message}`);

    try {
      // Check for special commands first
      const commandResponse = await this.orchestrator.handleCommand(clientId, message);
      if (commandResponse) {
        return commandResponse;
      }

      // Process message through orchestrator
      const response = await this.orchestrator.processMessage(clientId, message);
      return response;
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
    this.memoryStore.close();
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
