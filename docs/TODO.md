# TODO - proPACE Development

## High Priority

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
