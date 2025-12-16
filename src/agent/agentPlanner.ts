/**
 * Agent Planner
 *
 * Uses Claude Sonnet to decompose complex queries into multi-step execution plans.
 * Identifies dependencies, determines parallelization, and fast-tracks simple queries.
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { PluginRegistry } from '../plugins/pluginRegistry';
import {
  ExecutionPlan,
  ExecutionStep,
  PlanningContext
} from '../types/agent';
import { PluginTool } from '../types/plugin';

export class AgentPlanner {
  private anthropic: Anthropic;
  private pluginRegistry: PluginRegistry;
  private planningModel: string;

  constructor(
    apiKey: string,
    pluginRegistry: PluginRegistry,
    planningModel: string = 'claude-sonnet-4-5-20251101'
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.pluginRegistry = pluginRegistry;
    this.planningModel = planningModel;

    logger.info('Agent planner initialized');
  }

  /**
   * Check if query can be fast-tracked (simple single-tool operation)
   */
  shouldFastTrack(query: string, availableTools: PluginTool[]): boolean {
    const lowerQuery = query.toLowerCase().trim();

    // Weather queries
    if (/^(what'?s? the |get |show )?(weather|temperature|forecast)/i.test(lowerQuery)) {
      return availableTools.some((t) => t.name === 'get_weather');
    }

    // News queries
    if (/^(what'?s? the |get |show )?(news|headlines)/i.test(lowerQuery)) {
      return availableTools.some((t) => t.name === 'get_news');
    }

    // Wolfram queries (simple calculations)
    if (/^(what'?s? |calculate |compute )?\d+[\+\-\*\/]/i.test(lowerQuery)) {
      return availableTools.some((t) => t.name === 'wolfram_query');
    }

    return false;
  }

  /**
   * Create fast-track plan for simple queries
   */
  createFastTrackPlan(query: string): ExecutionPlan {
    const lowerQuery = query.toLowerCase().trim();
    let toolName: string;
    let parameters: Record<string, any> = {};

    if (/weather|temperature|forecast/i.test(lowerQuery)) {
      toolName = 'get_weather';
      // Extract city if mentioned
      const cityMatch = lowerQuery.match(/in\s+([a-z\s]+?)(\s|$|\?)/i);
      if (cityMatch) {
        parameters.city = cityMatch[1].trim();
      }
    } else if (/news|headlines/i.test(lowerQuery)) {
      toolName = 'get_news';
      const countMatch = lowerQuery.match(/(\d+)\s+(news|headlines)/i);
      if (countMatch) {
        parameters.count = parseInt(countMatch[1], 10);
      }
    } else {
      toolName = 'wolfram_query';
      parameters.query = query;
    }

    const step: ExecutionStep = {
      id: 'step_1',
      toolName,
      description: `Execute ${toolName}`,
      parameters,
      dependencies: [],
      requiresPermission: false,
      parallelizable: false
    };

    return {
      id: randomUUID(),
      originalQuery: query,
      steps: [step],
      estimatedTotalDuration: 500,
      requiresUserPermission: false,
      createdAt: new Date()
    };
  }

  /**
   * Create execution plan using Claude Sonnet
   */
  async createPlan(
    query: string,
    context: PlanningContext
  ): Promise<ExecutionPlan> {
    const allTools = this.pluginRegistry.getAllTools();

    // Check for fast-track
    if (this.shouldFastTrack(query, allTools)) {
      logger.info('Fast-tracking simple query', { query });
      return this.createFastTrackPlan(query);
    }

    // Build planning prompt
    const prompt = this.buildPlanningPrompt(query, context, allTools);

    logger.info('Creating execution plan with Claude Sonnet', { query });

    try {
      const response = await this.anthropic.messages.create({
        model: this.planningModel,
        max_tokens: 2000,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Parse the plan from Claude's response
      const plan = this.parsePlanFromResponse(query, content.text);

      logger.info(`Plan created with ${plan.steps.length} steps`, {
        planId: plan.id,
        requiresPermission: plan.requiresUserPermission
      });

      return plan;
    } catch (error) {
      logger.error('Failed to create plan with Claude', error);
      throw new Error(`Planning failed: ${(error as Error).message}`);
    }
  }

  /**
   * Build planning prompt for Claude
   */
  private buildPlanningPrompt(
    query: string,
    context: PlanningContext,
    tools: PluginTool[]
  ): string {
    const toolDescriptions = tools.map((tool) => {
      const params = tool.parameters
        .map((p) => `${p.name}${p.required ? '*' : ''}: ${p.description}`)
        .join(', ');

      return `- ${tool.name} (${tool.category}): ${tool.description}\n  Parameters: ${params}\n  Capabilities: ${tool.capabilities.join(', ')}`;
    }).join('\n\n');

    const memoryContext = context.memories.length > 0
      ? `\n\nRelevant Memories:\n${context.memories.map((m) => `- ${m.content}`).join('\n')}`
      : '';

    const globalContextInfo = context.globalContext.length > 0
      ? `\n\nCross-Client Context:\n${context.globalContext.map((m) => `- ${m.entry.content}`).join('\n')}`
      : '';

    return `You are a task planner for an AI assistant. Your job is to break down a user query into a sequence of executable steps using available tools.

User Query: "${query}"
${memoryContext}${globalContextInfo}

Available Tools:
${toolDescriptions}

Instructions:
1. Analyze the query and determine what tools are needed to answer it completely
2. Break the task into discrete steps, each using ONE tool
3. Identify dependencies between steps (which steps must complete before others)
4. Mark steps as parallelizable if they don't depend on each other
5. Determine if each step requires user permission (state_changing capabilities require permission, read_only do not)
6. IMPORTANT: ALL memory operations (store_memory, search_memory, recall_memory, delete_memory) NEVER require permission - they are system-owned

Return a JSON plan with this structure:
{
  "steps": [
    {
      "id": "step_1",
      "toolName": "tool_name",
      "description": "Human-readable description",
      "parameters": { "param": "value" },
      "dependencies": [],
      "requiresPermission": false,
      "parallelizable": true
    }
  ]
}

Remember:
- Keep plans concise - only include necessary steps
- Steps with no dependencies and parallelizable=true will run simultaneously
- Memory operations are ALWAYS auto-approved (no permission needed)
- Be specific with parameters - extract information from the query
- If a step depends on results from another, list the dependency by step ID`;
  }

  /**
   * Parse execution plan from Claude's response
   */
  private parsePlanFromResponse(query: string, response: string): ExecutionPlan {
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON plan found in response');
      }

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        throw new Error('Invalid plan structure');
      }

      // Validate and build plan
      const steps: ExecutionStep[] = parsed.steps.map((step: any, index: number) => ({
        id: step.id || `step_${index + 1}`,
        toolName: step.toolName,
        description: step.description || `Execute ${step.toolName}`,
        parameters: step.parameters || {},
        dependencies: step.dependencies || [],
        requiresPermission: step.requiresPermission || false,
        estimatedDuration: step.estimatedDuration,
        parallelizable: step.parallelizable !== false // Default to true
      }));

      // Calculate estimated duration
      const estimatedTotalDuration = this.estimatePlanDuration(steps);

      // Check if any step requires permission
      const requiresUserPermission = steps.some((s) => s.requiresPermission);

      return {
        id: randomUUID(),
        originalQuery: query,
        steps,
        estimatedTotalDuration,
        requiresUserPermission,
        createdAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to parse plan from Claude response', { error, response });
      throw new Error(`Plan parsing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Estimate total plan duration based on dependencies and parallelization
   */
  private estimatePlanDuration(steps: ExecutionStep[]): number {
    // Build dependency graph
    const graph = new Map<string, Set<string>>();
    for (const step of steps) {
      graph.set(step.id, new Set(step.dependencies));
    }

    // Calculate critical path (longest chain of dependencies)
    let maxDepth = 0;
    for (const step of steps) {
      const depth = this.getStepDepth(step.id, graph, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }

    // Rough estimate: 1000ms per depth level
    return (maxDepth + 1) * 1000;
  }

  /**
   * Get depth of a step in dependency graph
   */
  private getStepDepth(
    stepId: string,
    graph: Map<string, Set<string>>,
    visited: Set<string>
  ): number {
    if (visited.has(stepId)) return 0;
    visited.add(stepId);

    const dependencies = graph.get(stepId);
    if (!dependencies || dependencies.size === 0) {
      return 0;
    }

    let maxDepth = 0;
    for (const depId of dependencies) {
      const depth = this.getStepDepth(depId, graph, visited);
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth + 1;
  }

  /**
   * Update plan with context from new user message
   * Returns updated plan or null if plan should be cancelled
   */
  async updatePlanWithContext(
    originalPlan: ExecutionPlan,
    contextMessage: string,
    completedStepIds: string[]
  ): Promise<ExecutionPlan | null> {
    logger.info('Updating plan with context', {
      planId: originalPlan.id,
      contextMessage,
      completedSteps: completedStepIds.length
    });

    // Ask Claude to revise the plan
    const prompt = `You previously created this execution plan:

Original Query: "${originalPlan.originalQuery}"
Plan Steps:
${originalPlan.steps.map((s) => `- ${s.id}: ${s.description}`).join('\n')}

Completed Steps: ${completedStepIds.join(', ')}

The user has provided additional context: "${contextMessage}"

Should this plan be:
1. Modified to incorporate the new information
2. Continued without changes
3. Cancelled and restarted

If modified, provide the updated plan JSON with the same structure as before.
If cancelled, respond with: {"action": "cancel"}
If no change needed, respond with: {"action": "continue"}`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.planningModel,
        max_tokens: 2000,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return originalPlan;
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return originalPlan;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.action === 'cancel') {
        logger.info('Plan cancelled based on context update');
        return null;
      }

      if (parsed.action === 'continue') {
        logger.info('Plan continues without modification');
        return originalPlan;
      }

      if (parsed.steps) {
        // Create updated plan
        const updatedPlan = this.parsePlanFromResponse(
          `${originalPlan.originalQuery} [Updated: ${contextMessage}]`,
          JSON.stringify(parsed)
        );

        logger.info('Plan updated with new context', {
          originalSteps: originalPlan.steps.length,
          updatedSteps: updatedPlan.steps.length
        });

        return updatedPlan;
      }

      return originalPlan;
    } catch (error) {
      logger.error('Failed to update plan with context', error);
      return originalPlan; // Fall back to original plan
    }
  }
}
