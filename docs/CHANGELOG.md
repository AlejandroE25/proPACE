# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Automatic Update System**
  - UpdateMonitor component polls git repository every 5 minutes for new commits
  - Automatically fetches, pulls, rebuilds, and restarts NSSM service when updates detected
  - Comprehensive backup system creates snapshots before each update in `.backups/` directory
  - Automatic rollback on build/restart failure with git reset and backup restoration
  - Mutex locking prevents concurrent updates
  - Integration with ErrorRecoveryManager for automatic retry and failure handling
  - Safety checks: blocks updates if local changes exist (configurable), validates conditions before updating
  - Tracks statistics: total checks, updates applied, failures, rollbacks performed
  - Files: `src/agent/updateMonitor.ts`, `src/agent/gitChecker.ts`, `src/types/update.ts`
  - Configuration: `.env` variables (ENABLE_AUTO_UPDATE, AUTO_UPDATE_CHECK_INTERVAL, AUTO_UPDATE_REMOTE, AUTO_UPDATE_BRANCH, etc.)
  - Integration: `src/agent/agentOrchestrator.ts`, `src/config/index.ts`

- **Update Control API Endpoints**
  - `GET /api/update/status` - Returns current auto-update system status with statistics
  - `POST /api/update/trigger` - Manually triggers immediate update check (non-blocking)
  - Endpoints return proper HTTP status codes and JSON responses
  - Integration with AgentOrchestrator for access to UpdateMonitor
  - File: `src/server/websocket.ts`

- **Status Dashboard Enhancements**
  - Added "Time to Next System Update" display with countdown timer
  - Shows when the next automatic update check will occur
  - Automatically updates every refresh cycle
  - File: `src/cli/status-dashboard.ts`

- **Fast-path routing for agent mode**
  - Agent orchestrator now uses RoutingService (Claude Haiku) for intelligent plugin routing
  - Simple queries (weather, news, wolfram) bypass task creation and execute directly
  - Multi-layer caching (exact + similarity matching) for sub-5ms cached responses
  - High-confidence routes (>0.8) execute plugins immediately
  - Complex queries still use task planning for multi-step operations
  - Files: `src/agent/agentOrchestrator.ts` (tryFastPathRouting, executePluginDirectly)
  - Impact: Agent mode now matches legacy mode's performance for simple queries

### Changed
- **Status Dashboard Program Output**
  - Replaced WebSocket activity log with actual program output from service log file
  - Now tails `C:\proPACE\logs\service-stdout.log` for real-time debugging information
  - Intelligent file position tracking reads only new content (not entire file each time)
  - Expanded program output window from 3 rows to 5 rows for better visibility
  - Reduced health monitor from 4 rows to 2 rows to accommodate larger log window
  - Initial load shows last 50 lines only (prevents freezing on large log files)
  - Incremental reads limited to 100KB chunks to prevent performance issues
  - Added auto-focus on log box at startup with keyboard shortcuts (l/p to switch focus)
  - File: `src/cli/status-dashboard.ts`

- **Simplified Rebuild Script**
  - Removed cleaning steps (no longer deletes node_modules or dist directories)
  - Now only verifies critical dependencies, builds TypeScript project, and restarts NSSM service
  - Reduced from 5 steps to 3 steps for faster development cycles
  - File: `scripts/rebuild-windows.cmd`

- Agent orchestrator processMessage() now checks plugin capabilities before creating tasks
- Simple queries return instant responses instead of "Working on it..." messages

### Fixed
- **Git ownership issue for NSSM service**
  - Issue: Auto-update system failed because service runs as NT AUTHORITY\SYSTEM but repo owned by user account
  - Error: "fatal: detected dubious ownership in repository at 'C:/proPACE'"
  - Solution: Added C:/proPACE as safe directory at system level using `git config --system --add safe.directory C:/proPACE`
  - Impact: UpdateMonitor now works correctly when service runs under SYSTEM account

- **UpdateMonitor build errors**
  - Fixed use of private `createAlert()` method - changed to public `recordFailure()` API
  - Removed unused imports (CommitInfo, UpdateEventPayloads) that caused TypeScript warnings
  - Files: `src/agent/updateMonitor.ts`, `src/agent/agentOrchestrator.ts`

- **Status dashboard freezing on large log files**
  - Issue: Dashboard would freeze when loading entire service log file (could be hundreds of MB)
  - Solution: Implemented smart file position tracking to read only new content
  - On initial load: Only reads last 50 lines instead of entire file
  - On updates: Only reads new content since last position (max 100KB per read)
  - Handles log rotation correctly (detects when file size decreases)
  - File: `src/cli/status-dashboard.ts`

- **Agent mode routing issue** - Agent orchestrator was creating tasks for ALL queries, even simple weather/news requests
  - Root cause: Missing RoutingService integration in agent mode
  - Solution: Added fast-path routing layer that checks plugin capabilities before task creation
  - Result: Weather/news/wolfram queries now execute in <200ms (vs. task creation overhead)
  - See docs/TODO.md for full analysis and implementation details
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
- TODO list for planned features and improvements
  - API endpoints for server information (high priority for tomorrow)
  - CLI enhancements (command history, autocomplete, themes)
  - Dashboard improvements (graphs, metrics, charts)
  - File: `docs/TODO.md`

### Changed
- Status dashboard improvements
  - Added automatic refresh every 2 minutes
  - Status bar now shows "Last refresh" and countdown to next refresh
  - Manual refresh (r key) now resets the auto-refresh timer
  - File: `src/cli/status-dashboard.ts`
- CLI improvements based on user feedback
  - Restored original ASCII art logo ("proPACE" banner)
  - Fixed message parsing to strip server prefixes (Task Complete$$, Task Failed$$, etc.)
  - Added typewriter effect for long PACE responses (>200 chars) for better readability
  - Improved news parsing to filter headers and numbered list prefixes
  - Enhanced info panel with connection status, time, date, and version
  - Better weather detection using temperature and "feels like" keywords
  - File: `src/cli/index-blessed.ts`

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
