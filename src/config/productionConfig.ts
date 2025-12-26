/**
 * Production Configuration System
 *
 * Loads and validates system configuration from JSON/YAML files.
 * Supports environment-specific configs and runtime validation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentOrchestratorConfig } from '../orchestrator/types';
import { DecisionRule } from '../decision/types';
import { AutonomyLevel, RiskLevel } from '../decision/types';

/**
 * Configuration file format
 */
export interface ConfigFile {
  version: string;
  environment: 'development' | 'production' | 'test';
  storage: {
    dataPath: string;
    eventPath: string;
  };
  decisionEngine: {
    defaultAutonomyLevel: AutonomyLevel;
    maxRiskLevel: RiskLevel;
    approvalTimeoutMs: number;
  };
  plugins: {
    [pluginId: string]: {
      enabled: boolean;
      pollInterval?: number;
      settings?: Record<string, any>;
    };
  };
  rules: DecisionRule[];
  monitoring: {
    healthCheckIntervalMs: number;
    errorThreshold: number;
  };
  api?: {
    enabled: boolean;
    port: number;
    host: string;
    cors?: {
      enabled: boolean;
      origins: string[];
    };
    rateLimit?: {
      enabled: boolean;
      windowMs: number;
      maxRequests: number;
    };
  };
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: {
      enabled: boolean;
      path: string;
      maxSize: string;
      maxFiles: number;
    };
    console?: {
      enabled: boolean;
      colorize: boolean;
    };
  };
  auth?: {
    enabled: boolean;
    type: 'jwt' | 'api-key' | 'none';
    jwtSecret?: string;
    apiKeys?: string[];
  };
  dataRetention?: {
    enabled: boolean;
    sensorDataDays: number;
    eventLogDays: number;
    decisionHistoryDays: number;
  };
  voice?: {
    enabled: boolean;
    iceServers: Array<{
      urls: string | string[];
      username?: string;
      credential?: string;
    }>;
    tts?: {
      voice: string;
      cacheSize: number;
      cacheTTL: number;
    };
    stt?: {
      language: string;
      chunkDuration: number;
    };
  };
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: any
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Configuration loader and validator
 */
export class ConfigLoader {
  /**
   * Load configuration from file
   */
  static async loadFromFile(filePath: string): Promise<ConfigFile> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Configuration file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');

    let config: ConfigFile;

    if (ext === '.json') {
      config = JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      // For now, we'll support JSON. YAML support can be added with 'js-yaml' package
      throw new Error('YAML configuration not yet supported. Please use JSON.');
    } else {
      throw new Error(`Unsupported configuration file format: ${ext}`);
    }

    // Validate configuration
    this.validate(config);

