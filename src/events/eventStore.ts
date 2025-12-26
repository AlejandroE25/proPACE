/**
 * EventStore Implementation
 *
 * SQLite-based event persistence with time-series queries,
 * filtering, and automatic cleanup.
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger';
import {
  Event,
  EventType,
  EventPriority,
  EventQuery,
  EventStatistics
} from './types';
import fs from 'fs';
import path from 'path';

export class EventStore {
  private db: Database.Database;
  // @ts-ignore - Stored for future use (backup, migration, etc.)
  private dbPath: string;

  constructor(dbPath: string = './data/events.db') {
    this.dbPath = dbPath;

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        logger.error('Failed to create events database directory', { error: err, dir });
        throw new Error(`Cannot create database directory: ${dir}`);
      }
    }

    try {
      this.db = new Database(dbPath);
      this.initializeSchema();

      logger.info('EventStore initialized', { dbPath });
    } catch (err) {
      logger.error('Failed to initialize EventStore', { error: err, dbPath });
      throw err;
    }
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    // Create events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        source TEXT NOT NULL,
        payload TEXT NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
      CREATE INDEX IF NOT EXISTS idx_events_priority ON events(priority);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_events_type_timestamp ON events(type, timestamp DESC);
    `);

    logger.debug('EventStore schema initialized');
  }

  /**
   * Store an event
   */
  store(event: Event): boolean {
    // Validate event type
    if (!Object.values(EventType).includes(event.type)) {
      throw new Error(`Invalid event type: ${event.type}`);
    }

    if (!event.id) {
      throw new Error('Event must have an ID');
    }

    if (!event.timestamp) {
      throw new Error('Event must have a timestamp');
    }

    const priority = event.priority || EventPriority.MEDIUM;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO events (id, type, priority, source, payload, metadata, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        event.id,
        event.type,
        priority,
        event.source,
        JSON.stringify(event.payload),
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.timestamp.getTime()
      );

      logger.debug('Event stored', { id: event.id, type: event.type });

      return true;
    } catch (err) {
      logger.error('Error storing event', { error: err, event });
      throw err;
    }
  }

  /**
   * Query events with filters
   */
  query(filters: EventQuery = {}): Event[] {
    const conditions: string[] = [];
    const params: any[] = [];

    // Build WHERE clause
    if (filters.id) {
      conditions.push('id = ?');
      params.push(filters.id);
    }

    if (filters.type) {
      conditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters.source) {
      conditions.push('source = ?');
      params.push(filters.source);
    }

    if (filters.priority) {
      conditions.push('priority = ?');
      params.push(filters.priority);
    }

    if (filters.after) {
      conditions.push('timestamp > ?');
      params.push(filters.after.getTime());
    }

    if (filters.before) {
      conditions.push('timestamp < ?');
      params.push(filters.before.getTime());
    }

    // Build query
    let query = 'SELECT * FROM events';

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // Order by timestamp descending (newest first)
    query += ' ORDER BY timestamp DESC';

    // Apply limit
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    try {
      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];

      // Parse rows to Event objects
      const events: Event[] = rows.map(row => ({
        id: row.id,
        type: row.type as EventType,
        priority: row.priority as EventPriority,
        source: row.source,
        payload: JSON.parse(row.payload),
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        timestamp: new Date(row.timestamp)
      }));

      logger.debug('Events queried', {
        filters,
        resultCount: events.length
      });

      return events;
    } catch (err) {
      logger.error('Error querying events', { error: err, filters });
      throw err;
    }
  }

  /**
   * Delete events older than specified date
   */
  deleteOlderThan(date: Date): number {
    try {
      const stmt = this.db.prepare('DELETE FROM events WHERE timestamp < ?');
      const result = stmt.run(date.getTime());

      logger.info('Old events deleted', {
        count: result.changes,
        beforeDate: date
      });

      return result.changes;
    } catch (err) {
      logger.error('Error deleting old events', { error: err, date });
      throw err;
    }
  }

  /**
   * Clear all events
   */
  clear(): number {
    try {
      const stmt = this.db.prepare('DELETE FROM events');
      const result = stmt.run();

      logger.warn('All events cleared', { count: result.changes });

      return result.changes;
    } catch (err) {
      logger.error('Error clearing events', { error: err });
      throw err;
    }
  }

  /**
   * Get event statistics
   */
  getStatistics(): EventStatistics {
    try {
      // Total events
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
      const totalResult = totalStmt.get() as any;
      const totalEvents = totalResult.count;

      // Events by type
      const byTypeStmt = this.db.prepare(`
        SELECT type, COUNT(*) as count FROM events GROUP BY type
      `);
      const byTypeResults = byTypeStmt.all() as any[];
      const byType: Record<string, number> = {};
      for (const row of byTypeResults) {
        byType[row.type] = row.count;
      }

      // Events by source
      const bySourceStmt = this.db.prepare(`
        SELECT source, COUNT(*) as count FROM events GROUP BY source
      `);
      const bySourceResults = bySourceStmt.all() as any[];
      const bySource: Record<string, number> = {};
      for (const row of bySourceResults) {
        bySource[row.source] = row.count;
      }

      // Events by priority
      const byPriorityStmt = this.db.prepare(`
        SELECT priority, COUNT(*) as count FROM events GROUP BY priority
      `);
      const byPriorityResults = byPriorityStmt.all() as any[];
      const byPriority: Record<string, number> = {};
      for (const row of byPriorityResults) {
        byPriority[row.priority] = row.count;
      }

      // Oldest and newest events
      const oldestStmt = this.db.prepare(
        'SELECT MIN(timestamp) as timestamp FROM events'
      );
      const oldestResult = oldestStmt.get() as any;
      const oldestEvent = oldestResult.timestamp
        ? new Date(oldestResult.timestamp)
        : undefined;

      const newestStmt = this.db.prepare(
        'SELECT MAX(timestamp) as timestamp FROM events'
      );
      const newestResult = newestStmt.get() as any;
      const newestEvent = newestResult.timestamp
        ? new Date(newestResult.timestamp)
        : undefined;

      return {
        totalEvents,
        byType,
        bySource,
        byPriority,
        oldestEvent,
        newestEvent
      };
    } catch (err) {
      logger.error('Error getting statistics', { error: err });
      throw err;
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    try {
      this.db.close();
      logger.info('EventStore closed');
    } catch (err) {
      logger.error('Error closing EventStore', { error: err });
      throw err;
    }
  }
}
