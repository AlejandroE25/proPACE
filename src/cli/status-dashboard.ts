#!/usr/bin/env node

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { config } from '../config/index.js';
import WebSocket from 'ws';

/**
 * proPACE Status Dashboard
 * Real-time monitoring dashboard for the proPACE server
 */

interface ServerStatus {
  status: string;
  uptime: number;
  mode: string;
  version: string;
  port: number;
  clients: number;
}

interface PluginInfo {
  id: string;
  name: string;
  enabled: boolean;
  tools: number;
  status: string;
}

interface HealthMetric {
  component: string;
  status: string;
  lastCheck: string;
}

class StatusDashboard {
  private screen: blessed.Widgets.Screen;
  private grid: any;
  private serverBox: blessed.Widgets.BoxElement;
  private pluginList: blessed.Widgets.ListElement;
  private healthTable: contrib.widget.Table;
  private logBox: blessed.Widgets.Log;
  private statusBar: blessed.Widgets.TextElement;
  private ws: WebSocket | null = null;
  private lastRefresh: Date = new Date();

  private serverStatus: ServerStatus = {
    status: 'CHECKING...',
    uptime: 0,
    mode: 'UNKNOWN',
    version: '2.0.0',
    port: config.port,
    clients: 0
  };

  private plugins: PluginInfo[] = [];
  private healthMetrics: HealthMetric[] = [];
  private logs: string[] = [];

