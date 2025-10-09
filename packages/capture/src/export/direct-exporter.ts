import type Database from 'better-sqlite3'

/**
 * Check if a capture should be exported to the vault.
 * 
 * A capture is eligible for export if:
 * 1. Its status is 'transcribed'
 * 2. It hasn't been successfully exported yet (not in exports_audit with error_flag=0)
 * 
 * @param captureId - ULID of the capture to check
 * @param db - SQLite database instance
 * @returns true if the capture should be exported, false otherwise
 */
export function shouldExport(captureId: string, db: Database.Database): boolean {
  const result = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM captures
      WHERE id = ?
        AND status = 'transcribed'
        AND id NOT IN (
          SELECT capture_id
          FROM exports_audit
          WHERE error_flag = 0
        )
    `
    )
    .get(captureId) as { count: number } | undefined

  return result?.count === 1
}
