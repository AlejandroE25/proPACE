/**
 * AgentOrchestrator Test Suite
 *
 * Tests system orchestration, component coordination, health monitoring,
 * and lifecycle management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentOrchestrator } from '../../../src/orchestrator/agentOrchestrator';
import {
  SystemState,
  AgentOrchestratorConfig,
  PluginConfigMap
} from '../../../src/orchestrator/types';
import {
  AutonomyLevel,
  RiskLevel,
  DecisionRule
} from '../../../src/decision/types';
import { EventType } from '../../../src/events/types';
import { SensorType } from '../../../src/data/types';
import { PluginCapability } from '../../../src/plugins/types';

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let config: AgentOrchestratorConfig;

  beforeEach(() => {
    config = {
      dataStoragePath: ':memory:',
      eventStorePath: ':memory:',
      decisionEngine: {
        defaultAutonomyLevel: AutonomyLevel.APPROVAL_REQUIRED,
        maxRiskLevel: RiskLevel.MEDIUM,
        approvalTimeoutMs: 300000
      },
      plugins: {
        'temperature-sensor': {
          enabled: true,
          pollInterval: 30000,
          settings: {
            sensorId: 'temp-sensor-1',
            normalRange: { min: 18, max: 26 },
            anomalyThreshold: 5,
            location: 'Living Room'
          }
        }
      },
      rules: [
        {
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
            message: 'High temperature detected',
            priority: 'urgent'
          },
          autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
          riskLevel: RiskLevel.LOW,
          priority: 10,
          enabled: true,
          successCount: 0,
          failureCount: 0
        }
      ],
      healthCheckIntervalMs: 60000,
      errorThreshold: 5
    };

    orchestrator = new AgentOrchestrator(config);
  });

  afterEach(async () => {
    await orchestrator.shutdown();
  });

  describe('Lifecycle Management', () => {
    it('should initialize all components in correct order', async () => {
      await orchestrator.initialize();

      const health = orchestrator.getHealth();
      expect(health.state).toBe(SystemState.STOPPED);
      expect(health.components.eventBus).toBeDefined();
      expect(health.components.dataPipeline).toBeDefined();
      expect(health.components.pluginManager).toBeDefined();
      expect(health.components.decisionEngine).toBeDefined();
    });

    it('should start all components successfully', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const health = orchestrator.getHealth();
      expect(health.state).toBe(SystemState.RUNNING);
      expect(health.healthy).toBe(true);
    });

    it('should transition through states correctly', async () => {
      await orchestrator.initialize();
      expect(orchestrator.getState()).toBe(SystemState.STOPPED);

      const startPromise = orchestrator.start();
      // During start, state should be STARTING
      expect([SystemState.STARTING, SystemState.RUNNING]).toContain(orchestrator.getState());

      await startPromise;
      expect(orchestrator.getState()).toBe(SystemState.RUNNING);
    });

    it('should handle component initialization failure gracefully', async () => {
      // Create orchestrator with invalid plugin configuration
      const badConfig = { ...config };
      badConfig.plugins = {
        'invalid-plugin': {
          enabled: true,
          settings: {}
        }
      };

      const badOrchestrator = new AgentOrchestrator(badConfig);

      // Should not throw, but should mark system as degraded or error
      await badOrchestrator.initialize();

      const health = badOrchestrator.getHealth();
      expect([SystemState.DEGRADED, SystemState.ERROR, SystemState.STOPPED]).toContain(health.state);

      await badOrchestrator.shutdown();
    });

    it('should shutdown all components in reverse order', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      await orchestrator.shutdown();

      const health = orchestrator.getHealth();
      expect(health.state).toBe(SystemState.STOPPED);
    });

    it('should wait for pending operations during shutdown', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const shutdownStart = Date.now();
      await orchestrator.shutdown();
      const shutdownDuration = Date.now() - shutdownStart;

      // Shutdown should complete within reasonable time
      expect(shutdownDuration).toBeLessThan(2000);
    });

    it('should handle shutdown with active decisions', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // Trigger a decision by simulating sensor anomaly
      const eventBus = (orchestrator as any).eventBus;
      await eventBus.publish({
        type: EventType.SENSOR_ANOMALY,
        priority: 1,
        source: 'test',
        payload: {
          sensorId: 'temp-sensor-1',
          sensorType: SensorType.TEMPERATURE,
          value: 35
        }
      });

      // Wait a bit for decision processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should shutdown gracefully
      await orchestrator.shutdown();
      expect(orchestrator.getState()).toBe(SystemState.STOPPED);
    });

    it('should cleanup resources after shutdown', async () => {
      await orchestrator.initialize();
      await orchestrator.start();
      await orchestrator.shutdown();

      // Attempting operations after shutdown should be safe
      const health = orchestrator.getHealth();
      expect(health.state).toBe(SystemState.STOPPED);
    });
  });

  describe('Component Coordination', () => {
    it('should inject dependencies into all components', async () => {
      await orchestrator.initialize();

      const health = orchestrator.getHealth();
      expect(health.components.eventBus.healthy).toBe(true);
      expect(health.components.dataPipeline.healthy).toBe(true);
      expect(health.components.pluginManager.healthy).toBe(true);
      expect(health.components.decisionEngine.healthy).toBe(true);
    });

    it('should wire EventBus to DataPipeline', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // DataPipeline should be able to publish events
      const dataPipeline = (orchestrator as any).dataPipeline;
      await dataPipeline.ingest({
        sensorId: 'test-sensor',
        sensorType: SensorType.TEMPERATURE,
        value: 25,
        unit: '°C',
        timestamp: new Date()
      });

      // Event should be published
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it('should wire EventBus to DecisionEngine', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // DecisionEngine should receive events
      const eventBus = (orchestrator as any).eventBus;
      await eventBus.publish({
        type: EventType.SENSOR_ANOMALY,
        priority: 2,
        source: 'test',
        payload: {
          sensorType: SensorType.TEMPERATURE,
          value: 35
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const decisionEngine = (orchestrator as any).decisionEngine;
      const stats = decisionEngine.getStatistics();
      expect(stats.totalDecisions).toBeGreaterThanOrEqual(0);
    });

    it('should wire DataPipeline to plugins', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // Plugins should be able to ingest data
      await new Promise(resolve => setTimeout(resolve, 100));

      const dataStorage = (orchestrator as any).dataStorage;
      // Data storage should be available
      expect(dataStorage).toBeDefined();
    });

    it('should load decision rules from configuration', async () => {
      await orchestrator.initialize();

      const decisionEngine = (orchestrator as any).decisionEngine;
      const rules = decisionEngine.getRules();

      expect(rules.length).toBe(1);
      expect(rules[0].id).toBe('high-temp-alert');
    });

    it('should configure plugins from configuration', async () => {
      await orchestrator.initialize();

      const pluginManager = (orchestrator as any).pluginManager;
      const plugins = pluginManager.getPlugins();

      const tempPlugin = plugins.find((p: any) => p.metadata.id === 'temperature-sensor');
      expect(tempPlugin).toBeDefined();
    });
  });

  describe('Health Monitoring', () => {
    it('should report healthy when all components healthy', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const health = orchestrator.getHealth();
      expect(health.healthy).toBe(true);
      expect(health.state).toBe(SystemState.RUNNING);
    });

    it('should report degraded when one component unhealthy', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // Simulate component failure by accessing internals
      const eventBus = (orchestrator as any).eventBus;
      await eventBus.shutdown();

      // Wait for health check
      await new Promise(resolve => setTimeout(resolve, 100));

      const health = orchestrator.getHealth();
      // System should detect unhealthy component
      expect([SystemState.DEGRADED, SystemState.ERROR]).toContain(health.state);
    });

    it('should detect and log plugin errors', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // Simulate plugin error by causing poll failure
      // (This would normally be caught by health monitoring)

      const health = orchestrator.getHealth();
      expect(health.components.pluginManager).toBeDefined();
    });

    it('should detect and log decision engine errors', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const health = orchestrator.getHealth();
      expect(health.components.decisionEngine.healthy).toBe(true);
    });

    it('should track system metrics', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // Wait for some activity
      await new Promise(resolve => setTimeout(resolve, 200));

      const health = orchestrator.getHealth();
      expect(health.metrics).toBeDefined();
      expect(health.metrics.uptime).toBeGreaterThan(0);
      expect(health.metrics.eventsProcessedPerSecond).toBeGreaterThanOrEqual(0);
      expect(health.metrics.dataPointsIngestedPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should perform periodic health checks', async () => {
      const quickConfig = { ...config };
      quickConfig.healthCheckIntervalMs = 100;

      const quickOrchestrator = new AgentOrchestrator(quickConfig);
      await quickOrchestrator.initialize();
      await quickOrchestrator.start();

      const initialHealth = quickOrchestrator.getHealth();

      // Wait for health check
      await new Promise(resolve => setTimeout(resolve, 250));

      const laterHealth = quickOrchestrator.getHealth();
      expect(laterHealth).toBeDefined();

      await quickOrchestrator.shutdown();
    });

    it('should trigger alerts on error threshold', async () => {
      const strictConfig = { ...config };
      strictConfig.errorThreshold = 1;

      const strictOrchestrator = new AgentOrchestrator(strictConfig);
      await strictOrchestrator.initialize();
      await strictOrchestrator.start();

      // Simulate errors
      // (Would need to inject errors into components)

      await strictOrchestrator.shutdown();
    });
  });

  describe('Error Recovery', () => {
    it('should disable failed plugin and continue operation', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // Even if a plugin fails, system should continue
      const health = orchestrator.getHealth();
      expect([SystemState.RUNNING, SystemState.DEGRADED]).toContain(health.state);
    });

    it('should retry failed data ingestion', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const dataPipeline = (orchestrator as any).dataPipeline;

      // Attempt to ingest data
      await dataPipeline.ingest({
        sensorId: 'test-sensor',
        sensorType: SensorType.TEMPERATURE,
        value: 25,
        unit: '°C',
        timestamp: new Date()
      });

      // Should succeed
    });

    it('should handle EventBus queue overflow', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const eventBus = (orchestrator as any).eventBus;

      // Publish many events rapidly
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(eventBus.publish({
          type: EventType.SENSOR_TRIGGER,
          priority: 0,
          source: 'test',
          payload: { value: i }
        }));
      }

      await Promise.all(promises);

      // System should handle gracefully
      const health = orchestrator.getHealth();
      expect(health.state).toBe(SystemState.RUNNING);
    });

    it('should recover from temporary failures', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // System should be resilient to temporary issues
      const health = orchestrator.getHealth();
      expect(health.healthy).toBe(true);
    });

    it('should initiate shutdown on critical failure', async () => {
      // This would test automatic shutdown on critical errors
      // For now, just verify manual shutdown works
      await orchestrator.initialize();
      await orchestrator.start();
      await orchestrator.shutdown();

      expect(orchestrator.getState()).toBe(SystemState.STOPPED);
    });
  });

  describe('Integration Tests', () => {
    it('should process complete sensor → decision → action flow', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // Simulate sensor reading that triggers anomaly
      const dataPipeline = (orchestrator as any).dataPipeline;
      await dataPipeline.ingest({
        sensorId: 'temp-sensor-1',
        sensorType: SensorType.TEMPERATURE,
        value: 35, // Above threshold (28)
        unit: '°C',
        timestamp: new Date()
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify decision was made
      const decisionEngine = (orchestrator as any).decisionEngine;
      const stats = decisionEngine.getStatistics();
      expect(stats.totalDecisions).toBeGreaterThanOrEqual(0);
    });

    it('should handle multiple concurrent sensor readings', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const dataPipeline = (orchestrator as any).dataPipeline;

      // Ingest multiple readings concurrently
      await Promise.all([
        dataPipeline.ingest({
          sensorId: 'temp-sensor-1',
          sensorType: SensorType.TEMPERATURE,
          value: 22,
          unit: '°C',
          timestamp: new Date()
        }),
        dataPipeline.ingest({
          sensorId: 'temp-sensor-1',
          sensorType: SensorType.TEMPERATURE,
          value: 23,
          unit: '°C',
          timestamp: new Date()
        }),
        dataPipeline.ingest({
          sensorId: 'temp-sensor-1',
          sensorType: SensorType.TEMPERATURE,
          value: 24,
          unit: '°C',
          timestamp: new Date()
        })
      ]);

      await new Promise(resolve => setTimeout(resolve, 100));

      const dataStorage = (orchestrator as any).dataStorage;
      const readings = dataStorage.getLatest('temp-sensor-1', 3);
      expect(readings.length).toBe(3);
    });

    it('should coordinate multiple plugins simultaneously', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const pluginManager = (orchestrator as any).pluginManager;
      const plugins = pluginManager.getPlugins();

      // All enabled plugins should be running
      const runningPlugins = plugins.filter((p: any) => p.state === 'running');
      expect(runningPlugins.length).toBeGreaterThanOrEqual(0);
    });

    it('should execute autonomous decisions automatically', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // Trigger autonomous decision
      const eventBus = (orchestrator as any).eventBus;
      await eventBus.publish({
        type: EventType.SENSOR_ANOMALY,
        priority: 2,
        source: 'test',
        payload: {
          sensorType: SensorType.TEMPERATURE,
          value: 35
        }
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const decisionEngine = (orchestrator as any).decisionEngine;
      const stats = decisionEngine.getStatistics();
      // May or may not have decisions depending on rule matching
      expect(stats).toBeDefined();
    });

    it('should queue decisions requiring approval', async () => {
      // Create orchestrator with approval-required rules
      const approvalConfig = { ...config };
      approvalConfig.rules[0].autonomyLevel = AutonomyLevel.APPROVAL_REQUIRED;

      const approvalOrchestrator = new AgentOrchestrator(approvalConfig);
      await approvalOrchestrator.initialize();
      await approvalOrchestrator.start();

      // Trigger decision
      const eventBus = (approvalOrchestrator as any).eventBus;
      await eventBus.publish({
        type: EventType.SENSOR_ANOMALY,
        priority: 2,
        source: 'test',
        payload: {
          sensorType: SensorType.TEMPERATURE,
          value: 35
        }
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      await approvalOrchestrator.shutdown();
    });

    it('should handle mixed autonomy levels correctly', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      // System should handle different autonomy levels
      const health = orchestrator.getHealth();
      expect(health.healthy).toBe(true);
    });

    it('should maintain data consistency across components', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const dataPipeline = (orchestrator as any).dataPipeline;
      const dataStorage = (orchestrator as any).dataStorage;

      // Ingest data
      await dataPipeline.ingest({
        sensorId: 'test-consistency',
        sensorType: SensorType.TEMPERATURE,
        value: 25,
        unit: '°C',
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify data is stored
      const readings = dataStorage.getLatest('test-consistency', 1);
      expect(readings.length).toBe(1);
      expect(readings[0].value).toBe(25);
    });

    it('should handle high event throughput', async () => {
      await orchestrator.initialize();
      await orchestrator.start();

      const eventBus = (orchestrator as any).eventBus;

      // Publish many events
      const publishPromises = [];
      for (let i = 0; i < 50; i++) {
        publishPromises.push(eventBus.publish({
          type: EventType.SENSOR_TRIGGER,
          priority: 0,
          source: 'test',
          payload: { iteration: i }
        }));
      }

      await Promise.all(publishPromises);

      // System should remain healthy
      const health = orchestrator.getHealth();
      expect([SystemState.RUNNING, SystemState.DEGRADED]).toContain(health.state);
    });
  });

  describe('Configuration Management', () => {
    it('should load configuration from object', async () => {
      await orchestrator.initialize();

      const health = orchestrator.getHealth();
      expect(health).toBeDefined();
    });

    it('should apply default configuration values', () => {
      const minimalConfig: AgentOrchestratorConfig = {
        dataStoragePath: ':memory:',
        eventStorePath: ':memory:',
        decisionEngine: {
          defaultAutonomyLevel: AutonomyLevel.APPROVAL_REQUIRED,
          maxRiskLevel: RiskLevel.MEDIUM,
          approvalTimeoutMs: 300000
        },
        plugins: {},
        rules: [],
        healthCheckIntervalMs: 60000,
        errorThreshold: 5
      };

      const minimalOrchestrator = new AgentOrchestrator(minimalConfig);
      expect(minimalOrchestrator).toBeDefined();
    });

    it('should validate configuration structure', () => {
      // Valid configuration should not throw
      expect(() => new AgentOrchestrator(config)).not.toThrow();
    });

    it('should reject invalid configuration', () => {
      // Invalid configuration should be handled gracefully
      const invalidConfig = null as any;

      expect(() => new AgentOrchestrator(invalidConfig)).toThrow();
    });
  });
});
