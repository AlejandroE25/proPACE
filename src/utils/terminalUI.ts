import boxen from 'boxen';
import chalk from 'chalk';

/**
 * Terminal UI utilities for formatted output
 */

/**
 * Display startup banner
 */
export function displayStartupBanner(mode: 'AGENT' | 'LEGACY'): void {
  const banner = boxen(
    chalk.bold.cyan('proPACE v2.0') + '\n' +
    chalk.dim('Personal AI Assistant') + '\n\n' +
    chalk.yellow(`Mode: ${mode}`),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      title: chalk.bold('🤖 AI Assistant'),
      titleAlignment: 'center'
    }
  );
  console.log(banner);
}

/**
 * Display server configuration
 */
export function displayServerConfig(config: {
  environment: string;
  host: string;
  port: number;
  logLevel: string;
}): void {
  console.log(chalk.bold.white('\n📋 Server Configuration'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.white('  Environment: ') + chalk.green(config.environment));
  console.log(chalk.white('  Host:        ') + chalk.green(config.host));
  console.log(chalk.white('  Port:        ') + chalk.green(config.port));
  console.log(chalk.white('  Log Level:   ') + chalk.green(config.logLevel));
  console.log(chalk.dim('─'.repeat(50)) + '\n');
}

/**
 * Display plugin initialization status
 */
export function displayPluginStatus(pluginCount: number): void {
  console.log(chalk.bold.white('🔌 Plugin System'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.white('  Registered Plugins: ') + chalk.green(pluginCount));
  console.log(chalk.dim('─'.repeat(50)) + '\n');
}

/**
 * Display successful server start
 */
export function displayServerStarted(wsUrl: string): void {
  const message = boxen(
    chalk.bold.green('✓ Server Running') + '\n\n' +
    chalk.white('WebSocket: ') + chalk.cyan.underline(wsUrl) + '\n\n' +
    chalk.dim('Press Ctrl+C to stop'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'green'
    }
  );
  console.log(message);
}

/**
 * Display initialization step
 */
export function displayInitStep(step: string, status: 'start' | 'success' | 'error' = 'start'): void {
  let icon: string;
  let color: typeof chalk.green;

  switch (status) {
    case 'start':
      icon = '⏳';
      color = chalk.yellow;
      break;
    case 'success':
      icon = '✓';
      color = chalk.green;
      break;
    case 'error':
      icon = '✗';
      color = chalk.red;
      break;
  }

  console.log(color(`${icon} ${step}`));
}

/**
 * Display client connection event
 */
export function displayClientConnected(clientId: string, totalClients: number): void {
  console.log(
    chalk.green('→ ') +
    chalk.white('Client connected: ') +
    chalk.cyan(clientId) +
    chalk.dim(` (Total: ${totalClients})`)
  );
}

/**
 * Display client disconnection event
 */
export function displayClientDisconnected(clientId: string, totalClients: number): void {
  console.log(
    chalk.red('← ') +
    chalk.white('Client disconnected: ') +
    chalk.cyan(clientId) +
    chalk.dim(` (Total: ${totalClients})`)
  );
}

/**
 * Display incoming message
 */
export function displayIncomingMessage(clientId: string, message: string, truncateLength = 60): void {
  const truncated = message.length > truncateLength
    ? message.substring(0, truncateLength) + '...'
    : message;

  console.log(
    chalk.blue('📨 ') +
    chalk.dim(`[${clientId.substring(0, 8)}]`) +
    chalk.white(' ← ') +
    chalk.white(truncated)
  );
}

/**
 * Display outgoing response
 */
export function displayOutgoingResponse(clientId: string, response: string, truncateLength = 60): void {
  const truncated = response.length > truncateLength
    ? response.substring(0, truncateLength) + '...'
    : response;

  console.log(
    chalk.magenta('📤 ') +
    chalk.dim(`[${clientId.substring(0, 8)}]`) +
    chalk.white(' → ') +
    chalk.white(truncated)
  );
}

/**
 * Display error message
 */
export function displayError(message: string, error?: any): void {
  console.log(chalk.red.bold('\n❌ Error: ') + chalk.red(message));
  if (error) {
    console.log(chalk.dim(error.stack || error.toString()));
  }
  console.log('');
}

/**
 * Display warning message
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow('⚠️  ') + chalk.yellow(message));
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  console.log(chalk.cyan('ℹ️  ') + chalk.white(message));
}

/**
 * Display shutdown message
 */
export function displayShutdown(): void {
  const message = boxen(
    chalk.bold.yellow('Shutting down...') + '\n\n' +
    chalk.dim('Goodbye! 👋'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'yellow'
    }
  );
  console.log(message);
}

/**
 * Clear console and display header (useful for refreshing status)
 */
export function clearAndDisplayHeader(mode: 'AGENT' | 'LEGACY'): void {
  console.clear();
  displayStartupBanner(mode);
}

/**
 * Display subsystem routing (for agent mode)
 */
export function displayRouting(subsystem: string, confidence: number): void {
  const confidenceColor = confidence > 0.8 ? chalk.green : confidence > 0.5 ? chalk.yellow : chalk.red;
  console.log(
    chalk.blue('🎯 ') +
    chalk.white('Routing to: ') +
    chalk.cyan(subsystem) +
    chalk.dim(' (confidence: ') +
    confidenceColor(`${(confidence * 100).toFixed(0)}%`) +
    chalk.dim(')')
  );
}

/**
 * Display task status (for agent mode)
 */
export function displayTaskStatus(taskId: string, status: 'started' | 'completed' | 'failed'): void {
  let icon: string;
  let color: typeof chalk.green;
  let message: string;

  switch (status) {
    case 'started':
      icon = '▶️';
      color = chalk.blue;
      message = 'Task started';
      break;
    case 'completed':
      icon = '✅';
      color = chalk.green;
      message = 'Task completed';
      break;
    case 'failed':
      icon = '❌';
      color = chalk.red;
      message = 'Task failed';
      break;
  }

  console.log(
    color(`${icon} ${message}: `) +
    chalk.dim(taskId.substring(0, 12))
  );
}
