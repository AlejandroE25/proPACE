#!/usr/bin/env node

import blessed from 'blessed';
import WebSocket from 'ws';

/**
 * PACE Terminal Client - Blessed Edition
 * Beautiful TUI for chatting with PACE
 */

interface CLIConfig {
  host: string;
  port: number;
}

interface Message {
  type: 'user' | 'pace' | 'system';
  content: string;
  timestamp: Date;
}

class PACETerminalBlessed {
  private screen: blessed.Widgets.Screen;
  private chatBox!: blessed.Widgets.BoxElement;
  private inputBox!: blessed.Widgets.TextareaElement;
  private weatherBox!: blessed.Widgets.BoxElement;
  private newsBox!: blessed.Widgets.BoxElement;
  private statusBar!: blessed.Widgets.TextElement;
  private timeDisplay!: blessed.Widgets.TextElement;

  private ws: WebSocket | null = null;
  private config: CLIConfig;
  private messages: Message[] = [];
  private connected = false;
  private reconnecting = false;
  private isTyping = false;

  private weatherData: string = 'Loading...';
  private newsData: string[] = ['Loading news...'];
  private currentNewsIndex = 0;

  constructor(config: CLIConfig) {
    this.config = config;

    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'PACE Terminal',
      fullUnicode: true
    });

    // Create layout
    this.createLayout();

    // Setup key bindings
    this.setupKeyBindings();

    // Connect to server
    this.connect();

    // Start time update
    this.startTimeUpdate();

    // Initial render
    this.screen.render();
  }

  private createLayout() {
    // ASCII Art Logo Header
    const logo = blessed.box({
      top: 0,
      left: 0,
      width: '70%',
      height: 7,
      content:
`                      ____  ___   ____________
    ____  _________  / __ \\/   | / ____/ ____/
   / __ \\/ ___/ __ \\/ /_/ / /| |/ /   / __/
  / /_/ / /  / /_/ / ____/ ___ / /___/ /___
 / .___/_/   \\____/_/   /_/  |_\\____/_____/
/_/                                           `,
      tags: true,
      style: {
        fg: 'cyan',
        bold: true
      }
    });

    // Info box (top right)
    const topBar = blessed.box({
      top: 0,
      left: '70%',
      width: '30%',
      height: 7,
      border: { type: 'line' },
      tags: true,
      style: {
        border: { fg: 'cyan' },
        fg: 'white'
      }
    });

    this.timeDisplay = blessed.text({
      top: 1,
      left: '71%',
      width: '28%',
      height: 5,
      content: '',
      tags: true,
      align: 'center',
      style: {
        fg: 'white'
      }
    });

    // Chat panel (left side, main area)
    this.chatBox = blessed.box({
      label: ' Conversation ',
      top: 7,
      left: 0,
      width: '70%',
      height: '100%-10',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true }
      },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: { bg: 'cyan' }
      },
      mouse: true,
      keys: true,
      vi: true
    });

    // Weather panel (top right)
    this.weatherBox = blessed.box({
      label: ' Weather ',
      top: 7,
      left: '70%',
      width: '30%',
      height: 12,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'yellow', bold: true }
      },
      tags: true,
      content: '\n  Loading weather...'
    });

    // News panel (bottom right)
    this.newsBox = blessed.box({
      label: ' Latest News ',
      top: 19,
      left: '70%',
      width: '30%',
      height: '100%-22',
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { fg: 'green', bold: true }
      },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      content: '\n  Loading news...'
    });

    // Input box (bottom)
    this.inputBox = blessed.textarea({
      label: ' Message (Ctrl+S to send, Tab to cycle focus) ',
      bottom: 1,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        label: { fg: 'magenta', bold: true },
        focus: { border: { fg: 'brightMagenta' } }
      },
      inputOnFocus: true,
      mouse: true,
      keys: true
    });

    // Status bar (very bottom)
    this.statusBar = blessed.text({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' Connecting... | Ctrl+C: Quit | Ctrl+S: Send | Tab: Focus | Ctrl+L: Clear',
      style: {
        fg: 'black',
        bg: 'white'
      }
    });

    // Append all widgets
    this.screen.append(logo);
    this.screen.append(topBar);
    this.screen.append(this.timeDisplay);
    this.screen.append(this.chatBox);
    this.screen.append(this.weatherBox);
    this.screen.append(this.newsBox);
    this.screen.append(this.inputBox);
    this.screen.append(this.statusBar);

    // Focus on input by default
    this.inputBox.focus();
  }

  private setupKeyBindings() {
    // Quit
    this.screen.key(['C-c'], () => {
      this.disconnect();
      return process.exit(0);
    });

    // Send message
    this.screen.key(['C-s'], () => {
      this.sendMessage();
    });

    // Clear chat
    this.screen.key(['C-l'], () => {
      this.clearChat();
    });

    // Cycle focus with Tab
    this.screen.key(['tab'], () => {
      const focusedWidget = this.screen.focused;

      if (focusedWidget === this.inputBox) {
        this.chatBox.focus();
      } else if (focusedWidget === this.chatBox) {
        this.newsBox.focus();
      } else if (focusedWidget === this.newsBox) {
        this.weatherBox.focus();
      } else {
        this.inputBox.focus();
      }
      this.screen.render();
    });

    // Submit on Enter (alternative to Ctrl+S)
    this.inputBox.key(['enter'], () => {
      this.sendMessage();
    });

    // News navigation
    this.screen.key(['n'], () => {
      if (this.newsData.length > 1) {
        this.currentNewsIndex = (this.currentNewsIndex + 1) % this.newsData.length;
        this.updateNews();
      }
    });

    this.screen.key(['p'], () => {
      if (this.newsData.length > 1) {
        this.currentNewsIndex = (this.currentNewsIndex - 1 + this.newsData.length) % this.newsData.length;
        this.updateNews();
      }
    });
  }

  private connect() {
    try {
      this.ws = new WebSocket(`ws://${this.config.host}:${this.config.port}`);

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnecting = false;
        this.addSystemMessage('Connected to PACE server');
        this.updateStatusBar();

        // Request initial data
        setTimeout(() => {
          this.requestWeather();
          this.requestNews();
        }, 500);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleServerMessage(data.toString());
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.addSystemMessage('Disconnected from server');
        this.updateStatusBar();

        // Auto-reconnect after 3 seconds
        if (!this.reconnecting) {
          this.reconnecting = true;
          setTimeout(() => {
            this.addSystemMessage('Reconnecting...');
            this.connect();
          }, 3000);
        }
      });

      this.ws.on('error', (error) => {
        this.addSystemMessage(`Connection error: ${error.message}`);
      });

    } catch (error) {
      this.addSystemMessage(`Failed to connect: ${error}`);
    }
  }

  private disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private sendMessage() {
    const message = this.inputBox.getValue().trim();

    if (!message) return;

    if (!this.connected) {
      this.addSystemMessage('Not connected to server');
      return;
    }

    // Handle commands
    if (message.startsWith('/')) {
      this.handleCommand(message);
      this.inputBox.clearValue();
      this.screen.render();
      return;
    }

    // Add user message to chat
    this.addMessage('user', message);

    // Send to server
    if (this.ws) {
      this.ws.send(message);
    }

    // Clear input
    this.inputBox.clearValue();
    this.screen.render();
  }

  private handleCommand(command: string) {
    const cmd = command.toLowerCase().trim();

    if (cmd === '/clear') {
      this.clearChat();
    } else if (cmd === '/quit' || cmd === '/exit') {
      this.disconnect();
      process.exit(0);
    } else if (cmd === '/weather') {
      this.requestWeather();
    } else if (cmd === '/news') {
      this.requestNews();
    } else if (cmd === '/help') {
      this.showHelp();
    } else {
      this.addSystemMessage(`Unknown command: ${command}\nType /help for available commands`);
    }
  }

  private showHelp() {
    const helpText = `Available commands:
/help     - Show this help
/clear    - Clear conversation
/weather  - Refresh weather
/news     - Refresh news
/quit     - Exit application

Keyboard shortcuts:
Ctrl+S    - Send message
Ctrl+L    - Clear chat
Ctrl+C    - Quit
Tab       - Cycle focus
n/p       - Next/Previous news
Enter     - Send message (when input focused)`;

    this.addSystemMessage(helpText);
  }

  private async requestWeather() {
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/api/weather`);
      const data = await response.json() as { success: boolean; data: string };

      if (data.success) {
        this.weatherData = data.data;
        this.updateWeather();
      } else {
        this.weatherData = 'Failed to fetch weather';
        this.updateWeather();
      }
    } catch (error) {
      this.weatherData = 'Error fetching weather';
      this.updateWeather();
    }
  }

  private async requestNews() {
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/api/news`);
      const data = await response.json() as { success: boolean; data: string };

      if (data.success) {
        const newsText = data.data;
        // Parse news headlines - split by newlines and filter empty lines
        const lines = newsText.split('\n').filter((line: string) => {
          const trimmed = line.trim();
          return trimmed &&
                 !trimmed.toLowerCase().startsWith('here') &&
                 !trimmed.toLowerCase().startsWith('latest') &&
                 !trimmed.match(/^\d+[\.\)]/);
        });

        if (lines.length > 0) {
          this.newsData = lines;
          this.currentNewsIndex = 0;
          this.updateNews();
        }
      } else {
        this.newsData = ['Failed to fetch news'];
        this.updateNews();
      }
    } catch (error) {
      this.newsData = ['Error fetching news'];
      this.updateNews();
    }
  }

  private handleServerMessage(message: string) {
    try {
      // Parse JSON message
      const parsed = JSON.parse(message);

      // Handle different message types
      if (parsed.type === 'message') {
        const response = parsed.response || '';

        // Don't display "Processing..." messages in chat
        if (parsed.status === 'processing') {
          return;
        }

        // All messages go to chat (weather/news now fetched via API)
        if (response.length > 200) {
          this.addMessageWithTypewriter('pace', response);
        } else {
          this.addMessage('pace', response);
        }
      }
    } catch (error) {
      // Not JSON, treat as plain text fallback (shouldn't happen with new protocol)
      this.addSystemMessage(`Received malformed message: ${message}`);
    }
  }

  private async addMessageWithTypewriter(type: 'pace', content: string) {
    const message: Message = {
      type,
      content: '',
      timestamp: new Date()
    };

    this.messages.push(message);
    this.isTyping = true;

    // Type out character by character
    for (let i = 0; i < content.length; i++) {
      message.content += content[i];
      this.updateChat();

      // Small delay for typewriter effect (adjust for speed)
      await new Promise(resolve => setTimeout(resolve, 10));

      // Allow interruption
      if (!this.isTyping) break;
    }

    this.isTyping = false;
    message.content = content; // Ensure full content is set
    this.updateChat();
  }

  private addMessage(type: 'user' | 'pace' | 'system', content: string) {
    const message: Message = {
      type,
      content,
      timestamp: new Date()
    };

    this.messages.push(message);
    this.updateChat();
  }

  private addSystemMessage(content: string) {
    this.addMessage('system', content);
  }

  private updateChat() {
    const lines: string[] = [];

    this.messages.forEach(msg => {
      const time = msg.timestamp.toLocaleTimeString();

      if (msg.type === 'user') {
        lines.push(`{cyan-fg}[${time}] You:{/cyan-fg}`);
        lines.push(`  ${msg.content}`);
        lines.push('');
      } else if (msg.type === 'pace') {
        lines.push(`{green-fg}[${time}] PACE:{/green-fg}`);
        lines.push(`  ${msg.content}`);
        lines.push('');
      } else {
        lines.push(`{yellow-fg}[${time}] System: ${msg.content}{/yellow-fg}`);
        lines.push('');
      }
    });

    this.chatBox.setContent(lines.join('\n'));
    this.chatBox.setScrollPerc(100); // Auto-scroll to bottom
    this.screen.render();
  }

  private updateWeather() {
    // Format weather data nicely
    const lines = this.weatherData.split('\n');
    const formatted = lines.map(line => `  ${line}`).join('\n');

    this.weatherBox.setContent('\n' + formatted);
    this.screen.render();
  }

  private updateNews() {
    if (this.newsData.length === 0) return;

    const current = this.newsData[this.currentNewsIndex];
    const header = `\n  {bold}[${this.currentNewsIndex + 1}/${this.newsData.length}]{/bold}\n\n`;
    const content = `  ${current}\n\n  {gray-fg}Press 'n' for next, 'p' for previous{/gray-fg}`;

    this.newsBox.setContent(header + content);
    this.screen.render();
  }

  private clearChat() {
    this.messages = [];
    this.updateChat();
    this.addSystemMessage('Chat cleared');
  }

  private updateStatusBar() {
    const status = this.connected
      ? '{green-fg}● Connected{/green-fg}'
      : this.reconnecting
        ? '{yellow-fg}● Reconnecting...{/yellow-fg}'
        : '{red-fg}● Disconnected{/red-fg}';

    this.statusBar.setContent(
      ` ${status} | Ctrl+C: Quit | Ctrl+S: Send | Tab: Focus | Ctrl+L: Clear | /help: Commands`
    );
    this.screen.render();
  }

  private startTimeUpdate() {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString();
      const dateStr = now.toLocaleDateString();

      const statusIcon = this.connected ? '●' : this.reconnecting ? '◐' : '○';
      const statusColor = this.connected ? 'green' : this.reconnecting ? 'yellow' : 'red';
      const statusText = this.connected ? 'Connected' : this.reconnecting ? 'Reconnecting...' : 'Disconnected';

      this.timeDisplay.setContent(
        `{center}{bold}${timeStr}{/bold}\n` +
        `{gray-fg}${dateStr}{/gray-fg}\n\n` +
        `{${statusColor}-fg}${statusIcon}{/${statusColor}-fg} ${statusText}\n\n` +
        `{gray-fg}v2.0{/gray-fg}{/center}`
      );
      this.screen.render();
    };

    updateTime();
    setInterval(updateTime, 1000);
  }
}

// Parse command-line arguments
const config: CLIConfig = {
  host: process.env.PACE_HOST || 'localhost',
  port: parseInt(process.env.PACE_PORT || '3000', 10),
};

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
proPACE Terminal Client (Blessed Edition)

Usage: pace [options]

Options:
  --host <host>    WebSocket server host (default: localhost)
  --port <port>    WebSocket server port (default: 3000)
  --help, -h       Show this help message

Environment Variables:
  PACE_HOST        WebSocket server host
  PACE_PORT        WebSocket server port

Keyboard Shortcuts:
  Ctrl+S           Send message
  Ctrl+L           Clear chat
  Ctrl+C           Quit
  Tab              Cycle focus between panels
  Enter            Send message (when input focused)
  n / p            Navigate news (next/previous)

Commands (type in chat):
  /help            Show help
  /clear           Clear conversation
  /weather         Refresh weather
  /news            Refresh news
  /quit, /exit     Exit application
    `);
    process.exit(0);
  }
}

// Start the application
new PACETerminalBlessed(config);
