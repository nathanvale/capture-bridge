/**
 * Queue depth health check
 * AC10: Check queue depth (staged + transcribed count)
 */

import type { HealthCheckResult } from './types.js'
import type Database from 'better-sqlite3'


/**
 * Check queue depth (captures pending processing)
 * @param db - SQLite database instance
 * @returns Health check result
 */
export const checkQueueDepth = (db: Database.Database): HealthCheckResult => {
  try {
    // Query count of captures in processing states
    const result = db
      .prepare(
        `SELECT COUNT(*) as count FROM captures
         WHERE status IN ('staged', 'transcribed')`
      )
      .get() as { count: number }

    const queueDepth = result.count

    // Determine status based on queue depth
    if (queueDepth < 10) {
      return {
        name: 'queue_depth',
        status: 'ok',
        message: 'Queue is healthy',
        details: `${queueDepth} items in queue`,
      }
    }

    if (queueDepth <= 50) {
      return {
        name: 'queue_depth',
        status: 'warn',
        message: 'Queue is building up',
        details: `${queueDepth} items in queue`,
        fix: 'Monitor processing rate',
      }
    }

    // > 50 items
    return {
      name: 'queue_depth',
      status: 'error',
      message: 'Queue is backlogged',
      details: `${queueDepth} items in queue`,
      fix: 'Investigate processing bottleneck',
    }
  } catch (error) {
    return {
      name: 'queue_depth',
      status: 'error',
      message: 'Failed to check queue depth',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
