import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { PACEClient } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { AgentOrchestrator } from '../agent/agentOrchestrator.js';
import { WeatherService } from '../services/weatherService.js';
import { NewsService } from '../services/newsService.js';

export interface WebSocketServerOptions {
  port: number;
  host: string;
}

/**
 * PACE WebSocket Server
 * Manages WebSocket connections and message broadcasting
 */
export class PACEWebSocketServer {
  private wss: WebSocketServer | null = null;
  private httpServer: any = null;
  private clients: Map<string, PACEClient> = new Map();
  private isServerRunning: boolean = false;
  private options: WebSocketServerOptions;
  private onMessageHandler?: (clientId: string, message: string) => Promise<string>;
  private onClientConnectedHandler?: (clientId: string) => void;
  private onClientDisconnectedHandler?: (clientId: string) => void;
  private onWebRTCSignalingHandler?: (clientId: string, message: any) => Promise<void>;
  private agentOrchestrator?: AgentOrchestrator;
  private weatherService?: WeatherService;
  private newsService?: NewsService;

  constructor(options: WebSocketServerOptions) {
    this.options = options;
  }

  /**
   * Set the agent orchestrator (for update monitor access)
   */
  setAgentOrchestrator(orchestrator: AgentOrchestrator): void {
    this.agentOrchestrator = orchestrator;
  }

  /**
   * Set the weather service (for API endpoint access)
   */
  setWeatherService(service: WeatherService): void {
    this.weatherService = service;
  }

  /**
   * Set the news service (for API endpoint access)
   */
  setNewsService(service: NewsService): void {
    this.newsService = service;
  }

  /**
   * Set the message handler callback
   */
  setMessageHandler(handler: (clientId: string, message: string) => Promise<string>): void {
    this.onMessageHandler = handler;
  }

  /**
   * Set client connected handler
   */
  setClientConnectedHandler(handler: (clientId: string) => void): void {
    this.onClientConnectedHandler = handler;
  }

  /**
   * Set client disconnected handler
   */
  setClientDisconnectedHandler(handler: (clientId: string) => void): void {
    this.onClientDisconnectedHandler = handler;
  }

  /**
   * Set WebRTC signaling handler
   */
  setWebRTCSignalingHandler(handler: (clientId: string, message: any) => Promise<void>): void {
    this.onWebRTCSignalingHandler = handler;
  }

