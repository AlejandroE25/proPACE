/**
 * Agent Orchestrator
 *
 * Main coordinator for the agent system. Integrates planner, executor,
 * permission manager, and concurrent request manager for complete agent functionality.
 */

import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';
import { PluginRegistry } from '../plugins/pluginRegistry.js';
import { AgentPlanner } from './agentPlanner.js';
import { AgentExecutor } from './agentExecutor.js';
import { PermissionManager } from './permissionManager.js';
import { AuditLogger } from './auditLogger.js';
import { ConcurrentRequestManager } from './concurrentRequestManager.js';
import { SystemIntrospector } from './systemIntrospector.js';
import { ErrorRecoveryManager } from './errorRecoveryManager.js';
import { HealthMonitor } from './healthMonitor.js';
import { UpdateMonitor } from './updateMonitor.js';
import { SystemDiagnostics, DiagnosticLevel, DiagnosticStatus } from './diagnostics.js';
import { GlobalContextStore } from './globalContextStore.js';
import { ContextAnalyzer } from './contextAnalyzer.js';
import { LearningEngine } from './learningEngine.js';
import { PatternRecognition } from './patternRecognition.js';
import { SuggestionEngine } from './suggestionEngine.js';
import { RoutingService } from '../services/routingService.js';
import { ClaudeClient } from '../clients/claudeClient.js';
import { SubsystemType } from '../types/index.js';
import { UpdateMonitorConfig } from '../types/update.js';
import { EventBus } from '../events/eventBus.js';
import { EventType, EventPriority } from '../events/types.js';
import {
  PlanningContext,
  AuditEventType,
  TaskState,
  MetaQueryType
} from '../types/agent.js';

export class AgentOrchestrator {
  private pluginRegistry: PluginRegistry;
  private planner: AgentPlanner;
  private executor: AgentExecutor;
  private permissionManager: PermissionManager;
  private auditLogger: AuditLogger;
  private concurrentRequestManager: ConcurrentRequestManager;
  private introspector: SystemIntrospector;
  private recoveryManager: ErrorRecoveryManager;
  private healthMonitor: HealthMonitor;
  private updateMonitor?: UpdateMonitor;
  private diagnostics: SystemDiagnostics;
  private globalContext: GlobalContextStore;
  private contextAnalyzer: ContextAnalyzer;
  private learningEngine: LearningEngine;
  private patternRecognition: PatternRecognition;
  private suggestionEngine: SuggestionEngine;
  private routingService: RoutingService;
  private claudeClient: ClaudeClient;
  private eventBus: EventBus;

  /** Conversation history per client */
  private conversationHistory: Map<
    string,
    Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>
  >;

  /** Last interaction ID per client (for follow-up tracking) */
  private lastInteractionId: Map<string, string>;

  constructor(
    anthropicApiKey: string,
    pluginRegistry: PluginRegistry,
    eventBus: EventBus,
    auditDbPath: string = './data/audit.db',
    planningModel: string = 'claude-sonnet-4-20250514',
    updateMonitorConfig?: UpdateMonitorConfig
  ) {
    this.pluginRegistry = pluginRegistry;
    this.eventBus = eventBus;
    this.conversationHistory = new Map();
    this.lastInteractionId = new Map();

    // Initialize components
    this.auditLogger = new AuditLogger(auditDbPath);
    this.permissionManager = new PermissionManager();
    this.concurrentRequestManager = new ConcurrentRequestManager();
    this.introspector = new SystemIntrospector(pluginRegistry);

    // Initialize recovery system
    this.diagnostics = new SystemDiagnostics(pluginRegistry);
    this.recoveryManager = new ErrorRecoveryManager(3, true);
    this.healthMonitor = new HealthMonitor(
      this.diagnostics,
      this.recoveryManager,
      {
        checkInterval: 60000,  // 1 minute
        autoRecover: true,
        enableDegradedMode: true
      }
    );

    // Initialize auto-update monitor (if enabled)
    if (updateMonitorConfig?.enabled) {
      this.updateMonitor = new UpdateMonitor(this.recoveryManager, updateMonitorConfig);
      this.setupUpdateEventHandlers();
      logger.info('Auto-update monitor initialized');
    }

    // Initialize global context
    this.globalContext = new GlobalContextStore();

    // Initialize learning and proactive intelligence
    this.learningEngine = new LearningEngine(1000);
    this.patternRecognition = new PatternRecognition(500);

    // Initialize context analyzer for automatic learning
    this.contextAnalyzer = new ContextAnalyzer(
      anthropicApiKey,
      this.globalContext
    );

    // Initialize suggestion engine (depends on learning and pattern recognition)
    this.suggestionEngine = new SuggestionEngine(
      anthropicApiKey,
      this.globalContext,
      this.patternRecognition,
      this.learningEngine,
      'claude-haiku-4-5-20251001',
      0.7
    );

    // Initialize routing service for fast-path plugin routing
    // Pass plugin registry for dynamic subsystem discovery
    this.routingService = new RoutingService(anthropicApiKey, pluginRegistry);

    // Initialize Claude client for direct conversational responses
    this.claudeClient = new ClaudeClient(anthropicApiKey);

    this.planner = new AgentPlanner(anthropicApiKey, pluginRegistry, planningModel);
    this.executor = new AgentExecutor(
      pluginRegistry,
      this.permissionManager,
      this.auditLogger,
      anthropicApiKey
    );

    // Setup event handlers
    this.setupEventHandlers();

    // Run immediate startup diagnostics to catch critical issues
    this.runStartupDiagnostics();

    // Start health monitoring
    this.healthMonitor.start();

    // Start update monitoring (if enabled)
    if (this.updateMonitor) {
      this.updateMonitor.start();
    }

    logger.info('Agent orchestrator initialized with health monitoring');
  }

