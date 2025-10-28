/**
 * Polling timestamp health check
 * AC07: Check last successful poll timestamps (voice/email)
 */

import type { HealthCheckResult } from './types.js'
import type Database from 'better-sqlite3'


interface SyncStateRow {
  key: string
  value: string
  updated_at: string
}

/**
 * Check polling timestamps for voice and email channels
 * @param db - SQLite database instance
 * @returns Health check result
 */
export const checkPollingTimestamps = (db: Database.Database): HealthCheckResult => {
  try {
    // Query sync_state for last poll timestamps
    const rows = db
      .prepare(
        `SELECT key, value, updated_at FROM sync_state
         WHERE key IN ('voice_last_poll_at', 'email_last_poll_at')`
      )
      .all() as SyncStateRow[]

    // Check if any polling has happened
    if (rows.length === 0) {
      return {
        name: 'polling_timestamps',
        status: 'error',
        message: 'Polling has never occurred',
        details: 'No poll timestamps found in sync_state table',
        fix: 'Start polling services: capture poll',
      }
    }

    // Find most recent poll timestamp
    const now = Date.now()
    let oldestPollAge = 0
    const details: string[] = []

    for (const row of rows) {
      const pollTime = new Date(row.updated_at).getTime()
      const ageMinutes = Math.floor((now - pollTime) / 1000 / 60)
      oldestPollAge = Math.max(oldestPollAge, ageMinutes)
      details.push(`${row.key}: ${ageMinutes} minutes ago`)
    }

    // Determine status based on age
    if (oldestPollAge < 5) {
      return {
        name: 'polling_timestamps',
        status: 'ok',
        message: 'Polling is current',
        details: details.join(', '),
      }
    }

    if (oldestPollAge < 60) {
      return {
        name: 'polling_timestamps',
        status: 'warn',
        message: 'Polling is stale',
        details: `Last poll: ${oldestPollAge} minutes ago. ${details.join(', ')}`,
        fix: 'Check polling service status',
      }
    }

    // > 60 minutes
    return {
      name: 'polling_timestamps',
      status: 'error',
      message: 'Polling has stopped',
      details: `Last poll: ${oldestPollAge} minutes ago. ${details.join(', ')}`,
      fix: 'Restart polling services: capture poll',
    }
  } catch (error) {
    return {
      name: 'polling_timestamps',
      status: 'error',
      message: 'Failed to check polling timestamps',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
