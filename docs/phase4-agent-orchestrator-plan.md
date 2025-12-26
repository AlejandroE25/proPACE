# Phase 4: Agent Orchestrator - Implementation Plan

## Overview

The Agent Orchestrator is the "brain" that coordinates all subsystems in proPACE. It manages the complete system lifecycle, ensures component health, and orchestrates data flow between EventBus, DataPipeline, PluginManager, and DecisionEngine.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Lifecycle Manager                         │  │
│  │  - Initialize all subsystems                          │  │
│  │  - Start/Stop coordination                            │  │
│  │  - Graceful shutdown                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Component Coordinator                        │  │
│  │  - EventBus + EventStore                              │  │
│  │  - DataPipeline + DataStorage                         │  │
│  │  - PluginManager (with all plugins)                   │  │
│  │  - DecisionEngine (with rules)                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Health Monitor                              │  │
│  │  - Component health checks                            │  │
│  │  - Error detection and recovery                       │  │
│  │  - Performance metrics                                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Configuration Manager                         │  │
│  │  - Load system configuration                          │  │
│  │  - Runtime config updates                             │  │
│  │  - Plugin configuration                               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Responsibilities

### 1. System Lifecycle Management

**Initialization Sequence**:
1. Load configuration from file/environment
2. Create EventStore and EventBus
3. Create DataStorage and DataPipeline
4. Create PluginManager
5. Create DecisionEngine
6. Wire up dependencies (inject EventBus, DataPipeline into plugins/engine)
7. Load decision rules from configuration
8. Initialize all plugins
9. Start EventBus
10. Start DataPipeline
11. Start all plugins
12. Start DecisionEngine
13. Mark system as ready

**Shutdown Sequence**:
1. Mark system as shutting down
2. Stop DecisionEngine (wait for pending decisions)
3. Stop all plugins gracefully
4. Stop DataPipeline (flush pending data)
5. Stop EventBus (wait for in-flight events)
6. Close DataStorage
7. Close EventStore
8. Clean up resources

### 2. Component Coordination

**Event Flow**:
```
Sensor Plugin → EventBus → DecisionEngine → Action
                    ↓
              DataPipeline → DataStorage
```

**Data Flow**:
```
Sensor Plugin → poll() → DataPipeline.ingest()
                              ↓
                        Validation → Enrichment → Storage
                              ↓
                        SENSOR_TRIGGER event published
```

**Decision Flow**:
```
EventBus → DecisionEngine → Rule Evaluation → Decision
                                    ↓
                          Autonomous execution or approval request
                                    ↓
                          Execute action (plugin call, event publish, etc.)
```

### 3. Health Monitoring

**Health Checks**:
- EventBus: Check queue depth, subscriber count, error rate
- DataPipeline: Check ingestion rate, validation errors, storage health
- PluginManager: Check plugin states, error counts
- DecisionEngine: Check decision rate, approval queue depth, execution errors

**Error Recovery**:
- Plugin failure: Disable plugin, log error, continue operation
- Pipeline failure: Retry ingestion, fallback to direct storage
- Decision failure: Log error, notify user, don't retry automatically
- Critical failure: Initiate graceful shutdown

**Performance Metrics**:
- Events processed per second
- Data points ingested per second
- Decisions made per minute
- Average response latency
- System uptime

### 4. Configuration Management

**System Configuration**:
```typescript
interface AgentOrchestratorConfig {
  // Storage paths
  dataStoragePath: string;
  eventStorePath: string;

  // Decision engine config
  decisionEngine: {
    defaultAutonomyLevel: AutonomyLevel;
    maxRiskLevel: RiskLevel;
    approvalTimeoutMs: number;
  };

  // Plugin configurations
  plugins: {
    [pluginId: string]: {
      enabled: boolean;
      pollInterval?: number;
      settings?: any;
    };
  };

  // Decision rules
  rules: DecisionRule[];

  // Health monitoring
  healthCheckIntervalMs: number;
  errorThreshold: number;
}
```

## Data Flow Example: Temperature Anomaly Detection

Let's trace a complete flow through the system:

### Step 1: Sensor Reading
```typescript
// TemperatureSensorPlugin polls every 30 seconds
const temperature = await this.getCurrentTemperature();
// Returns: 35°C (abnormally high)
```

### Step 2: Data Ingestion
```typescript
// Plugin ingests data through DataPipeline
await this.dataPipeline.ingest({
  sensorId: 'temp-sensor-1',
  sensorType: SensorType.TEMPERATURE,
  value: 35,
  unit: '°C',
  timestamp: new Date(),
  metadata: { location: 'Living Room' }
});
```

### Step 3: Pipeline Processing
```typescript
// DataPipeline validates and enriches
1. Validation: Check required fields ✓
2. Enrichment: Add quality score (95%) ✓
3. Storage: Write to DataStorage ✓
4. Event: Publish SENSOR_TRIGGER event ✓
```

