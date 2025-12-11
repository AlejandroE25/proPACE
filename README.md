# proPACE v2.0 - TypeScript Edition

Personal AI Assistant with persistent memory and WebSocket communication.

## Overview

proPACE is a Jarvis-like AI assistant powered by Anthropic Claude 4.5 Sonnet with:
- **Persistent Memory**: Remembers important details across conversations
- **WebSocket Communication**: Real-time messaging with web/CLI clients
- **Subsystems**: Weather, News, Wolfram Alpha integration
- **Standalone CLI**: Single executable with no dependencies
- **TDD Approach**: Comprehensive test coverage

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Copy environment template and add your API keys
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Development

```bash
# Run server in development mode
npm run dev

# Run CLI client in development mode
npm run dev:cli

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Production

```bash
# Build server
npm run build

# Run server
npm start

# Build standalone CLI binaries
npm run build:cli:all
# Creates: build/pace-linux, build/pace-macos, build/pace-windows.exe
```

## Project Structure

```
proPACE/
├── src/
│   ├── server/              # WebSocket server
│   ├── services/            # AI, memory, subsystems
│   ├── clients/             # API clients (Claude, OpenAI, etc.)
│   ├── types/               # TypeScript interfaces
│   ├── utils/               # Logger, cache, helpers
│   └── config/              # Configuration loader
├── tests/
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
├── cli/                     # Standalone CLI client
├── data/                    # SQLite database
├── logs/                    # Application logs
└── GUIs/                    # Web interfaces (Desktop, Mobile, Big Display)
```

## API Keys Required

1. **Anthropic Claude** (Required): Get from https://console.anthropic.com/
2. **OpenWeatherMap** (Optional): Free tier at https://openweathermap.org/api
3. **Wolfram Alpha** (Optional): Free tier at https://products.wolframalpha.com/api/

## Features

### Memory System
- Automatically extracts important information from conversations
- Stores user preferences, facts, and context
- Retrieves relevant memories for personalized responses

### Subsystems
- **Weather**: Real-time weather by IP geolocation
- **News**: Latest headlines from Wikinews RSS
- **Wolfram Alpha**: Computational knowledge engine

### Commands
- "remember that..." - Store specific information
- "what do you remember about...?" - Search memories
- "forget..." - Delete memories
- "what do you know about me?" - Summarize all memories

## Deployment

### Oracle Cloud Free Tier

See deployment guide in docs/ for detailed instructions on deploying to Oracle Cloud Free Tier ($0/month).

## Cost Estimate

- **Hosting**: $0/month (Oracle Cloud Free Tier)
- **Claude API**: ~$10-25/month (usage-based)
- **Other APIs**: $0-5/month (free tiers)

## License

MIT

