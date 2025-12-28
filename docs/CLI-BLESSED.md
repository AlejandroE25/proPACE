# proPACE Terminal Client - Beautiful TUI Edition

A gorgeous terminal user interface for chatting with your PACE AI assistant.

## Overview

The new blessed-based CLI provides a professional, dashboard-like interface for interacting with PACE. It features real-time updates, a clean layout, and intuitive keyboard controls.

## Features

- **Beautiful Dashboard Layout**: Professional TUI with distinct panels
- **Real-time Chat**: Conversational interface with message history
- **Weather Widget**: Live weather updates in sidebar
- **News Feed**: Scrollable news headlines with navigation
- **Connection Status**: Visual connection state indicator
- **Keyboard Shortcuts**: Efficient navigation without touching the mouse
- **Auto-scroll**: Chat automatically scrolls to latest messages
- **Color-coded Messages**: Easy distinction between user, PACE, and system messages

## Interface Layout

```
┌────────────────────────────────────────────────────────────────┐
│              🤖 proPACE Terminal              10:30:45 AM      │
├────────────────────────────────────┬───────────────────────────┤
│ Conversation                       │ Weather                   │
│                                    │                           │
│ [10:30:12] You:                    │  San Francisco, CA        │
│   What's the weather?              │  ☀️ Sunny                  │
│                                    │  🌡️  72°F                  │
│ [10:30:14] PACE:                   │  💨 Wind: 5 mph           │
│   It's currently sunny and 72°F    │                           │
│   in San Francisco...              ├───────────────────────────┤
│                                    │ Latest News               │
│                                    │                           │
│                                    │ [1/5]                     │
│                                    │                           │
│                                    │ Breaking: Technology      │
│                                    │ advances continue...      │
│                                    │                           │
│                                    │ Press 'n' for next        │
│                                    │ Press 'p' for previous    │
├────────────────────────────────────┴───────────────────────────┤
│ Message (Ctrl+S to send, Tab to cycle focus)                  │
│ Type your message here...                                      │
├────────────────────────────────────────────────────────────────┤
│ ● Connected | Ctrl+C: Quit | Ctrl+S: Send | /help: Commands   │
└────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Development Mode

```bash
npm run dev:cli
```

### Production Mode

```bash
# Build first (if not already built)
npm run build

# Run the CLI
npm run cli
```

### Legacy CLI

The old CLI is still available if needed:

```bash
npm run cli:legacy
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Send message |
| `Enter` | Send message (when input has focus) |
| `Ctrl+L` | Clear chat history |
| `Ctrl+C` | Quit application |
| `Tab` | Cycle focus between panels |
| `n` | Next news headline |
| `p` | Previous news headline |
| `↑` `↓` | Scroll chat/news (when panel focused) |

## Slash Commands

Type these commands in the message input:

| Command | Description |
|---------|-------------|
| `/help` | Show help message |
| `/clear` | Clear conversation history |
| `/weather` | Refresh weather data |
| `/news` | Refresh news feed |
| `/quit` or `/exit` | Exit application |

## Panel Navigation

Use `Tab` to cycle between panels:

1. **Input Box** (default) - Type messages here
2. **Chat Panel** - Scroll through conversation history
3. **News Panel** - Read headlines, use n/p to navigate
4. **Weather Panel** - View weather information

When a panel is focused, you can:
- Scroll with arrow keys or mouse wheel
- Use panel-specific shortcuts (like n/p for news)

## Connection States

The status bar shows your connection state:

- 🟢 **● Connected** - Connected to PACE server
- 🟡 **● Reconnecting...** - Attempting to reconnect
- 🔴 **● Disconnected** - Not connected

The client automatically attempts to reconnect if connection is lost.

## Message Types

Messages are color-coded for easy reading:

- **🔵 Cyan** - Your messages
- **🟢 Green** - PACE responses
- **🟡 Yellow** - System notifications

## Configuration

### Command Line Options

```bash
npm run cli -- --host <hostname> --port <port>

# Examples:
npm run cli -- --host 10.0.0.69 --port 3000
npm run cli -- --help
```

### Environment Variables

Set these before running the CLI:

```bash
export PACE_HOST=localhost
export PACE_PORT=3000
npm run cli
```

Or on Windows:

```powershell
$env:PACE_HOST="localhost"
$env:PACE_PORT="3000"
npm run cli
```

## Features in Detail

### Chat Panel

- **Timestamped messages**: Every message shows when it was sent
- **Auto-scroll**: Automatically scrolls to newest messages
- **Scrollable history**: Use arrow keys to review past messages
- **Word wrap**: Long messages wrap properly

### Weather Widget

