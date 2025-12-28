# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Fixed Windows compatibility issue where server would exit immediately on startup
  - Issue: `import.meta.url` comparison with `process.argv[1]` was failing on Windows due to path format differences (forward slashes vs backslashes)
  - Solution: Use Node's `pathToFileURL()` to properly convert Windows paths to file URLs before comparison
  - File: `src/server/index.ts`
  - Impact: Server now starts correctly on Windows when using `npm start`

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
