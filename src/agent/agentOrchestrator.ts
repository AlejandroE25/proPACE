/**
 * Agent Orchestrator
 *
 * Main coordinator for the agent system. Integrates planner, executor,
 * permission manager, and concurrent request manager for complete agent functionality.
 */

import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { PluginRegistry } from '../plugins/pluginRegistry';
import { AgentPlanner } from './agentPlanner';
import { AgentExecutor } from './agentExecutor';
import { PermissionManager } from './permissionManager';
import { AuditLogger } from './auditLogger';
import { ConcurrentRequestManager } from './concurrentRequestManager';
import { SystemIntrospector } from './systemIntrospector';
import {
  PlanningContext,
  AuditEventType,
  TaskState,
  MetaQueryType
} from '../types/agent';

export class AgentOrchestrator {
  private pluginRegistry: PluginRegistry;
  private planner: AgentPlanner;
  private executor: AgentExecutor;
  private permissionManager: PermissionManager;
  private auditLogger: AuditLogger;
  private concurrentRequestManager: ConcurrentRequestManager;
  private introspector: SystemIntrospector;

  /** Conversation history per client */
  private conversationHistory: Map<
    string,
    Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>
  >;

  constructor(
    anthropicApiKey: string,
    pluginRegistry: PluginRegistry,
    auditDbPath: string = './data/audit.db',
    planningModel: string = 'claude-sonnet-4-20250514'
  ) {
    this.pluginRegistry = pluginRegistry;
    this.conversationHistory = new Map();

    // Initialize components
    this.auditLogger = new AuditLogger(auditDbPath);
    this.permissionManager = new PermissionManager();
    this.concurrentRequestManager = new ConcurrentRequestManager();
    this.introspector = new SystemIntrospector(pluginRegistry);
    this.planner = new AgentPlanner(anthropicApiKey, pluginRegistry, planningModel);
    this.executor = new AgentExecutor(
      pluginRegistry,
      this.permissionManager,
      this.auditLogger,
      anthropicApiKey
    );

    // Setup event handlers
    this.setupEventHandlers();

    logger.info('Agent orchestrator initialized');
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

      // New task - create and execute in background
      const task = this.concurrentRequestManager.createTask(clientId, message);

      logger.info('Created new task', { taskId: task.taskId, clientId });

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
      audit: this.auditLogger.getStatistics()
    };
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
    this.auditLogger.close();
    logger.info('Agent orchestrator shut down');
  }
}
