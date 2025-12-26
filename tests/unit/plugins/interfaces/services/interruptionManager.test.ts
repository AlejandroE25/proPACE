/**
 * InterruptionManager Test Suite
 *
 * Tests response session tracking and interruption handling
 * to prevent self-interruption while allowing user interruptions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterruptionManager, ResponseSession, SessionStatus } from '../../../../../src/plugins/interfaces/services/interruptionManager';

describe('InterruptionManager', () => {
  let manager: InterruptionManager;

  beforeEach(() => {
    manager = new InterruptionManager();
  });

  describe('Session Creation', () => {
    it('should create a new session with unique responseId', () => {
      const session1 = manager.createSession('client-1');
      const session2 = manager.createSession('client-2');

      expect(session1.responseId).toBeDefined();
      expect(session2.responseId).toBeDefined();
      expect(session1.responseId).not.toBe(session2.responseId);
    });

    it('should initialize session with generating status', () => {
      const session = manager.createSession('client-1');

      expect(session.status).toBe(SessionStatus.GENERATING);
    });

    it('should include AbortController in session', () => {
      const session = manager.createSession('client-1');

      expect(session.abortController).toBeDefined();
      expect(session.abortController.signal).toBeDefined();
    });

    it('should track session start time', () => {
      const before = Date.now();
      const session = manager.createSession('client-1');
      const after = Date.now();

      expect(session.startTime).toBeGreaterThanOrEqual(before);
      expect(session.startTime).toBeLessThanOrEqual(after);
    });

    it('should replace previous session for same client', () => {
      const session1 = manager.createSession('client-1');
      const session2 = manager.createSession('client-1');

      expect(session1.responseId).not.toBe(session2.responseId);

      // Old session should no longer be active
      expect(manager.isActiveResponse('client-1', session1.responseId)).toBe(false);
      expect(manager.isActiveResponse('client-1', session2.responseId)).toBe(true);
    });
  });

  describe('Session Retrieval', () => {
    it('should retrieve active session by client ID', () => {
      const created = manager.createSession('client-1');
      const retrieved = manager.getSession('client-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.responseId).toBe(created.responseId);
    });

    it('should return undefined for non-existent client', () => {
      const session = manager.getSession('non-existent-client');

      expect(session).toBeUndefined();
    });

    it('should return undefined after session is cleared', () => {
      manager.createSession('client-1');
      manager.clearSession('client-1');

      const session = manager.getSession('client-1');
      expect(session).toBeUndefined();
    });
  });

  describe('Active Response Detection', () => {
    it('should detect active response', () => {
      const session = manager.createSession('client-1');

      expect(manager.isActiveResponse('client-1', session.responseId)).toBe(true);
    });

    it('should return false for wrong responseId', () => {
      manager.createSession('client-1');

      expect(manager.isActiveResponse('client-1', 'wrong-id')).toBe(false);
    });

    it('should return false for wrong client ID', () => {
      const session = manager.createSession('client-1');

      expect(manager.isActiveResponse('client-2', session.responseId)).toBe(false);
    });

    it('should return false after interruption', () => {
      const session = manager.createSession('client-1');
      manager.interrupt('client-1');

      expect(manager.isActiveResponse('client-1', session.responseId)).toBe(false);
    });

    it('should return false after completion', () => {
      const session = manager.createSession('client-1');
      manager.completeSession('client-1');

      expect(manager.isActiveResponse('client-1', session.responseId)).toBe(false);
    });
  });

  describe('Interruption', () => {
    it('should interrupt active session', () => {
      const session = manager.createSession('client-1');

      manager.interrupt('client-1');

      const retrieved = manager.getSession('client-1');
      expect(retrieved?.status).toBe(SessionStatus.INTERRUPTED);
    });

    it('should abort session via AbortController', () => {
      const session = manager.createSession('client-1');
      const abortSpy = vi.spyOn(session.abortController, 'abort');

      manager.interrupt('client-1');

      expect(abortSpy).toHaveBeenCalled();
    });

    it('should handle interruption of non-existent session', () => {
      expect(() => {
        manager.interrupt('non-existent-client');
      }).not.toThrow();
    });

    it('should mark session as no longer active after interruption', () => {
      const session = manager.createSession('client-1');

      manager.interrupt('client-1');

      expect(manager.isActiveResponse('client-1', session.responseId)).toBe(false);
    });

    it('should allow multiple interruptions without error', () => {
      manager.createSession('client-1');

      expect(() => {
        manager.interrupt('client-1');
        manager.interrupt('client-1');
        manager.interrupt('client-1');
      }).not.toThrow();
    });
  });

  describe('Session Completion', () => {
    it('should mark session as completed', () => {
      manager.createSession('client-1');

      manager.completeSession('client-1');

      const session = manager.getSession('client-1');
      expect(session?.status).toBe(SessionStatus.COMPLETED);
    });

    it('should mark session as no longer active after completion', () => {
      const session = manager.createSession('client-1');

      manager.completeSession('client-1');

      expect(manager.isActiveResponse('client-1', session.responseId)).toBe(false);
    });

    it('should handle completion of non-existent session', () => {
      expect(() => {
        manager.completeSession('non-existent-client');
      }).not.toThrow();
    });
  });

  describe('Session Clearing', () => {
    it('should remove session from tracking', () => {
      manager.createSession('client-1');

      manager.clearSession('client-1');

      expect(manager.getSession('client-1')).toBeUndefined();
    });

    it('should handle clearing non-existent session', () => {
      expect(() => {
        manager.clearSession('non-existent-client');
      }).not.toThrow();
    });
  });

  describe('Status Updates', () => {
    it('should update session status', () => {
      manager.createSession('client-1');

      manager.updateStatus('client-1', SessionStatus.STREAMING);

      const session = manager.getSession('client-1');
      expect(session?.status).toBe(SessionStatus.STREAMING);
    });

    it('should handle status update for non-existent session', () => {
      expect(() => {
        manager.updateStatus('non-existent-client', SessionStatus.COMPLETED);
      }).not.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should track total sessions created', () => {
      manager.createSession('client-1');
      manager.createSession('client-2');
      manager.createSession('client-3');

      const stats = manager.getStatistics();
      expect(stats.totalSessions).toBe(3);
    });

    it('should track interrupted sessions', () => {
      manager.createSession('client-1');
      manager.interrupt('client-1');

      manager.createSession('client-2');
      manager.interrupt('client-2');

      const stats = manager.getStatistics();
      expect(stats.interruptedSessions).toBe(2);
    });

    it('should track completed sessions', () => {
      manager.createSession('client-1');
      manager.completeSession('client-1');

      manager.createSession('client-2');
      manager.completeSession('client-2');

      const stats = manager.getStatistics();
      expect(stats.completedSessions).toBe(2);
    });

    it('should track active sessions', () => {
      manager.createSession('client-1');
      manager.createSession('client-2');
      manager.createSession('client-3');

      manager.completeSession('client-1');

      const stats = manager.getStatistics();
      expect(stats.activeSessions).toBe(2);
    });

    it('should calculate average session duration', () => {
      manager.createSession('client-1');

      // Simulate time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(5000);

      manager.completeSession('client-1');

      vi.useRealTimers();

      const stats = manager.getStatistics();
      expect(stats.averageSessionDuration).toBeGreaterThan(0);
    });
  });

  describe('AbortSignal Integration', () => {
    it('should provide abort signal for session', () => {
      const session = manager.createSession('client-1');

      expect(session.abortController.signal.aborted).toBe(false);

      manager.interrupt('client-1');

      expect(session.abortController.signal.aborted).toBe(true);
    });

    it('should trigger abort listeners when interrupted', () => {
      const session = manager.createSession('client-1');
      const abortListener = vi.fn();

      session.abortController.signal.addEventListener('abort', abortListener);

      manager.interrupt('client-1');

      expect(abortListener).toHaveBeenCalled();
    });
  });

  describe('Concurrent Sessions', () => {
    it('should handle multiple clients simultaneously', () => {
      const session1 = manager.createSession('client-1');
      const session2 = manager.createSession('client-2');
      const session3 = manager.createSession('client-3');

      expect(manager.isActiveResponse('client-1', session1.responseId)).toBe(true);
      expect(manager.isActiveResponse('client-2', session2.responseId)).toBe(true);
      expect(manager.isActiveResponse('client-3', session3.responseId)).toBe(true);
    });

    it('should interrupt only specific client', () => {
      const session1 = manager.createSession('client-1');
      const session2 = manager.createSession('client-2');

      manager.interrupt('client-1');

      expect(manager.isActiveResponse('client-1', session1.responseId)).toBe(false);
      expect(manager.isActiveResponse('client-2', session2.responseId)).toBe(true);
    });
  });

  describe('Session Lifecycle', () => {
    it('should track complete lifecycle: create → streaming → complete', () => {
      const session = manager.createSession('client-1');

      expect(session.status).toBe(SessionStatus.GENERATING);

      manager.updateStatus('client-1', SessionStatus.STREAMING);
      expect(manager.getSession('client-1')?.status).toBe(SessionStatus.STREAMING);

      manager.completeSession('client-1');
      expect(manager.getSession('client-1')?.status).toBe(SessionStatus.COMPLETED);
    });

    it('should track complete lifecycle: create → streaming → interrupt', () => {
      const session = manager.createSession('client-1');

      expect(session.status).toBe(SessionStatus.GENERATING);

      manager.updateStatus('client-1', SessionStatus.STREAMING);
      expect(manager.getSession('client-1')?.status).toBe(SessionStatus.STREAMING);

      manager.interrupt('client-1');
      expect(manager.getSession('client-1')?.status).toBe(SessionStatus.INTERRUPTED);
    });
  });
});