    return config;
  }

  /**
   * Validate configuration structure
   */
  static validate(config: ConfigFile): void {
    // Version check
    if (!config.version) {
      throw new ConfigValidationError('Configuration version is required', 'version');
    }

    // Environment check
    if (!['development', 'production', 'test'].includes(config.environment)) {
      throw new ConfigValidationError(
        'Environment must be one of: development, production, test',
        'environment',
        config.environment
      );
    }

    // Storage paths
    if (!config.storage) {
      throw new ConfigValidationError('Storage configuration is required', 'storage');
    }
    if (!config.storage.dataPath) {
      throw new ConfigValidationError('Data storage path is required', 'storage.dataPath');
    }
    if (!config.storage.eventPath) {
      throw new ConfigValidationError('Event storage path is required', 'storage.eventPath');
    }

    // Decision engine
    if (!config.decisionEngine) {
      throw new ConfigValidationError('Decision engine configuration is required', 'decisionEngine');
    }
    if (!Object.values(AutonomyLevel).includes(config.decisionEngine.defaultAutonomyLevel)) {
      throw new ConfigValidationError(
        'Invalid default autonomy level',
        'decisionEngine.defaultAutonomyLevel',
        config.decisionEngine.defaultAutonomyLevel
      );
    }
    if (!Object.values(RiskLevel).includes(config.decisionEngine.maxRiskLevel)) {
      throw new ConfigValidationError(
        'Invalid max risk level',
        'decisionEngine.maxRiskLevel',
        config.decisionEngine.maxRiskLevel
      );
    }
    if (config.decisionEngine.approvalTimeoutMs <= 0) {
      throw new ConfigValidationError(
        'Approval timeout must be positive',
        'decisionEngine.approvalTimeoutMs',
        config.decisionEngine.approvalTimeoutMs
      );
    }

    // Plugins
    if (!config.plugins) {
      throw new ConfigValidationError('Plugins configuration is required', 'plugins');
    }

    // Rules
    if (!Array.isArray(config.rules)) {
      throw new ConfigValidationError('Rules must be an array', 'rules', config.rules);
    }

    // Monitoring
    if (!config.monitoring) {
      throw new ConfigValidationError('Monitoring configuration is required', 'monitoring');
    }
    if (config.monitoring.healthCheckIntervalMs <= 0) {
      throw new ConfigValidationError(
        'Health check interval must be positive',
        'monitoring.healthCheckIntervalMs',
        config.monitoring.healthCheckIntervalMs
      );
    }
    if (config.monitoring.errorThreshold <= 0) {
      throw new ConfigValidationError(
        'Error threshold must be positive',
        'monitoring.errorThreshold',
        config.monitoring.errorThreshold
      );
    }

    // Optional API validation
    if (config.api?.enabled) {
      if (!config.api.port || config.api.port < 1 || config.api.port > 65535) {
        throw new ConfigValidationError(
          'API port must be between 1 and 65535',
          'api.port',
          config.api.port
        );
      }
      if (!config.api.host) {
        throw new ConfigValidationError('API host is required when API is enabled', 'api.host');
      }
    }

    // Optional logging validation
    if (config.logging) {
      const validLevels = ['debug', 'info', 'warn', 'error'];
      if (!validLevels.includes(config.logging.level)) {
        throw new ConfigValidationError(
          `Log level must be one of: ${validLevels.join(', ')}`,
          'logging.level',
          config.logging.level
        );
      }
    }

    // Optional auth validation
    if (config.auth?.enabled) {
      const validTypes = ['jwt', 'api-key', 'none'];
      if (!validTypes.includes(config.auth.type)) {
        throw new ConfigValidationError(
          `Auth type must be one of: ${validTypes.join(', ')}`,
          'auth.type',
          config.auth.type
        );
      }
      if (config.auth.type === 'jwt' && !config.auth.jwtSecret) {
        throw new ConfigValidationError(
          'JWT secret is required when using JWT authentication',
          'auth.jwtSecret'
        );
      }
      if (config.auth.type === 'api-key' && (!config.auth.apiKeys || config.auth.apiKeys.length === 0)) {
        throw new ConfigValidationError(
          'API keys are required when using API key authentication',
          'auth.apiKeys'
        );
      }
    }

    // Optional data retention validation
    if (config.dataRetention?.enabled) {
      if (config.dataRetention.sensorDataDays <= 0) {
        throw new ConfigValidationError(
          'Sensor data retention days must be positive',
          'dataRetention.sensorDataDays',
          config.dataRetention.sensorDataDays
        );
      }
      if (config.dataRetention.eventLogDays <= 0) {
        throw new ConfigValidationError(
          'Event log retention days must be positive',
          'dataRetention.eventLogDays',
          config.dataRetention.eventLogDays
        );
      }
      if (config.dataRetention.decisionHistoryDays <= 0) {
        throw new ConfigValidationError(
          'Decision history retention days must be positive',
          'dataRetention.decisionHistoryDays',
          config.dataRetention.decisionHistoryDays
        );
      }
    }
  }

  /**
   * Convert ConfigFile to AgentOrchestratorConfig
   */
  static toOrchestratorConfig(config: ConfigFile): AgentOrchestratorConfig {
    return {
      dataStoragePath: config.storage.dataPath,
      eventStorePath: config.storage.eventPath,
      decisionEngine: config.decisionEngine,
      plugins: config.plugins,
      rules: config.rules,
      healthCheckIntervalMs: config.monitoring.healthCheckIntervalMs,
      errorThreshold: config.monitoring.errorThreshold
    };
  }

  /**
   * Load default configuration for environment
   */
  static getDefaultConfig(environment: 'development' | 'production' | 'test'): ConfigFile {
    const baseConfig: ConfigFile = {
      version: '1.0.0',
      environment,
      storage: {
        dataPath: environment === 'production' ? './data/propace.db' : ':memory:',
        eventPath: environment === 'production' ? './data/events.db' : ':memory:'
      },
      decisionEngine: {
        defaultAutonomyLevel: AutonomyLevel.APPROVAL_REQUIRED,
        maxRiskLevel: RiskLevel.MEDIUM,
        approvalTimeoutMs: 300000 // 5 minutes
      },
      plugins: {},
      rules: [],
      monitoring: {
        healthCheckIntervalMs: 30000, // 30 seconds
        errorThreshold: 100
      },
      api: {
        enabled: true,
        port: 3000,
        host: '0.0.0.0',
        cors: {
          enabled: true,
          origins: ['http://localhost:3001']
        },
        rateLimit: {
          enabled: true,
          windowMs: 60000, // 1 minute
          maxRequests: 100
        }
      },
      logging: {
        level: environment === 'production' ? 'info' : 'debug',
        file: {
          enabled: environment === 'production',
          path: './logs/propace.log',
          maxSize: '10m',
          maxFiles: 5
        },
        console: {
          enabled: true,
          colorize: environment !== 'production'
        }
      },
      auth: {
        enabled: environment === 'production',
        type: 'api-key',
        apiKeys: []
      },
      dataRetention: {
        enabled: environment === 'production',
        sensorDataDays: 90,
        eventLogDays: 30,
        decisionHistoryDays: 365
      },
      voice: {
        enabled: false, // Disabled by default, enable via config
        iceServers: [
          {
            urls: 'stun:stun.l.google.com:19302'
          }
        ],
        tts: {
          voice: 'onyx',
          cacheSize: 100,
          cacheTTL: 3600000 // 1 hour
        },
        stt: {
          language: 'en',
          chunkDuration: 2000 // 2 seconds
        }
      }
    };

    return baseConfig;
  }

  /**
   * Load configuration with environment fallback
   */
  static async load(configPath?: string): Promise<ConfigFile> {
    // Try to load from file if provided
    if (configPath) {
      return this.loadFromFile(configPath);
    }

    // Try to load from environment variable
    const envConfigPath = process.env.PROPACE_CONFIG;
    if (envConfigPath) {
      return this.loadFromFile(envConfigPath);
    }

    // Try to load from default locations
    const defaultPaths = [
      './config/propace.json',
      './propace.config.json',
      '/etc/propace/config.json'
    ];

    for (const defaultPath of defaultPaths) {
      if (fs.existsSync(defaultPath)) {
        return this.loadFromFile(defaultPath);
      }
    }

    // Fall back to default config for current environment
    const environment = (process.env.NODE_ENV as any) || 'development';
    console.warn(`No configuration file found, using default ${environment} configuration`);
    return this.getDefaultConfig(environment);
  }
}
