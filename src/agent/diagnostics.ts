/**
 * System Diagnostics
 *
 * Self-diagnostic framework that allows Pace to test itself.
 * Can be used by developers for integration testing AND by Pace
 * to diagnose its own capabilities and troubleshoot issues.
 */

import { logger } from '../utils/logger.js';
import { PluginRegistry } from '../plugins/pluginRegistry.js';
import { config } from '../config/index.js';
import Anthropic from '@anthropic-ai/sdk';

export enum DiagnosticLevel {
  QUICK = 'quick',        // Fast smoke tests
  STANDARD = 'standard',  // Normal integration tests
  THOROUGH = 'thorough'   // Comprehensive testing
}

export enum DiagnosticStatus {
  PASS = 'pass',
  FAIL = 'fail',
  SKIP = 'skip',
  WARN = 'warn'
}

export interface DiagnosticTest {
  id: string;
  name: string;
  category: string;
  description: string;
  level: DiagnosticLevel;
  execute: () => Promise<DiagnosticResult>;
}

export interface DiagnosticResult {
  testId: string;
  status: DiagnosticStatus;
  message: string;
  details?: string;
  duration: number;
  error?: Error;
}

export interface DiagnosticReport {
  timestamp: Date;
  level: DiagnosticLevel;
  results: DiagnosticResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    warnings: number;
    duration: number;
  };
}

export class SystemDiagnostics {
  private pluginRegistry: PluginRegistry;
  private tests: Map<string, DiagnosticTest>;

  constructor(pluginRegistry: PluginRegistry) {
    this.pluginRegistry = pluginRegistry;
    this.tests = new Map();

    // Register all diagnostic tests
    this.registerTests();

    logger.info('System diagnostics initialized');
  }

