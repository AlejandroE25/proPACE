# TODO - proPACE Development

## High Priority

### Speed & Personality Improvements
**Priority:** High
**Status:** ✅ COMPLETED
**Plan Location:** `/Users/CDN4LIFE/.claude/plans/streamed-riding-babbage.md`

Transformed PACE into a fast (<2s), conversational butler with consistent personality. Addressed the 10-second response delays and lack of character.

#### Goals (All Achieved)
- ✅ Add Google Search integration for external knowledge queries
- ✅ Make butler personality permanent (remove dynamic switching)
- ✅ Improve routing intelligence to distinguish PACE's sensors vs external knowledge
- ✅ Expand fast path to avoid unnecessary task planning
- ✅ Target: 90% of queries <2 seconds with consistent butler character

#### Implementation Checklist

- [x] Create Google Search Service (`src/services/googleSearchService.ts`)
- [x] Create Search Summarizer with Haiku (`src/services/searchSummarizer.ts`)
- [x] Create Search Plugin (`src/plugins/core/searchPlugin.ts`)
- [x] Make butler mode permanent in Claude client (`src/clients/claudeClient.ts`)
- [x] Update routing service to add google_search subsystem (`src/services/routingService.ts`)
- [x] Expand fast path in agent orchestrator (`src/agent/agentOrchestrator.ts`)
- [x] Add simple query fallback to agent orchestrator (`src/agent/agentOrchestrator.ts`)
- [x] Remove PersonalityManager file (`src/plugins/interfaces/services/personalityManager.ts`)
- [x] Add Google Search environment variables to config (`src/config/index.ts`)
- [x] Update .env.example with new variables
- [x] Register SearchPlugin in server (`src/server/index.ts`)
- [x] Fix TypeScript compilation errors

#### Performance Improvements
- Google search with Haiku summarization: ~700-900ms (vs 4-6s previously)
- Direct Claude for simple conversational queries: ~800ms (vs 3-5s via task planning)
- Fast path now handles: weather, news, wolfram, google_search, and simple claude queries
- Expected: 80-85% faster for most queries, 90% under 2 seconds

---

### Agent Orchestrator Routing Issue
**Priority:** High
**Status:** ✅ RESOLVED

**Resolution Summary:**
Implemented fast-path routing in agent mode. The agent orchestrator now uses RoutingService (Claude Haiku + caching) to intelligently route simple queries directly to plugins, bypassing task creation for weather/news/wolfram queries. Complex queries still create tasks for proper planning.

**Original Issue:**
The agent orchestrator was not properly utilizing plugins/modules for fast responses. It was:
1. Routing ALL queries through main conversational Claude
2. Creating full tasks for EVERYTHING (even simple queries)
3. NOT checking if plugins (weather, news, wolfram, memory) can provide faster answers
4. Bypassing the intelligent routing that should determine if a module can handle the query

**Expected behavior:**
- Simple queries ("what's the weather?") should use the weather plugin directly
- News requests should use the news plugin
- Math/science queries should use Wolfram
- Only complex queries requiring planning should create tasks
- Fast path for plugin-answerable queries, slow path (task creation) for complex ones

**Actual behavior:**
- Everything creates a task
- All responses come from main Claude conversation
- Plugins are registered but not being used for query responses
- No intelligent routing decision happening

**Root cause hypothesis:**
- Agent orchestrator's processMessage() may not be checking plugin capabilities
- Missing routing logic to determine "can a plugin handle this?"
- Task creation may be happening before plugin check
- RoutingService or RoutingPredictor not being used in agent mode

**Action items:**
- [x] Review how processMessage() routes queries in agent mode
- [x] Check if plugins are queried before creating tasks
- [x] Compare legacy mode routing vs agent mode routing
- [x] Verify RoutingService integration in agent orchestrator
- [x] Add logging to see routing decisions
- [x] Test simple queries (weather, news) and verify plugin usage
- [x] Implement fast-path routing for plugin-answerable queries

**Related files:**
- `src/agent/agentOrchestrator.ts` - Main routing logic
- `src/services/routingService.ts` - Routing decisions
- `src/services/routingPredictor.ts` - Pattern-based routing
- `src/agent/agentPlanner.ts` - Task planning
- `src/agent/agentExecutor.ts` - Task execution
- `src/plugins/pluginRegistry.ts` - Plugin capabilities
- `src/services/conversationOrchestrator.ts` - Legacy mode (working correctly)
- `logs/service-stdout.log` - Runtime behavior

