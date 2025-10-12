/* eslint-disable unicorn/no-null */
import type DatabaseConstructor from 'better-sqlite3'

// Same Database type convention used elsewhere in gmail module
type Database = ReturnType<typeof DatabaseConstructor>

/**
 * SyncStateRepository
 * Minimal repository to get/set sync_state values and compute cursor age.
 */
export class SyncStateRepository {
  constructor(private readonly db: Database) {}

  private ensureTable(): void {
    // Idempotent create; tests often create this explicitly as well
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  }

  get(key: string): string | null {
    this.ensureTable()
    const row = this.db
      .prepare('SELECT value FROM sync_state WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  set(key: string, value: string): void {
    this.ensureTable()
    this.db
      .prepare(
        `INSERT INTO sync_state (key, value, updated_at)
         VALUES (?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(key) DO UPDATE
           SET value = excluded.value,
               updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')`
      )
      .run(key, value)
  }

  exists(key: string): boolean {
    this.ensureTable()
    const row = this.db.prepare('SELECT 1 FROM sync_state WHERE key = ?').get(key)
    return !!row
  }

  /**
   * Returns the age in milliseconds since the row's updated_at, or null if not present.
   * Uses SQLite julianday math to avoid JS timezone parsing issues.
   */
  getCursorAge(key: string): number | null {
    this.ensureTable()
    const row = this.db
      .prepare(
        `SELECT CAST((julianday('now') - julianday(updated_at)) * 86400000 AS INTEGER) AS age
         FROM sync_state WHERE key = ?`
      )
      .get(key) as { age: number } | undefined
    if (!row) return null
    return row.age
  }
}

export default SyncStateRepository
