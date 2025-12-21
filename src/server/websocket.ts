import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { PACEClient } from '../types/index.js';
import { logger } from '../utils/logger.js';

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
  private clients: Map<string, PACEClient> = new Map();
  private isServerRunning: boolean = false;
  private options: WebSocketServerOptions;
  private onMessageHandler?: (clientId: string, message: string) => Promise<string>;
  private onClientConnectedHandler?: (clientId: string) => void;
  private onClientDisconnectedHandler?: (clientId: string) => void;

  constructor(options: WebSocketServerOptions) {
    this.options = options;
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
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({
        host: this.options.host,
        port: this.options.port,
      });

      this.wss.on('connection', (ws: WebSocket) => {
        this.handleNewClient(ws as PACEClient);
      });

      this.wss.on('listening', () => {
        this.isServerRunning = true;
        logger.info(`WebSocket server started on ${this.options.host}:${this.options.port}`);
        resolve();
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error:', error);
      });
    });
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
    const welcomeMessage = ' $$ Hello! I am PACE, your personal assistant.';
    ws.send(welcomeMessage);

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
    logger.info(`Client ${clientId} sent: ${message}`);

    // Process message asynchronously (non-blocking)
    (async () => {
      try {
        // Send immediate acknowledgment
        const acknowledgmentMessage = `${message}$$🔍 Processing...`;
        this.broadcast(acknowledgmentMessage);

        // Call the message handler if set
        let response: string;
        if (this.onMessageHandler) {
          response = await this.onMessageHandler(clientId, message);
        } else {
          // Default echo response
          response = `Echo: ${message}`;
        }

        // Broadcast final response to all clients
        const broadcastMessage = `${message}$$${response}`;
        this.broadcast(broadcastMessage);
      } catch (error) {
        logger.error(`Error handling message from ${clientId}:`, error);
        const errorMessage = `${message}$$Sorry, an error occurred processing your request.`;
        if (client.readyState === WebSocket.OPEN) {
          client.send(errorMessage);
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