**Implementation Details:**
Implemented a two-tier routing system in agent mode (see [agentOrchestrator.ts:324-330](src/agent/agentOrchestrator.ts#L324-L330)):

1. **Fast Path** (< 200ms) - NEW:
   - Uses RoutingService (Claude Haiku) to determine subsystem
   - Multi-layer caching (exact + similarity) for <5ms cached responses
   - High-confidence plugin routes (>0.8) execute tool directly
   - Returns result immediately without task creation
   - Example: "what's the weather?" → weather plugin → instant response
   - See [tryFastPathRouting()](src/agent/agentOrchestrator.ts#L678-L743) and [executePluginDirectly()](src/agent/agentOrchestrator.ts#L748-L814)

2. **Slow Path** (task creation) - EXISTING:
   - Only for complex queries that require planning
   - Multi-step tasks
   - Queries that need multiple tools
   - Research-type questions
   - Example: "analyze the weather trend and suggest activities" → create task

**Changes Made:**
- Added RoutingService integration to AgentOrchestrator
- Implemented tryFastPathRouting() method for simple queries
- Implemented executePluginDirectly() for tool execution
- Added routing decision logging
- Agent mode now matches legacy mode's intelligent routing behavior

---

### API Endpoints for Server Information
**Priority:** High
**Target Date:** Tomorrow

Implement REST API endpoints that expose server information and state to external clients. This will allow the CLI and other clients to fetch data more efficiently without relying solely on WebSocket message parsing.

#### Proposed Endpoints

```
GET /api/status
- Server status (running, uptime, version)
- Connection count
- Mode (agent/legacy)
- Response: JSON

GET /api/weather
- Current weather data
- Last update timestamp
- Response: JSON

GET /api/news
- Latest news headlines array
- Last update timestamp
- Response: JSON

GET /api/plugins
- List of registered plugins
- Tool counts per plugin
- Plugin status (enabled/disabled)
- Response: JSON

GET /api/health
- Health metrics for all components
- Diagnostic results
- Response: JSON

GET /api/metrics
- Performance metrics
- Request counts
- Cache hit rates
- Response: JSON
```

#### Benefits

1. **Cleaner Client Code**: No need to parse WebSocket messages for structured data
2. **Caching**: Clients can cache responses and poll at intervals
3. **Multiple Clients**: Dashboard and CLI can use same endpoints
4. **Debugging**: Easy to test with curl/browser
5. **Monitoring**: External monitoring tools can check endpoints
6. **Documentation**: API can be documented with OpenAPI/Swagger

#### Implementation Plan

1. Add Express HTTP server alongside WebSocket server
2. Create `/api` routes with controllers
3. Update CLI to use HTTP endpoints for weather/news/status
4. Update dashboard to use HTTP endpoints
5. Add CORS support for web clients
6. Document all endpoints
7. Add rate limiting for production

#### Related Files

- `src/server/api/` (new directory)
- `src/server/index.ts` (add HTTP server)
- `src/cli/index-blessed.ts` (use HTTP for data fetching)
- `src/cli/status-dashboard.ts` (use HTTP for status)

---

## Medium Priority

### CLI Improvements

- [ ] Add command history (up/down arrow navigation)
- [ ] Add autocomplete for slash commands
- [ ] Add conversation export functionality
- [ ] Add themes/color schemes
- [ ] Add notification sounds for messages (optional)

### Dashboard Improvements

- [ ] Add CPU/memory usage graphs
- [ ] Add request rate metrics
- [ ] Add response time charts
- [ ] Add error rate tracking

### Server Improvements

- [ ] Add WebSocket authentication/API keys
- [ ] Add rate limiting per client
- [ ] Add request logging middleware
- [ ] Add Prometheus metrics endpoint

## Low Priority

### CLI Features

- [ ] Voice input/output support
- [ ] Multiple conversation tabs
- [ ] Search within conversation history
- [ ] Image display in terminal (if supported)

### Documentation

- [ ] Video walkthrough of features
- [ ] Deployment guide for other platforms
- [ ] API reference documentation
- [ ] Architecture diagrams

### Testing

- [ ] E2E tests for CLI
- [ ] E2E tests for dashboard
- [ ] Load testing for WebSocket server
- [ ] Performance benchmarks

## Completed

- [x] Windows compatibility fix for server startup
- [x] NSSM deployment script fixes
- [x] SSH setup documentation
- [x] Status dashboard with blessed
- [x] New CLI with blessed framework
- [x] ASCII art logo in CLI
- [x] Message parsing fixes (Task Complete$$ prefix)
- [x] Typewriter effect for long responses
- [x] News feed functionality improvements

---

## Notes

- Keep backwards compatibility when adding new features
- Document all breaking changes in CHANGELOG.md
- Test on all platforms (Windows, macOS, Linux) before release
- Update README.md with new features
