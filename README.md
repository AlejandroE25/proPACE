# proPACE v2.0 - Autonomous AI Assistant

An advanced, self-aware AI assistant with autonomous decision-making, proactive intelligence, and continuous learning capabilities.

## Overview

proPACE is a Jarvis-like AI assistant that goes beyond simple Q&A to provide truly autonomous assistance. Built with TypeScript and powered by Anthropic Claude, it features:

### Core Intelligence
- **Autonomous Decision-Making**: Context-aware decisions with tiered autonomy (fully autonomous → approval required)
- **Proactive Suggestions**: Anticipates user needs based on learned patterns and context
- **Self-Extension**: Generates new capabilities when encountering tasks it can't handle
- **Continuous Learning**: Improves routing accuracy and decision quality over time
- **Pattern Recognition**: Detects behavioral patterns (time-based, sequence-based, context-triggered)

### Technical Features
- **Intelligent Routing**: AI-powered request routing using Claude Haiku with sub-200ms latency
- **Persistent Memory**: Cross-conversation memory with semantic search and automatic context extraction
- **Global Context Store**: Shared knowledge across all clients for coordinated assistance
- **Multi-Agent Planning**: Complex task decomposition with step-by-step execution
- **Real-Time Communication**: WebSocket-based bidirectional messaging
- **Tiered Plugin System**: Standard plugins, System plugins (deep integration), and AI-generated plugins
- **Self-Diagnostics**: Comprehensive health monitoring and error recovery

### Production Ready
- **TDD Approach**: Comprehensive test coverage with 50+ test suites
- **Multi-Layer Caching**: Routing, responses, and session learning for optimal performance
- **Standalone CLI**: Single executable with no dependencies
- **Production Deployment**: Oracle Cloud Free Tier ready

## ✨ Current Features (Implemented)

### 🎯 Intelligent Routing & Orchestration
- ✅ Dual-model AI routing (Haiku for speed, Sonnet for intelligence)
- ✅ Multi-layer caching with >60% hit rate (exact match + similarity-based)
- ✅ Confidence-based routing with pattern validation
- ✅ Session learning and subsystem prediction
- ✅ Multi-agent task planning and execution

### 🧠 Memory & Context Management
- ✅ Persistent SQLite-backed memory with semantic search
- ✅ Automatic context extraction from conversations
- ✅ Global context store for cross-client coordination
- ✅ Personal and global context scopes
- ✅ Smart categorization (preferences, facts, goals, constraints)

### 🔮 Proactive Intelligence
- ✅ Pattern recognition (topic sequences, time-based, context-triggered)
- ✅ Proactive suggestion generation with confidence scoring
- ✅ Smart reminders (time, context, and pattern-triggered)
- ✅ Continuous learning from user interactions
- ✅ Routing accuracy improvement over time

### 🏥 Self-Diagnostics & Reliability
- ✅ Comprehensive health monitoring (API, memory, routing, plugins)
- ✅ Startup diagnostics with critical failure detection
- ✅ Error recovery with retry and fallback strategies
- ✅ System introspection (performance metrics, cache efficiency)

### 🔌 Plugin System
- ✅ Dynamic plugin registry with hot loading
- ✅ Weather plugin with IP-based geolocation
- ✅ News plugin with RSS aggregation
- ✅ Wolfram Alpha integration for computational queries
- ✅ Plugin capability system (read-only, state-changing, etc.)

### 📡 Communication
- ✅ Real-time WebSocket server for bidirectional messaging
- ✅ Standalone CLI client (single executable, zero dependencies)
- ✅ Multiple GUI interfaces (Desktop, Mobile, Big Display)
- ✅ Plan progress streaming during task execution

### 🧪 Testing & Quality
- ✅ 50+ comprehensive test suites (unit + integration)
- ✅ Test-Driven Development (TDD) approach
- ✅ >80% code coverage for core systems
- ✅ Mock-based testing for external APIs

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

