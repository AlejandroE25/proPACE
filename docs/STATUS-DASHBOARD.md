# proPACE Status Dashboard

A beautiful terminal-based status monitoring dashboard for the proPACE server.

## Overview

The Status Dashboard provides real-time monitoring of your proPACE server with a professional TUI (Terminal User Interface). It displays server status, plugin information, health metrics, and activity logs in a clean, organized layout.

## Features

- **Real-time Updates**: Automatically refreshes status every 2 seconds
- **Server Status**: Shows running status, mode (Agent/Legacy), version, port, and client count
- **Plugin Monitoring**: Lists all registered plugins with their tool counts
- **Health Metrics**: Displays component health and diagnostic results
- **Activity Log**: Real-time scrolling log of server activity
- **WebSocket Connection**: Live connection to server for instant updates
- **Keyboard Navigation**: Full keyboard support for interaction

## Quick Start

### Development Mode

```bash
npm run dashboard
```

### Production Mode

```bash
# First build the project
npm run build

# Then run the dashboard
npm run status
```

## Dashboard Layout

```
┌─────────────────────┬─────────────────────┐
│   Server Status     │      Plugins        │
│                     │                     │
│  Status: RUNNING    │  ● weather (1)      │
│  Mode: AGENT        │  ● news (1)         │
│  Version: 2.0.0     │  ● wolfram (1)      │
│  Port: 3000         │  ● memory (4)       │
│  Clients: 0         │  ● diagnostic (4)   │
│  Uptime: 1h 23m     │  ● recovery (7)     │
│                     │  ● global_ctx (6)   │
└─────────────────────┴─────────────────────┘
┌───────────────────────────────────────────┐
│         Health Monitoring                 │
│                                           │
│  Component          Status    Last Check │
│  plugin_registry    monitored active     │
│  anthropic_api      monitored active     │
│  weather_tool       monitored active     │
│  System Diagnostics 6/6 passed 10:15 AM  │
└───────────────────────────────────────────┘
┌───────────────────────────────────────────┐
│         Activity Log                      │
│                                           │
│  [10:15:23] Dashboard started             │
│  [10:15:23] Connecting to server...       │
│  [10:15:24] ✓ Connected to server         │
│  [10:15:25] Manual refresh triggered      │
└───────────────────────────────────────────┘
 Press Ctrl+C or q to exit | r to refresh
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `q` or `Ctrl+C` | Exit dashboard |
| `r` | Manual refresh (also resets auto-refresh timer) |
| `↑` `↓` | Navigate plugin list |
| `Mouse` | Click to interact with elements |

## Auto-Refresh

The dashboard automatically refreshes data every **2 minutes**. The status bar shows:
- **Last refresh:** Time since last data fetch
- **Next:** Countdown to next automatic refresh

You can still manually refresh at any time by pressing `r`, which will also reset the auto-refresh timer.

## Information Displayed

### Server Status Panel
- **Status**: Current service status (RUNNING, STOPPED, etc.)
- **Mode**: Operating mode (AGENT or LEGACY)
- **Version**: proPACE version
- **Port**: WebSocket server port
- **Clients**: Number of connected clients
- **Uptime**: Time since server started

### Plugins Panel
- Lists all registered plugins
- Shows plugin name
- Displays number of tools per plugin
- Green dot (●) indicates active plugin
- Sorted alphabetically

### Health Monitoring Table
- **Component**: Name of monitored component
- **Status**: Current health status
- **Last Check**: Timestamp of last health check
- Shows diagnostic test results (e.g., "6/6 passed")

### Activity Log
- Real-time scrolling log
- Color-coded messages:
  - 🟢 Green: Success messages
  - 🟡 Yellow: Warnings
  - 🔴 Red: Errors
  - 🔵 Blue: WebSocket messages
- Timestamps for each entry
- Auto-scrolls to newest messages

## Connection Status

The dashboard connects to the proPACE server via WebSocket:

- **CONNECTED**: Successfully connected, receiving real-time updates
- **DISCONNECTED**: Connection lost, will auto-reconnect in 5 seconds
- **ERROR**: Connection error occurred

## Requirements

- proPACE server must be running (via NSSM service or `npm start`)
- Server must be accessible on configured host and port
- Read access to service logs at `C:\proPACE\logs\service-stdout.log`

## Troubleshooting

### Dashboard shows "STOPPED" status

The server is not running. Start it with:
```powershell
nssm start proPACE
```

### "Failed to connect" errors

1. Verify server is running:
   ```bash
   nssm status proPACE
   ```

2. Check server port in `.env`:
   ```
   PORT=3000
   ```

3. Ensure no firewall is blocking the connection

### No plugins showing

This is normal during initial startup. Wait a few seconds for the server to initialize, then press `r` to refresh.

### Blank or corrupted display

Some terminal emulators may not support all features. Try:
- Windows Terminal (recommended)
- ConEmu
- PowerShell 7+

Avoid:
- CMD.exe (limited support)
- Very old terminal emulators

## Technical Details

### Data Sources

The dashboard gathers information from:
1. **NSSM Service Status**: Via `nssm status proPACE` command
2. **Server Logs**: Reads `C:\proPACE\logs\service-stdout.log`
3. **WebSocket**: Real-time connection to server at `ws://host:port`

### Update Frequency

- Display refresh: Every 2 seconds
- WebSocket: Real-time (immediate updates)
- Log file parsing: Every 2 seconds
- Auto-reconnect: 5 seconds after disconnect

### Dependencies

- `blessed`: Terminal UI framework
- `blessed-contrib`: Dashboard widgets (tables, grids)
- `ws`: WebSocket client for real-time updates

## Development

To modify the dashboard:

1. Edit `src/cli/status-dashboard.ts`
2. Build: `npm run build`
3. Test: `npm run dashboard` (dev mode)

### Adding New Metrics

To add a new metric to the dashboard:

1. Add property to relevant interface (e.g., `ServerStatus`)
2. Fetch data in appropriate method (e.g., `fetchStatus()`)
3. Update display in `updateDisplay()`
4. Render in the relevant UI component

### Customizing Layout

The layout uses a 12x12 grid. Modify widget positions in the constructor:

```typescript
// Format: grid.set(row, col, height, width, widget, options)
this.serverBox = this.grid.set(0, 0, 4, 6, blessed.box, { ... });
```

## Use Cases

### Development
Monitor server status while developing features

### Deployment
Verify successful deployment and plugin initialization

### Debugging
Watch real-time logs and health metrics during troubleshooting

### Production Monitoring
Quick status check without checking logs files

## Best Practices

1. **Keep it running**: Leave dashboard open during development for instant feedback
2. **Monitor after deployments**: Run dashboard after deploying to verify everything started correctly
3. **Check health metrics**: Look for diagnostic test failures
4. **Watch the logs**: Activity log shows connection issues and errors immediately
5. **Use refresh**: Press `r` if you think data is stale

## Future Enhancements

Potential additions:
- CPU/Memory usage graphs
- Request rate metrics
- Response time charts
- Client connection history
- Error rate tracking
- Performance metrics
