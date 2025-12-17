/**
 * System Diagnostics
 *
 * Self-diagnostic framework that allows Pace to test itself.
 * Can be used by developers for integration testing AND by Pace
 * to diagnose its own capabilities and troubleshoot issues.
 */

import { logger } from '../utils/logger';
import { PluginRegistry } from '../plugins/pluginRegistry';

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