- Displays current weather conditions
- Shows temperature, conditions, and wind
- Auto-refreshes periodically
- Manual refresh with `/weather` command

### News Panel

- Shows latest headlines
- Navigate with `n` (next) and `p` (previous)
- Counter shows current headline (e.g., [3/10])
- Auto-refreshes periodically
- Manual refresh with `/news` command

### Status Bar

- Connection state indicator
- Quick reference for keyboard shortcuts
- Always visible at bottom of screen

## Tips & Tricks

1. **Fast Navigation**: Use `Tab` to quickly jump between panels
2. **Quick Send**: Press `Enter` in the input box instead of `Ctrl+S`
3. **Browse History**: Focus the chat panel and use arrow keys to scroll
4. **Clear Clutter**: Use `Ctrl+L` or `/clear` to start fresh
5. **Stay Updated**: The CLI auto-refreshes weather and news
6. **Auto-reconnect**: Don't worry about disconnections - it reconnects automatically

## Troubleshooting

### CLI Won't Start

**Issue**: Error when running `npm run cli`

**Solutions**:
1. Make sure you've built the project: `npm run build`
2. Check that the server is running: `nssm status proPACE`
3. Verify port isn't in use: `netstat -ano | findstr :3000`

### Can't Connect to Server

**Issue**: Shows "Disconnected" or "Reconnecting..."

**Solutions**:
1. Verify server is running: `npm run status` (dashboard)
2. Check server host/port in configuration
3. Ensure firewall isn't blocking connection
4. Try: `npm run cli -- --host localhost --port 3000`

### Messages Not Sending

**Issue**: Pressing send doesn't work

**Solutions**:
1. Make sure input box has focus (press `Tab` until it's highlighted)
2. Try `Ctrl+S` instead of `Enter`
3. Check connection status in status bar
4. Restart the CLI

### Display Looks Broken

**Issue**: Text overlaps or layout is messy

**Solutions**:
1. Use a modern terminal (Windows Terminal, iTerm2, etc.)
2. Make sure terminal window is large enough (80x24 minimum)
3. Try resizing the terminal window
4. Avoid CMD.exe on Windows (use PowerShell or Windows Terminal)

### Weather/News Not Updating

**Issue**: Weather or news shows "Loading..."

**Solutions**:
1. Wait a few seconds after connecting
2. Use `/weather` or `/news` commands to manually refresh
3. Check server logs for API errors
4. Verify internet connection

## Technical Details

### Dependencies

- **blessed**: Terminal UI framework
- **ws**: WebSocket client library
- **Node.js**: Requires Node.js 20+

### Platform Support

- ✅ **Linux**: Full support (best experience)
- ✅ **macOS**: Full support with mouse
- ✅ **Windows**: Full support (use Windows Terminal or PowerShell)

### Performance

- Lightweight: ~10MB memory usage
- Fast: < 1ms render time
- Efficient: Auto-throttles updates

## Comparison: New vs Legacy CLI

| Feature | Blessed CLI | Legacy CLI |
|---------|-------------|------------|
| Interface | Modern TUI dashboard | Basic text output |
| Layout | Multi-panel | Linear |
| Weather | Live widget | Inline text |
| News | Scrollable panel | Inline text |
| Navigation | Keyboard shortcuts | Commands only |
| Scrolling | Smooth scrolling | Terminal buffer |
| Colors | Rich colors | Basic colors |
| Mouse | Supported | Not supported |
| Focus | Panel switching | Single input |

## Future Enhancements

Potential features for future versions:

- Voice input/output
- Image display for news thumbnails
- Graph visualizations
- Multiple conversation tabs
- Command history with up/down arrows
- Search within conversation
- Export chat history
- Themes/customization

## Contributing

To modify the CLI:

1. Edit `src/cli/index-blessed.ts`
2. Build: `npm run build`
3. Test: `npm run dev:cli`

### Code Structure

```typescript
class PACETerminalBlessed {
  // UI Components
  private screen: blessed.Widgets.Screen;
  private chatBox: blessed.Widgets.BoxElement;
  private inputBox: blessed.Widgets.TextareaElement;
  // ... other panels

  // State
  private messages: Message[];
  private connected: boolean;
  private weatherData: string;
  private newsData: string[];

  // Methods
  private createLayout() { }     // Build UI
  private setupKeyBindings() { } // Keyboard shortcuts
  private connect() { }          // WebSocket connection
  private sendMessage() { }      // Send to PACE
  // ... other methods
}
```

## See Also

- [Status Dashboard](STATUS-DASHBOARD.md) - Monitor PACE server
- [SSH Setup](SSH-SETUP.md) - Remote connection setup
- [Main README](../README.md) - Project overview