### Step 4: Anomaly Detection
```typescript
// Plugin checks historical data
const recentReadings = this.dataStorage.getLatest('temp-sensor-1', 10);
const avgTemp = calculateAverage(recentReadings); // 22°C
const spike = 35 - 22; // 13°C spike

if (spike > anomalyThreshold) { // 5°C
  // Publish SENSOR_ANOMALY event
  await this.eventBus.publish({
    type: EventType.SENSOR_ANOMALY,
    priority: EventPriority.HIGH,
    source: 'temperature-sensor',
    payload: {
      sensorId: 'temp-sensor-1',
      sensorType: SensorType.TEMPERATURE,
      value: 35,
      anomalyType: 'temperature_spike',
      severity: 'high',
      details: `Temperature spike: ${spike}°C`
    }
  });
}
```

### Step 5: Decision Engine Receives Event
```typescript
// DecisionEngine subscribed to SENSOR_ANOMALY events
async handleEvent(event: Event): Promise<void> {
  // Build context
  const context = await this.buildContext(event);
  // Context includes: trigger event, time of day, user preferences

  // Evaluate rules
  const matchingRules = await this.evaluateRules(context);
  // Finds: "High Temperature Alert Rule"

  // Make decision
  await this.makeDecision(context);
}
```

### Step 6: Rule Evaluation
```typescript
// Rule: "High Temperature Alert"
const rule: DecisionRule = {
  id: 'high-temp-alert',
  name: 'High Temperature Alert',
  description: 'Notify user when temperature exceeds normal range',
  conditions: {
    eventType: EventType.SENSOR_ANOMALY,
    sensorType: SensorType.TEMPERATURE,
    valueComparison: {
      operator: '>',
      value: 28
    }
  },
  action: {
    type: 'notify_user',
    message: 'High temperature detected in Living Room: 35°C',
    priority: 'urgent'
  },
  autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
  riskLevel: RiskLevel.LOW,
  priority: 10,
  enabled: true
};

// Rule matches! Temperature is 35°C > 28°C
```

### Step 7: Decision Execution
```typescript
// Decision made with high confidence
const decision: Decision = {
  id: 'abc-123',
  timestamp: new Date(),
  context: { /* ... */ },
  selectedOption: {
    id: 'notify-option',
    description: 'Send urgent notification to user',
    action: rule.action,
    riskLevel: RiskLevel.LOW,
    confidence: 0.9
  },
  autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
  requiresApproval: false // LOW risk, FULLY_AUTONOMOUS
};

// Execute immediately (no approval required)
await this.executeAction(decision.selectedOption.action);
```

### Step 8: Action Execution
```typescript
// Execute notify_user action
await this.eventBus.publish({
  type: EventType.SYSTEM_STATUS,
  priority: EventPriority.HIGH,
  source: 'decision-engine',
  payload: {
    notification: 'High temperature detected in Living Room: 35°C',
    priority: 'urgent'
  }
});
```

### Step 9: User Notification
```typescript
// UI layer (future) receives SYSTEM_STATUS event
// Displays notification to user:
// "🔥 High temperature detected in Living Room: 35°C"
```

## Complete System Flow Diagram

```
┌─────────────────────┐
│ TemperatureSensor   │
│ Plugin              │
└──────────┬──────────┘
           │ poll() → 35°C
           ↓
┌─────────────────────┐
│ DataPipeline        │
│ .ingest()           │
└──────────┬──────────┘
           │ validate, enrich, store
           ↓
┌─────────────────────┐     ┌─────────────────────┐
│ DataStorage         │     │ EventBus            │
│ SQLite DB           │     │ SENSOR_TRIGGER      │
└─────────────────────┘     └──────────┬──────────┘
                                       │
                            ┌──────────┴──────────┐
                            │                     │
                            ↓                     ↓
                  ┌─────────────────┐   ┌─────────────────┐
                  │ Temperature     │   │ Other           │
                  │ Plugin          │   │ Subscribers     │
                  │ (anomaly check) │   │                 │
                  └────────┬────────┘   └─────────────────┘
                           │
                           │ Check history
                           │ Detect spike (13°C)
                           ↓
                  ┌─────────────────┐
                  │ EventBus        │
                  │ SENSOR_ANOMALY  │
                  └────────┬────────┘
                           │
                           ↓
                  ┌─────────────────┐
                  │ DecisionEngine  │
                  │ - Build context │
                  │ - Evaluate rules│
                  │ - Make decision │
                  └────────┬────────┘
                           │
                           │ Match: "High Temp Alert"
                           │ Risk: LOW
                           │ Autonomy: FULLY_AUTONOMOUS
                           ↓
                  ┌─────────────────┐
                  │ Execute Action  │
                  │ notify_user     │
                  └────────┬────────┘
                           │
                           ↓
                  ┌─────────────────┐
                  │ EventBus        │
                  │ SYSTEM_STATUS   │
                  └────────┬────────┘
                           │
                           ↓
                  ┌─────────────────┐
                  │ User Interface  │
                  │ (Future)        │
                  │ Display alert   │
                  └─────────────────┘
```

