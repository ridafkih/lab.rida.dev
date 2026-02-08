import { TIMING } from "../config/constants";
import { CONTAINER_STATUS } from "../types/container";
import {
  claimPooledSession as claimFromDb,
  countPooledSessions,
  createPooledSession as createInDb,
  findPooledSessions,
} from "../repositories/pool.repository";
import { findAllProjects } from "../repositories/project.repository";
import { findContainersByProjectId } from "../repositories/container-definition.repository";
import { createSessionContainer } from "../repositories/container-session.repository";
import type { BrowserServiceManager } from "./browser-service.manager";
import type { SessionLifecycleManager } from "./session-lifecycle.manager";
import type { Session } from "@lab/database/schema/sessions";
import { logger } from "../logging";

interface PoolStats {
  available: number;
  target: number;
}

/**
 * Computes exponential backoff duration with a ceiling.
 */
function computeBackoffMs(failures: number, baseMs: number, maxMs: number): number {
  return Math.min(baseMs * Math.pow(2, failures), maxMs);
}

/**
 * Manages a pool of pre-warmed sessions for each project, converging toward a target size.
 * Reconciliation is serialized per-project via reconcileLocks to prevent concurrent fill/drain
 * operations from racing against each other.
 */
export class PoolManager {
  private readonly reconcileLocks = new Map<string, Promise<void>>();
  private readonly reconcileStartedAt = new Map<string, number>();

  constructor(
    private readonly poolSize: number,
    private readonly browserService: BrowserServiceManager,
    private readonly sessionLifecycle: SessionLifecycleManager,
  ) {}

  getTargetPoolSize(): number {
    return this.poolSize;
  }

  async getPoolStats(projectId: string): Promise<PoolStats> {
    const available = await countPooledSessions(projectId);
    return {
      available,
      target: this.getTargetPoolSize(),
    };
  }

  async claimPooledSession(projectId: string): Promise<Session | null> {
    if (this.getTargetPoolSize() === 0) {
      return null;
    }

    const session = await claimFromDb(projectId);

    if (session) {
      this.triggerReconcileInBackground(projectId, "claim");
    }

    return session;
  }

  triggerReconcileInBackground(projectId: string, reason: string): void {
    this.reconcilePool(projectId).catch((error) => {
      logger.error({
        event_name: "pool_manager.reconcile_background_failed",
        project_id: projectId,
        reason,
        error,
      });
    });
  }

  async createPooledSession(projectId: string): Promise<Session | null> {
    const containerDefinitions = await findContainersByProjectId(projectId);
    if (containerDefinitions.length === 0) {
      return null;
    }

    const session = await createInDb(projectId);

    await Promise.all(
      containerDefinitions.map((containerDefinition) =>
        createSessionContainer({
          sessionId: session.id,
          containerId: containerDefinition.id,
          runtimeId: "",
          status: CONTAINER_STATUS.STARTING,
        }),
      ),
    );

    try {
      await this.sessionLifecycle.initializeSession(session.id, projectId);

      try {
        await this.browserService.service.warmUpBrowser(session.id);
        logger.info({
          event_name: "pool_manager.pooled_session_created_and_warmed",
          project_id: projectId,
          session_id: session.id,
        });
      } catch (error) {
        logger.error({
          event_name: "pool_manager.warmup_failed",
          project_id: projectId,
          session_id: session.id,
          error,
        });
        logger.info({
          event_name: "pool_manager.pooled_session_created_without_warmup",
          project_id: projectId,
          session_id: session.id,
        });
      }

      return session;
    } catch (error) {
      logger.error({
        event_name: "pool_manager.initialize_pooled_session_failed",
        project_id: projectId,
        session_id: session.id,
        error,
      });
      return null;
    }
  }

