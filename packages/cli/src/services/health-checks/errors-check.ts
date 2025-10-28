/**
 * Error log summary health check
 * AC08: Check error log summary (last 24 hours)
 */

import type { HealthCheckResult } from './types.js'
import type Database from 'better-sqlite3'


/**
 * Check error log summary for last 24 hours
 * @param db - SQLite database instance
 * @returns Health check result
 */
export const checkErrorLog = (db: Database.Database): HealthCheckResult => {
  try {
    // Query errors from last 24 hours
    const count = db
      .prepare(
        `SELECT COUNT(*) as count FROM errors_log
         WHERE datetime(created_at) > datetime('now', '-24 hours')`
      )
      .get() as { count: number }

    const errorCount = count.count

    // Determine status based on error count
    if (errorCount <= 5) {
      return {
        name: 'error_log_summary',
        status: 'ok',
        message: 'Error rate is normal',
        details: `${errorCount} errors in last 24 hours`,
      }
    }

    if (errorCount <= 20) {
      return {
        name: 'error_log_summary',
        status: 'warn',
        message: 'Elevated error rate',
        details: `${errorCount} errors in last 24 hours`,
        fix: 'Review error logs: capture doctor --verbose',
      }
    }

    // > 20 errors
    return {
      name: 'error_log_summary',
      status: 'error',
      message: 'High error rate detected',
      details: `${errorCount} errors in last 24 hours`,
      fix: 'Investigate error logs urgently: capture doctor --verbose',
    }
  } catch (error) {
    return {
      name: 'error_log_summary',
      status: 'error',
      message: 'Failed to check error log',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
