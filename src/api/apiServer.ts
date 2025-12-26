/**
 * API Server
 *
 * REST API and WebSocket server for external UI/client communication.
 * Provides real-time access to system state, sensor data, and decision control.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as path from 'path';
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentOrchestrator } from '../orchestrator/agentOrchestrator';
import { ConfigFile } from '../config/productionConfig';
import { EventBus } from '../events/eventBus';
import { EventStore } from '../events/eventStore';
import { Event, EventType, EventSubscriber } from '../events/types';
import { ConversationOrchestrator } from '../services/conversationOrchestrator.js';
import { ClaudeClient } from '../clients/claudeClient.js';
import { MemoryStore } from '../services/memoryStore.js';
import { WeatherService } from '../services/weatherService.js';
import { NewsService } from '../services/newsService.js';
import { WolframService } from '../services/wolframService.js';
import { RoutingService } from '../services/routingService.js';
import { RoutingPredictor } from '../services/routingPredictor.js';
import { config as appConfig } from '../config/index.js';

/**
 * API request with optional authentication
 */
interface AuthRequest extends Request {
  authenticated?: boolean;
  apiKey?: string;
}

/**
 * WebSocket client connection
 */
interface WebSocketClient {
  id: string;
  socket: WebSocket;
  authenticated: boolean;
  subscribedEvents: EventType[];
}

/**
 * API Server
 */
export class ApiServer {
  private app: express.Application;
  private httpServer?: HttpServer;
  private wsServer?: WebSocketServer;
  private orchestrator: AgentOrchestrator;
  private config: ConfigFile;
  private eventBus?: EventBus;
  private clients: Map<string, WebSocketClient> = new Map();
  private nextClientId = 1;
  private conversationOrchestrator?: ConversationOrchestrator;

  constructor(orchestrator: AgentOrchestrator, config: ConfigFile, eventBus?: EventBus) {
    this.orchestrator = orchestrator;
    this.config = config;
    this.eventBus = eventBus;
    this.app = express();

    // Initialize conversation orchestrator if API key is available
    this.initializeConversationOrchestrator();

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize conversation orchestrator with Claude AI
   */
  private initializeConversationOrchestrator(): void {
    try {
      if (!appConfig.anthropicApiKey) {
        console.warn('⚠️  No ANTHROPIC_API_KEY found - conversational AI will be limited');
        return;
      }

      // Initialize all services
      const claudeClient = new ClaudeClient(appConfig.anthropicApiKey);
      const memoryStore = new MemoryStore('./data/memory.db');
      const weatherService = new WeatherService();
      const newsService = new NewsService();
      const wolframService = new WolframService();
      const routingService = new RoutingService(appConfig.anthropicApiKey);
      const routingPredictor = new RoutingPredictor();

      // Create a default EventBus if not provided
      if (!this.eventBus) {
        const eventStore = new EventStore(':memory:');
        this.eventBus = new EventBus(eventStore);
      }

      this.conversationOrchestrator = new ConversationOrchestrator(
        claudeClient,
        memoryStore,
        weatherService,
        newsService,
        wolframService,
        routingService,
        routingPredictor,
        this.eventBus
      );

      console.log('✓ Conversation AI initialized with Claude Sonnet');
    } catch (error) {
      console.error('Failed to initialize conversation orchestrator:', error);
    }
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    if (this.config.api?.cors?.enabled) {
      this.app.use(cors({
        origin: this.config.api.cors.origins,
        credentials: true
      }));
    }

    // Body parsing
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    // Serve static files from public directory
    const publicPath = path.join(process.cwd(), 'public');
    this.app.use(express.static(publicPath));

    // Authentication middleware
    if (this.config.auth?.enabled) {
      this.app.use((req: AuthRequest, res: Response, next: NextFunction) => {
        this.authenticate(req, res, next);
      });
    }

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });

