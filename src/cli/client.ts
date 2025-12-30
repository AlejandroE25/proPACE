import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { CLIConfig, ConnectionState } from './types.js';

/**
 * WebSocket Client Manager
 * Handles connection, auto-reconnect, and message handling
 */
export class PACEClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: CLIConfig;
  private connectionState: ConnectionState = {
    connected: false,
    reconnecting: false,
    attemptCount: 0,
  };
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private currentReconnectDelay: number;

  constructor(config: CLIConfig) {
    super();
    this.config = config;
    this.currentReconnectDelay = config.reconnectDelay;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    const url = `ws://${this.config.host}:${this.config.port}`;

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.connectionState.connected = true;
      this.connectionState.reconnecting = false;
      this.connectionState.attemptCount = 0;
      this.currentReconnectDelay = this.config.reconnectDelay;
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      const message = data.toString();
      this.handleMessage(message);
    });

    this.ws.on('close', () => {
      this.connectionState.connected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: string): void {
    try {
      // Parse JSON message
      const parsed = JSON.parse(message);

      // Handle different message types
      if (parsed.type === 'message') {
        const query = parsed.query || '';
        const response = parsed.response || '';
        this.emit('message', { query, response, status: parsed.status });
      } else {
        // Unknown message type - log but don't error
        this.emit('message', { query: '', response: message });
      }
    } catch (error) {
      // Not JSON, treat as plain text fallback
      this.emit('message', { query: '', response: message });
    }
  }

  /**
   * Send a message to the server
   */
  send(message: string): void {
    if (this.ws && this.connectionState.connected) {
      this.ws.send(message);
    } else {
      this.emit('error', new Error('Not connected to server'));
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    this.connectionState.reconnecting = true;
    this.connectionState.attemptCount++;

    const delay = Math.min(this.currentReconnectDelay, this.config.maxReconnectDelay);

    this.emit('reconnecting', { delay, attempt: this.connectionState.attemptCount });

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * 2,
        this.config.maxReconnectDelay
      );
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connectionState.connected = false;
    this.connectionState.reconnecting = false;
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState.connected;
  }
}
