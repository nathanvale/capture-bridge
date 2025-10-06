/**
 * Foreign Key Constraint Tests
 *
 * Validates foreign key relationships:
 * - exports_audit.capture_id → captures.id (ON DELETE CASCADE)
 * - errors_log.capture_id → captures.id (ON DELETE SET NULL)
 *
 * Source: docs/features/staging-ledger/spec-staging-tech.md §2.1
 * Pattern: .claude/rules/testkit-tdd-guide.md (SQLite Testing Patterns)
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createSchema, initializePragmas } from '../schema/schema.js'

type DatabaseInstance = ReturnType<typeof Database>

describe('Foreign Key Constraints', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)

    // CRITICAL: Must enable foreign keys and create schema
    initializePragmas(db)
    createSchema(db)
  })

  afterEach(() => {
    // 4-step cleanup (CRITICAL ORDER)
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

  describe('Foreign Keys Enabled', () => {
    it('should have foreign_keys PRAGMA enabled', () => {
      const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
      expect(result.foreign_keys).toBe(1)
    })

    it('should reject invalid foreign key references', () => {
      // Try to insert export with non-existent capture_id
      expect(() => {
        db.prepare(
          `
          INSERT INTO exports_audit (id, capture_id, vault_path, mode)
          VALUES ('01HQW3P7Y0', 'nonexistent', '/inbox/test.md', 'initial')
        `
        ).run()
      }).toThrow(/FOREIGN KEY constraint failed/)
    })
  })

  describe('exports_audit.capture_id → captures.id (CASCADE)', () => {
    it('should allow insert when parent capture exists', () => {
      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Insert child export - should succeed
      expect(() => {
        db.prepare(
          `
          INSERT INTO exports_audit (id, capture_id, vault_path, mode)
          VALUES ('01HQW3P7Y0', '01HQW3P7XK', '/inbox/test.md', 'initial')
        `
        ).run()
      }).not.toThrow()

      // Verify child exists
      const row = db
        .prepare(
          `
        SELECT * FROM exports_audit WHERE id = '01HQW3P7Y0'
      `
        )
        .get()
      expect(row).toBeDefined()
    })

    it('should reject insert when parent capture does not exist', () => {
      // Try to insert child without parent - should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO exports_audit (id, capture_id, vault_path, mode)
          VALUES ('01HQW3P7Y0', 'nonexistent', '/inbox/test.md', 'initial')
        `
        ).run()
      }).toThrow(/FOREIGN KEY constraint failed/)
    })

    it('should CASCADE delete child when parent is deleted', () => {
      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Insert child export
      db.prepare(
        `
        INSERT INTO exports_audit (id, capture_id, vault_path, mode)
        VALUES ('01HQW3P7Y0', '01HQW3P7XK', '/inbox/test.md', 'initial')
      `
      ).run()

      // Verify child exists before delete
      let row = db
        .prepare(
          `
        SELECT * FROM exports_audit WHERE id = '01HQW3P7Y0'
      `
        )
        .get()
      expect(row).toBeDefined()

      // Delete parent - should cascade to child
      db.prepare(`DELETE FROM captures WHERE id = '01HQW3P7XK'`).run()

      // Verify child was deleted (CASCADE behavior)
      row = db
        .prepare(
          `
        SELECT * FROM exports_audit WHERE id = '01HQW3P7Y0'
      `
        )
        .get()
      expect(row).toBeUndefined()
    })

    it('should CASCADE delete multiple children when parent is deleted', () => {
      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Insert multiple child exports
      db.prepare(
        `
        INSERT INTO exports_audit (id, capture_id, vault_path, mode)
        VALUES
          ('01HQW3P7Y0', '01HQW3P7XK', '/inbox/test1.md', 'initial'),
          ('01HQW3P7Y1', '01HQW3P7XK', '/inbox/test2.md', 'duplicate_skip'),
          ('01HQW3P7Y2', '01HQW3P7XK', '/inbox/test3.md', 'placeholder')
      `
      ).run()

      // Verify children exist
      let count = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM exports_audit WHERE capture_id = '01HQW3P7XK'
      `
        )
        .get() as { count: number }
      expect(count.count).toBe(3)

      // Delete parent
      db.prepare(`DELETE FROM captures WHERE id = '01HQW3P7XK'`).run()

      // Verify all children were deleted
      count = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM exports_audit WHERE capture_id = '01HQW3P7XK'
      `
        )
        .get() as { count: number }
      expect(count.count).toBe(0)
    })
  })

  describe('errors_log.capture_id → captures.id (SET NULL)', () => {
    it('should allow insert when parent capture exists', () => {
      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Insert error log with capture reference - should succeed
      expect(() => {
        db.prepare(
          `
          INSERT INTO errors_log (id, capture_id, stage, message)
          VALUES ('01HQW3P7Z0', '01HQW3P7XK', 'transcribe', 'test error')
        `
        ).run()
      }).not.toThrow()

      // Verify error log exists
      const row = db
        .prepare(
          `
        SELECT * FROM errors_log WHERE id = '01HQW3P7Z0'
      `
        )
        .get() as { capture_id: string }
      expect(row).toBeDefined()
      expect(row.capture_id).toBe('01HQW3P7XK')
    })

    it('should allow insert with NULL capture_id (orphaned error)', () => {
      // Insert error log without capture reference - should succeed
      expect(() => {
        db.prepare(
          `
          INSERT INTO errors_log (id, capture_id, stage, message)
          VALUES ('01HQW3P7Z0', NULL, 'poll', 'general error')
        `
        ).run()
      }).not.toThrow()

      // Verify error log exists with NULL capture_id
      const row = db
        .prepare(
          `
        SELECT * FROM errors_log WHERE id = '01HQW3P7Z0'
      `
        )
        .get() as { capture_id: string | null }
      expect(row).toBeDefined()
      expect(row.capture_id).toBeNull()
    })

    it('should reject insert when parent capture does not exist', () => {
      // Try to insert error with non-existent capture - should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO errors_log (id, capture_id, stage, message)
          VALUES ('01HQW3P7Z0', 'nonexistent', 'transcribe', 'test error')
        `
        ).run()
      }).toThrow(/FOREIGN KEY constraint failed/)
    })

    it('should SET NULL on capture_id when parent is deleted', () => {
      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Insert error log with capture reference
      db.prepare(
        `
        INSERT INTO errors_log (id, capture_id, stage, message)
        VALUES ('01HQW3P7Z0', '01HQW3P7XK', 'transcribe', 'test error')
      `
      ).run()

      // Verify error log has capture_id before delete
      const rowBefore = db
        .prepare(
          `
        SELECT capture_id FROM errors_log WHERE id = '01HQW3P7Z0'
      `
        )
        .get() as { capture_id: string }
      expect(rowBefore.capture_id).toBe('01HQW3P7XK')

      // Delete parent - should SET NULL on child
      db.prepare(`DELETE FROM captures WHERE id = '01HQW3P7XK'`).run()

      // Verify error log still exists but capture_id is NULL
      const rowAfter = db
        .prepare(
          `
        SELECT capture_id FROM errors_log WHERE id = '01HQW3P7Z0'
      `
        )
        .get() as { capture_id: string | null }
      expect(rowAfter).toBeDefined()
      expect(rowAfter.capture_id).toBeNull()
    })

    it('should SET NULL on multiple error logs when parent is deleted', () => {
      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Insert multiple error logs with same capture reference
      db.prepare(
        `
        INSERT INTO errors_log (id, capture_id, stage, message)
        VALUES
          ('01HQW3P7Z0', '01HQW3P7XK', 'transcribe', 'error 1'),
          ('01HQW3P7Z1', '01HQW3P7XK', 'export', 'error 2'),
          ('01HQW3P7Z2', '01HQW3P7XK', 'backup', 'error 3')
      `
      ).run()

      // Verify all have capture_id
      const rowsBefore = db
        .prepare(
          `
        SELECT capture_id FROM errors_log WHERE capture_id IS NOT NULL
      `
        )
        .all() as Array<{ capture_id: string }>
      expect(rowsBefore).toHaveLength(3)

      // Delete parent
      db.prepare(`DELETE FROM captures WHERE id = '01HQW3P7XK'`).run()

      // Verify all error logs still exist but with NULL capture_id
      const countAfter = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM errors_log
      `
        )
        .get() as { count: number }
      expect(countAfter.count).toBe(3)

      const rowsAfter = db
        .prepare(
          `
        SELECT capture_id FROM errors_log WHERE capture_id IS NULL
      `
        )
        .all() as Array<{ capture_id: string | null }>
      expect(rowsAfter).toHaveLength(3)
    })
  })

  describe('Cross-Table Referential Integrity', () => {
    it('should maintain referential integrity across both child tables', () => {
      // Insert parent capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7XK', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Insert children from both tables
      db.prepare(
        `
        INSERT INTO exports_audit (id, capture_id, vault_path, mode)
        VALUES ('01HQW3P7Y0', '01HQW3P7XK', '/inbox/test.md', 'initial')
      `
      ).run()

      db.prepare(
        `
        INSERT INTO errors_log (id, capture_id, stage, message)
        VALUES ('01HQW3P7Z0', '01HQW3P7XK', 'transcribe', 'test error')
      `
      ).run()

      // Verify both children reference same parent
      const exportRow = db
        .prepare(
          `
        SELECT capture_id FROM exports_audit WHERE id = '01HQW3P7Y0'
      `
        )
        .get() as { capture_id: string }
      const errorRow = db
        .prepare(
          `
        SELECT capture_id FROM errors_log WHERE id = '01HQW3P7Z0'
      `
        )
        .get() as { capture_id: string }

      expect(exportRow.capture_id).toBe('01HQW3P7XK')
      expect(errorRow.capture_id).toBe('01HQW3P7XK')

      // Delete parent
      db.prepare(`DELETE FROM captures WHERE id = '01HQW3P7XK'`).run()

      // Verify CASCADE on exports_audit (deleted)
      const deletedExport = db
        .prepare(
          `
        SELECT * FROM exports_audit WHERE id = '01HQW3P7Y0'
      `
        )
        .get()
      expect(deletedExport).toBeUndefined()

      // Verify SET NULL on errors_log (preserved with NULL)
      const preservedError = db
        .prepare(
          `
        SELECT capture_id FROM errors_log WHERE id = '01HQW3P7Z0'
      `
        )
        .get() as { capture_id: string | null }
      expect(preservedError).toBeDefined()
      expect(preservedError.capture_id).toBeNull()
    })
  })
})
