import chalk from 'chalk';
import boxen from 'boxen';
import { DisplayData, LayoutConfig } from './types.js';
import { TerminalDetector, TerminalCapabilities } from './terminalDetector.js';

/**
 * Terminal UI Renderer
 * Handles full-screen dashboard rendering with panels
 */
export class TerminalUI {
  private displayData: DisplayData;
  private layout: LayoutConfig;
  private terminalWidth: number;
  private terminalHeight: number;
  private capabilities: TerminalCapabilities;

  constructor() {
    this.displayData = this.getDefaultDisplayData();
    this.terminalWidth = process.stdout.columns || 80;
    this.terminalHeight = process.stdout.rows || 24;
    this.layout = this.calculateLayout();
    this.capabilities = TerminalDetector.detect();

    // Listen for terminal resize
    process.stdout.on('resize', () => {
      this.terminalWidth = process.stdout.columns || 80;
      this.terminalHeight = process.stdout.rows || 24;
      this.layout = this.calculateLayout();
      this.render();
    });
  }

  /**
   * Get default display data
   */
  private getDefaultDisplayData(): DisplayData {
    return {
      time: {
        time: '--:--:--',
        date: '---',
      },
      weather: null,
      news: null,
      conversation: {
        query: '',
        response: '',
      },
      connectionState: {
        connected: false,
        reconnecting: false,
        attemptCount: 0,
      },
    };
  }

  /**
   * Calculate panel layout based on terminal size
   * New design: Chat on left, Weather/News stacked on right
   */
  private calculateLayout(): LayoutConfig {
    const width = this.terminalWidth;
    const height = this.terminalHeight;

    // Panel heights
    const headerHeight = 8; // ASCII art logo
    const inputHeight = 3;
    const contentHeight = height - headerHeight - inputHeight;

    // Panel widths - split 50/50
    const leftWidth = Math.floor(width / 2);
    const rightWidth = width - leftWidth;

    // Right side split - weather and news
    const weatherHeight = Math.floor(contentHeight * 0.3); // 30% for weather
    const newsHeight = contentHeight - weatherHeight; // 70% for news

    return {
      header: {
        width: width,
        height: headerHeight,
        x: 0,
        y: 0,
      },
      time: {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
      }, // Time not shown separately, will be in header
      weather: {
        width: rightWidth,
        height: weatherHeight,
        x: leftWidth,
        y: headerHeight,
      },
      news: {
        width: rightWidth,
        height: newsHeight,
        x: leftWidth,
        y: headerHeight + weatherHeight,
      },
      conversation: {
        width: leftWidth,
        height: contentHeight,
        x: 0,
        y: headerHeight,
      },
      input: {
        width: width,
        height: inputHeight,
        x: 0,
        y: height - inputHeight,
      },
    };
  }

  /**
   * Update display data
   */
  updateData(data: Partial<DisplayData>): void {
    this.displayData = {
      ...this.displayData,
      ...data,
    };
  }

  /**
   * Clear screen and move cursor to top
   */
  private clearScreen(): void {
    // ANSI escape codes
    process.stdout.write('\x1b[2J'); // Clear screen
    process.stdout.write('\x1b[H'); // Move cursor to home
  }

  /**
   * Move cursor to position
   */
  private moveCursor(x: number, y: number): void {
    process.stdout.write(`\x1b[${y + 1};${x + 1}H`);
  }

  /**
   * Render the full UI
   */
  render(newsIndex: number = 0, newsCount: number = 0): void {
    this.clearScreen();

    this.renderHeader();
    this.renderConversation();
    this.renderWeather();
    this.renderNews(newsIndex, newsCount);
    this.renderInput();
  }

  /**
   * Render only the header (for clock updates without clearing input)
   */
  renderHeaderOnly(): void {
    // Get current cursor position before rendering
    const inputPos = this.getInputPosition();

    this.renderHeader();

    // Restore cursor to input position explicitly (more compatible than \x1b7/\x1b8)
    this.moveCursor(inputPos.x, inputPos.y);
  }

