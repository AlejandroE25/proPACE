/**
 * Terminal Capability Detector
 * Detects terminal features and returns appropriate rendering mode
 */

export interface TerminalCapabilities {
  supportsColor: boolean;
  supportsUnicode: boolean;
  supportsEmoji: boolean;
  supportsItalic: boolean;
  colorDepth: number; // 0 = none, 1 = basic (16), 2 = 256, 3 = 16m
}

export class TerminalDetector {
  /**
   * Detect terminal capabilities
   */
  static detect(): TerminalCapabilities {
    const term = process.env.TERM || '';
    const termProgram = process.env.TERM_PROGRAM || '';
    const lang = process.env.LANG || '';
    const lc_all = process.env.LC_ALL || '';

    // Detect UTF-8 support
    const supportsUnicode = this.detectUnicode(lang, lc_all);

    // Detect emoji support (usually requires UTF-8 + modern terminal)
    const supportsEmoji = this.detectEmoji(term, termProgram, supportsUnicode);

    // Detect italic support
    const supportsItalic = this.detectItalic(term, termProgram);

    // Detect color support
    const colorDepth = this.detectColorDepth(term);

    return {
      supportsColor: colorDepth > 0,
      supportsUnicode,
      supportsEmoji,
      supportsItalic,
      colorDepth,
    };
  }

  /**
   * Detect UTF-8/Unicode support
   */
  private static detectUnicode(lang: string, lc_all: string): boolean {
    const locale = lc_all || lang;

    // Check if locale includes UTF-8
    if (locale.toLowerCase().includes('utf-8') || locale.toLowerCase().includes('utf8')) {
      return true;
    }

    // If in a known good terminal, assume UTF-8
    const termProgram = process.env.TERM_PROGRAM || '';
    if (['iTerm.app', 'Apple_Terminal', 'vscode', 'Hyper'].includes(termProgram)) {
      return true;
    }

    // Conservative default for unknown environments
    return false;
  }

  /**
   * Detect emoji support
   */
  private static detectEmoji(term: string, termProgram: string, hasUnicode: boolean): boolean {
    if (!hasUnicode) return false;

    // Known emoji-capable terminals
    const emojiCapableTerminals = [
      'iTerm.app',
      'Apple_Terminal',
      'vscode',
      'Hyper',
      'Terminus',
    ];

    if (emojiCapableTerminals.includes(termProgram)) {
      return true;
    }

    // Modern xterm-like terminals usually support emoji
    if (term.includes('xterm-256') || term.includes('gnome') || term.includes('konsole')) {
      return true;
    }

    // Linux console (TTY) generally doesn't support emoji
    if (term === 'linux' || term === 'console') {
      return false;
    }

    // Conservative default: assume no emoji for unknown terminals
    return false;
  }

  /**
   * Detect italic support
   */
  private static detectItalic(term: string, termProgram: string): boolean {
    // Known italic-capable terminals
    const italicCapableTerminals = [
      'iTerm.app',
      'Apple_Terminal',
      'vscode',
      'Hyper',
    ];

    if (italicCapableTerminals.includes(termProgram)) {
      return true;
    }

    // xterm-256color usually supports italics
    if (term.includes('xterm-256color')) {
      return true;
    }

    // Linux console doesn't support italics
    if (term === 'linux' || term === 'console') {
      return false;
    }

    // Conservative default
    return false;
  }

  /**
   * Detect color depth
   */
  private static detectColorDepth(term: string): number {
    // Check for true color support
    if (process.env.COLORTERM === 'truecolor' || process.env.COLORTERM === '24bit') {
      return 3; // 16 million colors
    }

    // Check for 256 color support
    if (term.includes('256color') || term.includes('256')) {
      return 2; // 256 colors
    }

    // Check for basic color support
    if (
      term.includes('color') ||
      term.includes('ansi') ||
      term.includes('xterm') ||
      term.includes('screen') ||
      term.includes('vt100')
    ) {
      return 1; // 16 colors
    }

    // Dumb terminal or no color
    if (term === 'dumb' || !term) {
      return 0; // No color
    }

    // Conservative default: basic colors
    return 1;
  }

  /**
   * Get a human-readable description of terminal capabilities
   */
  static describe(capabilities: TerminalCapabilities): string {
    const parts: string[] = [];

    if (capabilities.supportsColor) {
      const colorDesc =
        capabilities.colorDepth === 3
          ? '16M colors'
          : capabilities.colorDepth === 2
            ? '256 colors'
            : '16 colors';
      parts.push(colorDesc);
    } else {
      parts.push('no color');
    }

    if (capabilities.supportsUnicode) parts.push('Unicode');
    if (capabilities.supportsEmoji) parts.push('emoji');
    if (capabilities.supportsItalic) parts.push('italic');

    return parts.join(', ');
  }
}
