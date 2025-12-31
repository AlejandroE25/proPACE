# Changelog

All notable changes to proPACE will be documented in this file.

## [Unreleased]

### Added
- **Google Search Integration** - Added external knowledge queries with Google Custom Search API
  - New `GoogleSearchService` for fast search results (~300-500ms)
  - New `SearchSummarizer` using Claude Haiku to add butler personality to search results (~200-400ms)
  - New `SearchPlugin` registered in agent mode
  - Total search-to-response time: ~700-900ms (vs 4-6s previously for general knowledge queries)
  - Routing service updated to include `google_search` subsystem
  - Environment variables: `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID`

- **Permanent Butler Personality** - Pace now always responds with butler character
  - Removed dynamic personality switching system
  - `ClaudeClient` now hardcodes sophisticated British butler system prompt
  - Temperature set to 0.7 for consistent personality
  - Removed `PersonalityManager` and related tests

- **Expanded Fast Path Routing** - Agent orchestrator now handles more queries via fast path
  - Added `google_search` case to fast path (bypasses task planning)
  - Added direct `claude` case for simple conversational queries
  - New `isSimpleQuery()` helper to detect queries that don't need task planning
  - Simple query fallback prevents unnecessary SLOW PATH usage
  - Expected performance: 90% of queries <2 seconds (80-85% faster)

- **HTTP API Endpoints for Weather and News** - Added `/api/weather` and `/api/news` GET endpoints for direct data access without going through conversational interface
  - TUI now fetches weather and news data via HTTP instead of WebSocket messages
  - Added service exposure methods to weather and news plugins
  - Services wired into WebSocket server in agent mode

- **Comprehensive Test Suite** - Added 38 tests for new Google Search features
  - `googleSearchService.test.ts` - 13 tests for API integration, caching, error handling
  - `searchSummarizer.test.ts` - 12 tests for Haiku summarization with butler personality
  - `searchPlugin.test.ts` - 16 tests for plugin registration and tool execution
  - All tests passing with 100% success rate
  - See [TEST_SUMMARY.md](TEST_SUMMARY.md) for details

### Fixed
- **Multi-Step Task Response Delivery** - Fixed issue where complex queries requiring multiple steps would not send final responses to clients
  - `task_completed` event handler now properly sends responses using `sendToClient()` with JSON format
  - `task_failed` event handler now sends error messages instead of failing silently
  - Previously, `processMessage()` would return "🔍 Working on it..." but never deliver the final answer

- **TUI JSON Protocol** - Fixed TUI displaying raw JSON and weather/news content in chat
  - Updated `handleServerMessage()` to parse JSON messages instead of old `$` delimiter
  - Removed weather/news content detection from WebSocket message handler
  - Filters out `status: 'processing'` messages to avoid clutter

- **Removed External TTS API** - Removed Carter API calls from web client
  - Deleted `speakText()` function that was calling `api.carterapi.com`
  - All TTS now handled exclusively by server-side WebRTC voice interface plugin

### Changed
- **JSON Message Protocol** - Migrated from `$` delimiter to structured JSON messages throughout the system
  - WebSocket server sends messages with `type`, `query`, `response`, `timestamp`, `status` fields
  - Both TUI and web clients parse JSON messages
  - Event handlers no longer use old `Task Complete$...` format

- **Web UI Redesign** - Complete overhaul of web interface with modern responsive design
  - Migrated from absolute positioning to CSS Grid layout
  - Implemented glass morphism effects with backdrop blur
  - Added responsive side-panel chat layout (desktop/tablet/mobile)
  - Preserved animated background blobs and gold/dark blue color scheme
  - Markdown rendering with full feature support (headers, code blocks, tables, lists, blockquotes)
  - Typewriter effect for AI responses
  - Moved Desktop GUI files from `GUIs/Desktop/` to `public/` directory

### Removed
- Old `$` delimiter message format completely removed from codebase
- Carter API TTS integration removed from web client
- Legacy absolute-positioned web UI removed

## Previous Releases

### [2.0.0] - Initial Release
- Dual-model AI architecture (Claude 4.5 Sonnet + Haiku)
- Intelligent routing with multi-layer caching
- WebSocket-based real-time communication
- Plugin system with weather, news, Wolfram Alpha integration
- Persistent memory with SQLite
- WebRTC-based TTS voice interface
- Agent orchestration with task planning
- TUI and web interfaces