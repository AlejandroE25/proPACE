/**
 * Decision Engine Types
 *
 * Type definitions for autonomous decision-making, context awareness,
 * and action execution.
 */

/**
 * Decision autonomy levels
 * Determines whether AI can act independently or needs approval
 */
export enum AutonomyLevel {
  FULLY_AUTONOMOUS = 'fully_autonomous',     // AI acts immediately without approval
  APPROVAL_REQUIRED = 'approval_required',   // AI must ask for permission first
  ADVISORY_ONLY = 'advisory_only'            // AI only suggests, never acts
}

/**
 * Decision risk levels
 * Used to determine appropriate autonomy level
 */
export enum RiskLevel {
  NONE = 'none',           // No risk (e.g., querying data)
  LOW = 'low',             // Minimal risk (e.g., sending notification)
  MEDIUM = 'medium',       // Some risk (e.g., adjusting thermostat)
  HIGH = 'high',           // Significant risk (e.g., unlocking door)
  CRITICAL = 'critical'    // Critical risk (e.g., calling emergency services)
}

/**
 * Decision context
 * All information available for making a decision
 */
export interface DecisionContext {
  // Event that triggered the decision
  triggerEvent?: {
    type: string;
    payload: any;
    timestamp: Date;
  };

  // User preferences and constraints
  userPreferences?: {
    autonomyLevel?: AutonomyLevel;
    allowedRiskLevel?: RiskLevel;
    constraints?: string[];
  };

  // Environmental context
  environment?: {
    location?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek?: string;
    isUserHome?: boolean;
  };

  // Historical context
  history?: {
    recentDecisions?: Decision[];
    patterns?: any[];
  };

  // Sensor data
  sensorData?: {
    [sensorId: string]: {
      currentValue: number;
      trend?: 'increasing' | 'decreasing' | 'stable';
      anomaly?: boolean;
    };
  };
}

/**
 * Decision option
 * A possible action the AI can take
 */
export interface DecisionOption {
  id: string;
  description: string;
  action: DecisionAction;

  // Risk assessment
  riskLevel: RiskLevel;
  potentialImpact: string;

  // Confidence in this option
  confidence: number; // 0-1

  // Expected outcome
  expectedOutcome: string;

  // Prerequisites
  requirements?: string[];

  // Cost (time, resources, etc.)
  cost?: {
    time?: number;      // milliseconds
    resources?: string[];
  };
}

/**
 * Decision action
 * The actual action to execute
 */
export interface DecisionAction {
  type: 'plugin_call' | 'api_call' | 'event_publish' | 'notify_user' | 'composite';

  // For plugin_call
  pluginId?: string;
  method?: string;
  parameters?: any;

  // For api_call
  endpoint?: string;
  httpMethod?: string;
  body?: any;

  // For event_publish
  eventType?: string;
  eventPayload?: any;

  // For notify_user
  message?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  // For composite (multiple actions)
  actions?: DecisionAction[];
}

/**
 * Decision
 * A decision made by the AI
 */
export interface Decision {
  id: string;
  timestamp: Date;

  // Context
  context: DecisionContext;

  // Options considered
  options: DecisionOption[];

  // Selected option
  selectedOption: DecisionOption;

  // Reasoning
  reasoning: string;

  // Autonomy
  autonomyLevel: AutonomyLevel;
  requiresApproval: boolean;

  // Approval tracking
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
  approvedBy?: string;
  approvedAt?: Date;

  // Execution tracking
  executionStatus?: 'pending' | 'executing' | 'completed' | 'failed';
  executedAt?: Date;
  executionResult?: any;
  executionError?: string;

  // Learning
  outcome?: 'success' | 'partial_success' | 'failure';
  feedback?: string;
}

/**
 * Decision rule
 * Pre-configured rule for common scenarios
 */
export interface DecisionRule {
  id: string;
  name: string;
  description: string;

  // Conditions
  conditions: {
    eventType?: string;
    sensorId?: string;
    sensorType?: string;
    valueComparison?: {
      operator: '>' | '<' | '=' | '>=' | '<=' | '!=';
      value: number;
    };
    timeRange?: {
      start: string;  // HH:MM
      end: string;    // HH:MM
    };
    customCondition?: (context: DecisionContext) => boolean;
  };

  // Action to take
  action: DecisionAction;

  // Configuration
  autonomyLevel: AutonomyLevel;
  riskLevel: RiskLevel;
  priority: number;  // Higher = more important

  // Learning
  enabled: boolean;
  successCount: number;
  failureCount: number;
  lastExecuted?: Date;
}

/**
 * Decision engine statistics
 */
export interface DecisionEngineStats {
  totalDecisions: number;
  autonomousDecisions: number;
  approvalRequiredDecisions: number;
  approvedDecisions: number;
  rejectedDecisions: number;
  successfulDecisions: number;
  failedDecisions: number;
  averageConfidence: number;
  activeRules: number;
}
