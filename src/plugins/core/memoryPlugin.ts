/**
 * Memory Plugin - Adapter for persistent memory storage
 */

import { Plugin, PluginMetadata, PluginTool, PluginCapability, ExecutionContext, ToolResult } from '../../types/plugin';
import { MemoryStore } from '../../services/memoryStore';
import { logger } from '../../utils/logger';

export class MemoryPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'core.memory',
    name: 'Memory Service',
    version: '1.0.0',
    author: 'proPACE',
    description: 'Persistent memory storage for important information and preferences',
    tags: ['memory', 'storage', 'core']
  };

  private memoryStore?: MemoryStore;

  tools: PluginTool[] = [
    {
      name: 'store_memory',
      description: 'Store important information in persistent memory',
      category: 'memory',
      capabilities: [PluginCapability.STATE_CHANGING],
      parameters: [
        {
          name: 'topic',
          type: 'string',
          description: 'Topic or category of the memory',
          required: true
        },
        {
          name: 'content',
          type: 'string',
          description: 'The information to remember',
          required: true
        },
        {
          name: 'importance',
          type: 'number',
          description: 'Importance level (1-10)',
          required: true,
          validation: (value: any) => {
            const num = Number(value);
            return !isNaN(num) && num >= 1 && num <= 10;
          }
        },
        {
          name: 'tags',
          type: 'string',
          description: 'Comma-separated tags for categorization',
          required: false
        },
        {
          name: 'metadata',
          type: 'object',
          description: 'Additional metadata',
          required: false
        }
      ],
      execute: async (params: Record<string, any>, _context: ExecutionContext): Promise<ToolResult> => {
        const startTime = Date.now();

        try {
          if (!this.memoryStore) {
            throw new Error('Memory store not initialized');
          }

          const memory = this.memoryStore.store({
            topic: params.topic as string,
            content: params.content as string,
            importance: params.importance as number,
            tags: params.tags as string | undefined,
            metadata: params.metadata as Record<string, any> | undefined
          });

          const duration = Date.now() - startTime;

          return {
            success: true,
            data: {
              memory,
              message: `Stored memory #${memory.id}: ${memory.topic}`
            },
            metadata: {
              duration,
              cached: false
            }
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Memory plugin store error:', error);

          return {
            success: false,
            error: `Failed to store memory: ${(error as Error).message}`,
            metadata: {
              duration,
              cached: false
            }
          };
        }
      }
    },
    {
      name: 'search_memory',
      description: 'Search memories by topic, tags, or keywords',
      category: 'memory',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'topic',
          type: 'string',
          description: 'Search by topic',
          required: false
        },
        {
          name: 'tags',
          type: 'string',
          description: 'Search by tags',
          required: false
        },
        {
          name: 'keyword',
          type: 'string',
          description: 'Search by content keyword',
          required: false
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum number of results',
          required: false,
          default: 100
        }
      ],
      execute: async (params: Record<string, any>, _context: ExecutionContext): Promise<ToolResult> => {
        const startTime = Date.now();

        try {
          if (!this.memoryStore) {
            throw new Error('Memory store not initialized');
          }

          const criteria = {
            topic: params.topic as string | undefined,
            tags: params.tags as string | undefined,
            keyword: params.keyword as string | undefined
          };

          const limit = (params.limit as number) || 100;
          const memories = this.memoryStore.search(criteria, limit);

          const duration = Date.now() - startTime;

          return {
            success: true,
            data: {
              memories,
              count: memories.length,
              formatted: this.formatMemories(memories)
            },
            metadata: {
              duration,
              cached: false
            }
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Memory plugin search error:', error);

          return {
            success: false,
            error: `Failed to search memories: ${(error as Error).message}`,
            metadata: {
              duration,
              cached: false
            }
          };
        }
      }
    },
    {
      name: 'recall_memory',
      description: 'Recall recent memories or memories by importance',
      category: 'memory',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'limit',
          type: 'number',
          description: 'Number of memories to recall',
          required: false,
          default: 10
        },
        {
          name: 'minImportance',
          type: 'number',
          description: 'Minimum importance level (1-10)',
          required: false
        }
      ],
      execute: async (params: Record<string, any>, _context: ExecutionContext): Promise<ToolResult> => {
        const startTime = Date.now();

        try {
          if (!this.memoryStore) {
            throw new Error('Memory store not initialized');
          }

          const limit = (params.limit as number) || 10;
          let memories;

          if (params.minImportance !== undefined) {
            memories = this.memoryStore.getByImportance(params.minImportance as number, limit);
          } else {
            memories = this.memoryStore.getRecent(limit);
          }

          const duration = Date.now() - startTime;

          return {
            success: true,
            data: {
              memories,
              count: memories.length,
              formatted: this.formatMemories(memories)
            },
            metadata: {
              duration,
              cached: false
            }
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Memory plugin recall error:', error);

          return {
            success: false,
            error: `Failed to recall memories: ${(error as Error).message}`,
            metadata: {
              duration,
              cached: false
            }
          };
        }
      }
    },
    {
      name: 'delete_memory',
      description: 'Delete a memory by ID',
      category: 'memory',
      capabilities: [PluginCapability.STATE_CHANGING],
      parameters: [
        {
          name: 'id',
          type: 'number',
          description: 'Memory ID to delete',
          required: true
        }
      ],
      execute: async (params: Record<string, any>, _context: ExecutionContext): Promise<ToolResult> => {
        const startTime = Date.now();

        try {
          if (!this.memoryStore) {
            throw new Error('Memory store not initialized');
          }

          const deleted = this.memoryStore.delete(params.id as number);
          const duration = Date.now() - startTime;

          return {
            success: deleted,
            data: {
              deleted,
              message: deleted
                ? `Memory #${params.id} deleted successfully`
                : `Memory #${params.id} not found`
            },
            metadata: {
              duration,
              cached: false
            }
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('Memory plugin delete error:', error);

          return {
            success: false,
            error: `Failed to delete memory: ${(error as Error).message}`,
            metadata: {
              duration,
              cached: false
            }
          };
        }
      }
    }
  ];

  async initialize(config: Record<string, any>): Promise<void> {
    const dbPath = (config.dbPath as string) || './data/memories.db';
    this.memoryStore = new MemoryStore(dbPath);
    logger.info('Memory plugin initialized');
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.memoryStore) {
        return false;
      }
      // Test database connection by running a count query
      this.memoryStore.count();
      return true;
    } catch (error) {
      logger.warn('Memory plugin health check failed:', error);
      return false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.memoryStore) {
      this.memoryStore.close();
      this.memoryStore = undefined;
    }
    logger.info('Memory plugin shutdown');
  }

  private formatMemories(memories: any[]): string {
    if (memories.length === 0) {
      return 'No memories found';
    }

    return memories
      .map((m, index) => `${index + 1}. [${m.topic}] ${m.content} (importance: ${m.importance})`)
      .join('\n');
  }
}
