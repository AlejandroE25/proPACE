# CLI Terminal Compatibility

The proPACE CLI is designed to work across a wide range of terminal environments, from modern terminal emulators to bare-bones Linux consoles.

## Automatic Terminal Detection

On startup, the CLI automatically detects your terminal's capabilities and adapts the display accordingly:

### Detection Features

1. **UTF-8/Unicode Support** - Checked via `LANG` and `LC_ALL` environment variables
2. **Emoji Support** - Detected based on terminal type and Unicode support
3. **Italic Text Support** - Checked for modern terminals
4. **Color Depth** - Detects 16M colors, 256 colors, 16 colors, or no color

## Display Modes

### Full Unicode Mode (Modern Terminals)
- **Emojis**: ☁️ 📰 💬
- **Unicode bullets**: •
- **Rounded borders**: ╭─╮│╰─╯
- **Status indicators**: ● (colored dots)
- **Italic text**: Logo displayed in italics

**Supported terminals:**
- iTerm2
- Apple Terminal
- VS Code integrated terminal
- Gnome Terminal
- Konsole
- Hyper
- Any xterm-256color terminal

### ASCII Fallback Mode (Basic Terminals)
- **Emojis replaced**: [W] [N] [C]
- **ASCII bullets**: *
- **Simple borders**: +-|
- **Status indicators**: [*] [~] [X]
- **No italic text**: Plain bold text

**Fallback triggers:**
- Linux console (Ctrl+Alt+F1-F6)
- Terminals with `TERM=linux`
- Non-UTF-8 locales
- Unknown terminal types (conservative default)

## Testing Your Terminal

To see what capabilities your terminal supports, run:

```bash
DEBUG=1 npm run dev:cli
```

This will display detected capabilities before starting the application:
```
Terminal capabilities: 256 colors, Unicode, emoji, italic
Press any key to continue...
```

## Environment Variables

The detection system checks these environment variables:

- `TERM` - Terminal type (e.g., xterm-256color, linux, screen)
- `TERM_PROGRAM` - Terminal application (e.g., iTerm.app, vscode)
- `COLORTERM` - Color depth (e.g., truecolor, 24bit)
- `LANG` / `LC_ALL` - Locale settings (UTF-8 detection)

## Manual Override

If automatic detection fails, you can force ASCII mode by setting:

```bash
TERM=dumb npm run dev:cli
```

Or force UTF-8 mode:

```bash
LANG=en_US.UTF-8 npm run dev:cli
```

## Compatibility Matrix

| Environment | Unicode | Emoji | Italic | Colors | Works? |
|-------------|---------|-------|--------|--------|--------|
| iTerm2 (macOS) | ✅ | ✅ | ✅ | 16M | ✅ Perfect |
| Gnome Terminal | ✅ | ✅ | ⚠️ | 256 | ✅ Excellent |
| Linux Console (TTY) | ⚠️ | ❌ | ❌ | 16 | ✅ ASCII mode |
| SSH (modern client) | ✅ | ✅ | ✅ | 256 | ✅ Excellent |
| SSH (PuTTY) | ✅ | ⚠️ | ❌ | 256 | ✅ Good |
| Windows Terminal | ✅ | ✅ | ✅ | 16M | ✅ Perfect |
| tmux/screen | ✅ | ✅ | ⚠️ | 256 | ✅ Excellent |

## Known Issues

1. **Emoji rendering on Linux console**: Emojis will show as `?` or boxes - this is expected, ASCII fallback [W] [N] [C] will be used
2. **Italic text in tmux**: May not render unless tmux is configured with `set -g default-terminal "tmux-256color"`
3. **Colors in `screen`**: Limited to 256 colors unless using `screen-256color` TERM type

## Recommendations

For best experience, ensure your terminal:
1. Supports UTF-8 locale (`LANG=*.UTF-8`)
2. Uses a modern TERM type (`xterm-256color`, `gnome-256color`, etc.)
3. Has emoji fonts installed (Noto Color Emoji, Apple Color Emoji, etc.)

For SSH sessions:
```bash
# In your ~/.ssh/config
Host *
    SetEnv LANG=en_US.UTF-8
    SetEnv TERM=xterm-256color
```

## Troubleshooting

**Problem**: Boxes or question marks instead of icons
**Solution**: Terminal doesn't support Unicode/emoji - this is expected, ASCII mode active

**Problem**: No colors
**Solution**: Set `TERM=xterm-256color` or upgrade terminal

**Problem**: Garbled borders
**Solution**: Terminal doesn't support Unicode box-drawing - ASCII borders will be used

**Problem**: Layout looks wrong
**Solution**: Ensure terminal is at least 80x24. Resize terminal or maximize window.
