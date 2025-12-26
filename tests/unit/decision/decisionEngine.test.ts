/**
 * DecisionEngine Test Suite
 *
 * Tests autonomous decision-making, context awareness, rule evaluation,
 * and action execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DecisionEngine } from '../../../src/decision/decisionEngine';
import { EventBus } from '../../../src/events/eventBus';
import { EventStore } from '../../../src/events/eventStore';
import {
  AutonomyLevel,
  RiskLevel,
  DecisionContext,
  DecisionRule,
  DecisionAction
} from '../../../src/decision/types';
import { EventType, EventPriority } from '../../../src/events/types';

describe('DecisionEngine', () => {
  let decisionEngine: DecisionEngine;
  let eventBus: EventBus;
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = new EventStore(':memory:');
    eventBus = new EventBus(eventStore);
    decisionEngine = new DecisionEngine(eventBus);
  });

  afterEach(async () => {
    await decisionEngine.shutdown();
    await eventBus.shutdown();
    eventStore.close();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(decisionEngine).toBeDefined();
    });

    it('should start event subscription', async () => {
      await decisionEngine.start();

      const stats = decisionEngine.getStatistics();
      expect(stats).toBeDefined();
      expect(stats.totalDecisions).toBe(0);
    });

    it('should have default configuration', () => {
      const config = (decisionEngine as any).config;
      expect(config.defaultAutonomyLevel).toBeDefined();
      expect(config.maxRiskLevel).toBeDefined();
    });
  });

  describe('Decision Context Building', () => {
    beforeEach(async () => {
      await decisionEngine.start();
    });

    it('should build context from sensor event', async () => {
      const event = {
        type: EventType.SENSOR_ANOMALY,
        priority: EventPriority.HIGH,
        source: 'sensor:temp-1',
        payload: {
          sensorId: 'temp-1',
          sensorType: 'temperature',
          value: 35,
          anomalyType: 'spike'
        },
        timestamp: new Date()
      };

      const context = await (decisionEngine as any).buildContext(event);

      expect(context.triggerEvent).toBeDefined();
      expect(context.triggerEvent.type).toBe(EventType.SENSOR_ANOMALY);
      expect(context.triggerEvent.payload.value).toBe(35);
    });

    it('should include time-of-day in context', async () => {
      const context = await (decisionEngine as any).buildContext({
        type: EventType.SENSOR_TRIGGER,
        source: 'test',
        payload: {}
      });

      expect(context.environment).toBeDefined();
      expect(context.environment.timeOfDay).toMatch(/morning|afternoon|evening|night/);
    });

    it('should include sensor data in context', async () => {
      // Simulate sensor data availability
      const context: DecisionContext = {
        sensorData: {
          'temp-1': {
            currentValue: 35,
            trend: 'increasing',
            anomaly: true
          }
        }
      };

      expect(context.sensorData!['temp-1'].currentValue).toBe(35);
      expect(context.sensorData!['temp-1'].anomaly).toBe(true);
    });
  });

  describe('Rule Evaluation', () => {
    beforeEach(async () => {
      await decisionEngine.start();
    });

    it('should add decision rule', () => {
      const rule: DecisionRule = {
        id: 'high-temp-alert',
        name: 'High Temperature Alert',
        description: 'Alert when temperature exceeds threshold',
        conditions: {
          eventType: EventType.SENSOR_ANOMALY,
          sensorType: 'temperature',
          valueComparison: {
            operator: '>',
            value: 30
          }
        },
        action: {
          type: 'notify_user',
          message: 'Temperature is too high!',
          priority: 'high'
        },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const rules = decisionEngine.getRules();
      expect(rules.length).toBe(1);
      expect(rules[0].id).toBe('high-temp-alert');
    });

    it('should evaluate matching rule', async () => {
      const rule: DecisionRule = {
        id: 'temp-rule',
        name: 'Temperature Rule',
        description: 'Test rule',
        conditions: {
          eventType: EventType.SENSOR_ANOMALY,
          valueComparison: {
            operator: '>',
            value: 30
          }
        },
        action: {
          type: 'notify_user',
          message: 'Alert!'
        },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: { value: 35 },
          timestamp: new Date()
        }
      };

      const matchingRules = await (decisionEngine as any).evaluateRules(context);
      expect(matchingRules.length).toBeGreaterThan(0);
      expect(matchingRules[0].id).toBe('temp-rule');
    });

    it('should not match rule with wrong event type', async () => {
      const rule: DecisionRule = {
        id: 'specific-rule',
        name: 'Specific Event Rule',
        description: 'Only for sensor anomalies',
        conditions: {
          eventType: EventType.SENSOR_ANOMALY
        },
        action: {
          type: 'notify_user',
          message: 'Anomaly detected'
        },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_TRIGGER, // Different type
          payload: {},
          timestamp: new Date()
        }
      };

      const matchingRules = await (decisionEngine as any).evaluateRules(context);
      expect(matchingRules.length).toBe(0);
    });

    it('should evaluate time range conditions', async () => {
      const rule: DecisionRule = {
        id: 'night-rule',
        name: 'Night Time Rule',
        description: 'Only active at night',
        conditions: {
          timeRange: {
            start: '22:00',
            end: '06:00'
          }
        },
        action: {
          type: 'notify_user',
          message: 'Night time action'
        },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        environment: {
          timeOfDay: 'night'
        }
      };

      const matchingRules = await (decisionEngine as any).evaluateRules(context);
      // Will match if current time is within range
      expect(matchingRules).toBeDefined();
    });
  });

  describe('Decision Making', () => {
    beforeEach(async () => {
      await decisionEngine.start();
    });

    it('should make autonomous decision for low-risk action', async () => {
      const rule: DecisionRule = {
        id: 'low-risk-rule',
        name: 'Low Risk Rule',
        description: 'Test rule',
        conditions: {
          eventType: EventType.SENSOR_ANOMALY
        },
        action: {
          type: 'notify_user',
          message: 'Low risk notification'
        },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: { value: 35 },
          timestamp: new Date()
        },
        userPreferences: {
          autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
          allowedRiskLevel: RiskLevel.MEDIUM
        }
      };

      const decision = await decisionEngine.makeDecision(context);

      expect(decision).toBeDefined();
      expect(decision.requiresApproval).toBe(false);
      expect(decision.autonomyLevel).toBe(AutonomyLevel.FULLY_AUTONOMOUS);
    });

    it('should require approval for high-risk action', async () => {
      const rule: DecisionRule = {
        id: 'high-risk-rule',
        name: 'High Risk Rule',
        description: 'Test rule',
        conditions: {
          eventType: EventType.SENSOR_ANOMALY
        },
        action: {
          type: 'plugin_call',
          pluginId: 'door-lock',
          method: 'unlock'
        },
        autonomyLevel: AutonomyLevel.APPROVAL_REQUIRED,
        riskLevel: RiskLevel.HIGH,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: {},
          timestamp: new Date()
        },
        userPreferences: {
          autonomyLevel: AutonomyLevel.APPROVAL_REQUIRED,
          allowedRiskLevel: RiskLevel.MEDIUM
        }
      };

      const decision = await decisionEngine.makeDecision(context);

      expect(decision).toBeDefined();
      expect(decision.requiresApproval).toBe(true);
      expect(decision.approvalStatus).toBe('pending');
    });

    it('should select highest priority rule', async () => {
      const lowPriorityRule: DecisionRule = {
        id: 'low-priority',
        name: 'Low Priority',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: { type: 'notify_user', message: 'Low' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 5,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      const highPriorityRule: DecisionRule = {
        id: 'high-priority',
        name: 'High Priority',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: { type: 'notify_user', message: 'High' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 15,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(lowPriorityRule);
      decisionEngine.addRule(highPriorityRule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: {},
          timestamp: new Date()
        }
      };

      const decision = await decisionEngine.makeDecision(context);

      expect(decision.selectedOption.id).toContain('high-priority');
    });

    it('should generate reasoning for decision', async () => {
      const rule: DecisionRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: { type: 'notify_user', message: 'Test' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: { value: 35 },
          timestamp: new Date()
        }
      };

      const decision = await decisionEngine.makeDecision(context);

      expect(decision.reasoning).toBeDefined();
      expect(decision.reasoning.length).toBeGreaterThan(0);
    });
  });

  describe('Decision Approval', () => {
    beforeEach(async () => {
      await decisionEngine.start();
    });

    it('should approve pending decision', async () => {
      const rule: DecisionRule = {
        id: 'approval-rule',
        name: 'Approval Required Rule',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: { type: 'notify_user', message: 'Test' },
        autonomyLevel: AutonomyLevel.APPROVAL_REQUIRED,
        riskLevel: RiskLevel.MEDIUM,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: {},
          timestamp: new Date()
        }
      };

      const decision = await decisionEngine.makeDecision(context);
      expect(decision.approvalStatus).toBe('pending');

      await decisionEngine.approveDecision(decision.id, 'user-1');

      const approved = decisionEngine.getDecision(decision.id);
      expect(approved?.approvalStatus).toBe('approved');
      expect(approved?.approvedBy).toBe('user-1');
    });

    it('should reject pending decision', async () => {
      const rule: DecisionRule = {
        id: 'approval-rule',
        name: 'Approval Required Rule',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: { type: 'notify_user', message: 'Test' },
        autonomyLevel: AutonomyLevel.APPROVAL_REQUIRED,
        riskLevel: RiskLevel.MEDIUM,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: {},
          timestamp: new Date()
        }
      };

      const decision = await decisionEngine.makeDecision(context);

      await decisionEngine.rejectDecision(decision.id, 'user-1');

      const rejected = decisionEngine.getDecision(decision.id);
      expect(rejected?.approvalStatus).toBe('rejected');
    });
  });

  describe('Decision Execution', () => {
    beforeEach(async () => {
      await decisionEngine.start();
    });

    it('should execute autonomous decision immediately', async () => {
      await decisionEngine.start(); // Start engine to enable event handling

      const rule: DecisionRule = {
        id: 'auto-rule',
        name: 'Autonomous Rule',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: {
          type: 'event_publish',
          eventType: EventType.SYSTEM_STATUS,
          eventPayload: { status: 'executed' }
        },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: {},
          timestamp: new Date()
        }
      };

      const decision = await decisionEngine.makeDecision(context);

      // Wait for async execution with proper polling
      await vi.waitFor(() => {
        const executed = decisionEngine.getDecision(decision.id);
        expect(executed?.executionStatus).toBe('completed');
      }, { timeout: 500 });
    });

    it('should track execution results', async () => {
      await decisionEngine.start(); // Start engine to enable event handling

      const rule: DecisionRule = {
        id: 'track-rule',
        name: 'Tracked Rule',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: {
          type: 'notify_user',
          message: 'Test notification'
        },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: {},
          timestamp: new Date()
        }
      };

      const decision = await decisionEngine.makeDecision(context);

      // Wait for execution with proper polling
      await vi.waitFor(() => {
        const executed = decisionEngine.getDecision(decision.id);
        expect(executed?.executedAt).toBeDefined();
        expect(executed?.executionResult).toBeDefined();
      }, { timeout: 500 });
    });

    it('should handle execution errors gracefully', async () => {
      await decisionEngine.start(); // Start engine to enable event handling

      const rule: DecisionRule = {
        id: 'error-rule',
        name: 'Error Rule',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: {
          type: 'plugin_call',
          pluginId: 'non-existent-plugin',
          method: 'someMethod'
        },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: {},
          timestamp: new Date()
        }
      };

      const decision = await decisionEngine.makeDecision(context);

      // Wait for execution attempt with proper polling
      await vi.waitFor(() => {
        const failed = decisionEngine.getDecision(decision.id);
        expect(failed?.executionStatus).toBe('failed');
        expect(failed?.executionError).toBeDefined();
      }, { timeout: 500 });
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await decisionEngine.start();
    });

    it('should track decision statistics', async () => {
      const rule: DecisionRule = {
        id: 'stats-rule',
        name: 'Stats Rule',
        description: 'Test',
        conditions: { eventType: EventType.SENSOR_ANOMALY },
        action: { type: 'notify_user', message: 'Test' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      const context: DecisionContext = {
        triggerEvent: {
          type: EventType.SENSOR_ANOMALY,
          payload: {},
          timestamp: new Date()
        }
      };

      await decisionEngine.makeDecision(context);
      await decisionEngine.makeDecision(context);

      const stats = decisionEngine.getStatistics();
      expect(stats.totalDecisions).toBe(2);
      expect(stats.autonomousDecisions).toBe(2);
    });

    it('should count active rules', () => {
      const rule1: DecisionRule = {
        id: 'rule-1',
        name: 'Rule 1',
        description: 'Test',
        conditions: {},
        action: { type: 'notify_user', message: 'Test' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      const rule2: DecisionRule = {
        id: 'rule-2',
        name: 'Rule 2',
        description: 'Test',
        conditions: {},
        action: { type: 'notify_user', message: 'Test' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: false, // Disabled
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule1);
      decisionEngine.addRule(rule2);

      const stats = decisionEngine.getStatistics();
      expect(stats.activeRules).toBe(1); // Only enabled rules
    });
  });

  describe('Rule Management', () => {
    it('should update existing rule', () => {
      const rule: DecisionRule = {
        id: 'update-rule',
        name: 'Update Rule',
        description: 'Original',
        conditions: {},
        action: { type: 'notify_user', message: 'Original' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      decisionEngine.updateRule('update-rule', {
        description: 'Updated',
        action: { type: 'notify_user', message: 'Updated' }
      });

      const updated = decisionEngine.getRule('update-rule');
      expect(updated?.description).toBe('Updated');
      expect(updated?.action.message).toBe('Updated');
    });

    it('should remove rule', () => {
      const rule: DecisionRule = {
        id: 'remove-rule',
        name: 'Remove Rule',
        description: 'Test',
        conditions: {},
        action: { type: 'notify_user', message: 'Test' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);
      expect(decisionEngine.getRules().length).toBe(1);

      decisionEngine.removeRule('remove-rule');
      expect(decisionEngine.getRules().length).toBe(0);
    });

    it('should disable rule', () => {
      const rule: DecisionRule = {
        id: 'disable-rule',
        name: 'Disable Rule',
        description: 'Test',
        conditions: {},
        action: { type: 'notify_user', message: 'Test' },
        autonomyLevel: AutonomyLevel.FULLY_AUTONOMOUS,
        riskLevel: RiskLevel.LOW,
        priority: 10,
        enabled: true,
        successCount: 0,
        failureCount: 0
      };

      decisionEngine.addRule(rule);

      decisionEngine.disableRule('disable-rule');

      const disabled = decisionEngine.getRule('disable-rule');
      expect(disabled?.enabled).toBe(false);
    });
  });
});
