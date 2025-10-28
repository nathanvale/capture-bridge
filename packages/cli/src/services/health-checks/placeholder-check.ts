/**
 * Placeholder ratio health check
 * AC11: Check placeholder ratio (last 7 days)
 */

import type { HealthCheckResult } from './types.js'
import type Database from 'better-sqlite3'

/**
 * Check placeholder export ratio for last 7 days
 * @param db - SQLite database instance
 * @returns Health check result
 */
export const checkPlaceholderRatio = (db: Database.Database): HealthCheckResult => {
  try {
    // Query total exports and placeholder count from last 7 days
    const result = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'exported_placeholder' THEN 1 ELSE 0 END) as placeholders
         FROM captures
         WHERE status LIKE 'exported%'
           AND datetime(created_at) > datetime('now', '-7 days')`
      )
      .get() as { total: number; placeholders: number }

    const totalExports = result.total
    const placeholderCount = result.placeholders || 0

    // Handle no exports case
    if (totalExports === 0) {
      return {
        name: 'placeholder_ratio',
        status: 'ok',
        message: 'No exports in last 7 days',
        details: 'Placeholder ratio: 0%',
      }
    }

    // Calculate ratio
    const ratio = (placeholderCount / totalExports) * 100

    // Determine status based on ratio
    if (ratio <= 5) {
      return {
        name: 'placeholder_ratio',
        status: 'ok',
        message: 'Transcription success rate is healthy',
        details: `${placeholderCount}/${totalExports} placeholders (${ratio.toFixed(1)}%)`,
      }
    }

    if (ratio <= 25) {
      return {
        name: 'placeholder_ratio',
        status: 'warn',
        message: 'Elevated placeholder rate',
        details: `${placeholderCount}/${totalExports} placeholders (${ratio.toFixed(1)}%)`,
        fix: 'Review transcription failures',
      }
    }

    // > 25%
    return {
      name: 'placeholder_ratio',
      status: 'error',
      message: 'High transcription failure rate',
      details: `${placeholderCount}/${totalExports} placeholders (${ratio.toFixed(1)}%)`,
      fix: 'Investigate Whisper model and audio quality',
    }
  } catch (error) {
    return {
      name: 'placeholder_ratio',
      status: 'error',
      message: 'Failed to check placeholder ratio',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