# Run beautiful CLI client (chat with PACE)
npm run dev:cli

# Run status dashboard (monitor server in real-time)
npm run dashboard

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

# Run beautiful CLI client (chat with PACE)
npm run cli

# Run status dashboard (monitor server in real-time)
npm run status

# Build standalone CLI binaries
npm run build:cli:all
# Creates: build/pace-linux, build/pace-macos, build/pace-windows.exe
```

## Project Structure

```
proPACE/
├── src/
│   ├── server/              # WebSocket server
│   ├── agent/               # Autonomous agent systems
│   │   ├── agentOrchestrator.ts      # Multi-agent planning & execution
│   │   ├── globalContextStore.ts     # Shared cross-client knowledge
│   │   ├── contextAnalyzer.ts        # Automatic context extraction
│   │   ├── learningEngine.ts         # Continuous improvement
│   │   ├── patternRecognition.ts     # Behavioral pattern detection
│   │   └── suggestionEngine.ts       # Proactive suggestion generation
│   ├── services/            # Core services
│   │   ├── conversationOrchestrator.ts  # Main orchestration layer
│   │   ├── routingService.ts            # AI-powered routing
│   │   ├── memoryStore.ts               # Persistent memory
│   │   ├── healthMonitor.ts             # System diagnostics
│   │   └── errorRecovery.ts             # Self-healing capabilities
│   ├── plugins/             # Tiered plugin system
│   │   ├── core/            # Standard plugins (Weather, News, Wolfram)
│   │   ├── system/          # System plugins (future: monitors, self-extension)
│   │   └── pluginRegistry.ts  # Dynamic plugin management
│   ├── types/               # TypeScript interfaces
│   ├── utils/               # Logger, cache, helpers
│   └── config/              # Configuration loader
├── tests/
│   ├── unit/                # 50+ unit test suites
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
├── cli/                     # Standalone CLI client
├── data/                    # SQLite databases (memory, context)
├── logs/                    # Application logs
└── GUIs/                    # Web interfaces (Desktop, Mobile, Big Display)
```

## API Keys Required

1. **Anthropic Claude** (Required): Get from https://console.anthropic.com/
   - Primary AI (Claude 4.5 Sonnet) for conversational responses
   - Fast routing (Claude 4.5 Haiku) for intelligent subsystem selection
2. **OpenWeatherMap** (Optional): Free tier at https://openweathermap.org/api
3. **Wolfram Alpha** (Optional): Free tier at https://products.wolframalpha.com/api/

## Architecture

### 🧠 Autonomous Intelligence Layer

#### Proactive Suggestion Engine
- Analyzes conversation context, user patterns, and goals to generate helpful suggestions
- Confidence-scored recommendations (actions, information, reminders, insights, follow-ups)
- Learns from user acceptance/rejection to improve future suggestions
- Smart reminders triggered by time, context, or detected patterns

#### Pattern Recognition System
- **Topic Sequence Patterns**: Learns common conversation flows (e.g., weather → news → general)
- **Time-Based Patterns**: Detects temporal behaviors (e.g., news queries every morning)
- **Context-Triggered Patterns**: Associates contexts with subsystem preferences
- **Subsystem Prediction**: Predicts next likely subsystem based on recent activity

#### Learning Engine
- Tracks routing accuracy, response quality, and user interactions
- Records explicit feedback and infers satisfaction from behavior
- Improves over time by learning from routing corrections
- Measures improvement across routing accuracy, response time, and helpfulness

#### Context Extraction & Management
- **Automatic Extraction**: AI-powered extraction of preferences, facts, goals, and constraints
- **Global Context Store**: Shared knowledge across all clients (e.g., "visitor expected at 3pm")
- **Scoped Contexts**: Personal (user-specific) vs Global (system-wide) contexts
- **Smart Categorization**: Organizes information by type with confidence scoring

### 🚀 Multi-Agent Planning System

#### AgentOrchestrator
- Decomposes complex tasks into step-by-step execution plans
- Coordinates between specialized subsystems
- Tracks plan progress with real-time updates
- Adapts plans based on intermediate results

#### AgentPlanner
- Analyzes task requirements and available tools
- Creates optimized execution plans with parallel steps where possible
- Estimates complexity and success probability
- Identifies capability gaps for self-extension

#### AgentExecutor
- Executes plans with error handling and recovery
- Manages tool invocations across plugins
- Provides real-time progress updates via WebSocket
- Handles partial failures gracefully

### ⚡ Intelligent Routing System

Dual-model architecture optimized for speed and intelligence:

- **Pre-Routing Validator**: Claude Haiku 4.5 analyzes queries in <200ms
- **Confidence-Based Routing**: High-confidence (>80%) routes directly to subsystems
- **Pattern Fallback**: Medium/low confidence validates with pattern matching
- **Multi-Layer Caching**:
  - Exact match cache (1-5ms lookups)
  - Similarity-based cache (fuzzy matching, 75% threshold)
  - LRU eviction with configurable TTL (default: 5 minutes)
- **Session Learning**: Predicts next subsystem based on per-client patterns

### 🧩 Tiered Plugin System

#### Tier 1: Standard Plugins
- **Weather**: Real-time weather by IP geolocation (15-min cache)
- **News**: Latest headlines from Wikinews RSS (1-hour cache)
- **Wolfram Alpha**: Computational knowledge engine
- Minimal system integration, expose tools only

#### Tier 2: System Plugins (Planned)
- **Calendar Monitor**: Background monitoring with visitor detection
- **Sensor Monitor**: IoT device integration for smart home
- **Self-Extension**: AI-powered plugin generation
- Deep integration with EventBus, GlobalContext, LearningEngine

#### Tier 3: Generated Plugins (Planned)
- User-requested capabilities generated by AI
- Safety-checked and sandboxed execution
- Requires user approval before deployment

### 💾 Memory & Context System

- **Persistent Memory**: SQLite-backed storage with semantic search
- **Automatic Extraction**: AI identifies important facts, preferences, and goals
- **Cross-Conversation**: Remembers details across sessions
- **Contextual Recall**: Retrieves relevant memories for personalized responses
- **Global Context**: Shared knowledge for coordinated multi-client assistance

### 🏥 Self-Diagnostics & Health Monitoring

- **Comprehensive Health Checks**: Anthropic API, memory system, routing service
- **Startup Diagnostics**: Detects critical failures immediately on launch
- **Error Recovery**: Self-healing with automatic retry and fallback strategies
- **System Introspection**: Reports on routing performance, cache efficiency, memory usage
- **Failure Detection**: Identifies and logs component failures for debugging

### 📊 Performance Metrics

- **Cached Routing**: 1-5ms
- **Haiku Routing**: 50-200ms
- **Total Response**: 500ms-1s (conversational feel)
- **Cache Hit Rate**: >60% after warm-up
- **Routing Accuracy**: Continuously improving via learning
- **Pattern Detection**: Real-time behavioral analysis

### 💬 Natural Commands

#### Memory Management
- "remember that..." - Store specific information
- "what do you remember about...?" - Search memories
- "forget..." - Delete memories
- "what do you know about me?" - Summarize all memories

#### Context Awareness
- Automatically extracts context from natural conversation
- No explicit commands needed for most context storage
- System learns your preferences and patterns over time

#### Natural Routing
- Weather queries → Weather subsystem
- News requests → News subsystem
- Math/science → Wolfram Alpha
- Complex questions → Claude Sonnet
- **Fully automatic** - no routing commands needed

## 🔮 Roadmap: Full Autonomy (In Development)

proPACE is evolving toward complete autonomous operation with the following capabilities:

### Event-Driven Architecture
- **Event Bus**: Central nervous system for all system events
- **Active Monitoring**: Background sensor polling (IoT, calendar, security)
- **Webhook API**: Real-time event ingestion from external systems
- **Data Pipeline**: Continuous sensor data storage and trend analysis

### Autonomous Decision Engine
- **Context-Aware Decisions**: Analyzes GlobalContext, patterns, and recent events
- **Tiered Autonomy**:
  - **Tier 1 (Fully Autonomous)**: Safe routine actions (notifications, information gathering)
  - **Tier 2 (Context-Aware Auto)**: Smart decisions based on learned context (e.g., unlock door for expected visitor)
  - **Tier 3 (Approval Required)**: Uncertain or high-impact actions require user confirmation
- **Confidence Scoring**: 0-1 scale determines autonomy tier
- **Learning Loop**: Records decisions and user feedback to improve over time

### Self-Extension System
- **Capability Gap Detection**: Identifies missing tools during task planning
- **AI Code Generation**: Uses Claude Sonnet to write new plugin code
- **Safety Analysis**: Static analysis for dangerous patterns before deployment
- **User Approval Workflow**: Present generated code for review
- **Sandboxed Execution**: Tier 3 plugins run with restricted system access
- **Dynamic Deployment**: Register and activate plugins at runtime

### Example Use Case: Smart Home Integration

**Expected Visitor Scenario:**
1. Calendar Monitor detects visitor in 15 minutes → Stores in GlobalContext
2. Door sensor triggers → Event published to EventBus
3. DecisionEngine checks context → High confidence (0.95): Expected visitor
4. **Autonomously unlocks door** (Tier 2 action)
5. Sends notification: "John arrived, door unlocked"
6. Records successful decision for learning

**Unexpected Visitor Scenario:**
1. Door sensor triggers at 2am → No expected visitors in context
2. **Autonomous safety actions** (Tier 1): Check locks, turn on lights, activate cameras
3. **Requests approval** (Tier 3): "Unexpected visitor. Options: [Unlock, Call Security, Ignore]"
4. User decides → System learns decision for similar future scenarios

### Technical Implementation
- **5-Phase Development Plan**: Event infrastructure → System Plugins → Decision Engine → Self-Extension → Integration
- **28 New Core Files**: Across events, plugins, decision, autonomy, toolgen, data, and API modules
- **Zero New Dependencies**: Built entirely on existing Node.js packages (EventEmitter, better-sqlite3, express)
- **Full Backward Compatibility**: Autonomous features are additive, existing functionality unchanged

See [PLAN.md](.claude/plans/lively-discovering-spring.md) for complete implementation details.

## 🏆 Key Differentiators

What sets proPACE apart from other AI assistants:

1. **True Autonomy**: Not just reactive Q&A - makes context-aware decisions independently
2. **Self-Aware**: Introspects on its own performance and actively works to improve
3. **Self-Extending**: Generates new capabilities when encountering novel tasks
4. **Proactive**: Anticipates needs and offers suggestions before being asked
5. **Learns Continuously**: Every interaction improves routing, decision-making, and personalization
6. **Production-Ready**: Comprehensive testing, error recovery, and health monitoring
7. **Fully Local**: All data stays on your server - no external data sharing
8. **Extensible Architecture**: Tiered plugin system for controlled capability expansion

## Deployment

### Oracle Cloud Free Tier

See deployment guide in docs/ for detailed instructions on deploying to Oracle Cloud Free Tier ($0/month).

## Cost Estimate

- **Hosting**: $0/month (Oracle Cloud Free Tier)
- **Claude API**: ~$10-25/month (usage-based, scales with usage)
- **Other APIs**: $0-5/month (free tiers)

## Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **AI Models**: Anthropic Claude (Sonnet 4.5 + Haiku 4.5)
- **Database**: SQLite (better-sqlite3)
- **Communication**: WebSocket (ws)
- **Testing**: Vitest
- **Deployment**: Oracle Cloud Free Tier (ARM-based compute)

## License

MIT