    // Error handling
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('API Error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message
      });
    });
  }

  /**
   * Authenticate request
   */
  private authenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
    // Skip health endpoint
    if (req.path === '/api/health') {
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      _res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (this.config.auth?.type === 'api-key') {
      const apiKey = authHeader.replace('Bearer ', '');
      if (this.config.auth.apiKeys?.includes(apiKey)) {
        req.authenticated = true;
        req.apiKey = apiKey;
        next();
        return;
      }
    }

    _res.status(401).json({ error: 'Invalid authentication' });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const router = express.Router();

    // Health check
    router.get('/health', (_req: Request, res: Response) => {
      const health = this.orchestrator.getHealth();
      res.json({
        status: health.healthy ? 'healthy' : 'unhealthy',
        state: health.state,
        uptime: health.uptime,
        components: health.components,
        metrics: health.metrics,
        timestamp: new Date().toISOString()
      });
    });

    // System state
    router.get('/state', (_req: Request, res: Response) => {
      const state = this.orchestrator.getState();
      res.json({ state });
    });

    // Metrics
    router.get('/metrics', (_req: Request, res: Response) => {
      const health = this.orchestrator.getHealth();
      res.json(health.metrics);
    });

    // Components
    router.get('/components', (_req: Request, res: Response) => {
      const health = this.orchestrator.getHealth();
      res.json(health.components);
    });

    // Errors
    router.get('/errors', (req: Request, res: Response) => {
      const health = this.orchestrator.getHealth();
      const limit = parseInt(req.query.limit as string) || 10;
      res.json({
        errors: health.errors.slice(-limit),
        total: health.errors.length
      });
    });

    // Sensors (placeholder - would need access to DataStorage)
    router.get('/sensors', (_req: Request, res: Response) => {
      res.json({
        message: 'Sensor endpoints require DataStorage access',
        available: false
      });
    });

    // Decisions (placeholder - would need access to DecisionEngine)
    router.get('/decisions', (_req: Request, res: Response) => {
      res.json({
        message: 'Decision endpoints require DecisionEngine access',
        available: false
      });
    });

    // Approve decision (placeholder)
    router.post('/decisions/:id/approve', (req: Request, res: Response) => {
      const decisionId = req.params.id;
      res.json({
        message: 'Decision approval requires DecisionEngine access',
        decisionId,
        available: false
      });
    });

    // Plugins (placeholder - would need access to PluginManager)
    router.get('/plugins', (_req: Request, res: Response) => {
      res.json({
        message: 'Plugin endpoints require PluginManager access',
        available: false
      });
    });

    // Mount router
    this.app.use('/api', router);

    // Root endpoint
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'proPACE API Server',
        version: this.config.version,
        environment: this.config.environment,
        endpoints: {
          health: '/api/health',
          state: '/api/state',
          metrics: '/api/metrics',
          components: '/api/components',
          errors: '/api/errors',
          websocket: this.config.api?.enabled ? `ws://${this.config.api.host}:${this.config.api.port}/ws` : undefined
        }
      });
    });
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    if (!this.httpServer) {
      return;
    }

    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: '/ws'
    });

    this.wsServer.on('connection', (socket: WebSocket, _req) => {
      this.handleWebSocketConnection(socket);
    });

    // Subscribe to events if EventBus is available
    if (this.eventBus) {
      const subscriber: EventSubscriber = {
        id: 'api-server-websocket',
        handle: async (event: Event) => {
          this.broadcastEvent(event);
        },
        canHandle: () => true, // Handle all events
        priority: 1
      };

      // Subscribe to all event types
      this.eventBus.subscribe(Object.values(EventType), subscriber);
    }

    console.log('✓ WebSocket server initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleWebSocketConnection(socket: WebSocket): void {
    const clientId = `client-${this.nextClientId++}`;

    const client: WebSocketClient = {
      id: clientId,
      socket,
      authenticated: !this.config.auth?.enabled, // Auto-auth if auth disabled
      subscribedEvents: []
    };

    this.clients.set(clientId, client);

    console.log(`WebSocket client connected: ${clientId}`);

    // Send welcome message
    this.sendToClient(client, {
      type: 'welcome',
      clientId,
      timestamp: new Date().toISOString(),
      requiresAuth: this.config.auth?.enabled || false
    });

    // Handle messages
    socket.on('message', (data: Buffer) => {
      this.handleWebSocketMessage(client, data);
    });

    // Handle disconnect
    socket.on('close', () => {
      console.log(`WebSocket client disconnected: ${clientId}`);
      this.clients.delete(clientId);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
      this.clients.delete(clientId);
    });
  }

  /**
   * Handle WebSocket message
   */
  private handleWebSocketMessage(client: WebSocketClient, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      // Handle authentication
      if (message.type === 'auth' && this.config.auth?.enabled) {
        if (this.config.auth.type === 'api-key' && this.config.auth.apiKeys?.includes(message.apiKey)) {
          client.authenticated = true;
          this.sendToClient(client, {
            type: 'auth_success',
            timestamp: new Date().toISOString()
          });
        } else {
          this.sendToClient(client, {
            type: 'auth_failed',
            timestamp: new Date().toISOString()
          });
        }
        return;
      }

      // Require authentication
      if (this.config.auth?.enabled && !client.authenticated) {
        this.sendToClient(client, {
          type: 'error',
          message: 'Authentication required'
        });
        return;
      }

      // Handle subscribe
      if (message.type === 'subscribe') {
        const eventTypes = Array.isArray(message.events) ? message.events : [message.events];
        client.subscribedEvents.push(...eventTypes);
        this.sendToClient(client, {
          type: 'subscribed',
          events: eventTypes,
          timestamp: new Date().toISOString()
        });
      }

      // Handle unsubscribe
      if (message.type === 'unsubscribe') {
        const eventTypes = Array.isArray(message.events) ? message.events : [message.events];
        client.subscribedEvents = client.subscribedEvents.filter(e => !eventTypes.includes(e));
        this.sendToClient(client, {
          type: 'unsubscribed',
          events: eventTypes,
          timestamp: new Date().toISOString()
        });
      }

      // Handle health request
      if (message.type === 'get_health') {
        const health = this.orchestrator.getHealth();
        this.sendToClient(client, {
          type: 'health',
          data: health,
          timestamp: new Date().toISOString()
        });
      }

      // Handle command/text input
      if (message.type === 'command' && message.text) {
        console.log(`Received command from ${client.id}: ${message.text}`);

        // Process command asynchronously
        this.handleCommand(client, message.text).catch(err => {
          console.error('Error processing command:', err);
          this.sendToClient(client, {
            type: 'response',
            text: 'Sorry, there was an error processing your message.',
            timestamp: new Date().toISOString()
          });
        });
      }

    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendToClient(client, {
        type: 'error',
        message: 'Invalid message format'
      });
    }
  }

  /**
   * Handle command/conversation message
   */
  private async handleCommand(client: WebSocketClient, text: string): Promise<void> {
    try {
      const response = await this.generateResponse(client.id, text);

      this.sendToClient(client, {
        type: 'response',
        text: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate AI response using ConversationOrchestrator
   */
  private async generateResponse(clientId: string, text: string): Promise<string> {
    // If conversation orchestrator is available, use it
    if (this.conversationOrchestrator) {
      try {
        const response = await this.conversationOrchestrator.processMessage(clientId, text);
        return response;
      } catch (error) {
        console.error('Conversation orchestrator error:', error);
        return "I'm having trouble processing that right now. Please try again.";
      }
    }

    // Fallback to simple responses if no API key
    const lowerText = text.toLowerCase();

    if (lowerText.includes('hello') || lowerText.includes('hi ') || lowerText === 'hi') {
      return "Hello! I'm PACE. To enable full AI conversation with Claude Sonnet, add your ANTHROPIC_API_KEY to the .env file.";
    }

    if (lowerText.includes('how are you')) {
      return "I'm running smoothly! All systems are operational. Add ANTHROPIC_API_KEY to enable full conversational AI.";
    }

    if (lowerText.includes('help')) {
      return "I can help you monitor sensors and automation. For full AI capabilities including weather, news, and natural language understanding, add your ANTHROPIC_API_KEY to .env";
    }

    return `You said: "${text}". Add ANTHROPIC_API_KEY to .env to enable full Claude Sonnet AI with intelligent routing, memory, weather, news, and more!`;
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: WebSocketClient, message: any): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast event to subscribed clients
   */
  private broadcastEvent(event: Event): void {
    const message = {
      type: 'event',
      event,
      timestamp: new Date().toISOString()
    };

    for (const client of this.clients.values()) {
      if (!client.authenticated) {
        continue;
      }

      // Check if client is subscribed to this event type
      if (client.subscribedEvents.length === 0 ||
          client.subscribedEvents.includes(event.type) ||
          client.subscribedEvents.includes('*' as any)) {
        this.sendToClient(client, message);
      }
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (!this.config.api?.enabled) {
      console.log('API server disabled in configuration');
      return;
    }

    const port = this.config.api.port;
    const host = this.config.api.host;

    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(port, host, () => {
          console.log(`✓ API server listening on http://${host}:${port}`);
          this.setupWebSocket();
          resolve();
        });

        this.httpServer.on('error', (error) => {
          console.error('Failed to start API server:', error);
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Close all WebSocket connections
    for (const client of this.clients.values()) {
      client.socket.close();
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wsServer) {
      this.wsServer.close();
    }

    // Close HTTP server
    if (this.httpServer) {
      return new Promise((resolve, reject) => {
        this.httpServer!.close((error) => {
          if (error) {
            reject(error);
          } else {
            console.log('✓ API server stopped');
            resolve();
          }
        });
      });
    }
  }
}
