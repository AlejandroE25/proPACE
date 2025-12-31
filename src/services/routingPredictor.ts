import { SessionPattern, SubsystemType } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Routing Predictor
 * Learns session patterns and predicts next likely subsystem
 * Enables pre-warming and reduced latency
 */
export class RoutingPredictor {
  private sessions: Map<string, SessionPattern>;
  private enabled: boolean;

  // Common transition patterns (can be learned over time)
  private readonly COMMON_TRANSITIONS: Record<SubsystemType, SubsystemType[]> = {
    weather: ['news', 'claude'], // After weather, users often check news
    news: ['weather', 'claude'], // After news, might check weather
    wolfram: ['claude', 'wolfram'], // Math questions often lead to more math
    google_search: ['claude', 'google_search'], // Knowledge queries often lead to follow-ups
    claude: ['weather', 'news', 'wolfram', 'google_search'], // General convo can go anywhere
  };

  constructor() {
    this.sessions = new Map();
    this.enabled = config.enableSessionLearning;

    // Periodic cleanup of old sessions
    setInterval(() => {
      this.cleanOldSessions();
    }, 300000); // Every 5 minutes
  }

  /**
   * Record subsystem usage for a client
   */
  record(clientId: string, subsystem: SubsystemType): void {
    if (!this.enabled) return;

    let pattern = this.sessions.get(clientId);

    if (!pattern) {
      pattern = {
        clientId,
        subsystemHistory: [],
        lastQuery: new Date(),
      };
      this.sessions.set(clientId, pattern);
    }

    // Add to history (keep last 10)
    pattern.subsystemHistory.push(subsystem);
    if (pattern.subsystemHistory.length > 10) {
      pattern.subsystemHistory.shift();
    }

    pattern.lastQuery = new Date();

    // Predict next subsystem
    pattern.predictedNext = this.predictNext(pattern.subsystemHistory);

    logger.debug(
      `Session pattern updated for ${clientId}: ${subsystem} → predicted: ${pattern.predictedNext}`
    );
  }

  /**
   * Predict next likely subsystem based on history
   */
  private predictNext(history: SubsystemType[]): SubsystemType | undefined {
    if (history.length === 0) return undefined;

    const lastSubsystem = history[history.length - 1];

    // Check for patterns in recent history
    if (history.length >= 3) {
      const recent = history.slice(-3);

      // If last 2 queries were the same, likely to continue
      if (recent[1] === recent[2] && recent[1] === 'wolfram') {
        return 'wolfram'; // Math questions often cluster
      }

      // Weather → News pattern
      if (recent[1] === 'weather' && recent[2] === 'weather') {
        return 'news';
      }
    }

    // Use common transitions
    const possibleNext = this.COMMON_TRANSITIONS[lastSubsystem];
    if (possibleNext && possibleNext.length > 0) {
      return possibleNext[0]; // Return most common transition
    }

    return undefined;
  }

  /**
   * Get predicted subsystem for a client
   */
  getPrediction(clientId: string): SubsystemType | undefined {
    if (!this.enabled) return undefined;

    const pattern = this.sessions.get(clientId);
    return pattern?.predictedNext;
  }

  /**
   * Get session pattern for a client
   */
  getSession(clientId: string): SessionPattern | undefined {
    return this.sessions.get(clientId);
  }

  /**
   * Check if client has a strong pattern (for pre-warming)
   */
  hasStrongPattern(clientId: string): boolean {
    const pattern = this.sessions.get(clientId);
    if (!pattern || pattern.subsystemHistory.length < 3) {
      return false;
    }

    // Check if user tends to use same subsystem repeatedly
    const recent = pattern.subsystemHistory.slice(-3);
    const uniqueRecent = new Set(recent);

    return uniqueRecent.size === 1; // All recent queries to same subsystem
  }

  /**
   * Clean up old sessions (inactive for >1 hour)
   */
  private cleanOldSessions(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    let cleaned = 0;

    for (const [clientId, pattern] of this.sessions.entries()) {
      if (pattern.lastQuery < oneHourAgo) {
        this.sessions.delete(clientId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} old session patterns`);
    }
  }

  /**
   * Get statistics about session patterns
   */
  getStats(): {
    activeSessions: number;
    totalQueries: number;
    predictions: Record<SubsystemType, number>;
  } {
    const stats = {
      activeSessions: this.sessions.size,
      totalQueries: 0,
      predictions: {
        weather: 0,
        news: 0,
        wolfram: 0,
        claude: 0,
      } as Record<SubsystemType, number>,
    };

    for (const pattern of this.sessions.values()) {
      stats.totalQueries += pattern.subsystemHistory.length;

      if (pattern.predictedNext) {
        stats.predictions[pattern.predictedNext]++;
      }
    }

    return stats;
  }

  /**
   * Clear all session data
   */
  clear(): void {
    this.sessions.clear();
    logger.debug('All session patterns cleared');
  }
}
