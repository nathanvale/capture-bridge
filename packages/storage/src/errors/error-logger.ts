/**
 * Error Logger
 *
 * Provides error logging functionality for the staging ledger.
 * Inserts error entries into the errors_log table.
 *
 * Task: ERROR_LOGGING_STRUCTURED--T01
 * Source: docs/features/staging-ledger/spec-staging-tech.md §2.1
 */

import { ulid } from 'ulid'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

export interface ErrorLogEntry {
  id: string
  capture_id: string | null
  stage: 'poll' | 'transcribe' | 'export' | 'backup' | 'integrity'
  message: string
  created_at: Date
}

/**
 * Log an error to the errors_log table
 *
 * Inserts a new error log entry with automatic ULID generation
 * and timestamp. Supports both capture-specific and system-level errors.
 *
 * @param db - SQLite database instance
 * @param capture_id - Capture ID (null for system-level errors)
 * @param stage - Stage where error occurred (must be one of: poll, transcribe, export, backup, integrity)
 * @param message - Error message
 * @throws Error if database insertion fails or stage is invalid
 *
 * @example
 * // Capture-specific error
 * await logError(db, 'cap-123', 'transcribe', 'Whisper API timeout')
 *
 * // System-level error
 * await logError(db, null, 'poll', 'Disk full')
 */
export const logError = (
  db: Database,
  capture_id: string | null,
  stage: string,
  message: string
): Promise<void> => {
  return Promise.resolve().then(() => {
    const id = ulid()

    // Use parameterized query to prevent SQL injection
    const stmt = db.prepare(`
      INSERT INTO errors_log (id, capture_id, stage, message, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)

    // Run the insert statement
    stmt.run(id, capture_id, stage, message)
  })
}

/**
 * Get error summary for the last 24 hours, grouped by stage
 *
 * Used by the `capture doctor` command (AC05) to show recent error counts.
 * Returns errors from the last 24 hours only, grouped by stage.
 *
 * @param db - SQLite database instance
 * @returns Array of {stage, count} objects for errors in last 24h
 *
 * @example
 * const summary = getErrorSummaryLast24Hours(db)
 * // Returns: [{stage: 'transcribe', count: 3}, {stage: 'poll', count: 1}]
 */
export const getErrorSummaryLast24Hours = (
  db: Database
): Array<{ stage: string; count: number }> => {
  const stmt = db.prepare(`
    SELECT stage, COUNT(*) as count
    FROM errors_log
    WHERE created_at > datetime('now', '-1 day')
    GROUP BY stage
  `)
  return stmt.all() as Array<{ stage: string; count: number }>
}

/**
 * Get errors by stage for the last day (AC06)
 *
 * Implements the exact query from the spec:
 * SELECT stage, COUNT(*) FROM errors_log WHERE created_at > datetime('now', '-1 day') GROUP BY stage
 *
 * Note: This function delegates to getErrorSummaryLast24Hours (AC05) because both
 * acceptance criteria require identical grouped error counts. They are kept as separate
 * functions to match the spec's requirements and allow independent evolution in future phases.
 *
 * @param db - SQLite database instance
 * @returns Array of {stage, count} objects
 *
 * @example
 * const result = getErrorsByStageLastDay(db)
 * // Returns: [{stage: 'poll', count: 3}, {stage: 'transcribe', count: 2}]
 */
export const getErrorsByStageLastDay = (db: Database): Array<{ stage: string; count: number }> => {
  // AC06 requires the same query as AC05, so delegate to avoid duplication
  return getErrorSummaryLast24Hours(db)
}

/**
 * Trim errors older than 90 days (Phase 3+, AC07)
 *
 * This function is DEFERRED to Phase 3+. In MPPP scope, it returns 0 deleted rows
 * without performing any deletion. The errors_log table will be manually managed
 * during MPPP, with automatic trimming implemented in Phase 3.
 *
 * @deprecated Phase 3 feature - not implemented in MPPP scope
 * @param _db - SQLite database instance (unused in MPPP, prefixed with underscore)
 * @returns Object with rowsDeleted count (always 0 in MPPP)
 *
 * @example
 * const result = await trimErrorsOlderThan90Days(db)
 * // Returns: {rowsDeleted: 0} (no-op in MPPP)
 */
export const trimErrorsOlderThan90Days = (_db: Database): Promise<{ rowsDeleted: number }> => {
  // Phase 3+ deferral - return 0 deleted rows without performing deletion
  // This preserves the function signature for future implementation while
  // preventing accidental data loss during MPPP phase
  return Promise.resolve({ rowsDeleted: 0 })
}