  /**
   * Render header panel
   */
  private renderHeader(): void {
    const { connectionState, time } = this.displayData;

    // Use ASCII fallback for status icon if no Unicode support
    const statusIcon = this.capabilities.supportsUnicode
      ? (connectionState.connected
          ? chalk.green('●')
          : connectionState.reconnecting
            ? chalk.yellow('●')
            : chalk.red('●'))
      : (connectionState.connected
          ? chalk.green('[*]')
          : connectionState.reconnecting
            ? chalk.yellow('[~]')
            : chalk.red('[X]'));

    const statusText = connectionState.connected
      ? 'Connected'
      : connectionState.reconnecting
        ? `Reconnecting (${connectionState.attemptCount})`
        : 'Disconnected';

    // ASCII art logo - "PACE" with optional italic formatting
    const italic = this.capabilities.supportsItalic ? '\x1b[3m' : '';
    const reset = this.capabilities.supportsItalic ? '\x1b[0m' : '';

    const logo  = chalk.bold.white(italic + '                      ____  ___   ____________' + reset);
    const logo2 = chalk.bold.white(italic + '    ____  _________  / __ \\/   | / ____/ ____/' + reset);
    const logo3 = chalk.bold.white(italic + '   / __ \\/ ___/ __ \\/ /_/ / /| |/ /   / __/   ' + reset);
    const logo4 = chalk.bold.white(italic + '  / /_/ / /  / /_/ / ____/ ___ / /___/ /___   ' + reset);
    const logo5 = chalk.bold.white(italic + ' / .___/_/   \\____/_/   /_/  |_\\____/_____/   ' + reset);
    const logo6 = chalk.bold.white(italic + '/_/                                           ' + reset);

    const timeDisplay = chalk.white(time.time) + ' ' + chalk.gray(time.date);
    const status = `${statusIcon} ${statusText}`;
    const version = chalk.gray('v2.0');

    // Render logo without box
    this.moveCursor(0, this.layout.header.y);
    process.stdout.write(logo);
    this.moveCursor(0, this.layout.header.y + 1);
    process.stdout.write(logo2);
    this.moveCursor(0, this.layout.header.y + 2);
    process.stdout.write(logo3);
    this.moveCursor(0, this.layout.header.y + 3);
    process.stdout.write(logo4);
    this.moveCursor(0, this.layout.header.y + 4);
    process.stdout.write(logo5);
    this.moveCursor(0, this.layout.header.y + 5);
    process.stdout.write(logo6);

    // Create info box on the right with time, status, version
    const infoContent = `${timeDisplay}\n${status}\n\n${version}`;
    const infoBox = boxen(infoContent, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: 0,
      borderStyle: this.capabilities.supportsUnicode ? 'round' : 'single',
      borderColor: 'cyan',
      width: Math.floor(this.layout.header.width * 0.35),
    });

