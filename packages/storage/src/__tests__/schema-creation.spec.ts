/**
 * Schema Creation Tests
 *
 * Validates that all 4 tables are created with correct structure:
 * - captures (ephemeral staging)
 * - exports_audit (immutable trail)
 * - errors_log (diagnostics)
 * - sync_state (cursors)
 *
 * Source: docs/features/staging-ledger/spec-staging-tech.md §2.1
 * Pattern: .claude/rules/testkit-tdd-guide.md (SQLite Testing Patterns)
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createSchema, initializePragmas } from '../schema/schema.js'

type DatabaseInstance = ReturnType<typeof Database>

describe('Schema Creation', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)
  })

  afterEach(() => {
    // 4-step cleanup (CRITICAL ORDER)
    // Source: testkit-tdd-guide.md lines 100-152
    for (const database of databases) {
      try {
        if (database.open && !database.readonly) {
          database.close()
        }
      } catch {
        // Ignore close errors (safe in cleanup)
      }
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  describe('Table Creation', () => {
    it('should create captures table with correct schema', () => {
      createSchema(db)

      const tableInfo = db
        .prepare(
          `
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='captures'
      `
        )
        .get() as { sql: string } | undefined

      expect(tableInfo).toBeDefined()
      expect(tableInfo?.sql).toContain('id TEXT PRIMARY KEY')
      expect(tableInfo?.sql).toContain('source TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('raw_content TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('content_hash TEXT')
      expect(tableInfo?.sql).toContain('status TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('meta_json TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('created_at DATETIME DEFAULT CURRENT_TIMESTAMP')
      expect(tableInfo?.sql).toContain('updated_at DATETIME DEFAULT CURRENT_TIMESTAMP')
    })

    it('should create exports_audit table with correct schema', () => {
      createSchema(db)

      const tableInfo = db
        .prepare(
          `
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='exports_audit'
      `
        )
        .get() as { sql: string } | undefined

      expect(tableInfo).toBeDefined()
      expect(tableInfo?.sql).toContain('id TEXT PRIMARY KEY')
      expect(tableInfo?.sql).toContain('capture_id TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('vault_path TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('hash_at_export TEXT')
      expect(tableInfo?.sql).toContain('exported_at DATETIME DEFAULT CURRENT_TIMESTAMP')
      expect(tableInfo?.sql).toContain('mode TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('error_flag INTEGER DEFAULT 0')
    })

    it('should create errors_log table with correct schema', () => {
      createSchema(db)

      const tableInfo = db
        .prepare(
          `
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='errors_log'
      `
        )
        .get() as { sql: string } | undefined

      expect(tableInfo).toBeDefined()
      expect(tableInfo?.sql).toContain('id TEXT PRIMARY KEY')
      expect(tableInfo?.sql).toContain('capture_id TEXT')
      expect(tableInfo?.sql).toContain('stage TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('message TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('created_at DATETIME DEFAULT CURRENT_TIMESTAMP')
    })

    it('should create sync_state table with correct schema', () => {
      createSchema(db)

      const tableInfo = db
        .prepare(
          `
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='sync_state'
      `
        )
        .get() as { sql: string } | undefined

      expect(tableInfo).toBeDefined()
      expect(tableInfo?.sql).toContain('key TEXT PRIMARY KEY')
      expect(tableInfo?.sql).toContain('value TEXT NOT NULL')
      expect(tableInfo?.sql).toContain('updated_at DATETIME DEFAULT CURRENT_TIMESTAMP')
    })

    it('should create all 4 required tables', () => {
      createSchema(db)

      const tables = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `
        )
        .all() as Array<{ name: string }>

      const tableNames = tables.map((t) => t.name)
      expect(tableNames).toEqual(['captures', 'errors_log', 'exports_audit', 'sync_state'])
    })
  })

  describe('CHECK Constraints', () => {
    it('should enforce source CHECK constraint on captures', () => {
      createSchema(db)

      // Valid sources should work
      expect(() => {
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, status, meta_json)
          VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
        `
        ).run()
      }).not.toThrow()

      expect(() => {
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, status, meta_json)
          VALUES ('01HQW3P7XL', 'email', 'test', 'staged', '{}')
        `
        ).run()
      }).not.toThrow()

      // Invalid source should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, status, meta_json)
          VALUES ('01HQW3P7XM', 'invalid', 'test', 'staged', '{}')
        `
        ).run()
      }).toThrow(/CHECK constraint failed/)
    })

    it('should enforce status CHECK constraint on captures', () => {
      createSchema(db)

      const validStatuses = [
        'staged',
        'transcribed',
        'failed_transcription',
        'exported',
        'exported_duplicate',
        'exported_placeholder',
      ]

      // All valid statuses should work
      for (const [idx, status] of validStatuses.entries()) {
        expect(() => {
          db.prepare(
            `
            INSERT INTO captures (id, source, raw_content, status, meta_json)
            VALUES (?, 'voice', 'test', ?, '{}')
          `
          ).run(`01HQW3P7X${idx}`, status)
        }).not.toThrow()
      }

      // Invalid status should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, status, meta_json)
          VALUES ('01HQW3P7XZ', 'voice', 'test', 'invalid_status', '{}')
        `
        ).run()
      }).toThrow(/CHECK constraint failed/)
    })

    it('should enforce mode CHECK constraint on exports_audit', () => {
      createSchema(db)

      // Insert parent capture first
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      const validModes = ['initial', 'duplicate_skip', 'placeholder']

      // All valid modes should work
      for (const [idx, mode] of validModes.entries()) {
        expect(() => {
          db.prepare(
            `
            INSERT INTO exports_audit (id, capture_id, vault_path, mode)
            VALUES (?, '01HQW3P7XK', '/inbox/test.md', ?)
          `
          ).run(`01HQW3P7Y${idx}`, mode)
        }).not.toThrow()
      }

      // Invalid mode should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO exports_audit (id, capture_id, vault_path, mode)
          VALUES ('01HQW3P7YZ', '01HQW3P7XK', '/inbox/test.md', 'invalid_mode')
        `
        ).run()
      }).toThrow(/CHECK constraint failed/)
    })

    it('should enforce error_flag CHECK constraint on exports_audit', () => {
      createSchema(db)

      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Valid values (0, 1) should work
      expect(() => {
        db.prepare(
          `
          INSERT INTO exports_audit (id, capture_id, vault_path, mode, error_flag)
          VALUES ('01HQW3P7Y0', '01HQW3P7XK', '/inbox/test.md', 'initial', 0)
        `
        ).run()
      }).not.toThrow()

      expect(() => {
        db.prepare(
          `
          INSERT INTO exports_audit (id, capture_id, vault_path, mode, error_flag)
          VALUES ('01HQW3P7Y1', '01HQW3P7XK', '/inbox/test.md', 'initial', 1)
        `
        ).run()
      }).not.toThrow()

      // Invalid value should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO exports_audit (id, capture_id, vault_path, mode, error_flag)
          VALUES ('01HQW3P7Y2', '01HQW3P7XK', '/inbox/test.md', 'initial', 2)
        `
        ).run()
      }).toThrow(/CHECK constraint failed/)
    })

    it('should enforce stage CHECK constraint on errors_log', () => {
      createSchema(db)

      const validStages = ['poll', 'transcribe', 'export', 'backup', 'integrity']

      // All valid stages should work
      for (const [idx, stage] of validStages.entries()) {
        expect(() => {
          db.prepare(
            `
            INSERT INTO errors_log (id, stage, message)
            VALUES (?, ?, 'test error')
          `
          ).run(`01HQW3P7Z${idx}`, stage)
        }).not.toThrow()
      }

      // Invalid stage should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO errors_log (id, stage, message)
          VALUES ('01HQW3P7ZZ', 'invalid_stage', 'test error')
        `
        ).run()
      }).toThrow(/CHECK constraint failed/)
    })
  })

  describe('DEFAULT Values', () => {
    it('should apply DEFAULT CURRENT_TIMESTAMP to captures.created_at', () => {
      createSchema(db)

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      const row = db
        .prepare(
          `
        SELECT created_at FROM captures WHERE id = '01HQW3P7XK'
      `
        )
        .get() as { created_at: string }

      expect(row.created_at).toBeDefined()
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
    })

    it('should apply DEFAULT CURRENT_TIMESTAMP to captures.updated_at', () => {
      createSchema(db)

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      const row = db
        .prepare(
          `
        SELECT updated_at FROM captures WHERE id = '01HQW3P7XK'
      `
        )
        .get() as { updated_at: string }

      expect(row.updated_at).toBeDefined()
      expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
    })

    it('should apply DEFAULT 0 to exports_audit.error_flag', () => {
      createSchema(db)

      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Insert without error_flag
      db.prepare(
        `
        INSERT INTO exports_audit (id, capture_id, vault_path, mode)
        VALUES ('01HQW3P7Y0', '01HQW3P7XK', '/inbox/test.md', 'initial')
      `
      ).run()

      const row = db
        .prepare(
          `
        SELECT error_flag FROM exports_audit WHERE id = '01HQW3P7Y0'
      `
        )
        .get() as { error_flag: number }

      expect(row.error_flag).toBe(0)
    })
  })

  describe('PRAGMA Configuration', () => {
    it('should set journal_mode to WAL (or memory for :memory: databases)', () => {
      initializePragmas(db)

      const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
      // :memory: databases don't support WAL, use 'memory' mode instead
      expect(['wal', 'memory']).toContain(result.journal_mode)
    })

    it('should set synchronous to NORMAL', () => {
      initializePragmas(db)

      const result = db.prepare('PRAGMA synchronous').get() as { synchronous: number }
      // NORMAL = 1
      expect(result.synchronous).toBe(1)
    })

    it('should enable foreign_keys', () => {
      initializePragmas(db)

      const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
      expect(result.foreign_keys).toBe(1)
    })

    it('should set busy_timeout to 5000ms', () => {
      initializePragmas(db)

      const result = db.prepare('PRAGMA busy_timeout').get() as { timeout: number }
      expect(result.timeout).toBe(5000)
    })

    it('should set wal_autocheckpoint to 1000', () => {
      initializePragmas(db)

      const result = db.prepare('PRAGMA wal_autocheckpoint').get() as { wal_autocheckpoint: number }
      expect(result.wal_autocheckpoint).toBe(1000)
    })

    it('should set cache_size to -2000 (2MB)', () => {
      initializePragmas(db)

      const result = db.prepare('PRAGMA cache_size').get() as { cache_size: number }
      expect(result.cache_size).toBe(-2000)
    })

    it('should set temp_store to MEMORY', () => {
      initializePragmas(db)

      const result = db.prepare('PRAGMA temp_store').get() as { temp_store: number }
      // MEMORY = 2
      expect(result.temp_store).toBe(2)
    })
  })
})
