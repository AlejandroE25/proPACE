/**
 * Decision Engine
 *
 * Autonomous decision-making system that evaluates context, applies rules,
 * and executes actions based on risk assessment and autonomy levels.
 */

import { EventBus } from '../events/eventBus';
import { Event, EventType, EventPriority, EventSubscriber } from '../events/types';
import {
  AutonomyLevel,
  RiskLevel,
  DecisionContext,
  DecisionOption,
  DecisionAction,
  Decision,
  DecisionRule,
  DecisionEngineStats
} from './types';
import { randomUUID } from 'crypto';

/**
 * Decision Engine Configuration
 */
interface DecisionEngineConfig {
  defaultAutonomyLevel: AutonomyLevel;
  maxRiskLevel: RiskLevel;
  approvalTimeoutMs: number;
}

/**
 * Decision Engine
 * Core autonomous decision-making system
 */
export class DecisionEngine {
  private eventBus: EventBus;
  private config: DecisionEngineConfig;
  private rules: Map<string, DecisionRule>;
  private decisions: Map<string, Decision>;
  private stats: {
    totalDecisions: number;
    autonomousDecisions: number;
    approvalRequiredDecisions: number;
    approvedDecisions: number;
    rejectedDecisions: number;
    successfulDecisions: number;
    failedDecisions: number;
    confidenceSum: number;
  };
  private isRunning: boolean;

  constructor(eventBus: EventBus, config?: Partial<DecisionEngineConfig>) {
    this.eventBus = eventBus;
    this.config = {
      defaultAutonomyLevel: AutonomyLevel.APPROVAL_REQUIRED,
      maxRiskLevel: RiskLevel.MEDIUM,
      approvalTimeoutMs: 300000, // 5 minutes
      ...config
    };

    this.rules = new Map();
    this.decisions = new Map();
    this.stats = {
      totalDecisions: 0,
      autonomousDecisions: 0,
      approvalRequiredDecisions: 0,
      approvedDecisions: 0,
      rejectedDecisions: 0,
      successfulDecisions: 0,
      failedDecisions: 0,
      confidenceSum: 0
    };
    this.isRunning = false;
  }

  /**
   * Start the decision engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // Subscribe to events that might trigger decisions
    const subscriber: EventSubscriber = {
      id: 'decision-engine',
      handle: this.handleEvent.bind(this),
      canHandle: (event: Event) => {
        // Handle sensor anomalies and other decision-triggering events
        return event.type === EventType.SENSOR_ANOMALY ||
               event.type === EventType.SENSOR_TRIGGER ||
               event.priority === EventPriority.HIGH;
      },
      priority: 5
    };

    this.eventBus.subscribe([
      EventType.SENSOR_ANOMALY,
      EventType.SENSOR_TRIGGER,
      EventType.SYSTEM_STATUS
    ], subscriber);

    this.isRunning = true;
  }

  /**
   * Handle incoming events
   */
  private async handleEvent(event: Event): Promise<void> {
    // Build context from event
    const context = await this.buildContext(event);

    // Evaluate rules and make decision if applicable
    const matchingRules = await this.evaluateRules(context);

    if (matchingRules.length > 0) {
      // Make decision based on matching rules
      await this.makeDecision(context);
    }
  }

