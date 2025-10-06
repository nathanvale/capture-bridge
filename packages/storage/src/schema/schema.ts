/**
 * SQLite Schema Definition for Staging Ledger
 *
 * Implements the 4-table hard cap architecture:
 * - captures: Ephemeral staging for incoming data
 * - exports_audit: Immutable trail of vault writes
 * - errors_log: Diagnostics and failure tracking
 * - sync_state: Cursor tracking for polling
 *
 * Source: docs/features/staging-ledger/spec-staging-tech.md §2.1
 * ADR: docs/adr/0003-four-table-hard-cap.md
 */

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

/**
 * Initialize SQLite PRAGMAs for optimal performance and safety
 *
 * Configuration:
 * - WAL mode for better concurrency and crash recovery
 * - NORMAL synchronous for balance of safety and speed
 * - Foreign keys enabled for referential integrity
 * - Busy timeout for retry on lock contention
 * - WAL autocheckpoint for automatic WAL file management
 * - Cache size for query performance
 * - Temp store in memory for speed
 *
 * Source: docs/features/staging-ledger/spec-staging-tech.md §2.2
 * ADR: docs/adr/0005-wal-mode-normal-sync.md
 */
export const initializePragmas = (db: Database): void => {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('wal_autocheckpoint = 1000')
  db.pragma('cache_size = -2000') // 2MB cache
  db.pragma('temp_store = MEMORY')
}

/**
 * Verify all critical PRAGMAs are correctly set
 * Returns validation result with details about any issues
 */
export const verifyPragmas = (db: Database): { valid: boolean; issues: string[] } => {
  const issues: string[] = []

  // Check journal_mode (should be 'wal' for file-based DBs, 'memory' for in-memory)
  const journalMode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
  const dbName = db.name
  const isInMemory = dbName === ':memory:' || dbName === ''

  if (!isInMemory && journalMode.journal_mode.toLowerCase() !== 'wal') {
    issues.push(
      `journal_mode is '${journalMode.journal_mode}' but expected 'wal' for file-based database`
    )
  }

  // Check synchronous (should be 1 for NORMAL)
  const synchronous = db.prepare('PRAGMA synchronous').get() as { synchronous: number }
  if (synchronous.synchronous !== 1) {
    issues.push(`synchronous is ${synchronous.synchronous} but expected 1 (NORMAL)`)
  }

  // Check foreign_keys (should be 1 for ON)
  const foreignKeys = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
  if (foreignKeys.foreign_keys !== 1) {
    issues.push(`foreign_keys is ${foreignKeys.foreign_keys} but expected 1 (ON)`)
  }

  // Check busy_timeout (should be 5000)
  const busyTimeout = db.prepare('PRAGMA busy_timeout').get() as { timeout: number }
  if (busyTimeout.timeout !== 5000) {
    issues.push(`busy_timeout is ${busyTimeout.timeout} but expected 5000`)
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

/**
 * Create all 4 tables with complete schema
 *
 * Order matters:
 * 1. captures (parent table)
 * 2. exports_audit (child with CASCADE)
 * 3. errors_log (child with SET NULL)
 * 4. sync_state (independent)
 *
 * All indexes are created immediately after their tables.
 */
export const createSchema = (db: Database): void => {
  // === Table 1: captures (Ephemeral Staging) ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL CHECK (source IN ('voice', 'email')),
      raw_content TEXT NOT NULL,
      content_hash TEXT,
      status TEXT NOT NULL CHECK (status IN (
        'staged',
        'transcribed',
        'failed_transcription',
        'exported',
        'exported_duplicate',
        'exported_placeholder'
      )),
      meta_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Indexes for captures table
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS captures_content_hash_idx
      ON captures(content_hash)
      WHERE content_hash IS NOT NULL
  `)

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS captures_channel_native_uid
      ON captures(
        json_extract(meta_json, '$.channel'),
        json_extract(meta_json, '$.channel_native_id')
      )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS captures_status_idx
      ON captures(status)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS captures_created_at_idx
      ON captures(created_at)
  `)

  // === Table 2: exports_audit (Immutable Trail) ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS exports_audit (
      id TEXT PRIMARY KEY,
      capture_id TEXT NOT NULL,
      vault_path TEXT NOT NULL,
      hash_at_export TEXT,
      exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      mode TEXT NOT NULL CHECK (mode IN ('initial', 'duplicate_skip', 'placeholder')),
      error_flag INTEGER DEFAULT 0 CHECK (error_flag IN (0, 1)),
      FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
    )
  `)

  // Index for exports_audit table
  db.exec(`
    CREATE INDEX IF NOT EXISTS exports_audit_capture_idx
      ON exports_audit(capture_id)
  `)

  // === Table 3: errors_log (Diagnostics) ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS errors_log (
      id TEXT PRIMARY KEY,
      capture_id TEXT,
      stage TEXT NOT NULL CHECK (stage IN ('poll', 'transcribe', 'export', 'backup', 'integrity')),
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
    )
  `)

  // Indexes for errors_log table
  db.exec(`
    CREATE INDEX IF NOT EXISTS errors_log_stage_idx
      ON errors_log(stage)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS errors_log_created_at_idx
      ON errors_log(created_at)
  `)

  // === Table 4: sync_state (Cursors) ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Insert schema version (INSERT OR IGNORE ensures idempotency)
  db.exec(`
    INSERT OR IGNORE INTO sync_state (key, value)
    VALUES ('schema_version', '1')
  `)
}

/**
 * Initialize database with PRAGMAs and schema
 *
 * This is the main entry point for setting up a new database connection.
 * Call this once per connection to ensure proper configuration.
 *
 * @param db - better-sqlite3 Database instance
 *
 * @example
 * ```typescript
 * const db = new Database(':memory:')
 * initializeDatabase(db)
 * // Database is now ready to use
 * ```
 */
export const initializeDatabase = (db: Database): void => {
  initializePragmas(db)
  createSchema(db)
}

/**
 * Verify schema integrity
 *
 * Checks that all required tables and indexes exist.
 * Useful for health checks and validation.
 *
 * @param db - better-sqlite3 Database instance
 * @returns Object with verification results
 */
export const verifySchema = (
  db: Database
): {
  tables: string[]
  indexes: string[]
  valid: boolean
  missing: string[]
} => {
  const requiredTables = ['captures', 'exports_audit', 'errors_log', 'sync_state']
  const requiredIndexes = [
    'captures_content_hash_idx',
    'captures_channel_native_uid',
    'captures_status_idx',
    'captures_created_at_idx',
    'exports_audit_capture_idx',
    'errors_log_stage_idx',
    'errors_log_created_at_idx',
  ]

  // Get existing tables
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>

  const tableNames = tables.map((t) => t.name)

  // Get existing indexes
  const indexes = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>

  const indexNames = indexes.map((i) => i.name)

  // Check for missing items
  const missingTables = requiredTables.filter((t) => !tableNames.includes(t))
  const missingIndexes = requiredIndexes.filter((i) => !indexNames.includes(i))
  const missing = [...missingTables, ...missingIndexes]

  return {
    tables: tableNames,
    indexes: indexNames,
    valid: missing.length === 0,
    missing,
  }
}
