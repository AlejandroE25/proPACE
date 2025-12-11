#!/usr/bin/env node

import { PACEClient } from './client.js';
import { TerminalUI } from './ui.js';
import { InputHandler } from './input.js';
import {
  TimeManager,
  WeatherManager,
  NewsManager,
  ConversationManager,
} from './dataManager.js';
import { CLIConfig } from './types.js';

/**
 * PACE Terminal Client
 * Main entry point for the terminal UI application
 */

// Default configuration
const config: CLIConfig = {
  host: process.env.PACE_HOST || 'localhost',
  port: parseInt(process.env.PACE_PORT || '9001', 10),
  reconnectDelay: 1000,
  maxReconnectDelay: 30000,
  weatherRefreshInterval: 15 * 60 * 1000, // 15 minutes
  newsRefreshInterval: 60 * 60 * 1000, // 1 hour
  timeRefreshInterval: 1000, // 1 second
};

// Parse command-line arguments
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && args[i + 1]) {
    config.host = args[i + 1];
    i++;
  } else if (args[i] === '--port' && args[i + 1]) {
    config.port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
PACE Terminal Client

Usage: pace-cli [options]

Options:
  --host <host>    WebSocket server host (default: localhost)
  --port <port>    WebSocket server port (default: 9001)
  --help, -h       Show this help message

Environment Variables:
  PACE_HOST        WebSocket server host
  PACE_PORT        WebSocket server port

Commands (in terminal):
  /quit, /exit     Exit the application
  /restart         Restart the application
  /clear           Clear conversation
  /refresh         Force refresh weather and news
  /help            Show help in terminal
    `);
    process.exit(0);
  }
}

/**
 * Main Application Class
 */
class PACETerminal {
  private client: PACEClient;
  private ui: TerminalUI;
  private input: InputHandler;
  private timeManager: TimeManager;
  private weatherManager: WeatherManager;
  private newsManager: NewsManager;
  private conversationManager: ConversationManager;
  private messageQueue: Array<{ query: string; response: string }> = [];
  private processingMessage: boolean = false;

  constructor() {
    this.client = new PACEClient(config);
    this.ui = new TerminalUI();
    this.input = new InputHandler();
    this.timeManager = new TimeManager(config.timeRefreshInterval);
    this.weatherManager = new WeatherManager(this.client, config.weatherRefreshInterval);
    this.newsManager = new NewsManager(this.client, config.newsRefreshInterval);
    this.conversationManager = new ConversationManager();

    this.setupEventHandlers();
  }

  /**
   * Setup all event handlers
   */
  private setupEventHandlers(): void {
    // Client events
    this.client.on('connected', () => {
      this.ui.updateData({
        connectionState: this.client.getConnectionState(),
      });
      this.renderUI();

      // Start managers once connected
      this.weatherManager.start();
      this.newsManager.start();
    });

    this.client.on('disconnected', () => {
      this.ui.updateData({
        connectionState: this.client.getConnectionState(),
      });
      this.renderUI();
    });

    this.client.on('reconnecting', () => {
      this.ui.updateData({
        connectionState: this.client.getConnectionState(),
      });
      this.renderUI();
    });

    this.client.on('message', (data: { query: string; response: string }) => {
      // Check if this is a weather or news response (handled by managers)
      const queryLower = data.query.toLowerCase();
      if (queryLower.includes('weather') || queryLower.includes('news')) {
        // Already handled by managers
        return;
      }

      // Regular conversation message
      this.conversationManager.setResponse(data.response);
      this.processingMessage = false;
      this.processMessageQueue();
    });

    this.client.on('error', (error: Error) => {
      // Could display error in conversation panel
      console.error('Client error:', error.message);
    });

    // Time manager events
    this.timeManager.on('update', (timeData) => {
      this.ui.updateData({ time: timeData });
      // Only update header to avoid clearing user input
      this.ui.renderHeaderOnly();
    });

    // Weather manager events
    this.weatherManager.on('update', (weatherData) => {
      this.ui.updateData({ weather: weatherData });
      this.renderUI();
    });

    this.weatherManager.on('error', (error: Error) => {
      console.error('Weather error:', error.message);
    });

    // News manager events
    this.newsManager.on('update', (newsData) => {
      this.ui.updateData({ news: newsData });
      this.renderUI();
    });

    this.newsManager.on('error', (error: Error) => {
      console.error('News error:', error.message);
    });

    // Conversation manager events
    this.conversationManager.on('update', (conversationData) => {
      this.ui.updateData({ conversation: conversationData });
      this.renderUI();
    });

    // Input handler events
    this.input.on('message', (message: string) => {
      this.handleUserMessage(message);
    });

    this.input.on('clear', () => {
      this.conversationManager.clear();
    });

    this.input.on('refresh', () => {
      this.weatherManager.fetch();
      this.newsManager.fetch();
    });

    this.input.on('help', () => {
      this.showHelp();
    });

    this.input.on('exit', () => {
      this.shutdown();
    });

    // this.input.on('restart', () => {
    //   this.restart();
    // });

    this.input.on('prompt', () => {
      this.renderUI();
    });

    this.input.on('error', (error: Error) => {
      console.error('Input error:', error.message);
    });
  }

  /**
   * Render UI with current state
   */
  private renderUI(): void {
    const newsIndex = this.newsManager.getCurrentIndex();
    const newsCount = this.newsManager.getHeadlineCount();
    this.ui.render(newsIndex, newsCount);
  }

  /**
   * Handle user message
   */
  private handleUserMessage(message: string): void {
    if (!this.client.isConnected()) {
      this.conversationManager.setQuery('Not connected');
      this.conversationManager.setResponse('Cannot send message: not connected to server');
      return;
    }

    // Set query immediately
    this.conversationManager.setQuery(message);

    // Send to server
    this.client.send(message);
    this.processingMessage = true;

    // Start a timeout in case we don't get a response
    setTimeout(() => {
      if (this.processingMessage) {
        this.conversationManager.setResponse('Request timed out. Please try again.');
        this.processingMessage = false;
      }
    }, 30000); // 30 second timeout
  }

  /**
   * Process message queue (if we need to queue messages)
   */
  private processMessageQueue(): void {
    if (this.messageQueue.length > 0 && !this.processingMessage) {
      const nextMessage = this.messageQueue.shift();
      if (nextMessage) {
        this.conversationManager.setQuery(nextMessage.query);
        this.conversationManager.setResponse(nextMessage.response);
      }
    }
  }

  /**
   * Show help in conversation panel
   */
  private showHelp(): void {
    const helpText = `Available commands:
/quit, /exit - Exit the application
/restart - Restart the application
/clear - Clear conversation
/refresh - Force refresh weather and news
/help - Show this help message

Just type your message and press Enter to chat with PACE!`;

    this.conversationManager.setQuery('/help');
    this.conversationManager.setResponse(helpText);
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    // Log terminal capabilities for debugging
    if (process.env.DEBUG) {
      console.log('Terminal capabilities:', this.ui.getCapabilitiesDescription());
      console.log('Press any key to continue...');
      await new Promise((resolve) => process.stdin.once('data', resolve));
    }

    // Initialize UI
    this.renderUI();

    // Start time manager
    this.timeManager.start();

    // Connect to WebSocket server
    this.client.connect();

    // Initialize input handler
    this.input.init();
    this.input.enable();
  }


  /**
   * Shutdown the application
   */
  private shutdown(): void {
    // Stop all managers
    this.timeManager.stop();
    this.weatherManager.stop();
    this.newsManager.stop();

    // Disconnect client
    this.client.disconnect();

    // Close input
    this.input.close();

    // Clear screen and show exit message
    console.clear();
    console.log('Thanks for using PACE Terminal! Goodbye.');
    process.exit(0);
  }
}

// Start the application
const app = new PACETerminal();
app.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