  /**
   * Build decision context from event
   */
  private async buildContext(event: Event): Promise<DecisionContext> {
    const now = new Date();
    const hour = now.getHours();

    // Determine time of day
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hour >= 6 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 && hour < 22) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'night';
    }

    const context: DecisionContext = {
      triggerEvent: {
        type: event.type,
        payload: event.payload,
        timestamp: event.timestamp || new Date()
      },
      environment: {
        timeOfDay,
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' })
      },
      userPreferences: {
        autonomyLevel: this.config.defaultAutonomyLevel,
        allowedRiskLevel: this.config.maxRiskLevel
      }
    };

    return context;
  }

  /**
   * Evaluate rules against context
   */
  private async evaluateRules(context: DecisionContext): Promise<DecisionRule[]> {
    const matchingRules: DecisionRule[] = [];

    for (const rule of this.rules.values()) {
      // Skip disabled rules
      if (!rule.enabled) {
        continue;
      }

      // Check if rule matches context
      if (await this.ruleMatches(rule, context)) {
        matchingRules.push(rule);
      }
    }

    // Sort by priority (highest first)
    matchingRules.sort((a, b) => b.priority - a.priority);

    return matchingRules;
  }

  /**
   * Check if rule matches context
   */
  private async ruleMatches(rule: DecisionRule, context: DecisionContext): Promise<boolean> {
    const conditions = rule.conditions;

    // Check event type
    if (conditions.eventType && context.triggerEvent?.type !== conditions.eventType) {
      return false;
    }

    // Check sensor type
    if (conditions.sensorType && context.triggerEvent?.payload.sensorType !== conditions.sensorType) {
      return false;
    }

    // Check value comparison
    if (conditions.valueComparison && context.triggerEvent?.payload.value !== undefined) {
      const value = context.triggerEvent.payload.value;
      const comparison = conditions.valueComparison;

      let matches = false;
      switch (comparison.operator) {
        case '>':
          matches = value > comparison.value;
          break;
        case '<':
          matches = value < comparison.value;
          break;
        case '>=':
          matches = value >= comparison.value;
          break;
        case '<=':
          matches = value <= comparison.value;
          break;
        case '=':
          matches = value === comparison.value;
          break;
        case '!=':
          matches = value !== comparison.value;
          break;
      }

      if (!matches) {
        return false;
      }
    }

    // Check time range
    if (conditions.timeRange && context.environment?.timeOfDay) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // Simple time range check (doesn't handle overnight ranges)
      if (currentTime < conditions.timeRange.start || currentTime > conditions.timeRange.end) {
        return false;
      }
    }

    // Check custom condition
    if (conditions.customCondition) {
      if (!conditions.customCondition(context)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Make a decision based on context
   */
  async makeDecision(context: DecisionContext): Promise<Decision> {
    // Evaluate matching rules
    const matchingRules = await this.evaluateRules(context);

    // Generate options from rules
    const options: DecisionOption[] = matchingRules.map((rule, index) => ({
      id: `${rule.id}-option`,
      description: rule.description,
      action: rule.action,
      riskLevel: rule.riskLevel,
      potentialImpact: rule.description,
      confidence: 0.8 - (index * 0.1), // Higher priority = higher confidence
      expectedOutcome: `Execute: ${rule.name}`
    }));

    // Select best option (highest priority, highest confidence)
    const selectedOption = options[0] || {
      id: 'no-action',
      description: 'No action required',
      action: { type: 'notify_user' as const, message: 'No matching rules' },
      riskLevel: RiskLevel.NONE,
      potentialImpact: 'None',
      confidence: 0.5,
      expectedOutcome: 'No action taken'
    };

    // Determine autonomy level
    const selectedRule = matchingRules[0];
    const autonomyLevel = selectedRule?.autonomyLevel || this.config.defaultAutonomyLevel;

    // Check if approval required
    const requiresApproval =
      autonomyLevel === AutonomyLevel.APPROVAL_REQUIRED ||
      autonomyLevel === AutonomyLevel.ADVISORY_ONLY ||
      selectedOption.riskLevel > (context.userPreferences?.allowedRiskLevel || this.config.maxRiskLevel);

    // Generate reasoning
    const reasoning = this.generateReasoning(context, selectedOption, matchingRules);

    // Create decision
    const decision: Decision = {
      id: randomUUID(),
      timestamp: new Date(),
      context,
      options,
      selectedOption,
      reasoning,
      autonomyLevel,
      requiresApproval,
      approvalStatus: requiresApproval ? 'pending' : undefined,
      executionStatus: 'pending'
    };

    // Store decision
    this.decisions.set(decision.id, decision);

    // Update statistics
    this.stats.totalDecisions++;
    this.stats.confidenceSum += selectedOption.confidence;

    if (requiresApproval) {
      this.stats.approvalRequiredDecisions++;
    } else {
      this.stats.autonomousDecisions++;
      // Execute immediately if autonomous (use Promise.resolve for better test compatibility)
      Promise.resolve().then(async () => {
        await this.executeDecision(decision);
      }).catch(_error => {
        // Already handled in executeDecision, but catch to prevent unhandled rejection
      });
    }

    return decision;
  }

  /**
   * Generate reasoning for decision
   */
  private generateReasoning(
    context: DecisionContext,
    option: DecisionOption,
    matchingRules: DecisionRule[]
  ): string {
    const parts: string[] = [];

    // Event trigger
    if (context.triggerEvent) {
      parts.push(`Triggered by ${context.triggerEvent.type} event`);
      if (context.triggerEvent.payload.value !== undefined) {
        parts.push(`with value ${context.triggerEvent.payload.value}`);
      }
    }

    // Matching rules
    if (matchingRules.length > 0) {
      parts.push(`Matched ${matchingRules.length} rule(s): ${matchingRules.map(r => r.name).join(', ')}`);
    }

    // Selected action
    parts.push(`Selected action: ${option.description}`);

    // Risk assessment
    parts.push(`Risk level: ${option.riskLevel}`);

    // Confidence
    parts.push(`Confidence: ${(option.confidence * 100).toFixed(0)}%`);

    return parts.join('. ') + '.';
  }

  /**
   * Execute a decision
   */
  private async executeDecision(decision: Decision): Promise<void> {
    decision.executionStatus = 'executing';
    decision.executedAt = new Date();

    try {
      const result = await this.executeAction(decision.selectedOption.action);

      decision.executionStatus = 'completed';
      decision.executionResult = result;
      decision.outcome = 'success';
      this.stats.successfulDecisions++;

      // Update rule success count
      const ruleId = decision.selectedOption.id.replace('-option', '');
      const rule = this.rules.get(ruleId);
      if (rule) {
        rule.successCount++;
        rule.lastExecuted = new Date();
      }

    } catch (err) {
      decision.executionStatus = 'failed';
      decision.executionError = err instanceof Error ? err.message : String(err);
      decision.outcome = 'failure';
      this.stats.failedDecisions++;

      // Update rule failure count
      const ruleId = decision.selectedOption.id.replace('-option', '');
      const rule = this.rules.get(ruleId);
      if (rule) {
        rule.failureCount++;
      }
    }

    this.decisions.set(decision.id, decision);
  }

  /**
   * Execute an action
   */
  private async executeAction(action: DecisionAction): Promise<any> {
    switch (action.type) {
      case 'event_publish':
        if (!action.eventType) {
          throw new Error('Missing eventType for event_publish action');
        }
        await this.eventBus.publish({
          type: action.eventType as EventType,
          priority: EventPriority.MEDIUM,
          source: 'decision-engine',
          payload: action.eventPayload || {}
        });
        return { published: true };

      case 'notify_user':
        // In production, this would send actual notification
        // For now, publish a notification event
        await this.eventBus.publish({
          type: EventType.SYSTEM_STATUS,
          priority: action.priority === 'urgent' ? EventPriority.HIGH : EventPriority.MEDIUM,
          source: 'decision-engine',
          payload: {
            notification: action.message,
            priority: action.priority
          }
        });
        return { notified: true, message: action.message };

      case 'plugin_call':
        // In production, this would call actual plugin
        if (!action.pluginId) {
          throw new Error('Plugin not found: ' + action.pluginId);
        }
        throw new Error('Plugin execution not yet implemented');

      case 'api_call':
        // In production, this would make actual API call
        throw new Error('API call execution not yet implemented');

      case 'composite':
        // Execute multiple actions
        const results = [];
        if (action.actions) {
          for (const subAction of action.actions) {
            const result = await this.executeAction(subAction);
            results.push(result);
          }
        }
        return { composite: true, results };

      default:
        throw new Error('Unknown action type');
    }
  }

  /**
   * Approve a pending decision
   */
  async approveDecision(decisionId: string, approvedBy: string): Promise<void> {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    if (decision.approvalStatus !== 'pending') {
      throw new Error(`Decision ${decisionId} is not pending approval`);
    }

    decision.approvalStatus = 'approved';
    decision.approvedBy = approvedBy;
    decision.approvedAt = new Date();

    this.stats.approvedDecisions++;

    // Execute the approved decision
    await this.executeDecision(decision);
  }

  /**
   * Reject a pending decision
   */
  async rejectDecision(decisionId: string, _rejectedBy: string): Promise<void> {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    if (decision.approvalStatus !== 'pending') {
      throw new Error(`Decision ${decisionId} is not pending approval`);
    }

    decision.approvalStatus = 'rejected';
    decision.executionStatus = 'failed';
    decision.outcome = 'failure';

    this.stats.rejectedDecisions++;

    this.decisions.set(decisionId, decision);
  }

  /**
   * Add a decision rule
   */
  addRule(rule: DecisionRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Update a decision rule
   */
  updateRule(ruleId: string, updates: Partial<DecisionRule>): void {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    Object.assign(rule, updates);
    this.rules.set(ruleId, rule);
  }

  /**
   * Remove a decision rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Disable a rule
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      this.rules.set(ruleId, rule);
    }
  }

  /**
   * Enable a rule
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      this.rules.set(ruleId, rule);
    }
  }

  /**
   * Get a specific rule
   */
  getRule(ruleId: string): DecisionRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules
   */
  getRules(): DecisionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific decision
   */
  getDecision(decisionId: string): Decision | undefined {
    return this.decisions.get(decisionId);
  }

  /**
   * Get all decisions
   */
  getDecisions(): Decision[] {
    return Array.from(this.decisions.values());
  }

  /**
   * Get statistics
   */
  getStatistics(): DecisionEngineStats {
    const activeRules = Array.from(this.rules.values()).filter(r => r.enabled).length;

    return {
      totalDecisions: this.stats.totalDecisions,
      autonomousDecisions: this.stats.autonomousDecisions,
      approvalRequiredDecisions: this.stats.approvalRequiredDecisions,
      approvedDecisions: this.stats.approvedDecisions,
      rejectedDecisions: this.stats.rejectedDecisions,
      successfulDecisions: this.stats.successfulDecisions,
      failedDecisions: this.stats.failedDecisions,
      averageConfidence: this.stats.totalDecisions > 0
        ? this.stats.confidenceSum / this.stats.totalDecisions
        : 0,
      activeRules
    };
  }

  /**
   * Shutdown the decision engine
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    // Cleanup would go here
  }
}
