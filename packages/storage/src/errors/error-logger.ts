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