    // Position info box on the right side
    const infoPosX = this.layout.header.width - Math.floor(this.layout.header.width * 0.35) - 2;
    this.moveCursor(infoPosX, this.layout.header.y);
    this.writeMultiline(infoBox, this.layout.header.y, infoPosX);
  }

  /**
   * Render weather panel
   */
  private renderWeather(): void {
    const { weather } = this.displayData;

    // Use emoji or ASCII fallback
    const weatherIcon = this.capabilities.supportsEmoji ? '☁️  ' : '[W] ';

    let content: string;
    if (weather) {
      const lastUpdated = weather.lastUpdated.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      content = `${chalk.bold(weatherIcon + 'WEATHER')}\n\n${chalk.white.bold(weather.city)}\n${chalk.yellow(`${weather.temp}°F`)} • ${weather.description}\nFeels like ${weather.feelsLike}°F\n\n${chalk.gray(`Updated: ${lastUpdated}`)}`;
    } else {
      content = `${chalk.bold(weatherIcon + 'WEATHER')}\n\n${chalk.gray('Loading...')}`;
    }

    const box = boxen(content, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: 0,
      borderStyle: this.capabilities.supportsUnicode ? 'round' : 'single',
      borderColor: 'yellow',
      width: this.layout.weather.width,
      height: this.layout.weather.height,
    });

    this.moveCursor(this.layout.weather.x, this.layout.weather.y);
    this.writeMultiline(box, this.layout.weather.y, this.layout.weather.x);
  }

  /**
   * Render news panel
   */
  renderNews(_currentIndex: number = 0, _totalCount: number = 0): void {
    const { news } = this.displayData;

    // Use emoji or ASCII fallback
    const newsIcon = this.capabilities.supportsEmoji ? '📰 ' : '[N] ';
    const bullet = this.capabilities.supportsUnicode ? '•' : '*';

    let content: string;
    if (news && news.headlines.length > 0) {
      const lastUpdated = news.lastUpdated.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Calculate how many headlines can fit in the panel
      const maxWidth = this.layout.news.width - 6;
      const availableHeight = this.layout.news.height - 6; // Account for borders, title, footer

      // Show as many headlines as will fit
      const headlinesToShow = Math.min(news.headlines.length, Math.floor(availableHeight / 2));

      const headlinesList = news.headlines
        .slice(0, headlinesToShow)
        .map((headline) => {
          const truncated = headline.length > maxWidth - 3
            ? headline.substring(0, maxWidth - 6) + '...'
            : headline;
          return `${chalk.gray(bullet)} ${chalk.white(truncated)}`;
        })
        .join('\n');

      content = `${chalk.bold(newsIcon + 'NEWS HEADLINES')}\n\n${headlinesList}\n\n${chalk.gray(`Updated: ${lastUpdated}`)}`;
    } else {
      content = `${chalk.bold(newsIcon + 'NEWS HEADLINES')}\n\n${chalk.gray('Loading...')}`;
    }

    const box = boxen(content, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: 0,
      borderStyle: this.capabilities.supportsUnicode ? 'round' : 'single',
      borderColor: 'magenta',
      width: this.layout.news.width,
      height: this.layout.news.height,
    });

    this.moveCursor(this.layout.news.x, this.layout.news.y);
    this.writeMultiline(box, this.layout.news.y, this.layout.news.x);
  }

  /**
   * Render conversation panel
   */
  private renderConversation(): void {
    const { conversation } = this.displayData;

    // Use emoji or ASCII fallback
    const chatIcon = this.capabilities.supportsEmoji ? '💬 ' : '[C] ';

    let content: string;
    if (conversation.query && conversation.response) {
      const maxWidth = this.layout.conversation.width - 6;
      const query = this.wrapText(conversation.query, maxWidth);
      const responseFormatted = this.formatResponseText(conversation.response);
      const response = this.wrapText(responseFormatted, maxWidth);
      content = `${chalk.bold(chatIcon + 'CHAT')}\n\n${chalk.cyan.bold('You:')}\n${chalk.white(query)}\n\n${chalk.green.bold('PACE:')}\n${response}`;
    } else if (conversation.query) {
      const maxWidth = this.layout.conversation.width - 6;
      const query = this.wrapText(conversation.query, maxWidth);
      content = `${chalk.bold(chatIcon + 'CHAT')}\n\n${chalk.cyan.bold('You:')}\n${chalk.white(query)}\n\n${chalk.green.bold('PACE:')}\n${chalk.gray('Thinking...')}`;
    } else {
      content = `${chalk.bold(chatIcon + 'CHAT')}\n\n${chalk.gray('Type a message below and press Enter to chat...')}`;
    }

    const box = boxen(content, {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      margin: 0,
      borderStyle: this.capabilities.supportsUnicode ? 'round' : 'single',
      borderColor: 'green',
      width: this.layout.conversation.width,
      height: this.layout.conversation.height,
    });

    this.moveCursor(this.layout.conversation.x, this.layout.conversation.y);
    this.writeMultiline(box, this.layout.conversation.y, this.layout.conversation.x);
  }

  /**
   * Render input panel
   */
  private renderInput(): void {
    const content = chalk.bold.white('> ');

    const box = boxen(content, {
      padding: 0,
      margin: 0,
      borderStyle: this.capabilities.supportsUnicode ? 'round' : 'single',
      borderColor: 'white',
      width: this.layout.input.width,
    });

    this.moveCursor(this.layout.input.x, this.layout.input.y);
    this.writeMultiline(box, this.layout.input.y);

    // Position cursor in input area
    this.moveCursor(4, this.layout.input.y + 1);
  }

  /**
   * Helper: Format response text - convert *text* to bold
   */
  private formatResponseText(text: string): string {
    return text.replace(/\*([^\*]+)\*/g, (_match, content) => {
      return chalk.white.bold(content);
    });
  }

  /**
   * Helper: Wrap text to max width
   */
  private wrapText(text: string, maxWidth: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);

    return lines.join('\n');
  }

  /**
   * Helper: Write multiline text starting at X,Y position
   */
  private writeMultiline(text: string, startY: number, startX: number = 0): void {
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      this.moveCursor(startX, startY + index);
      process.stdout.write(line);
    });
  }

  /**
   * Get input position for readline
   */
  getInputPosition(): { x: number; y: number } {
    return {
      x: 4,
      y: this.layout.input.y + 1,
    };
  }

  /**
   * Get terminal capabilities for debugging
   */
  getCapabilities(): TerminalCapabilities {
    return this.capabilities;
  }

  /**
   * Get terminal capabilities description
   */
  getCapabilitiesDescription(): string {
    return TerminalDetector.describe(this.capabilities);
  }
}
