/**
 * Wolfram Plugin - Adapter for Wolfram Alpha computational knowledge
 */

import { Plugin, PluginMetadata, PluginTool, PluginCapability, ExecutionContext, ToolResult } from '../../types/plugin';
import { WolframService } from '../../services/wolframService';
import { logger } from '../../utils/logger';

export class WolframPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'core.wolfram',
    name: 'Wolfram Alpha',
    version: '1.0.0',
    author: 'proPACE',
    description: 'Computational knowledge engine for math, science, and factual queries',
    tags: ['computational', 'math', 'science', 'core']
  };

  private wolframService?: WolframService;

  tools: PluginTool[] = [{
    name: 'wolfram_query',
    description: 'Query Wolfram Alpha for computational and factual answers',
    category: 'computational',
    capabilities: [PluginCapability.READ_ONLY],
    parameters: [{
      name: 'query',
      type: 'string',
      description: 'The question or computation to solve',
      required: true
    }],
    execute: async (params: Record<string, any>, _context: ExecutionContext): Promise<ToolResult> => {
      const startTime = Date.now();
      try {
        if (!this.wolframService) throw new Error('Wolfram service not initialized');
        const result = await this.wolframService.getFormattedAnswer(params.query as string);
        return {
          success: !result.includes("couldn't find"),
          data: { answer: result },
          metadata: { duration: Date.now() - startTime, cached: false }
        };
      } catch (error) {
        logger.error('Wolfram plugin error:', error);
        return {
          success: false,
          error: `Wolfram query failed: ${(error as Error).message}`,
          metadata: { duration: Date.now() - startTime, cached: false }
        };
      }
    }
  }];

  async initialize(config: Record<string, any>): Promise<void> {
    this.wolframService = new WolframService(config.appId as string | undefined);
    logger.info('Wolfram plugin initialized');
  }

  async healthCheck(): Promise<boolean> {
    return this.wolframService !== undefined;
  }

  async shutdown(): Promise<void> {
    this.wolframService = undefined;
  }
}
