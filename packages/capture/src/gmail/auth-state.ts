/**
 * Gmail Auth State Management - Database Operations Only
 * [AC06 + AC07] Sync State Tracking + Auth Failure Tracking
 *
 * This module contains ONLY database operations for auth state management.
 * NO googleapis imports - fast unit testing without OAuth2 dependencies.
 */

import { GmailAuthError, GmailErrorType } from './types.js'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

/**
 * Ensures sync_state table exists (defensive guard for P0-3)
 * Safe to call multiple times - uses IF NOT EXISTS
 *
 * @param db - SQLite database instance
 */
const ensureSyncStateTable = (db: Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

/**
 * Updates sync_state table with last successful Gmail auth timestamp
 * [AC06] Sync State Tracking + [P0-3] Defensive table initialization
 *
 * @param db - SQLite database instance
 */
export const updateSyncState = (db: Database): void => {
  ensureSyncStateTable(db)
  const timestamp = new Date().toISOString()
  const stmt = db.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES ('last_gmail_auth', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `)
  stmt.run(timestamp)
}

/**
 * Increments the gmail_auth_failures counter in sync_state
 * [AC07] Auth Failure Tracking + [P0-3] Defensive table initialization
 *
 * @param db - SQLite database instance
 * @returns Current failure count after increment
 */
export const incrementAuthFailures = (db: Database): number => {
  ensureSyncStateTable(db)
  const stmt = db.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES ('gmail_auth_failures', '1', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
      updated_at = datetime('now')
  `)
  stmt.run()

  const result = db
    .prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'")
    .get() as { value: string } | undefined
  return result ? parseInt(result.value, 10) : 0
}

/**
 * Resets the gmail_auth_failures counter to 0
 * [AC07] Auth Failure Tracking + [P0-3] Defensive table initialization
 *
 * @param db - SQLite database instance
 */
export const resetAuthFailures = (db: Database): void => {
  ensureSyncStateTable(db)
  const stmt = db.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES ('gmail_auth_failures', '0', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = '0',
      updated_at = datetime('now')
  `)
  stmt.run()
}

/**
 * Gets the current auth failure count without throwing
 * [AC07] Auth Failure Tracking
 *
 * @param db - SQLite database instance
 * @returns Current failure count (0 if not set)
 */
export const getAuthFailureCount = (db: Database): number => {
  ensureSyncStateTable(db)
  const result = db
    .prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failures'")
    .get() as { value: string } | undefined
  return result ? parseInt(result.value, 10) : 0
}

/**
 * Checks if auth failures have exceeded the threshold (>= 5)
 * Throws MaxAuthFailuresError if threshold exceeded
 * [AC07] Auth Failure Tracking + [P0-3] Defensive table initialization
 *
 * @param db - SQLite database instance
 * @throws GmailAuthError with AUTH_MAX_FAILURES type if failures >= 5
 */
export const checkAuthFailures = (db: Database): void => {
  const failures = getAuthFailureCount(db)

  if (failures >= 5) {
    throw new GmailAuthError(
      GmailErrorType.AUTH_MAX_FAILURES,
      `Gmail authentication has failed ${failures} times consecutively. Run 'capture doctor' to diagnose the issue.`,
      new Error(`Max auth failures exceeded: ${failures}`)
    )
  }
}
