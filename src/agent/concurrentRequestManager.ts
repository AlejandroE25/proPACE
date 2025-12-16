/**
 * Concurrent Request Manager
 *
 * Manages multiple simultaneous tasks per client with background execution.
 * Handles context injection and dynamic plan updates based on new user input.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  ActiveTask,
  TaskState,
  ContextUpdate,
  ExecutionResult
} from '../types/agent';

export class ConcurrentRequestManager extends EventEmitter {
  /** Active tasks by client ID */
  private activeTasks: Map<string, ActiveTask[]>;

  /** Task lookup by task ID */
  private taskLookup: Map<string, ActiveTask>;

  /** Maximum concurrent tasks per client */
  private maxConcurrentTasks: number;

  constructor(maxConcurrentTasks: number = 5) {
    super();
    this.activeTasks = new Map();
    this.taskLookup = new Map();
    this.maxConcurrentTasks = maxConcurrentTasks;

    logger.info('Concurrent request manager initialized');
  }

  /**
   * Create a new task for a client
   */
  createTask(clientId: string, query: string): ActiveTask {
    // Check if client has too many active tasks
    const clientTasks = this.getActiveTasksForClient(clientId);
    if (clientTasks.length >= this.maxConcurrentTasks) {
      throw new Error(
        `Client ${clientId} has too many concurrent tasks (max: ${this.maxConcurrentTasks})`
      );
    }

    const task: ActiveTask = {
      taskId: randomUUID(),
      clientId,
      query,
      state: TaskState.PENDING,
      createdAt: new Date(),
      contextUpdates: []
    };

    // Add to tracking
    if (!this.activeTasks.has(clientId)) {
      this.activeTasks.set(clientId, []);
    }
    this.activeTasks.get(clientId)!.push(task);
    this.taskLookup.set(task.taskId, task);

    logger.info(`Task created: ${task.taskId} for client ${clientId}`, { query });

    return task;
  }

  /**
   * Update task state
   */
  updateTaskState(taskId: string, state: TaskState): void {
    const task = this.taskLookup.get(taskId);
    if (!task) {
      logger.warn(`Cannot update state for unknown task: ${taskId}`);
      return;
    }

    task.state = state;

    if (state === TaskState.ACTIVE && !task.startedAt) {
      task.startedAt = new Date();
    }

    if (
      (state === TaskState.COMPLETED ||
        state === TaskState.FAILED ||
        state === TaskState.CANCELLED) &&
      !task.completedAt
    ) {
      task.completedAt = new Date();
    }

    logger.debug(`Task ${taskId} state updated: ${state}`);
    this.emit('task_state_changed', task);
  }

  /**
   * Add context update to a task
   */
  addContextUpdate(taskId: string, message: string): ContextUpdate {
    const task = this.taskLookup.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const update: ContextUpdate = {
      id: randomUUID(),
      taskId,
      message,
      timestamp: new Date(),
      processed: false
    };

    task.contextUpdates.push(update);

    logger.info(`Context update added to task ${taskId}`, { message });
    this.emit('context_update', { task, update });

    return update;
  }

  /**
   * Mark context update as processed
   */
  markContextUpdateProcessed(
    taskId: string,
    updateId: string,
    impact: 'plan_modified' | 'no_change' | 'task_cancelled'
  ): void {
    const task = this.taskLookup.get(taskId);
    if (!task) return;

    const update = task.contextUpdates.find((u) => u.id === updateId);
    if (update) {
      update.processed = true;
      update.impact = impact;
      logger.debug(`Context update ${updateId} processed with impact: ${impact}`);
    }
  }

  /**
   * Find related active task for a new query
   * Returns task if the new query is likely related to an active task
   */
  findRelatedTask(clientId: string, query: string): ActiveTask | undefined {
    const clientTasks = this.getActiveTasksForClient(clientId);

    // Only consider active or paused tasks
    const activeTasks = clientTasks.filter(
      (t) => t.state === TaskState.ACTIVE || t.state === TaskState.PAUSED
    );

    if (activeTasks.length === 0) {
      return undefined;
    }

    // Simple heuristic: check for keyword overlap
    const queryWords = this.extractKeywords(query);

    for (const task of activeTasks) {
      const taskWords = this.extractKeywords(task.query);

      // Check if there's significant overlap
      const overlap = queryWords.filter((word) => taskWords.includes(word));
      const overlapRatio = overlap.length / Math.max(queryWords.length, taskWords.length);

      // If >30% overlap, consider it related
      if (overlapRatio > 0.3) {
        logger.info(`Found related task ${task.taskId} for new query`, {
          query,
          originalQuery: task.query,
          overlapRatio
        });
        return task;
      }
    }

    return undefined;
  }

  /**
   * Extract keywords from query (simple implementation)
   */
  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'is',
      'are',
      'was',
      'were',
      'to',
      'from',
      'in',
      'on',
      'at',
      'for',
      'with',
      'by',
      'of',
      'as',
      'i',
      'me',
      'my',
      'you',
      'your',
      'can',
      'what',
      'when',
      'where',
      'how',
      'why'
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): ActiveTask | undefined {
    return this.taskLookup.get(taskId);
  }

  /**
   * Get all active tasks for a client
   */
  getActiveTasksForClient(clientId: string): ActiveTask[] {
    return this.activeTasks.get(clientId) || [];
  }

  /**
   * Get all tasks in a specific state
   */
  getTasksByState(state: TaskState): ActiveTask[] {
    return Array.from(this.taskLookup.values()).filter((t) => t.state === state);
  }

  /**
   * Complete a task
   */
  completeTask(taskId: string, result: ExecutionResult): void {
    const task = this.taskLookup.get(taskId);
    if (!task) return;

    this.updateTaskState(
      taskId,
      result.success ? TaskState.COMPLETED : TaskState.FAILED
    );

    logger.info(`Task ${taskId} completed`, {
      success: result.success,
      duration: result.duration
    });

    // Clean up after a delay (keep for audit/history)
    setTimeout(() => {
      this.removeTask(taskId);
    }, 60000); // Keep for 1 minute
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): void {
    const task = this.taskLookup.get(taskId);
    if (!task) return;

    this.updateTaskState(taskId, TaskState.CANCELLED);
    logger.info(`Task ${taskId} cancelled`);

    setTimeout(() => {
      this.removeTask(taskId);
    }, 5000); // Clean up quickly
  }

  /**
   * Remove task from tracking
   */
  private removeTask(taskId: string): void {
    const task = this.taskLookup.get(taskId);
    if (!task) return;

    // Remove from task lookup
    this.taskLookup.delete(taskId);

    // Remove from client tasks
    const clientTasks = this.activeTasks.get(task.clientId);
    if (clientTasks) {
      const index = clientTasks.findIndex((t) => t.taskId === taskId);
      if (index !== -1) {
        clientTasks.splice(index, 1);
      }

      // Clean up empty client entries
      if (clientTasks.length === 0) {
        this.activeTasks.delete(task.clientId);
      }
    }

    logger.debug(`Task ${taskId} removed from tracking`);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalTasks: number;
    tasksByState: Record<string, number>;
    tasksByClient: Record<string, number>;
    averageTasksPerClient: number;
  } {
    const totalTasks = this.taskLookup.size;
    const tasksByState: Record<string, number> = {};
    const tasksByClient: Record<string, number> = {};

    for (const task of this.taskLookup.values()) {
      tasksByState[task.state] = (tasksByState[task.state] || 0) + 1;
      tasksByClient[task.clientId] = (tasksByClient[task.clientId] || 0) + 1;
    }

    const clientCount = Object.keys(tasksByClient).length;
    const averageTasksPerClient = clientCount > 0 ? totalTasks / clientCount : 0;

    return {
      totalTasks,
      tasksByState,
      tasksByClient,
      averageTasksPerClient
    };
  }

  /**
   * Clean up completed/failed/cancelled tasks older than threshold
   */
  cleanup(olderThanMs: number = 300000): number {
    const now = new Date();
    const threshold = new Date(now.getTime() - olderThanMs);
    let cleaned = 0;

    for (const task of this.taskLookup.values()) {
      if (
        task.completedAt &&
        task.completedAt < threshold &&
        (task.state === TaskState.COMPLETED ||
          task.state === TaskState.FAILED ||
          task.state === TaskState.CANCELLED)
      ) {
        this.removeTask(task.taskId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old tasks`);
    }

    return cleaned;
  }
}