  /**
   * Run startup diagnostics to catch critical issues immediately
   */
  private runStartupDiagnostics(): void {
    // Run diagnostics asynchronously, don't block initialization
    (async () => {
      try {
        logger.info('Running startup diagnostics...');

        // Run QUICK diagnostics to check critical components
        const report = await this.diagnostics.runDiagnostics(DiagnosticLevel.QUICK);

        // Check for any failures
        const failures = report.results.filter(r => r.status === DiagnosticStatus.FAIL);

        if (failures.length > 0) {
          logger.error('STARTUP DIAGNOSTIC FAILURES DETECTED:', {
            failureCount: failures.length,
            failures: failures.map(f => ({
              test: f.testId,
              message: f.message,
              details: f.details
            }))
          });

          // Log each failure clearly
          for (const failure of failures) {
            logger.error(`[STARTUP] ${failure.testId}: ${failure.message}`, {
              details: failure.details,
              error: failure.error?.message
            });
          }

          // Create alerts for critical failures
          for (const failure of failures) {
            const component = this.mapTestIdToComponent(failure.testId);
            await this.recoveryManager.recordFailure(
              component,
              failure.error || new Error(failure.message),
              {
                testId: failure.testId,
                details: failure.details,
                startup: true
              }
            );
          }
        } else {
          logger.info('Startup diagnostics passed', {
            passed: report.summary.passed,
            warnings: report.summary.warnings
          });
        }
      } catch (error) {
        logger.error('Failed to run startup diagnostics', { error });
      }
    })();
  }

  /**
   * Map test ID to component (same logic as HealthMonitor)
   */
  private mapTestIdToComponent(testId: string): string {
    const mapping: Record<string, string> = {
      'plugin_registry_loaded': 'plugin_registry',
      'anthropic_api_key_configured': 'anthropic_api',
      'anthropic_api_connection': 'anthropic_api',
      'anthropic_models_available': 'anthropic_models',
      'weather_tool_available': 'weather_tool',
      'news_tool_available': 'news_tool',
      'memory_tools_available': 'memory_tools',
      'wolfram_tool_available': 'wolfram_tool',
      'tool_parameters_valid': 'tool_validation'
    };

    return mapping[testId] || testId;
  }

  /**
   * Setup event handlers for cross-component communication
   */
  private setupEventHandlers(): void {
    // Permission requests -> emit for WebSocket
    this.permissionManager.on('permission_request', (request) => {
      logger.debug('Permission request event', { requestId: request.id });
      // Will be forwarded to WebSocket by server
    });

    // Progress updates -> emit for WebSocket
    this.executor.on('progress', (data) => {
      logger.debug('Progress update event', { planId: data.planId });
      // Will be forwarded to WebSocket by server
    });

    // Task state changes
    this.concurrentRequestManager.on('task_state_changed', (task) => {
      logger.debug('Task state changed', {
        taskId: task.taskId,
        state: task.state
      });
    });

    // Context updates
    this.concurrentRequestManager.on('context_update', ({ task, update }) => {
      logger.info('Context update received', {
        taskId: task.taskId,
        message: update.message
      });

      // Process context update if task is active
      if (task.state === TaskState.ACTIVE && task.execution) {
        this.executor.processContextUpdate(task.execution, update, this.planner);
      }
    });
  }