  constructor() {
    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'proPACE Status Dashboard'
    });

    // Create grid layout
    this.grid = new contrib.grid({
      rows: 12,
      cols: 12,
      screen: this.screen
    });

    // Server Status Box (top left)
    this.serverBox = this.grid.set(0, 0, 4, 6, blessed.box, {
      label: ' Server Status ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true }
      },
      tags: true
    });

    // Plugin List (top right)
    this.pluginList = this.grid.set(0, 6, 4, 6, blessed.list, {
      label: ' Plugins ',
      border: { type: 'line' },
      style: {
        border: { fg: 'green' },
        label: { fg: 'green', bold: true },
        selected: { bg: 'blue', fg: 'white' }
      },
      mouse: true,
      keys: true,
      vi: true,
      tags: true
    });

    // Health Monitor Table (middle)
    this.healthTable = this.grid.set(4, 0, 4, 12, contrib.table, {
      label: ' Health Monitoring ',
      keys: true,
      vi: true,
      columnSpacing: 3,
      columnWidth: [25, 15, 30],
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'yellow', bold: true }
      }
    });

    // Activity Log (bottom)
    this.logBox = this.grid.set(8, 0, 3, 12, blessed.log, {
      label: ' Activity Log ',
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' },
        label: { fg: 'magenta', bold: true }
      },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        style: { bg: 'blue' }
      },
      mouse: true
    });

    // Status Bar (very bottom)
    this.statusBar = this.grid.set(11, 0, 1, 12, blessed.text, {
      content: ' Press Ctrl+C or q to exit | r to refresh | Auto-refresh: ON (every 2 min)',
      style: {
        fg: 'black',
        bg: 'white'
      }
    });

    // Key bindings
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.cleanup();
      return process.exit(0);
    });

    this.screen.key(['r'], () => {
      this.addLog('Manual refresh triggered');
      this.lastRefresh = new Date();
      this.fetchStatus();
      this.updateStatusBar();
    });

    // Focus handling
    this.pluginList.focus();

    // Render initial screen
    this.screen.render();

    // Start monitoring
    this.start();
  }

  private async start() {
    this.addLog('{cyan-fg}Dashboard started{/cyan-fg}');
    this.addLog(`Connecting to proPACE server at ws://${config.host}:${config.port}...`);

    // Initial fetch
    await this.fetchStatus();

    // Connect WebSocket for real-time updates
    this.connectWebSocket();

    // Update display every 2 seconds
    setInterval(() => {
      this.updateDisplay();
    }, 2000);

    // Auto-refresh data every 2 minutes
    setInterval(() => {
      this.addLog('{blue-fg}Auto-refreshing status...{/blue-fg}');
      this.lastRefresh = new Date();
      this.fetchStatus();
      this.updateStatusBar();
    }, 120000); // 120000ms = 2 minutes

    // Update status bar with time info every second
    setInterval(() => {
      this.updateStatusBar();
    }, 1000);
  }

  private updateStatusBar() {
    const now = new Date();
    const timeSinceRefresh = Math.floor((now.getTime() - this.lastRefresh.getTime()) / 1000);
    const minutesAgo = Math.floor(timeSinceRefresh / 60);
    const secondsAgo = timeSinceRefresh % 60;

    const timeText = minutesAgo > 0
      ? `${minutesAgo}m ${secondsAgo}s ago`
      : `${secondsAgo}s ago`;

    const nextRefresh = 120 - timeSinceRefresh;
    const nextMin = Math.floor(nextRefresh / 60);
    const nextSec = nextRefresh % 60;

    this.statusBar.setContent(
      ` Ctrl+C: Quit | r: Refresh | Last refresh: ${timeText} | Next: ${nextMin}m ${nextSec}s`
    );
    this.screen.render();
  }

  private connectWebSocket() {
    try {
      this.ws = new WebSocket(`ws://${config.host}:${config.port}`);

      this.ws.on('open', () => {
        this.serverStatus.status = 'CONNECTED';
        this.addLog('{green-fg}✓ Connected to server{/green-fg}');
        this.updateDisplay();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        const message = data.toString();
        this.addLog(`{blue-fg}[WS]{/blue-fg} ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`);

        // Parse server messages for client count updates
        if (message.includes('client')) {
          this.fetchStatus(); // Refresh status when clients change
        }
      });

      this.ws.on('close', () => {
        this.serverStatus.status = 'DISCONNECTED';
        this.addLog('{yellow-fg}⚠ WebSocket disconnected{/yellow-fg}');
        this.updateDisplay();

        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          this.addLog('Attempting to reconnect...');
          this.connectWebSocket();
        }, 5000);
      });

      this.ws.on('error', (error) => {
        this.serverStatus.status = 'ERROR';
        this.addLog(`{red-fg}✗ WebSocket error: ${error.message}{/red-fg}`);
        this.updateDisplay();
      });

    } catch (error) {
      this.addLog(`{red-fg}✗ Failed to connect: ${error}{/red-fg}`);
    }
  }

  private async fetchStatus() {
    try {
      // Check if service is running via NSSM
      const { execSync } = await import('child_process');

      try {
        const status = execSync('nssm status proPACE', { encoding: 'utf8' }).trim();
        this.serverStatus.status = status === 'SERVICE_RUNNING' ? 'RUNNING' : status;
      } catch (error) {
        this.serverStatus.status = 'STOPPED';
      }

      // Try to read service logs for plugin info
      await this.fetchPluginInfo();
      await this.fetchHealthInfo();

      this.updateDisplay();
    } catch (error) {
      this.addLog(`{red-fg}Error fetching status: ${error}{/red-fg}`);
    }
  }

  private async fetchPluginInfo() {
    try {
      const fs = await import('fs/promises');
      const logPath = 'C:\\proPACE\\logs\\service-stdout.log';

      try {
        const logContent = await fs.readFile(logPath, 'utf-8');
        const lines = logContent.split('\n');

        // Parse plugin registrations from logs
        const pluginLines = lines.filter(line => line.includes('Plugin registered:'));
        const pluginMap = new Map<string, PluginInfo>();

        pluginLines.forEach(line => {
          const match = line.match(/Plugin registered: ([^\s]+) \((\d+) tools\)/);
          if (match) {
            const [, id, tools] = match;
            pluginMap.set(id, {
              id,
              name: id.split('.').pop() || id,
              enabled: true,
              tools: parseInt(tools, 10),
              status: 'active'
            });
          }
        });

        this.plugins = Array.from(pluginMap.values());

        // Check for agent mode vs legacy mode
        const modeMatch = logContent.match(/Initializing PACE server in (\w+) mode/);
        if (modeMatch) {
          this.serverStatus.mode = modeMatch[1];
        }

      } catch (error) {
        // Log file might not exist yet
        this.plugins = [];
      }
    } catch (error) {
      this.addLog(`Error reading plugin info: ${error}`);
    }
  }

  private async fetchHealthInfo() {
    try {
      const fs = await import('fs/promises');
      const logPath = 'C:\\proPACE\\logs\\service-stdout.log';

      try {
        const logContent = await fs.readFile(logPath, 'utf-8');
        const lines = logContent.split('\n').slice(-50); // Last 50 lines

        // Look for health monitoring registrations
        const healthLines = lines.filter(line =>
          line.includes('Registered component for health monitoring:') ||
          line.includes('Diagnostics complete:')
        );

        const metrics: HealthMetric[] = [];

        healthLines.forEach(line => {
          const componentMatch = line.match(/Registered component for health monitoring: (\w+)/);
          if (componentMatch) {
            metrics.push({
              component: componentMatch[1],
              status: 'monitored',
              lastCheck: 'active'
            });
          }

          const diagMatch = line.match(/Diagnostics complete: (\d+)\/(\d+) passed/);
          if (diagMatch) {
            const [, passed, total] = diagMatch;
            metrics.push({
              component: 'System Diagnostics',
              status: `${passed}/${total} passed`,
              lastCheck: new Date().toLocaleTimeString()
            });
          }
        });

        this.healthMetrics = metrics;

      } catch (error) {
        this.healthMetrics = [];
      }
    } catch (error) {
      this.addLog(`Error reading health info: ${error}`);
    }
  }

  private updateDisplay() {
    // Update server status box
    const statusColor = this.getStatusColor(this.serverStatus.status);

    this.serverBox.setContent(
      `\n` +
      `  {bold}Status:{/bold}        {${statusColor}-fg}${this.serverStatus.status}{/${statusColor}-fg}\n` +
      `  {bold}Mode:{/bold}          ${this.serverStatus.mode}\n` +
      `  {bold}Version:{/bold}       ${this.serverStatus.version}\n` +
      `  {bold}Port:{/bold}          ${this.serverStatus.port}\n` +
      `  {bold}Clients:{/bold}       ${this.serverStatus.clients}\n` +
      `  {bold}Uptime:{/bold}        ${this.formatUptime(this.serverStatus.uptime)}\n`
    );

    // Update plugin list
    const pluginItems = this.plugins.map(p => {
      const icon = p.enabled ? '●' : '○';
      const color = p.enabled ? 'green' : 'red';
      return `{${color}-fg}${icon}{/${color}-fg} ${p.name} {gray-fg}(${p.tools} tools){/gray-fg}`;
    });

    if (pluginItems.length === 0) {
      pluginItems.push('{gray-fg}No plugins loaded{/gray-fg}');
    }

    this.pluginList.setItems(pluginItems);

    // Update health table
    const tableData = this.healthMetrics.map(m => [
      m.component,
      this.colorizeStatus(m.status),
      m.lastCheck
    ]);

    this.healthTable.setData({
      headers: ['Component', 'Status', 'Last Check'],
      data: tableData.length > 0 ? tableData : [['No health data', '-', '-']]
    });

    this.screen.render();
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'RUNNING':
      case 'CONNECTED':
      case 'SERVICE_RUNNING':
        return 'green';
      case 'STOPPED':
      case 'DISCONNECTED':
        return 'red';
      case 'CHECKING...':
        return 'yellow';
      default:
        return 'white';
    }
  }

  private colorizeStatus(status: string): string {
    if (status.includes('passed') || status === 'active' || status === 'monitored') {
      return `{green-fg}${status}{/green-fg}`;
    } else if (status.includes('failed') || status === 'error') {
      return `{red-fg}${status}{/red-fg}`;
    }
    return status;
  }

  private formatUptime(seconds: number): string {
    if (seconds === 0) return 'N/A';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours}h ${minutes}m ${secs}s`;
  }

  private addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `{gray-fg}[${timestamp}]{/gray-fg} ${message}`;
    this.logs.push(logMessage);

    // Keep only last 100 logs
    if (this.logs.length > 100) {
      this.logs.shift();
    }

    this.logBox.log(logMessage);
  }

  private cleanup() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Start the dashboard
new StatusDashboard();
