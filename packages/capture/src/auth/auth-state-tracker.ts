/**
 * Auth State Tracker - Gmail OAuth2 State Management
 *
 * AC06: Store last successful auth in sync_state table
 * AC07: Cap consecutive auth failures (> 5 → halt email polling)
 *
 * Tracks authentication success/failure state in SQLite sync_state table:
 * - gmail_last_auth_success: ISO timestamp of last successful auth
 * - gmail_auth_failure_count: Consecutive failure counter
 */

import type Database from 'better-sqlite3'

// Threshold for halting polling (failures must exceed this)
const HALT_THRESHOLD = 5

/**
 * Record successful Gmail authentication
 *
 * Updates sync_state with:
 * - Current timestamp for gmail_last_auth_success
 * - Resets gmail_auth_failure_count to 0
 *
 * @param db - SQLite database connection
 */
export const recordAuthSuccess = (db: Database.Database): void => {
  const now = new Date().toISOString()

  // Update timestamp
  db.prepare(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_last_auth_success', ?)"
  ).run(now)

  // Reset failure count
  db.prepare(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_auth_failure_count', '0')"
  ).run()
}

/**
 * Record failed Gmail authentication
 *
 * Increments gmail_auth_failure_count in sync_state table.
 * Initializes to 1 if counter doesn't exist.
 *
 * @param db - SQLite database connection
 */
export const recordAuthFailure = (db: Database.Database): void => {
  // Get current count
  const result = db
    .prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failure_count'")
    .get() as { value: string } | undefined

  const currentCount = result ? Number.parseInt(result.value, 10) : 0
  const newCount = currentCount + 1

  // Update count
  db.prepare(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('gmail_auth_failure_count', ?)"
  ).run(String(newCount))
}

/**
 * Get consecutive authentication failure count
 *
 * @param db - SQLite database connection
 * @returns Number of consecutive failures (0 if no record exists)
 */
export const getConsecutiveFailures = (db: Database.Database): number => {
  const result = db
    .prepare("SELECT value FROM sync_state WHERE key = 'gmail_auth_failure_count'")
    .get() as { value: string } | undefined

  if (!result) {
    return 0
  }

  return Number.parseInt(result.value, 10)
}

/**
 * Determine if email polling should halt due to excessive auth failures
 *
 * Threshold: > 5 consecutive failures
 *
 * @param db - SQLite database connection
 * @returns true if polling should halt (failures > 5), false otherwise
 */
export const shouldHaltPolling = (db: Database.Database): boolean => {
  const failures = getConsecutiveFailures(db)
  return failures > HALT_THRESHOLD
}