## Type Definitions Needed

### Core Types

```typescript
export interface AgentOrchestratorConfig {
  dataStoragePath: string;
  eventStorePath: string;
  decisionEngine: DecisionEngineConfig;
  plugins: PluginConfigMap;
  rules: DecisionRule[];
  healthCheckIntervalMs: number;
  errorThreshold: number;
}

export interface PluginConfigMap {
  [pluginId: string]: {
    enabled: boolean;
    pollInterval?: number;
    settings?: any;
  };
}

export enum SystemState {
  INITIALIZING = 'initializing',
  STARTING = 'starting',
  RUNNING = 'running',
  DEGRADED = 'degraded',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error'
}

export interface SystemHealth {
  state: SystemState;
  healthy: boolean;
  uptime: number;
  components: {
    eventBus: ComponentHealth;
    dataPipeline: ComponentHealth;
    pluginManager: ComponentHealth;
    decisionEngine: ComponentHealth;
  };
  metrics: SystemMetrics;
  errors: ErrorSummary[];
}

export interface ComponentHealth {
  healthy: boolean;
  state: string;
  errorCount: number;
  lastError?: string;
  lastErrorTime?: Date;
  metrics?: any;
}

export interface SystemMetrics {
  eventsProcessedPerSecond: number;
  dataPointsIngestedPerSecond: number;
  decisionsPerMinute: number;
  averageLatencyMs: number;
  uptime: number;
}

export interface ErrorSummary {
  component: string;
  message: string;
  timestamp: Date;
  count: number;
}
```

## Test Specifications

### 1. Lifecycle Tests (8 tests)
- Should initialize all components in correct order
- Should start all components successfully
- Should transition through states correctly (INITIALIZING → STARTING → RUNNING)
- Should handle component initialization failure gracefully
- Should shutdown all components in reverse order
- Should wait for pending operations during shutdown
- Should handle shutdown with active decisions
- Should cleanup resources after shutdown

### 2. Component Coordination Tests (6 tests)
- Should inject dependencies into all components
- Should wire EventBus to DataPipeline
- Should wire EventBus to DecisionEngine
- Should wire DataPipeline to plugins
- Should load decision rules from configuration
- Should configure plugins from configuration

### 3. Health Monitoring Tests (7 tests)
- Should report healthy when all components healthy
- Should report degraded when one component unhealthy
- Should detect and log plugin errors
- Should detect and log decision engine errors
- Should track system metrics (events/sec, ingestion rate)
- Should perform periodic health checks
- Should trigger alerts on error threshold

### 4. Error Recovery Tests (5 tests)
- Should disable failed plugin and continue operation
- Should retry failed data ingestion
- Should handle EventBus queue overflow
- Should recover from temporary failures
- Should initiate shutdown on critical failure

### 5. Integration Tests (8 tests)
- Should process complete sensor → decision → action flow
- Should handle multiple concurrent sensor readings
- Should coordinate multiple plugins simultaneously
- Should execute autonomous decisions automatically
- Should queue decisions requiring approval
- Should handle mixed autonomy levels correctly
- Should maintain data consistency across components
- Should handle high event throughput

### 6. Configuration Tests (4 tests)
- Should load configuration from file
- Should apply default configuration values
- Should validate configuration structure
- Should reject invalid configuration

**Total: 38 test specifications**

## Implementation Plan

### Step 1: Create Types
- File: `src/orchestrator/types.ts`
- Define all interfaces and enums

### Step 2: Create Test Suite
- File: `tests/unit/orchestrator/agentOrchestrator.test.ts`
- Implement all 38 test specifications

### Step 3: Implement AgentOrchestrator
- File: `src/orchestrator/agentOrchestrator.ts`
- Implement core orchestration logic

### Step 4: Create Default Configuration
- File: `src/orchestrator/defaultConfig.ts`
- Default system configuration

### Step 5: Integration Testing
- Verify end-to-end flows work correctly
- Test with real sensor data simulation

## Success Criteria

- All 38 tests passing
- Complete temperature anomaly flow works end-to-end
- System starts and stops gracefully
- Health monitoring detects failures
- Error recovery functions correctly
- No resource leaks during shutdown
- Overall test count: 350 + 38 = 388 tests passing

## Future Enhancements (Not in this phase)

- Web dashboard for system monitoring
- REST API for external control
- Configuration hot-reloading
- Distributed orchestration (multiple agents)
- Machine learning for rule optimization
- Advanced analytics and reporting
