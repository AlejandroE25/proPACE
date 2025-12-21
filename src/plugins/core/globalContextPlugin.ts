/**
 * Global Context Plugin
 *
 * Provides tools for Pace to manage shared context across clients
 */

import {
  Plugin,
  PluginMetadata,
  PluginTool,
  PluginCapability,
  ExecutionContext,
  ToolResult
} from '../../types/plugin';
import { GlobalContextStore } from '../../agent/globalContextStore';
import { ContextScope } from '../../types/globalContext';
import { logger } from '../../utils/logger';

export class GlobalContextPlugin implements Plugin {
  readonly metadata: PluginMetadata = {
    id: 'pace.core.global_context',
    name: 'Global Context Plugin',
    version: '1.0.0',
    description: 'Cross-client context management and awareness',
    author: 'PACE Core Team',
    tags: ['context', 'global', 'collaboration', 'cross-client']
  };

  private contextStore?: GlobalContextStore;

  tools: PluginTool[] = [
    {
      name: 'set_global_context',
      description: 'Set a global context value accessible to all clients',
      category: 'context',
      capabilities: [PluginCapability.STATE_CHANGING],
      parameters: [
        {
          name: 'key',
          type: 'string',
          description: 'Context key (e.g., "system.timezone", "team.preferences")',
          required: true
        },
        {
          name: 'value',
          type: 'string',
          description: 'Value to store (will be JSON stringified)',
          required: true
        },
        {
          name: 'description',
          type: 'string',
          description: 'Optional description of what this represents',
          required: false
        }
      ],
      execute: this.setGlobalContext.bind(this)
    },
    {
      name: 'get_global_context',
      description: 'Get a global context value',
      category: 'context',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'key',
          type: 'string',
          description: 'Context key to retrieve',
          required: true
        }
      ],
      execute: this.getGlobalContext.bind(this)
    },
    {
      name: 'list_global_context',
      description: 'List all global context values',
      category: 'context',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.listGlobalContext.bind(this)
    },
    {
      name: 'get_active_clients',
      description: 'Get list of currently active clients/users',
      category: 'context',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [],
      execute: this.getActiveClients.bind(this)
    },
    {
      name: 'send_client_message',
      description: 'Send a message to another client (for notifications, alerts, etc)',
      category: 'context',
      capabilities: [PluginCapability.STATE_CHANGING],
      parameters: [
        {
          name: 'target_client',
          type: 'string',
          description: 'Client ID to send message to',
          required: true
        },
        {
          name: 'message',
          type: 'string',
          description: 'Message content',
          required: true
        }
      ],
      execute: this.sendClientMessage.bind(this)
    },
    {
      name: 'search_context',
      description: 'Search context values by key pattern (supports wildcards)',
      category: 'context',
      capabilities: [PluginCapability.READ_ONLY],
      parameters: [
        {
          name: 'pattern',
          type: 'string',
          description: 'Search pattern (e.g., "user.*", "*.preferences")',
          required: true
        }
      ],
      execute: this.searchContext.bind(this)
    }
  ];

  async initialize(_config: Record<string, any>): Promise<void> {
    logger.info('Global context plugin initialized');
  }

  /**
   * Set the global context store
   */
  setContextStore(store: GlobalContextStore): void {
    this.contextStore = store;
  }

  async shutdown(): Promise<void> {
    logger.info('Global context plugin shut down');
  }

  /**
   * Set global context
   */
  private async setGlobalContext(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.contextStore) {
      return {
        success: false,
        error: 'Global context store not initialized'
      };
    }

    const key = params.key as string;
    const value = params.value as string;
    const description = params.description as string | undefined;

    if (!key || !value) {
      return {
        success: false,
        error: 'key and value parameters are required'
      };
    }

    try {
      const contextValue = this.contextStore.set(
        key,
        value,
        context.clientId,
        ContextScope.GLOBAL,
        { description }
      );

      return {
        success: true,
        data: {
          key: contextValue.key,
          value: contextValue.value,
          createdBy: contextValue.createdBy,
          formatted: `✓ Global context set: ${key} = ${value}`
        }
      };
    } catch (error) {
      logger.error('Error setting global context:', error);
      return {
        success: false,
        error: `Failed to set global context: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get global context
   */
  private async getGlobalContext(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.contextStore) {
      return {
        success: false,
        error: 'Global context store not initialized'
      };
    }

    const key = params.key as string;

    if (!key) {
      return {
        success: false,
        error: 'key parameter is required'
      };
    }

    try {
      const contextValue = this.contextStore.get(key, context.clientId);

      if (!contextValue) {
        return {
          success: false,
          error: `Context value not found: ${key}`
        };
      }

      let output = `**Global Context: ${key}**\n\n`;
      output += `Value: ${contextValue.value}\n`;
      output += `Created by: ${contextValue.createdBy}\n`;
      output += `Created at: ${contextValue.createdAt.toISOString()}\n`;

      if (contextValue.metadata?.description) {
        output += `Description: ${contextValue.metadata.description}\n`;
      }

      return {
        success: true,
        data: {
          contextValue,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error getting global context:', error);
      return {
        success: false,
        error: `Failed to get global context: ${(error as Error).message}`
      };
    }
  }

  /**
   * List global context
   */
  private async listGlobalContext(
    _params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.contextStore) {
      return {
        success: false,
        error: 'Global context store not initialized'
      };
    }

    try {
      const values = this.contextStore.getAll(context.clientId, ContextScope.GLOBAL);

      if (values.length === 0) {
        return {
          success: true,
          data: {
            values: [],
            count: 0,
            formatted: 'No global context values found'
          }
        };
      }

      let output = `**Global Context Values** (${values.length} total)\n\n`;

      for (const value of values) {
        output += `• **${value.key}**: ${value.value}\n`;
        if (value.metadata?.description) {
          output += `  ${value.metadata.description}\n`;
        }
        output += `  Created by ${value.createdBy} at ${value.createdAt.toISOString()}\n\n`;
      }

      return {
        success: true,
        data: {
          values,
          count: values.length,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error listing global context:', error);
      return {
        success: false,
        error: `Failed to list global context: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get active clients
   */
  private async getActiveClients(
    _params: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.contextStore) {
      return {
        success: false,
        error: 'Global context store not initialized'
      };
    }

    try {
      const clients = this.contextStore.getActiveClients();

      if (clients.length === 0) {
        return {
          success: true,
          data: {
            clients: [],
            count: 0,
            formatted: 'No active clients'
          }
        };
      }

      let output = `**Active Clients** (${clients.length} total)\n\n`;

      for (const client of clients) {
        output += `• **${client.clientId}**\n`;
        if (client.name) {
          output += `  Name: ${client.name}\n`;
        }
        if (client.userId) {
          output += `  User ID: ${client.userId}\n`;
        }
        output += `  Connected: ${client.connectedAt.toISOString()}\n`;
        output += `  Last Activity: ${client.lastActivity.toISOString()}\n\n`;
      }

      return {
        success: true,
        data: {
          clients,
          count: clients.length,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error getting active clients:', error);
      return {
        success: false,
        error: `Failed to get active clients: ${(error as Error).message}`
      };
    }
  }

  /**
   * Send message to client
   */
  private async sendClientMessage(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.contextStore) {
      return {
        success: false,
        error: 'Global context store not initialized'
      };
    }

    const targetClient = params.target_client as string;
    const message = params.message as string;

    if (!targetClient || !message) {
      return {
        success: false,
        error: 'target_client and message parameters are required'
      };
    }

    try {
      const msg = this.contextStore.sendMessage(
        context.clientId,
        targetClient,
        message
      );

      return {
        success: true,
        data: {
          messageId: msg.id,
          to: targetClient,
          formatted: `✓ Message sent to ${targetClient}`
        }
      };
    } catch (error) {
      logger.error('Error sending client message:', error);
      return {
        success: false,
        error: `Failed to send message: ${(error as Error).message}`
      };
    }
  }

  /**
   * Search context
   */
  private async searchContext(
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    if (!this.contextStore) {
      return {
        success: false,
        error: 'Global context store not initialized'
      };
    }

    const pattern = params.pattern as string;

    if (!pattern) {
      return {
        success: false,
        error: 'pattern parameter is required'
      };
    }

    try {
      const values = this.contextStore.search(pattern, context.clientId);

      if (values.length === 0) {
        return {
          success: true,
          data: {
            values: [],
            count: 0,
            formatted: `No context values matching pattern: ${pattern}`
          }
        };
      }

      let output = `**Context Search Results** (${values.length} matches for "${pattern}")\n\n`;

      for (const value of values) {
        const scopeIcon = value.scope === ContextScope.GLOBAL ? '🌐' :
                         value.scope === ContextScope.SHARED ? '👥' : '👤';

        output += `${scopeIcon} **${value.key}**: ${value.value}\n`;
        output += `  Scope: ${value.scope}\n`;
        if (value.metadata?.description) {
          output += `  ${value.metadata.description}\n`;
        }
        output += '\n';
      }

      return {
        success: true,
        data: {
          values,
          count: values.length,
          pattern,
          formatted: output
        }
      };
    } catch (error) {
      logger.error('Error searching context:', error);
      return {
        success: false,
        error: `Failed to search context: ${(error as Error).message}`
      };
    }
  }
}