  /**
   * Start the HTTP + WebSocket server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      // Create HTTP server for static files
      this.httpServer = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Create WebSocket server attached to HTTP server
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws: WebSocket) => {
        this.handleNewClient(ws as PACEClient);
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error:', error);
      });

      // Start HTTP server
      this.httpServer.listen(this.options.port, this.options.host, () => {
        this.isServerRunning = true;
        logger.info(`HTTP + WebSocket server started on ${this.options.host}:${this.options.port}`);
        resolve();
      });

      this.httpServer.on('error', (error: any) => {
        logger.error('HTTP server error:', error);
      });
    });
  }

  /**
   * Handle HTTP requests for static files and API endpoints
   */
  private handleHttpRequest(req: any, res: any): void {
    // Handle API endpoints
    if (req.url.startsWith('/api/')) {
      this.handleApiRequest(req, res);
      return;
    }

    // Handle static files
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = join(process.cwd(), 'public', filePath);

    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
      const content = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content, 'utf-8');
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end(`Server error: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Handle API requests
   */
  private handleApiRequest(req: any, res: any): void {
    res.setHeader('Content-Type', 'application/json');

    // /api/health endpoint
    if (req.url === '/api/health') {
      const health = {
        healthy: true,
        timestamp: new Date().toISOString(),
        clients: this.clients.size
      };
      res.writeHead(200);
      res.end(JSON.stringify(health));
      return;
    }

    // POST /api/update/trigger endpoint
    if (req.url === '/api/update/trigger' && req.method === 'POST') {
      this.handleUpdateTrigger(req, res);
      return;
    }

    // GET /api/update/status endpoint
    if (req.url === '/api/update/status' && req.method === 'GET') {
      this.handleUpdateStatus(req, res);
      return;
    }

    // GET /api/weather endpoint
    if (req.url === '/api/weather' && req.method === 'GET') {
      this.handleWeatherRequest(req, res);
      return;
    }

    // GET /api/news endpoint
    if (req.url === '/api/news' && req.method === 'GET') {
      this.handleNewsRequest(req, res);
      return;
    }

    // Unknown API endpoint
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'API endpoint not found' }));
  }

  /**
   * Handle update trigger endpoint
   */
  private async handleUpdateTrigger(_req: any, res: any): Promise<void> {
    try {
      if (!this.agentOrchestrator) {
        res.writeHead(503);
        res.end(JSON.stringify({
          error: 'Agent orchestrator not available',
          message: 'Server is not running in agent mode'
        }));
        return;
      }

      const updateMonitor = this.agentOrchestrator.getUpdateMonitor();

      if (!updateMonitor) {
        res.writeHead(503);
        res.end(JSON.stringify({
          error: 'Auto-update is not enabled',
          message: 'Set ENABLE_AUTO_UPDATE=true in .env to enable auto-update'
        }));
        return;
      }

      // Trigger update check (don't await - let it run in background)
      updateMonitor.checkNow().catch(error => {
        logger.error('Update check failed:', error);
      });

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: 'Update check triggered successfully',
        timestamp: new Date().toISOString()
      }));
    } catch (error: any) {
      logger.error('Error triggering update:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        error: 'Failed to trigger update',
        message: error.message
      }));
    }
  }

  /**
   * Handle update status endpoint
   */
  private handleUpdateStatus(_req: any, res: any): void {
    try {
      if (!this.agentOrchestrator) {
        res.writeHead(200);
        res.end(JSON.stringify({
          enabled: false,
          message: 'Agent orchestrator not available - server not running in agent mode'
        }));
        return;
      }

      const updateMonitor = this.agentOrchestrator.getUpdateMonitor();

      if (!updateMonitor) {
        res.writeHead(200);
        res.end(JSON.stringify({
          enabled: false,
          message: 'Auto-update is not enabled. Set ENABLE_AUTO_UPDATE=true in .env to enable it.'
        }));
        return;
      }

      const status = updateMonitor.getStatus();

      res.writeHead(200);
      res.end(JSON.stringify({
        enabled: true,
        status,
        timestamp: new Date().toISOString()
      }));
    } catch (error: any) {
      logger.error('Error getting update status:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        error: 'Failed to get update status',
        message: error.message
      }));
    }
  }

  /**
   * Handle weather API request
   */
  private async handleWeatherRequest(_req: any, res: any): Promise<void> {
    try {
      if (!this.weatherService) {
        res.writeHead(503);
        res.end(JSON.stringify({
          error: 'Weather service not available'
        }));
        return;
      }

      const weatherData = await this.weatherService.getWeatherFormatted();
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: weatherData,
        timestamp: new Date().toISOString()
      }));
    } catch (error: any) {
      logger.error('Error fetching weather:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        error: 'Failed to fetch weather',
        message: error.message
      }));
    }
  }

  /**
   * Handle news API request
   */
  private async handleNewsRequest(_req: any, res: any): Promise<void> {
    try {
      if (!this.newsService) {
        res.writeHead(503);
        res.end(JSON.stringify({
          error: 'News service not available'
        }));
        return;
      }

      const newsData = await this.newsService.getNewsFormatted();
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        data: newsData,
        timestamp: new Date().toISOString()
      }));
    } catch (error: any) {
      logger.error('Error fetching news:', error);
      res.writeHead(500);
      res.end(JSON.stringify({
        error: 'Failed to fetch news',
        message: error.message
      }));
    }
  }

  /**
   * Handle new client connection
   */
  private handleNewClient(ws: PACEClient): void {
    const clientId = randomUUID();
    ws.id = clientId;
    ws.connectedAt = new Date();
    ws.lastActivity = new Date();

    this.clients.set(clientId, ws);
    logger.info(`New client connected: ${clientId}`);

    // Notify handler
    if (this.onClientConnectedHandler) {
      this.onClientConnectedHandler(clientId);
    }

    // Send welcome message
    const welcomeMessage = {
      type: 'message',
      query: '',
      response: 'Hello! I am PACE, your personal assistant.',
      timestamp: new Date().toISOString()
    };
    ws.send(JSON.stringify(welcomeMessage));

    // Handle incoming messages (non-blocking for concurrent support)
    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data.toString());
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.handleClientDisconnect(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`Client ${clientId} error:`, error);
    });
  }

  /**
   * Handle incoming message from client (non-blocking)
   * Messages are processed asynchronously to support concurrent conversations
   */
  private handleMessage(clientId: string, message: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      logger.warn(`Message from unknown client: ${clientId}`);
      return;
    }

    client.lastActivity = new Date();

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(message);

      // Check if this is a WebRTC signaling message
      if (parsed.type === 'webrtc-signal' && this.onWebRTCSignalingHandler) {
        logger.info(`Client ${clientId} sent WebRTC signaling message: ${parsed.signal}`);

        // Handle WebRTC signaling asynchronously
        const handler = this.onWebRTCSignalingHandler;
        (async () => {
          try {
            await handler(clientId, parsed);
          } catch (error) {
            logger.error(`Error handling WebRTC signaling from ${clientId}:`, error);
          }
        })();
        return;
      }

      // Check if this is a JSON command message
      if (parsed.type === 'command' && parsed.text) {
        this.handleCommandMessage(clientId, parsed.text, client);
        return;
      }

      // Check for other JSON message types (subscribe, get_health, etc.)
      if (parsed.type) {
        logger.info(`Client ${clientId} sent ${parsed.type} message`);
        // Don't send a response for these message types - they're handled internally
        return;
      }
    } catch (e) {
      // Not JSON, treat as plain text message
      this.handleCommandMessage(clientId, message, client);
      return;
    }
  }

  /**
   * Handle command message (text or JSON)
   */
  private handleCommandMessage(clientId: string, text: string, client: PACEClient): void {
    logger.info(`Client ${clientId} sent: ${text}`);

    // Process message asynchronously (non-blocking)
    (async () => {
      try {
        // Send immediate acknowledgment to the specific client only
        const acknowledgmentMessage = {
          type: 'message',
          query: text,
          response: '🔍 Processing...',
          timestamp: new Date().toISOString(),
          status: 'processing'
        };
        this.sendToClient(clientId, JSON.stringify(acknowledgmentMessage));

        // Call the message handler if set
        let response: string;
        if (this.onMessageHandler) {
          response = await this.onMessageHandler(clientId, text);
        } else {
          // Default echo response
          response = `Echo: ${text}`;
        }

        // Send final response to the specific client only
        const responseMessage = {
          type: 'message',
          query: text,
          response: response,
          timestamp: new Date().toISOString(),
          status: 'complete'
        };
        this.sendToClient(clientId, JSON.stringify(responseMessage));
      } catch (error) {
        logger.error(`Error handling message from ${clientId}:`, error);
        const errorMessage = {
          type: 'message',
          query: text,
          response: 'Sorry, an error occurred processing your request.',
          timestamp: new Date().toISOString(),
          status: 'error',
          error: (error as Error).message
        };
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(errorMessage));
        }
      }
    })();
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: string): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          logger.error(`Error sending to client ${clientId}:`, error);
        }
      }
    }
  }

  /**
   * Send message to a specific client
   */
  sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      try {
        const payload = typeof message === 'string' ? message : JSON.stringify(message);
        client.send(payload);
      } catch (error) {
        logger.error(`Error sending to client ${clientId}:`, error);
      }
    }
  }

  /**
   * Handle client disconnection
   */
  private handleClientDisconnect(clientId: string): void {
    this.clients.delete(clientId);
    logger.info(`Client disconnected: ${clientId}`);

    // Notify handler
    if (this.onClientDisconnectedHandler) {
      this.onClientDisconnectedHandler(clientId);
    }
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }

      // Close all client connections
      for (const client of this.clients.values()) {
        client.close();
      }
      this.clients.clear();

      // Close the server
      this.wss.close(() => {
        this.isServerRunning = false;
        logger.info('WebSocket server stopped');
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.isServerRunning;
  }

  /**
   * Get all connected clients
   */
  getClients(): PACEClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): PACEClient | undefined {
    return this.clients.get(clientId);
  }
}
