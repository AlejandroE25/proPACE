/**
 * Audit Logger
 *
 * Comprehensive action logging for agent system.
 * Tracks all queries, tool executions, permissions, and cross-client interactions.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger';
import {
  AuditEntry,
  AuditEventType,
  AuditQueryCriteria
} from '../types/agent';

export class AuditLogger {
  private db: Database.Database;
  private retentionDays: number;

  constructor(dbPath: string, retentionDays: number = 30) {
    // Ensure database directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.retentionDays = retentionDays;
    this.initializeDatabase();

    // Setup automatic cleanup
    this.setupAutomaticCleanup();

    logger.info(`Audit logger initialized at ${dbPath}`);
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        client_id TEXT NOT NULL,
        user_id TEXT,
        event_type TEXT NOT NULL,
        correlation_id TEXT,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_log(client_id);
      CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_log(correlation_id);
    `);
  }

  /**
   * Log an audit event
   */
  log(
    clientId: string,
    eventType: AuditEventType,
    data: Record<string, any>,
    correlationId?: string,
    userId?: string
  ): AuditEntry {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date(),
      clientId,
      userId,
      eventType,
      data,
      correlationId
    };

    const stmt = this.db.prepare(`
      INSERT INTO audit_log (id, timestamp, client_id, user_id, event_type, correlation_id, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.timestamp.toISOString(),
      entry.clientId,
      entry.userId || null,
      entry.eventType,
      entry.correlationId || null,
      JSON.stringify(entry.data)
    );

    logger.debug(`Audit log: ${eventType} for client ${clientId}`, {
      correlationId,
      data
    });

    return entry;
  }

  /**
   * Query audit log
   */
  query(criteria: AuditQueryCriteria = {}): AuditEntry[] {
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];

    if (criteria.clientId) {
      sql += ' AND client_id = ?';
      params.push(criteria.clientId);
    }

    if (criteria.eventType) {
      sql += ' AND event_type = ?';
      params.push(criteria.eventType);
    }

    if (criteria.correlationId) {
      sql += ' AND correlation_id = ?';
      params.push(criteria.correlationId);
    }

    if (criteria.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(criteria.startTime.toISOString());
    }

    if (criteria.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(criteria.endTime.toISOString());
    }

    sql += ' ORDER BY timestamp DESC';

    if (criteria.limit) {
      sql += ' LIMIT ?';
      params.push(criteria.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      clientId: row.client_id,
      userId: row.user_id || undefined,
      eventType: row.event_type as AuditEventType,
      data: JSON.parse(row.data),
      correlationId: row.correlation_id || undefined
    }));
  }

  /**
   * Get entries by correlation ID
   */
  getByCorrelationId(correlationId: string): AuditEntry[] {
    return this.query({ correlationId });
  }

  /**
   * Get recent entries for a client
   */
  getRecentForClient(clientId: string, limit: number = 50): AuditEntry[] {
    return this.query({ clientId, limit });
  }

  /**
   * Get all entries for a specific event type
   */
  getByEventType(eventType: AuditEventType, limit: number = 100): AuditEntry[] {
    return this.query({ eventType, limit });
  }

  /**
   * Get count of entries
   */
  count(criteria: AuditQueryCriteria = {}): number {
    let sql = 'SELECT COUNT(*) as count FROM audit_log WHERE 1=1';
    const params: any[] = [];

    if (criteria.clientId) {
      sql += ' AND client_id = ?';
      params.push(criteria.clientId);
    }

    if (criteria.eventType) {
      sql += ' AND event_type = ?';
      params.push(criteria.eventType);
    }

    if (criteria.correlationId) {
      sql += ' AND correlation_id = ?';
      params.push(criteria.correlationId);
    }

    if (criteria.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(criteria.startTime.toISOString());
    }

    if (criteria.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(criteria.endTime.toISOString());
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Delete old entries based on retention policy
   */
  cleanup(): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const stmt = this.db.prepare(`
      DELETE FROM audit_log
      WHERE timestamp < ?
    `);

    const result = stmt.run(cutoffDate.toISOString());
    const deletedCount = result.changes;

    if (deletedCount > 0) {
      logger.info(`Audit log cleanup: deleted ${deletedCount} old entries`);
    }

    return deletedCount;
  }

  /**
   * Setup automatic cleanup (daily)
   */
  private setupAutomaticCleanup(): void {
    // Run cleanup daily
    setInterval(() => {
      this.cleanup();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalEntries: number;
    entriesByEventType: Record<string, number>;
    uniqueClients: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const totalEntries = this.count();

    // Count by event type
    const eventTypeStmt = this.db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM audit_log
      GROUP BY event_type
    `);
    const eventTypeCounts = eventTypeStmt.all() as Array<{
      event_type: string;
      count: number;
    }>;
    const entriesByEventType: Record<string, number> = {};
    for (const row of eventTypeCounts) {
      entriesByEventType[row.event_type] = row.count;
    }

    // Count unique clients
    const clientStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT client_id) as count
      FROM audit_log
    `);
    const uniqueClients = (clientStmt.get() as { count: number }).count;

    // Get oldest and newest entries
    const rangeStmt = this.db.prepare(`
      SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest
      FROM audit_log
    `);
    const range = rangeStmt.get() as { oldest: string | null; newest: string | null };

    return {
      totalEntries,
      entriesByEventType,
      uniqueClients,
      oldestEntry: range.oldest ? new Date(range.oldest) : undefined,
      newestEntry: range.newest ? new Date(range.newest) : undefined
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Audit logger closed');
  }
}
