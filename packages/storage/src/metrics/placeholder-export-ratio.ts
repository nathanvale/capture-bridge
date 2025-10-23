/**
 * Placeholder Export Ratio Metric
 *
 * Calculates the daily ratio of placeholder exports (failed transcriptions)
 * to total exports. Provides observability into transcription reliability.
 *
 * Formula: (placeholder_count / total_count) * 100
 *
 * Source: PLACEHOLDER_EXPORT--T02, PLACEHOLDER_EXPORT-AC07
 * Related: prd-master-condensed.md (Metrics section)
 */

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

/**
 * Calculate the placeholder export ratio for a given date.
 *
 * @param db - SQLite database instance
 * @param date - Optional date in YYYY-MM-DD format (defaults to current date)
 * @returns Ratio as percentage (0.0 to 100.0), or 0.0 if no exports exist
 *
 * @example
 * ```typescript
 * const ratio = calculatePlaceholderExportRatio(db)
 * console.log(`Placeholder ratio: ${ratio}%`)
 * // Output: Placeholder ratio: 3.0%
 * ```
 */
export const calculatePlaceholderExportRatio = (db: Database, date?: string): number => {
  // Determine the date to query (default to current date)
  const queryDate = date ?? new Date().toISOString().split('T')[0]

  // Count placeholder exports for the given date
  const placeholderCount = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM exports_audit
      WHERE mode = 'placeholder'
      AND DATE(exported_at) = ?
    `
    )
    .get(queryDate) as { count: number }

  // Count total exports for the given date
  const totalCount = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM exports_audit
      WHERE DATE(exported_at) = ?
    `
    )
    .get(queryDate) as { count: number }

  // Handle division by zero
  if (totalCount.count === 0) {
    return 0.0
  }

  // Calculate and return ratio as percentage
  return (placeholderCount.count / totalCount.count) * 100
}
