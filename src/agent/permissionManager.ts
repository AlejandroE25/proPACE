/**
 * Permission Manager
 *
 * Manages permission classification and user approval for state-changing operations.
 * Auto-approves read-only operations and ALL memory operations.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  PermissionLevel,
  PermissionRequest,
  PermissionResponse
} from '../types/agent';
import { PluginCapability } from '../types/plugin';

export class PermissionManager extends EventEmitter {
  /** Active permission requests awaiting user response */
  private pendingRequests: Map<string, PermissionRequest>;

  /** Permission timeout in milliseconds */
  private requestTimeout: number;

  /** Max requests per minute per client */
  private rateLimitMax: number;

  /** Request counts per client (for rate limiting) */
  private requestCounts: Map<string, { count: number; resetAt: Date }>;

  constructor(requestTimeout: number = 30000, rateLimitMax: number = 10) {
    super();
    this.pendingRequests = new Map();
    this.requestTimeout = requestTimeout;
    this.rateLimitMax = rateLimitMax;
    this.requestCounts = new Map();

    logger.info('Permission manager initialized');
  }

  /**
   * Classify tool permission level based on capabilities
   */
  classify(
    toolName: string,
    capabilities: PluginCapability[]
  ): PermissionLevel {
    // Memory operations are ALWAYS auto-approved (system-owned)
    if (
      toolName === 'store_memory' ||
      toolName === 'search_memory' ||
      toolName === 'recall_memory' ||
      toolName === 'delete_memory'
    ) {
      logger.debug(`Auto-approving memory operation: ${toolName}`);
      return PermissionLevel.AUTO_APPROVE;
    }

    // Check capabilities
    if (capabilities.includes(PluginCapability.READ_ONLY)) {
      return PermissionLevel.AUTO_APPROVE;
    }

    if (capabilities.includes(PluginCapability.STATE_CHANGING)) {
      return PermissionLevel.REQUIRE_CONFIRMATION;
    }

    // Default to require confirmation for safety
    logger.warn(`Unknown capability for tool ${toolName}, requiring confirmation`);
    return PermissionLevel.REQUIRE_CONFIRMATION;
  }

  /**
   * Check if operation is auto-approved
   */
  isAutoApproved(toolName: string, capabilities: PluginCapability[]): boolean {
    return this.classify(toolName, capabilities) === PermissionLevel.AUTO_APPROVE;
  }

  /**
   * Request permission from user
   */
  async requestPermission(
    clientId: string,
    stepId: string,
    toolName: string,
    description: string,
    parameters: Record<string, any>,
    level: PermissionLevel
  ): Promise<PermissionResponse> {
    // Check rate limit
    if (!this.checkRateLimit(clientId)) {
      throw new Error('Permission request rate limit exceeded');
    }

    const requestId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.requestTimeout);

    const request: PermissionRequest = {
      id: requestId,
      clientId,
      stepId,
      toolName,
      description,
      parameters,
      level,
      requestedAt: now,
      expiresAt
    };

    this.pendingRequests.set(requestId, request);

    logger.info(`Permission requested: ${requestId} for ${toolName}`, {
      clientId,
      stepId
    });

    // Emit event for WebSocket to send to client
    this.emit('permission_request', request);

    // Wait for response or timeout
    return new Promise((resolve, _reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        logger.warn(`Permission request ${requestId} timed out`);

        resolve({
          requestId,
          approved: false,
          respondedAt: new Date(),
          reason: 'Request timed out'
        });
      }, this.requestTimeout);

      // Listen for response
      const responseHandler = (response: PermissionResponse) => {
        if (response.requestId === requestId) {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          this.removeListener('permission_response', responseHandler);

          logger.info(`Permission ${response.approved ? 'granted' : 'denied'}: ${requestId}`);
          resolve(response);
        }
      };

      this.on('permission_response', responseHandler);
    });
  }

  /**
   * Respond to permission request (called when user responds)
   */
  respondToPermission(requestId: string, approved: boolean, reason?: string): void {
    const request = this.pendingRequests.get(requestId);

    if (!request) {
      logger.warn(`Permission response for unknown request: ${requestId}`);
      return;
    }

    const response: PermissionResponse = {
      requestId,
      approved,
      respondedAt: new Date(),
      reason
    };

    this.emit('permission_response', response);
  }

  /**
   * Check rate limit for client
   */
  private checkRateLimit(clientId: string): boolean {
    const now = new Date();
    const entry = this.requestCounts.get(clientId);

    if (!entry || entry.resetAt < now) {
      // Reset or create new entry
      this.requestCounts.set(clientId, {
        count: 1,
        resetAt: new Date(now.getTime() + 60000) // 1 minute
      });
      return true;
    }

    if (entry.count >= this.rateLimitMax) {
      logger.warn(`Rate limit exceeded for client ${clientId}`);
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Get pending request
   */
  getPendingRequest(requestId: string): PermissionRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  /**
   * Get all pending requests for a client
   */
  getPendingRequestsForClient(clientId: string): PermissionRequest[] {
    return Array.from(this.pendingRequests.values()).filter(
      (req) => req.clientId === clientId
    );
  }

  /**
   * Cancel a pending request
   */
  cancelRequest(requestId: string): void {
    const request = this.pendingRequests.get(requestId);

    if (request) {
      this.pendingRequests.delete(requestId);
      logger.info(`Permission request cancelled: ${requestId}`);

      this.emit('permission_response', {
        requestId,
        approved: false,
        respondedAt: new Date(),
        reason: 'Cancelled'
      });
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    pendingRequests: number;
    requestsByClient: Record<string, number>;
  } {
    const pendingRequests = this.pendingRequests.size;
    const requestsByClient: Record<string, number> = {};

    for (const request of this.pendingRequests.values()) {
      requestsByClient[request.clientId] =
        (requestsByClient[request.clientId] || 0) + 1;
    }

    return {
      pendingRequests,
      requestsByClient
    };
  }
}
