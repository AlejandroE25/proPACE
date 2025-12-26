/**
 * Production Logger
 *
 * File-based logging with rotation, multiple transports, and structured logging.
 * Uses Winston for production-grade logging capabilities.
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ConfigFile } from '../config/productionConfig';

/**
 * Logger instance
 */
let logger: winston.Logger | null = null;

/**
 * Initialize production logger
 */
export function initializeLogger(config: ConfigFile): winston.Logger {
  const transports: winston.transport[] = [];

  // Console transport
  if (config.logging?.console?.enabled) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          config.logging.console.colorize
            ? winston.format.colorize()
            : winston.format.uncolorize(),
          winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
            let log = `${timestamp} [${level}] ${message}`;

            // Add metadata if present
            if (Object.keys(meta).length > 0) {
              log += ` ${JSON.stringify(meta)}`;
            }

            // Add stack trace if present
            if (stack) {
              log += `\n${stack}`;
            }

            return log;
          })
        )
      })
    );
  }

  // File transport with rotation
  if (config.logging?.file?.enabled && config.logging.file.path) {
    // Parse maxSize (e.g., "10m" -> "10m", "1g" -> "1g")
    const maxSize = config.logging.file.maxSize || '10m';

    transports.push(
      new DailyRotateFile({
        filename: config.logging.file.path.replace('.log', '-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize,
        maxFiles: config.logging.file.maxFiles || 5,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      })
    );

    // Separate error log file
    transports.push(
      new DailyRotateFile({
        filename: config.logging.file.path.replace('.log', '-error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        maxSize,
        maxFiles: config.logging.file.maxFiles || 5,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      })
    );
  }

  // Create logger
  logger = winston.createLogger({
    level: config.logging?.level || 'info',
    transports,
    exitOnError: false
  });

  return logger;
}

/**
 * Get logger instance
 */
export function getLogger(): winston.Logger {
  if (!logger) {
    // Create default console logger if not initialized
    logger = winston.createLogger({
      level: 'info',
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.errors({ stack: true }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `${timestamp} [${level}] ${message}`;
            })
          )
        })
      ]
    });
  }

  return logger;
}

/**
 * Structured logging helpers
 */
export const Logger = {
  /**
   * Debug log
   */
  debug(message: string, meta?: Record<string, any>): void {
    getLogger().debug(message, meta);
  },

  /**
   * Info log
   */
  info(message: string, meta?: Record<string, any>): void {
    getLogger().info(message, meta);
  },

  /**
   * Warning log
   */
  warn(message: string, meta?: Record<string, any>): void {
    getLogger().warn(message, meta);
  },

  /**
   * Error log
   */
  error(message: string, error?: Error, meta?: Record<string, any>): void {
    const logData = {
      ...meta,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined
    };
    getLogger().error(message, logData);
  },

  /**
   * Component-specific logging
   */
  component(component: string) {
    return {
      debug: (message: string, meta?: Record<string, any>) => {
        getLogger().debug(message, { component, ...meta });
      },
      info: (message: string, meta?: Record<string, any>) => {
        getLogger().info(message, { component, ...meta });
      },
      warn: (message: string, meta?: Record<string, any>) => {
        getLogger().warn(message, { component, ...meta });
      },
      error: (message: string, error?: Error, meta?: Record<string, any>) => {
        Logger.error(message, error, { component, ...meta });
      }
    };
  },

  /**
   * Performance logging
   */
  perf(operation: string, duration: number, meta?: Record<string, any>): void {
    getLogger().info(`[PERF] ${operation}`, {
      duration,
      ...meta
    });
  },

  /**
   * Audit logging
   */
  audit(action: string, userId?: string, meta?: Record<string, any>): void {
    getLogger().info(`[AUDIT] ${action}`, {
      userId,
      timestamp: new Date().toISOString(),
      ...meta
    });
  },

  /**
   * Shutdown logger
   */
  shutdown(): Promise<void> {
    if (logger) {
      return new Promise((resolve) => {
        logger!.on('finish', () => {
          resolve();
        });
        logger!.end();
      });
    }
    return Promise.resolve();
  }
};
