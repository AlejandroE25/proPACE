# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- SSH key authentication setup documentation for Mac to Windows connections (docs/SSH-SETUP.md)
- Terminal-based status dashboard with real-time monitoring
  - Beautiful TUI interface using blessed and blessed-contrib
  - Real-time server status, plugin list, health metrics, and activity logs
  - WebSocket integration for live updates
  - Keyboard navigation and auto-refresh
  - File: `src/cli/status-dashboard.ts`
  - Run with: `npm run dashboard` (dev) or `npm run status` (production)
  - Documentation: `docs/STATUS-DASHBOARD.md`
- **New Beautiful CLI Client using blessed framework**
  - Complete redesign of terminal client with modern TUI dashboard layout
  - Multi-panel interface: Chat, Weather, News, Input
  - Real-time chat with color-coded messages and timestamps
  - Live weather widget with auto-refresh
  - Scrollable news feed with n/p navigation
  - Comprehensive keyboard shortcuts (Ctrl+S, Ctrl+L, Tab, Enter)
  - Connection status indicator and auto-reconnect
  - Cross-platform support (Linux, macOS, Windows)
  - File: `src/cli/index-blessed.ts`
  - Run with: `npm run dev:cli` (dev) or `npm run cli` (production)
  - Legacy CLI available as: `npm run cli:legacy`
  - Documentation: `docs/CLI-BLESSED.md`

### Fixed
- Fixed Windows compatibility issue where server would exit immediately on startup
  - Issue: `import.meta.url` comparison with `process.argv[1]` was failing on Windows due to path format differences (forward slashes vs backslashes)
  - Solution: Use Node's `pathToFileURL()` to properly convert Windows paths to file URLs before comparison
  - File: `src/server/index.ts`
  - Impact: Server now starts correctly on Windows when using `npm start`

- Fixed NSSM path in deployment script and improved service restart reliability
  - Updated NSSM path from `C:/nssm/win64/nssm.exe` to correct Chocolatey installation path `C:/ProgramData/chocolatey/bin/nssm.exe`
  - Changed service restart to use stop/start sequence instead of restart command to avoid port binding issues
  - Added `.Trim()` to status check to handle whitespace in NSSM output
  - File: `scripts/deploy-windows.sh`
  - Impact: Deployment script now works correctly with Chocolatey-installed NSSM and handles service restarts more reliably

## [2.0.0] - Previous Release

### Added
- Autonomous AI assistant with multi-agent planning
- Intelligent routing system with dual-model architecture
- Persistent memory with semantic search
- Global context store for cross-client coordination
- Proactive suggestion engine with pattern recognition
- Comprehensive health monitoring and self-diagnostics
- Plugin system (Weather, News, Wolfram Alpha)
- WebSocket-based real-time communication
- Standalone CLI client
- 50+ test suites with TDD approach