  /**
   * Setup event handlers for update monitor
   */
  private setupUpdateEventHandlers(): void {
    if (!this.updateMonitor) {
      return;
    }

    this.updateMonitor.on('update_available', (info) => {
      logger.info('Update available', {
        from: info.localCommit.shortHash,
        to: info.remoteCommit.shortHash,
        message: info.remoteCommit.message
      });
    });

    this.updateMonitor.on('update_started', (data) => {
      logger.warn('System update starting - service will restart soon', {
        from: data.fromCommit.substring(0, 7),
        to: data.toCommit.substring(0, 7)
      });
    });

    this.updateMonitor.on('update_completed', (result) => {
      logger.info('Update completed successfully', {
        from: result.previousCommit.substring(0, 7),
        to: result.newCommit.substring(0, 7),
        duration: `${result.duration}ms`
      });
    });

    this.updateMonitor.on('update_failed', (data) => {
      logger.error('Update failed', {
        phase: data.phase,
        error: data.error.message
      });

      // Record the failure with recovery manager
      this.recoveryManager.recordFailure('update_monitor', data.error, {
        phase: data.phase,
        rolledBack: data.result.rolledBack
      });
    });

    this.updateMonitor.on('rollback_completed', (data) => {
      if (data.success) {
        logger.info('Rollback completed successfully', {
          restoredCommit: data.restoredCommit.substring(0, 7)
        });
      } else {
        logger.error('Rollback failed', {
          restoredCommit: data.restoredCommit.substring(0, 7)
        });
      }
    });

    this.updateMonitor.on('update_blocked', (data) => {
      logger.warn('Update blocked', {
        reason: data.reason,
        message: data.message
      });
    });
  }

  /**
   * Process a user message (main entry point)
   */
  async processMessage(clientId: string, message: string): Promise<string> {
    const correlationId = randomUUID();

    logger.info('Processing message', { clientId, message, correlationId });

    // Audit log
    this.auditLogger.log(
      clientId,
      AuditEventType.QUERY_RECEIVED,
      { query: message },
      correlationId
    );

    // Get or initialize conversation history
    if (!this.conversationHistory.has(clientId)) {
      this.conversationHistory.set(clientId, []);
    }
    const history = this.conversationHistory.get(clientId)!;

    // Add user message to history
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    try {
      // Check if this is a meta-query about system capabilities
      const metaQueryType = this.introspector.isMetaQuery(message);

      if (metaQueryType) {
        logger.info('Detected meta-query', { type: metaQueryType, message });

        const response = this.handleMetaQuery(metaQueryType, message);

        // Add response to history
        history.push({
          role: 'assistant',
          content: response,
          timestamp: new Date()
        });

        // Automatically analyze for context (non-blocking)
        this.contextAnalyzer.analyzeConversation(
          clientId,
          message,
          response,
          history
        ).catch(error => {
          logger.error('Context analysis failed', { error, clientId });
        });

        return response;
      }

      // Check if this message relates to an active task
      const relatedTask = this.concurrentRequestManager.findRelatedTask(clientId, message);

      if (relatedTask && (relatedTask.state === TaskState.ACTIVE || relatedTask.state === TaskState.PAUSED)) {
        // This is a context update for an active task
        logger.info('Message identified as context update for active task', {
          taskId: relatedTask.taskId,
          originalQuery: relatedTask.query
        });

        this.concurrentRequestManager.addContextUpdate(relatedTask.taskId, message);

        return `I've updated the plan for "${relatedTask.query}" based on your new information. I'll incorporate this and continue working on it.`;
      }

      // FAST PATH: Check if simple plugin can handle this query
      // This prevents creating tasks for simple weather/news/wolfram queries
      const fastPathResult = await this.tryFastPathRouting(message, history, correlationId, clientId);
      if (fastPathResult) {
        logger.info('Query handled via fast-path plugin routing', { message });

        // Publish RESPONSE_GENERATED event for voice plugin and other subscribers
        await this.eventBus.publish({
          type: EventType.RESPONSE_GENERATED,
          priority: EventPriority.HIGH,
          source: 'agent-orchestrator',
          payload: {
            clientId,
            message,
            response: fastPathResult.response,
            subsystem: fastPathResult.subsystem,
            timestamp: new Date()
          }
        });

        return fastPathResult.response;
      }

      // Check if this is a simple query that can be handled directly by Claude
      // to avoid unnecessary task planning overhead
      if (this.isSimpleQuery(message)) {
        logger.info('Simple query detected - using streaming Claude response', { message });

        const conversationHistory = history.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        // Use streaming response with sentence-level TTS
        const response = await this.generateStreamingResponseWithSentenceTTS(
          message,
          conversationHistory,
          clientId
        );

        // Add to history
        history.push(
          { role: 'user', content: message, timestamp: new Date() },
          { role: 'assistant', content: response, timestamp: new Date() }
        );

        // NOTE: We do NOT publish RESPONSE_GENERATED here because RESPONSE_CHUNK
        // events have already triggered TTS for each sentence. Publishing the
        // complete response would cause duplicate audio generation.

        return response;
      }

      // SLOW PATH: Complex query requiring task planning
      // New task - create and execute in background
      const task = this.concurrentRequestManager.createTask(clientId, message);

      logger.info('Created new task for complex query', { taskId: task.taskId, clientId });

      // Fire off execution in background (non-blocking)
      this.executeTaskInBackground(task.taskId, clientId, message, history, correlationId);

      // Return immediately
      return `🔍 Working on it... (Task ${task.taskId.slice(0, 8)})`;
    } catch (error) {
      logger.error('Error processing message', { error, clientId });

      this.auditLogger.log(
        clientId,
        AuditEventType.EXECUTION_FAILED,
        { error: (error as Error).message },
        correlationId
      );

      return `I encountered an error: ${(error as Error).message}`;
    }
  }