  async reconcilePool(projectId: string): Promise<void> {
    const existing = this.reconcileLocks.get(projectId);
    if (existing) {
      const startedAt = this.reconcileStartedAt.get(projectId);
      if (startedAt && Date.now() - startedAt > TIMING.POOL_RECONCILIATION_TIMEOUT_MS) {
        logger.info({
          event_name: "pool_manager.reconcile_waiting_on_long_running_lock",
          project_id: projectId,
          lock_age_ms: Date.now() - startedAt,
        });
      }
      return existing;
    }

    const promise = Promise.race([
      this.doReconcile(projectId),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Pool reconciliation timeout for project ${projectId}`)),
          TIMING.POOL_RECONCILIATION_TIMEOUT_MS,
        ),
      ),
    ]).finally(() => {
      this.reconcileLocks.delete(projectId);
      this.reconcileStartedAt.delete(projectId);
    });

    this.reconcileStartedAt.set(projectId, Date.now());
    this.reconcileLocks.set(projectId, promise);
    return promise;
  }

  async reconcileAllPools(): Promise<void> {
    const projects = await findAllProjects();

    for (const project of projects) {
      try {
        await this.reconcilePool(project.id);
      } catch (error) {
        logger.error({
          event_name: "pool_manager.reconcile_project_failed",
          project_id: project.id,
          error,
        });
      }
    }
  }

  initialize(): void {
    logger.info({
      event_name: "pool_manager.initialize",
      target_size: this.getTargetPoolSize(),
    });
    this.reconcileAllPools().catch((error) =>
      logger.error({
        event_name: "pool_manager.initial_reconciliation_failed",
        error,
      }),
    );
  }

  /**
   * Attempts to create one pooled session. Returns the updated consecutive failure count.
   * On success, resets failures to 0. On failure, increments and applies backoff delay.
   */
  private async fillOne(projectId: string, consecutiveFailures: number): Promise<number> {
    const session = await this.createPooledSession(projectId);
    if (!session) {
      const failures = consecutiveFailures + 1;
      const delay = computeBackoffMs(
        failures,
        TIMING.POOL_BACKOFF_BASE_MS,
        TIMING.POOL_BACKOFF_MAX_MS,
      );
      logger.error({
        event_name: "pool_manager.fill_creation_failed",
        project_id: projectId,
        attempt: failures,
        backoff_ms: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
      return failures;
    }
    return 0;
  }

  /**
   * Removes excess pooled sessions beyond the target size.
   */
  private async drainExcess(projectId: string, excess: number): Promise<void> {
    logger.info({
      event_name: "pool_manager.drain_excess_start",
      project_id: projectId,
      excess_count: excess,
    });

    const sessionsToRemove = await findPooledSessions(projectId, excess);
    for (const session of sessionsToRemove) {
      await this.sessionLifecycle.cleanupSession(session.id);
      logger.info({
        event_name: "pool_manager.drain_excess_removed_session",
        project_id: projectId,
        session_id: session.id,
      });
    }
  }

  /**
   * Converges the pool toward the target size for a given project.
   * Uses a fill/drain loop with exponential backoff on creation failures.
   * Protected by a per-project lock in reconcilePool() to prevent concurrent reconciliation.
   */
  private async doReconcile(projectId: string): Promise<void> {
    const targetSize = this.getTargetPoolSize();
    const maxIterations = Math.max(10, targetSize * 2);
    let consecutiveFailures = 0;
    let settled = false;

    for (let i = 0; i < maxIterations; i++) {
      const currentCount = await countPooledSessions(projectId);

      if (currentCount === targetSize) {
        settled = true;
        break;
      }

      if (currentCount < targetSize) {
        logger.info({
          event_name: "pool_manager.fill_needed",
          project_id: projectId,
          current_count: currentCount,
          target_size: targetSize,
        });
        consecutiveFailures = await this.fillOne(projectId, consecutiveFailures);
      } else {
        await this.drainExcess(projectId, currentCount - targetSize);
      }
    }

    if (!settled) {
      logger.error({
        event_name: "pool_manager.reconcile_iteration_limit_hit",
        project_id: projectId,
        max_iterations: maxIterations,
      });
    }
  }
}