  /**
   * Register all diagnostic tests
   */
  private registerTests(): void {
    // Plugin Registry Tests
    this.registerTest({
      id: 'plugin_registry_loaded',
      name: 'Plugin Registry Loaded',
      category: 'core',
      description: 'Verify plugin registry is initialized and has plugins',
      level: DiagnosticLevel.QUICK,
      execute: async () => {
        const startTime = Date.now();

        try {
          const pluginCount = this.pluginRegistry.getPluginCount();
          const toolCount = this.pluginRegistry.getAllTools().length;

          if (pluginCount === 0) {
            return {
              testId: 'plugin_registry_loaded',
              status: DiagnosticStatus.FAIL,
              message: 'No plugins registered',
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'plugin_registry_loaded',
            status: DiagnosticStatus.PASS,
            message: `Registry loaded: ${pluginCount} plugins, ${toolCount} tools`,
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            testId: 'plugin_registry_loaded',
            status: DiagnosticStatus.FAIL,
            message: 'Plugin registry error',
            error: error as Error,
            duration: Date.now() - startTime
          };
        }
      }
    });

    // Anthropic API Key Test
    this.registerTest({
      id: 'anthropic_api_key_configured',
      name: 'Anthropic API Key Configured',
      category: 'core',
      description: 'Verify Anthropic API key is configured',
      level: DiagnosticLevel.QUICK,
      execute: async () => {
        const startTime = Date.now();

        try {
          const hasApiKey = config.anthropicApiKey &&
                           config.anthropicApiKey !== '' &&
                           config.anthropicApiKey !== 'your_api_key_here';

          if (!hasApiKey) {
            return {
              testId: 'anthropic_api_key_configured',
              status: DiagnosticStatus.FAIL,
              message: 'Anthropic API key not configured',
              details: 'Set ANTHROPIC_API_KEY in .env file',
              duration: Date.now() - startTime
            };
          }

          // Basic validation - should start with 'sk-ant-'
          if (!config.anthropicApiKey.startsWith('sk-ant-')) {
            return {
              testId: 'anthropic_api_key_configured',
              status: DiagnosticStatus.WARN,
              message: 'API key format looks incorrect',
              details: 'Anthropic API keys should start with "sk-ant-"',
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'anthropic_api_key_configured',
            status: DiagnosticStatus.PASS,
            message: 'Anthropic API key configured',
            details: `Key: sk-ant-...${config.anthropicApiKey.slice(-4)}`,
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            testId: 'anthropic_api_key_configured',
            status: DiagnosticStatus.FAIL,
            message: 'Error checking API key configuration',
            error: error as Error,
            duration: Date.now() - startTime
          };
        }
      }
    });

    // Anthropic API Connection Test
    this.registerTest({
      id: 'anthropic_api_connection',
      name: 'Anthropic API Connection',
      category: 'core',
      description: 'Test actual connection to Anthropic API',
      level: DiagnosticLevel.STANDARD,
      execute: async () => {
        const startTime = Date.now();

        try {
          // Check if API key is configured first
          if (!config.anthropicApiKey || config.anthropicApiKey === 'your_api_key_here') {
            return {
              testId: 'anthropic_api_connection',
              status: DiagnosticStatus.SKIP,
              message: 'API key not configured',
              duration: Date.now() - startTime
            };
          }

          const client = new Anthropic({ apiKey: config.anthropicApiKey });

          // Make a minimal API call to test connectivity
          const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }]
          });

          if (!response || !response.content || response.content.length === 0) {
            return {
              testId: 'anthropic_api_connection',
              status: DiagnosticStatus.FAIL,
              message: 'API returned unexpected response',
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'anthropic_api_connection',
            status: DiagnosticStatus.PASS,
            message: 'API connection successful',
            details: `Response received in ${Date.now() - startTime}ms`,
            duration: Date.now() - startTime
          };
        } catch (error) {
          const err = error as Error;

          // Provide specific error messages
          let message = 'API connection failed';
          let details = err.message;

          if (err.message.includes('401') || err.message.includes('authentication')) {
            message = 'API authentication failed';
            details = 'API key is invalid or expired';
          } else if (err.message.includes('429') || err.message.includes('rate limit')) {
            message = 'API rate limit exceeded';
            details = 'Too many requests - try again later';
          } else if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
            message = 'API connection timeout';
            details = 'Network connectivity issues or API is slow';
          } else if (err.message.includes('ENOTFOUND') || err.message.includes('network')) {
            message = 'Network error';
            details = 'Cannot reach Anthropic API - check internet connection';
          }

          return {
            testId: 'anthropic_api_connection',
            status: DiagnosticStatus.FAIL,
            message,
            details,
            error: err,
            duration: Date.now() - startTime
          };
        }
      }
    });

    // Anthropic Model Availability Test
    this.registerTest({
      id: 'anthropic_models_available',
      name: 'Anthropic Models Available',
      category: 'core',
      description: 'Verify required Claude models are accessible',
      level: DiagnosticLevel.STANDARD,
      execute: async () => {
        const startTime = Date.now();

        try {
          // Check if API key is configured first
          if (!config.anthropicApiKey || config.anthropicApiKey === 'your_api_key_here') {
            return {
              testId: 'anthropic_models_available',
              status: DiagnosticStatus.SKIP,
              message: 'API key not configured',
              duration: Date.now() - startTime
            };
          }

          const client = new Anthropic({ apiKey: config.anthropicApiKey });

          // Test the models we actually use
          const modelsToTest = [
            { name: 'Claude Sonnet 4', id: 'claude-sonnet-4-20250514' },
            { name: 'Claude Haiku 4.5', id: 'claude-haiku-4-5-20251001' }
          ];

          const results: string[] = [];
          let allAvailable = true;

          for (const model of modelsToTest) {
            try {
              // Quick test with minimal tokens
              await client.messages.create({
                model: model.id,
                max_tokens: 5,
                messages: [{ role: 'user', content: 'Test' }]
              });

              results.push(`✓ ${model.name}`);
            } catch (error) {
              allAvailable = false;
              const err = error as Error;

              if (err.message.includes('404') || err.message.includes('not_found')) {
                results.push(`✗ ${model.name} (model not found)`);
              } else {
                results.push(`✗ ${model.name} (${err.message.slice(0, 50)})`);
              }
            }
          }

          if (!allAvailable) {
            return {
              testId: 'anthropic_models_available',
              status: DiagnosticStatus.WARN,
              message: 'Some models unavailable',
              details: results.join('\n'),
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'anthropic_models_available',
            status: DiagnosticStatus.PASS,
            message: 'All required models available',
            details: results.join('\n'),
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            testId: 'anthropic_models_available',
            status: DiagnosticStatus.FAIL,
            message: 'Error testing model availability',
            error: error as Error,
            duration: Date.now() - startTime
          };
        }
      }
    });

    // Weather Tool Test
    this.registerTest({
      id: 'weather_tool_available',
      name: 'Weather Tool Available',
      category: 'tools',
      description: 'Check if weather tool is registered and configured',
      level: DiagnosticLevel.QUICK,
      execute: async () => {
        const startTime = Date.now();

        try {
          const weatherTool = this.pluginRegistry.getTool('get_weather');

          if (!weatherTool) {
            return {
              testId: 'weather_tool_available',
              status: DiagnosticStatus.FAIL,
              message: 'Weather tool not found',
              duration: Date.now() - startTime
            };
          }

          // Check if it's configured (has API key)
          const hasApiKey = process.env.OPENWEATHERMAP_API_KEY &&
                            process.env.OPENWEATHERMAP_API_KEY !== 'your_api_key_here';

          if (!hasApiKey) {
            return {
              testId: 'weather_tool_available',
              status: DiagnosticStatus.WARN,
              message: 'Weather tool found but not configured (missing API key)',
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'weather_tool_available',
            status: DiagnosticStatus.PASS,
            message: 'Weather tool available and configured',
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            testId: 'weather_tool_available',
            status: DiagnosticStatus.FAIL,
            message: 'Error checking weather tool',
            error: error as Error,
            duration: Date.now() - startTime
          };
        }
      }
    });

    // News Tool Test
    this.registerTest({
      id: 'news_tool_available',
      name: 'News Tool Available',
      category: 'tools',
      description: 'Check if news tool is registered',
      level: DiagnosticLevel.QUICK,
      execute: async () => {
        const startTime = Date.now();

        try {
          const newsTool = this.pluginRegistry.getTool('get_news');

          if (!newsTool) {
            return {
              testId: 'news_tool_available',
              status: DiagnosticStatus.FAIL,
              message: 'News tool not found',
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'news_tool_available',
            status: DiagnosticStatus.PASS,
            message: 'News tool available',
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            testId: 'news_tool_available',
            status: DiagnosticStatus.FAIL,
            message: 'Error checking news tool',
            error: error as Error,
            duration: Date.now() - startTime
          };
        }
      }
    });

    // Memory Tool Test
    this.registerTest({
      id: 'memory_tools_available',
      name: 'Memory Tools Available',
      category: 'tools',
      description: 'Check if memory tools are registered',
      level: DiagnosticLevel.QUICK,
      execute: async () => {
        const startTime = Date.now();

        try {
          const storeMemory = this.pluginRegistry.getTool('store_memory');
          const searchMemory = this.pluginRegistry.getTool('search_memory');

          if (!storeMemory || !searchMemory) {
            return {
              testId: 'memory_tools_available',
              status: DiagnosticStatus.FAIL,
              message: 'Memory tools not found',
              details: `store_memory: ${!!storeMemory}, search_memory: ${!!searchMemory}`,
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'memory_tools_available',
            status: DiagnosticStatus.PASS,
            message: 'Memory tools available',
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            testId: 'memory_tools_available',
            status: DiagnosticStatus.FAIL,
            message: 'Error checking memory tools',
            error: error as Error,
            duration: Date.now() - startTime
          };
        }
      }
    });

    // Wolfram Tool Test
    this.registerTest({
      id: 'wolfram_tool_available',
      name: 'Wolfram Tool Available',
      category: 'tools',
      description: 'Check if Wolfram tool is registered and configured',
      level: DiagnosticLevel.QUICK,
      execute: async () => {
        const startTime = Date.now();

        try {
          const wolframTool = this.pluginRegistry.getTool('wolfram_query');

          if (!wolframTool) {
            return {
              testId: 'wolfram_tool_available',
              status: DiagnosticStatus.FAIL,
              message: 'Wolfram tool not found',
              duration: Date.now() - startTime
            };
          }

          // Check if it's configured (has App ID)
          const hasAppId = process.env.WOLFRAM_ALPHA_APP_ID &&
                          process.env.WOLFRAM_ALPHA_APP_ID !== 'your_wolfram_id_here';

          if (!hasAppId) {
            return {
              testId: 'wolfram_tool_available',
              status: DiagnosticStatus.WARN,
              message: 'Wolfram tool found but not configured (missing App ID)',
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'wolfram_tool_available',
            status: DiagnosticStatus.PASS,
            message: 'Wolfram tool available and configured',
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            testId: 'wolfram_tool_available',
            status: DiagnosticStatus.FAIL,
            message: 'Error checking Wolfram tool',
            error: error as Error,
            duration: Date.now() - startTime
          };
        }
      }
    });

    // Tool Parameter Validation Test
    this.registerTest({
      id: 'tool_parameters_valid',
      name: 'Tool Parameters Valid',
      category: 'tools',
      description: 'Verify all tools have valid parameter definitions',
      level: DiagnosticLevel.STANDARD,
      execute: async () => {
        const startTime = Date.now();

        try {
          const tools = this.pluginRegistry.getAllTools();
          const invalidTools: string[] = [];

          for (const tool of tools) {
            if (!tool.parameters || tool.parameters.length === 0) {
              continue; // Some tools may have no parameters
            }

            for (const param of tool.parameters) {
              if (!param.name || !param.type || !param.description) {
                invalidTools.push(`${tool.name}.${param.name || 'unknown'}`);
              }
            }
          }

          if (invalidTools.length > 0) {
            return {
              testId: 'tool_parameters_valid',
              status: DiagnosticStatus.WARN,
              message: 'Some tool parameters have missing metadata',
              details: invalidTools.join(', '),
              duration: Date.now() - startTime
            };
          }

          return {
            testId: 'tool_parameters_valid',
            status: DiagnosticStatus.PASS,
            message: `All ${tools.length} tools have valid parameter definitions`,
            duration: Date.now() - startTime
          };
        } catch (error) {
          return {
            testId: 'tool_parameters_valid',
            status: DiagnosticStatus.FAIL,
            message: 'Error validating tool parameters',
            error: error as Error,
            duration: Date.now() - startTime
          };
        }
      }
    });

    logger.info(`Registered ${this.tests.size} diagnostic tests`);
  }

  /**
   * Register a diagnostic test
   */
  registerTest(test: DiagnosticTest): void {
    this.tests.set(test.id, test);
  }

  /**
   * Run diagnostics at specified level
   */
  async runDiagnostics(level: DiagnosticLevel = DiagnosticLevel.STANDARD): Promise<DiagnosticReport> {
    const startTime = Date.now();
    const results: DiagnosticResult[] = [];

    logger.info(`Running ${level} diagnostics...`);

    // Get tests for this level
    const testsToRun = Array.from(this.tests.values()).filter(test => {
      switch (level) {
        case DiagnosticLevel.QUICK:
          return test.level === DiagnosticLevel.QUICK;
        case DiagnosticLevel.STANDARD:
          return test.level === DiagnosticLevel.QUICK || test.level === DiagnosticLevel.STANDARD;
        case DiagnosticLevel.THOROUGH:
          return true;
        default:
          return false;
      }
    });

    // Run tests sequentially
    for (const test of testsToRun) {
      logger.debug(`Running test: ${test.name}`);

      try {
        const result = await test.execute();
        results.push(result);

        logger.debug(`Test ${test.id}: ${result.status} (${result.duration}ms)`);
      } catch (error) {
        results.push({
          testId: test.id,
          status: DiagnosticStatus.FAIL,
          message: 'Test execution failed',
          error: error as Error,
          duration: Date.now() - startTime
        });
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === DiagnosticStatus.PASS).length,
      failed: results.filter(r => r.status === DiagnosticStatus.FAIL).length,
      skipped: results.filter(r => r.status === DiagnosticStatus.SKIP).length,
      warnings: results.filter(r => r.status === DiagnosticStatus.WARN).length,
      duration: Date.now() - startTime
    };

    logger.info(`Diagnostics complete: ${summary.passed}/${summary.total} passed in ${summary.duration}ms`);

    return {
      timestamp: new Date(),
      level,
      results,
      summary
    };
  }

  /**
   * Run specific diagnostic test
   */
  async runTest(testId: string): Promise<DiagnosticResult> {
    const test = this.tests.get(testId);

    if (!test) {
      return {
        testId,
        status: DiagnosticStatus.FAIL,
        message: `Test '${testId}' not found`,
        duration: 0
      };
    }

    return await test.execute();
  }

  /**
   * Get all available tests
   */
  listTests(): DiagnosticTest[] {
    return Array.from(this.tests.values());
  }

  /**
   * Format diagnostic report as human-readable text
   */
  formatReport(report: DiagnosticReport): string {
    let output = `**System Diagnostics Report**\n`;
    output += `Level: ${report.level}\n`;
    output += `Time: ${report.timestamp.toISOString()}\n`;
    output += `Duration: ${report.summary.duration}ms\n\n`;

    output += `**Summary:**\n`;
    output += `  Total: ${report.summary.total}\n`;
    output += `  ✓ Passed: ${report.summary.passed}\n`;
    output += `  ✗ Failed: ${report.summary.failed}\n`;
    output += `  ⚠️ Warnings: ${report.summary.warnings}\n`;
    output += `  ⊘ Skipped: ${report.summary.skipped}\n\n`;

    // Group by category
    const byCategory = new Map<string, DiagnosticResult[]>();
    for (const result of report.results) {
      const test = this.tests.get(result.testId);
      const category = test?.category || 'other';

      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(result);
    }

    output += `**Test Results:**\n\n`;

    for (const [category, results] of byCategory.entries()) {
      output += `**${category.toUpperCase()}:**\n`;

      for (const result of results) {
        const test = this.tests.get(result.testId);
        const icon = result.status === DiagnosticStatus.PASS ? '✓' :
                    result.status === DiagnosticStatus.FAIL ? '✗' :
                    result.status === DiagnosticStatus.WARN ? '⚠️' : '⊘';

        output += `  ${icon} ${test?.name || result.testId}: ${result.message}\n`;

        if (result.details) {
          output += `     ${result.details}\n`;
        }

        if (result.error) {
          output += `     Error: ${result.error.message}\n`;
        }
      }
      output += '\n';
    }

    return output;
  }
}