  /**
   * Execute task in background (non-blocking)
   */
  private executeTaskInBackground(
    taskId: string,
    clientId: string,
    query: string,
    conversationHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }>,
    correlationId: string
  ): void {
    const task = this.concurrentRequestManager.getTask(taskId);
    if (!task) {
      logger.error('Task not found for background execution', { taskId });
      return;
    }

    // Execute asynchronously
    (async () => {
      const startTime = Date.now();
      let routedSubsystem = 'unknown';

      try {
        // Update task state
        this.concurrentRequestManager.updateTaskState(taskId, TaskState.ACTIVE);

        // Build planning context
        const planningContext: PlanningContext = {
          clientId,
          conversationHistory,
          memories: [], // TODO: Integrate memory service
          globalContext: [], // TODO: Integrate global context
          availableTools: this.pluginRegistry.getAllTools().map((t) => t.name)
        };

        // Create plan
        const plan = await this.planner.createPlan(query, planningContext);

        task.planId = plan.id;

        // Determine subsystem from plan (for learning)
        if (plan.steps.length > 0 && plan.steps[0].toolName) {
          routedSubsystem = plan.steps[0].toolName;
        }

        this.auditLogger.log(
          clientId,
          AuditEventType.PLAN_CREATED,
          { planId: plan.id, steps: plan.steps.length },
          correlationId
        );

        logger.info('Plan created', {
          taskId,
          planId: plan.id,
          steps: plan.steps.length
        });

        // Execute plan
        const result = await this.executor.execute(
          plan,
          clientId,
          conversationHistory,
          correlationId
        );

        // Complete task
        this.concurrentRequestManager.completeTask(taskId, result);

        // Add assistant response to conversation history
        conversationHistory.push({
          role: 'assistant',
          content: result.finalAnswer,
          timestamp: new Date()
        });

        // Calculate response time
        const responseTime = Date.now() - startTime;

        // Record interaction for learning (non-blocking)
        const interactionId = this.learningEngine.recordInteraction(
          query,
          routedSubsystem,
          result.finalAnswer,
          responseTime,
          {
            taskId,
            planId: plan.id,
            stepsExecuted: plan.steps.length
          }
        );

        // Store interaction ID for follow-up tracking
        this.lastInteractionId.set(clientId, interactionId.id);

        // Record conversation pattern (non-blocking)
        const currentContexts = Array.from(this.globalContext.getAll(clientId))
          .map(ctx => ctx.key);
        this.patternRecognition.recordConversation(routedSubsystem, currentContexts);

        // Automatically analyze conversation for important context (non-blocking)
        this.contextAnalyzer.analyzeConversation(
          clientId,
          query,
          result.finalAnswer,
          conversationHistory
        ).catch(error => {
          logger.error('Context analysis failed', { error, clientId });
        });

        // Generate proactive suggestions (non-blocking)
        (async () => {
          try {
            const recentMessages = conversationHistory
              .slice(-5)
              .map(h => `${h.role}: ${h.content}`);

            const suggestions = await this.suggestionEngine.generateSuggestions(
              clientId,
              recentMessages,
              currentContexts
            );

            if (suggestions.length > 0) {
              logger.info('Generated proactive suggestions', {
                clientId,
                count: suggestions.length,
                suggestions: suggestions.map(s => ({
                  type: s.type,
                  priority: s.priority,
                  content: s.content
                }))
              });

              // Emit suggestions for the client
              this.executor.emit('suggestions_generated', {
                clientId,
                suggestions
              });
            }
          } catch (error) {
            logger.error('Suggestion generation failed', { error, clientId });
          }
        })();

        // Publish RESPONSE_GENERATED event for voice plugin and other subscribers
        await this.eventBus.publish({
          type: EventType.RESPONSE_GENERATED,
          priority: EventPriority.HIGH,
          source: 'agent-orchestrator',
          payload: {
            clientId,
            message: query,
            response: result.finalAnswer,
            subsystem: routedSubsystem,
            timestamp: new Date()
          }
        });

        // Emit result for WebSocket to send
        this.executor.emit('task_completed', {
          taskId,
          clientId,
          result
        });

        logger.info('Task completed successfully', { taskId, clientId });
      } catch (error) {
        logger.error('Background task execution failed', {
          taskId,
          error
        });

        this.concurrentRequestManager.updateTaskState(taskId, TaskState.FAILED);

        this.executor.emit('task_failed', {
          taskId,
          clientId,
          error: (error as Error).message
        });
      }
    })();
  }

  /**
   * Handle permission response from user
   */
  handlePermissionResponse(
    requestId: string,
    approved: boolean,
    reason?: string
  ): void {
    this.permissionManager.respondToPermission(requestId, approved, reason);
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): void {
    this.concurrentRequestManager.cancelTask(taskId);
  }

  /**
   * Get active tasks for a client
   */
  getActiveTasksForClient(clientId: string) {
    return this.concurrentRequestManager.getActiveTasksForClient(clientId);
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      tasks: this.concurrentRequestManager.getStatistics(),
      permissions: this.permissionManager.getStatistics(),
      audit: this.auditLogger.getStatistics(),
      learning: this.learningEngine.getMetrics(),
      patterns: this.patternRecognition.getStatistics(),
      suggestions: this.suggestionEngine.getStatistics()
    };
  }

  /**
   * Get learning metrics
   */
  getLearningMetrics() {
    return this.learningEngine.getMetrics();
  }

  /**
   * Get detected patterns
   */
  getDetectedPatterns() {
    return this.patternRecognition.getPatterns();
  }

  /**
   * Get active suggestions for a client
   */
  getActiveSuggestions() {
    return this.suggestionEngine.getActiveSuggestions();
  }

  /**
   * Get active reminders
   */
  getActiveReminders() {
    return this.suggestionEngine.getActiveReminders();
  }

  /**
   * Record user feedback on a suggestion
   */
  recordSuggestionFeedback(
    suggestionId: string,
    action: 'accepted' | 'rejected' | 'ignored'
  ): void {
    this.suggestionEngine.recordSuggestionAction(suggestionId, action);
  }

  /**
   * Record user rating for an interaction
   */
  recordInteractionRating(clientId: string, rating: number): void {
    const lastId = this.lastInteractionId.get(clientId);
    if (lastId) {
      this.learningEngine.recordUserRating(lastId, rating);
    }
  }

  /**
   * Manually trigger proactive suggestions
   */
  async generateProactiveSuggestions(clientId: string): Promise<any[]> {
    const history = this.conversationHistory.get(clientId) || [];
    const recentMessages = history.slice(-5).map(h => `${h.role}: ${h.content}`);
    const contexts = Array.from(this.globalContext.getAll(clientId)).map(ctx => ctx.key);

    return await this.suggestionEngine.generateSuggestions(
      clientId,
      recentMessages,
      contexts
    );
  }

  /**
   * Get permission manager (for WebSocket integration)
   */
  getPermissionManager(): PermissionManager {
    return this.permissionManager;
  }

  /**
   * Get executor (for WebSocket integration)
   */
  getExecutor(): AgentExecutor {
    return this.executor;
  }

  /**
   * Get audit logger
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Get recovery manager (for WebSocket integration)
   */
  getRecoveryManager(): ErrorRecoveryManager {
    return this.recoveryManager;
  }

  /**
   * Get health monitor (for WebSocket integration)
   */
  getHealthMonitor(): HealthMonitor {
    return this.healthMonitor;
  }

  getUpdateMonitor(): UpdateMonitor | undefined {
    return this.updateMonitor;
  }

  /**
   * Get global context store (for WebSocket integration)
   */
  getGlobalContext(): GlobalContextStore {
    return this.globalContext;
  }

  /**
   * Try fast-path routing to plugins for simple queries
   * Returns response and subsystem if handled, null if should fall through to task creation
   */
  private async tryFastPathRouting(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>,
    correlationId: string,
    clientId: string
  ): Promise<{ response: string; subsystem: SubsystemType } | null> {
    const startTime = Date.now();

    // Get routing decision from RoutingService (uses Haiku + caching)
    const routingDecision = await this.routingService.getRoutingDecision(message);

    logger.info(
      `Fast-path routing decision: ${routingDecision.subsystem} (confidence: ${routingDecision.confidence}, cached: ${routingDecision.cached})`
    );

    // Expand fast-path for high-confidence routes including google_search and claude
    if (this.routingService.shouldRouteDirectly(routingDecision)) {
      let response: string | null = null;

      // Handle different subsystems
      if (routingDecision.subsystem === 'claude') {
        // Direct Claude response for conversational queries
        const conversationHistory = history.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        response = await this.claudeClient.generateResponse(message, conversationHistory);
      } else if (routingDecision.subsystem === 'google_search') {
        // Google search with Haiku summarization
        response = await this.executePluginDirectly('google_search', message);
      } else {
        // Standard plugin execution (weather, news, wolfram)
        response = await this.executePluginDirectly(routingDecision.subsystem, message);
      }

      if (response) {
        // Successfully executed via fast path
        const elapsed = Date.now() - startTime;

        // Add to conversation history
        history.push(
          { role: 'user', content: message, timestamp: new Date() },
          { role: 'assistant', content: response, timestamp: new Date() }
        );

        // Record for learning
        this.learningEngine.recordInteraction(
          message,
          routingDecision.subsystem,
          response,
          elapsed,
          { fastPath: true, cached: routingDecision.cached }
        );

        // Audit log
        this.auditLogger.log(
          clientId,
          AuditEventType.PLAN_CREATED,
          {
            fastPath: true,
            subsystem: routingDecision.subsystem,
            confidence: routingDecision.confidence,
            cached: routingDecision.cached
          },
          correlationId
        );

        logger.info(
          `Fast-path executed ${routingDecision.subsystem} in ${elapsed}ms (cached: ${routingDecision.cached})`
        );

        return { response, subsystem: routingDecision.subsystem };
      }
    }

    // No fast-path match - fall through to task creation
    return null;
  }

  /**
   * Execute plugin tool directly (for fast-path routing)
   */
  private async executePluginDirectly(
    subsystem: SubsystemType,
    message: string
  ): Promise<string | null> {
    try {
      // Get tools from plugin registry
      const allTools = this.pluginRegistry.getAllTools();

      // Create minimal execution context for direct tool execution
      const context = {
        clientId: 'system',
        conversationHistory: [],
        previousStepResults: new Map()
      };

      switch (subsystem) {
        case 'weather': {
          const weatherTool = allTools.find((t) => t.name === 'get_weather');
          if (weatherTool) {
            const result = await weatherTool.execute({}, context);
            if (result.success && result.data) {
              // Check for formatted field first, then string, then stringify
              if (typeof result.data === 'object' && result.data.formatted) {
                return result.data.formatted;
              }
              return typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
            }
          }
          break;
        }

        case 'news': {
          const newsTool = allTools.find((t) => t.name === 'get_news');
          if (newsTool) {
            const result = await newsTool.execute({}, context);
            if (result.success && result.data) {
              // Use formatted field if available, otherwise fallback to stringify
              if (typeof result.data === 'object' && result.data.formatted) {
                return result.data.formatted;
              }
              return typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
            }
          }
          break;
        }

        case 'wolfram': {
          const wolframTool = allTools.find((t) => t.name === 'wolfram_query');
          if (wolframTool) {
            const result = await wolframTool.execute({ query: message }, context);
            if (result.success && result.data) {
              // Extract answer from data object
              const answer = typeof result.data === 'object' && result.data.answer
                ? result.data.answer
                : (typeof result.data === 'string' ? result.data : JSON.stringify(result.data));

              // Check if Wolfram actually found an answer
              if (
                !answer.includes("couldn't find") &&
                !answer.includes('encountered an error')
              ) {
                // Format response conversationally
                return `It's ${answer}`;
              }
            }
          }
          break;
        }

        case 'google_search': {
          const searchTool = allTools.find((t) => t.name === 'google_search');
          if (searchTool) {
            const result = await searchTool.execute({ query: message }, context);
            if (result.success && result.data) {
              // Extract summary from search results
              const summary = typeof result.data === 'object' && result.data.summary
                ? result.data.summary
                : (typeof result.data === 'string' ? result.data : JSON.stringify(result.data));

              return summary;
            }
          }
          break;
        }

        default:
          return null;
      }

      return null;
    } catch (error) {
      logger.error(`Error executing ${subsystem} plugin directly:`, error);
      return null;
    }
  }

  /**
   * Detect if a query is simple enough to skip task planning
   * Simple queries are single-purpose, conversational, and don't require multiple tools
   */
  private isSimpleQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Multi-step indicators - NOT simple
    const multiStepIndicators = [
      'and then',
      'after that',
      'also',
      'then',
      'followed by',
      'plus',
      'as well as'
    ];

    if (multiStepIndicators.some(indicator => lowerMessage.includes(indicator))) {
      return false;
    }

    // Multiple tool requirements - NOT simple
    const hasMultipleToolReferences =
      (lowerMessage.includes('weather') && lowerMessage.includes('news')) ||
      (lowerMessage.includes('weather') && lowerMessage.includes('calculate')) ||
      (lowerMessage.includes('news') && lowerMessage.includes('calculate'));

    if (hasMultipleToolReferences) {
      return false;
    }

    // Command-like queries that need execution - NOT simple
    const commandIndicators = [
      'send',
      'email',
      'create',
      'make a',
      'set up',
      'schedule',
      'remind me'
    ];

    if (commandIndicators.some(cmd => lowerMessage.includes(cmd))) {
      return false;
    }

    // Research/investigation queries - might not be simple
    if (
      lowerMessage.includes('investigate') ||
      lowerMessage.includes('research') ||
      lowerMessage.includes('analyze')
    ) {
      return false;
    }

    // Everything else is considered simple:
    // - Questions ("how are you", "what do you think", "tell me a joke")
    // - Opinions ("do you like", "what's your favorite")
    // - Greetings ("hello", "hi")
    // - Follow-up conversation
    return true;
  }

  /**
   * Generate streaming response with sentence-level TTS
   * Buffers text into complete sentences and publishes RESPONSE_CHUNK events
   */
  private async generateStreamingResponseWithSentenceTTS(
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    clientId: string
  ): Promise<string> {
    let fullResponse = '';
    let sentenceBuffer = '';

    // Sentence ending punctuation
    const sentenceEnders = /[.!?]+[\s]*$/;

    try {
      const stream = this.claudeClient.generateStreamingResponse(message, conversationHistory);

      for await (const chunk of stream) {
        fullResponse += chunk;
        sentenceBuffer += chunk;

        // Check if we have a complete sentence
        if (sentenceEnders.test(sentenceBuffer.trim())) {
          const completeSentence = sentenceBuffer.trim();

          logger.debug(`[Streaming TTS] Complete sentence: ${completeSentence.substring(0, 50)}...`);

          // Publish RESPONSE_CHUNK event for immediate TTS generation
          await this.eventBus.publish({
            type: EventType.RESPONSE_CHUNK,
            priority: EventPriority.URGENT, // High priority for low latency
            source: 'agent-orchestrator',
            payload: {
              clientId,
              message,
              chunk: completeSentence,
              isComplete: false,
              timestamp: new Date()
            }
          });

          // Clear buffer for next sentence
          sentenceBuffer = '';
        }
      }

      // Publish any remaining text as final chunk
      if (sentenceBuffer.trim().length > 0) {
        logger.debug(`[Streaming TTS] Final chunk: ${sentenceBuffer.trim()}`);

        await this.eventBus.publish({
          type: EventType.RESPONSE_CHUNK,
          priority: EventPriority.URGENT,
          source: 'agent-orchestrator',
          payload: {
            clientId,
            message,
            chunk: sentenceBuffer.trim(),
            isComplete: true,
            timestamp: new Date()
          }
        });
      }

      return fullResponse;

    } catch (error) {
      logger.error('Error in streaming response with sentence TTS:', error);
      throw error;
    }
  }

  /**
   * Handle meta-queries about system capabilities
   */
  private handleMetaQuery(metaQueryType: MetaQueryType, originalQuery: string): string {
    switch (metaQueryType) {
      case MetaQueryType.WHAT_CAN_YOU_DO:
        return this.introspector.generateCapabilityDescription();

      case MetaQueryType.CAPABILITY_LIST:
        // Specific capability query like "Can you check weather?"
        return this.introspector.answerSpecificCapabilityQuery(originalQuery);

      case MetaQueryType.SYSTEM_STATUS: {
        const status = this.introspector.getSystemStatus();

        let response = `**System Status: ${status.overallHealth.toUpperCase()}**\n\n`;

        for (const component of status.components) {
          const icon = component.status === 'healthy' ? '✓' :
                       component.status === 'degraded' ? '⚠️' : '✗';
          response += `${icon} **${component.name}:** ${component.message}\n`;
        }

        return response;
      }

      case MetaQueryType.TOOL_HEALTH: {
        const capabilities = this.introspector.getCapabilities();

        let response = '**Tool Health Status:**\n\n';

        for (const cap of capabilities) {
          const icon = cap.status === 'healthy' ? '✓' : '⚠️';
          response += `${icon} **${cap.category}:**\n`;

          for (const tool of cap.tools) {
            const toolIcon = tool.configured ? '  ✓' : '  ⚠️';
            response += `${toolIcon} ${tool.name}: ${tool.description}\n`;
          }

          if (cap.requirements && cap.requirements.length > 0) {
            response += `  Requirements: ${cap.requirements.join(', ')}\n`;
          }
          response += '\n';
        }

        return response;
      }

      case MetaQueryType.KNOWLEDGE_BOUNDARY: {
        const boundaries = this.introspector.getKnowledgeBoundaries();

        let response = '**My Knowledge & Access:**\n\n';

        const available = boundaries.filter(b => b.hasAccess);
        const unavailable = boundaries.filter(b => !b.hasAccess);

        if (available.length > 0) {
          response += '✓ **I have access to:**\n';
          for (const boundary of available) {
            response += `\n**${boundary.domain}:**\n`;
            if (boundary.availableData) {
              response += `  • ${boundary.availableData.join('\n  • ')}\n`;
            }
            if (boundary.relatedInfo) {
              response += `  ℹ️ ${boundary.relatedInfo.join(', ')}\n`;
            }
          }
        }

        if (unavailable.length > 0) {
          response += '\n⚠️ **I do not have access to:**\n';
          for (const boundary of unavailable) {
            response += `\n**${boundary.domain}:**\n`;
            if (boundary.requirements) {
              response += `  Needed: ${boundary.requirements.join(', ')}\n`;
            }
          }
        }

        return response;
      }

      case MetaQueryType.PLUGIN_INFO: {
        const pluginMetadata = this.pluginRegistry.listPlugins();
        const allTools = this.pluginRegistry.getAllTools();

        let response = '**Installed Plugins:**\n\n';

        for (const metadata of pluginMetadata) {
          // Get tools for this plugin
          const pluginTools = allTools.filter(tool => {
            // Match by category or plugin ID (assuming category maps to plugin)
            return metadata.tags?.includes(tool.category) ||
                   tool.category.toLowerCase().includes(metadata.id.split('.')[1]?.toLowerCase() || '');
          });

          response += `**${metadata.name}** (v${metadata.version})\n`;
          response += `  ${metadata.description}\n`;
          if (pluginTools.length > 0) {
            response += `  Tools: ${pluginTools.map(t => t.name).join(', ')}\n`;
          }
          response += '\n';
        }

        return response;
      }

      default:
        return "I can help you understand my capabilities. Try asking:\n" +
               "• 'What can you do?'\n" +
               "• 'What's your system status?'\n" +
               "• 'What data do you have access to?'";
    }
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    // Stop health monitoring
    this.healthMonitor.stop();

    // Stop update monitoring
    if (this.updateMonitor) {
      this.updateMonitor.stop();
    }

    // Shutdown global context
    this.globalContext.shutdown();

    // Close audit logger
    this.auditLogger.close();

    logger.info('Agent orchestrator shut down');
  }
}
