/**
 * Index Performance Tests
 *
 * Validates that all required indexes exist and are used by the query planner:
 * - captures_content_hash_idx (UNIQUE, partial WHERE content_hash IS NOT NULL)
 * - captures_channel_native_uid (UNIQUE composite on JSON extract)
 * - captures_status_idx
 * - captures_created_at_idx
 * - exports_audit_capture_idx
 * - errors_log_stage_idx
 * - errors_log_created_at_idx
 *
 * Source: docs/features/staging-ledger/spec-staging-tech.md §2.1
 * Pattern: .claude/rules/testkit-tdd-guide.md (SQLite Testing Patterns)
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createSchema, initializePragmas } from '../schema/schema.js'

type DatabaseInstance = ReturnType<typeof Database>

describe('Index Performance', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)

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

  describe('Index Existence', () => {
    it('should create captures_content_hash_idx', () => {
      const indexes = db
        .prepare(
          `
        SELECT name, sql FROM sqlite_master
        WHERE type='index' AND name='captures_content_hash_idx'
      `
        )
        .all() as Array<{ name: string; sql: string }>

      expect(indexes).toHaveLength(1)
      const index = indexes[0]!
      expect(index.name).toBe('captures_content_hash_idx')
      expect(index.sql).toContain('UNIQUE')
      expect(index.sql).toContain('content_hash')
    })

    it('should create captures_channel_native_uid', () => {
      const indexes = db
        .prepare(
          `
        SELECT name, sql FROM sqlite_master
        WHERE type='index' AND name='captures_channel_native_uid'
      `
        )
        .all() as Array<{ name: string; sql: string }>

      expect(indexes).toHaveLength(1)
      const index = indexes[0]!
      expect(index.name).toBe('captures_channel_native_uid')
      expect(index.sql).toContain('UNIQUE')
      expect(index.sql).toContain('json_extract')
      expect(index.sql).toContain('$.channel')
      expect(index.sql).toContain('$.channel_native_id')
    })

    it('should create captures_status_idx', () => {
      const indexes = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='captures_status_idx'
      `
        )
        .all() as Array<{ name: string }>

      expect(indexes).toHaveLength(1)
      const index = indexes[0]!
      expect(index.name).toBe('captures_status_idx')
    })

    it('should create captures_created_at_idx', () => {
      const indexes = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='captures_created_at_idx'
      `
        )
        .all() as Array<{ name: string }>

      expect(indexes).toHaveLength(1)
      const index = indexes[0]!
      expect(index.name).toBe('captures_created_at_idx')
    })

    it('should create exports_audit_capture_idx', () => {
      const indexes = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='exports_audit_capture_idx'
      `
        )
        .all() as Array<{ name: string }>

      expect(indexes).toHaveLength(1)
      const index = indexes[0]!
      expect(index.name).toBe('exports_audit_capture_idx')
    })

    it('should create errors_log_stage_idx', () => {
      const indexes = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='errors_log_stage_idx'
      `
        )
        .all() as Array<{ name: string }>

      expect(indexes).toHaveLength(1)
      const index = indexes[0]!
      expect(index.name).toBe('errors_log_stage_idx')
    })

    it('should create errors_log_created_at_idx', () => {
      const indexes = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='errors_log_created_at_idx'
      `
        )
        .all() as Array<{ name: string }>

      expect(indexes).toHaveLength(1)
      const index = indexes[0]!
      expect(index.name).toBe('errors_log_created_at_idx')
    })

    it('should create all 7 required indexes', () => {
      const indexes = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `
        )
        .all() as Array<{ name: string }>

      const indexNames = indexes.map((i) => i.name)
      expect(indexNames).toEqual([
        'captures_channel_native_uid',
        'captures_content_hash_idx',
        'captures_created_at_idx',
        'captures_status_idx',
        'errors_log_created_at_idx',
        'errors_log_stage_idx',
        'exports_audit_capture_idx',
      ])
    })
  })

  describe('UNIQUE Constraint Enforcement', () => {
    it('should enforce UNIQUE constraint on content_hash (non-NULL)', () => {
      // Insert first capture with hash
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES ('01HQW3P7X0', 'voice', 'test', 'hash123', 'staged', '{}')
      `
      ).run()

      // Try to insert duplicate hash - should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
          VALUES ('01HQW3P7X1', 'voice', 'test', 'hash123', 'staged', '{}')
        `
        ).run()
      }).toThrow(/UNIQUE constraint failed/)
    })

    it('should allow multiple NULL content_hash values (partial index)', () => {
      // Multiple NULLs should be allowed (partial index WHERE content_hash IS NOT NULL)
      expect(() => {
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
          VALUES
            ('01HQW3P7X0', 'voice', 'test', NULL, 'staged', '{}'),
            ('01HQW3P7X1', 'voice', 'test', NULL, 'staged', '{}'),
            ('01HQW3P7X2', 'voice', 'test', NULL, 'staged', '{}')
        `
        ).run()
      }).not.toThrow()

      const count = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM captures WHERE content_hash IS NULL
      `
        )
        .get() as { count: number }
      expect(count.count).toBe(3)
    })

    it('should enforce UNIQUE constraint on (channel, channel_native_id)', () => {
      const metaJson = JSON.stringify({
        channel: 'voice',
        channel_native_id: 'voice-memo-123',
      })

      // Insert first capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7X0', 'voice', 'test', 'staged', ?)
      `
      ).run(metaJson)

      // Try to insert duplicate channel+native_id - should fail
      expect(() => {
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, status, meta_json)
          VALUES ('01HQW3P7X1', 'voice', 'test', 'staged', ?)
        `
        ).run(metaJson)
      }).toThrow(/UNIQUE constraint failed/)
    })

    it('should allow different channel_native_id combinations', () => {
      expect(() => {
        db.prepare(
          `
          INSERT INTO captures (id, source, raw_content, status, meta_json)
          VALUES
            ('01HQW3P7X0', 'voice', 'test', 'staged', ?),
            ('01HQW3P7X1', 'email', 'test', 'staged', ?)
        `
        ).run(
          JSON.stringify({ channel: 'voice', channel_native_id: 'voice-123' }),
          JSON.stringify({ channel: 'email', channel_native_id: 'msg-456' })
        )
      }).not.toThrow()

      const count = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM captures
      `
        )
        .get() as { count: number }
      expect(count.count).toBe(2)
    })
  })

  describe('Query Planner Index Usage', () => {
    it('should use content_hash index for duplicate detection', () => {
      // Insert test data
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES
          ('01HQW3P7X0', 'voice', 'test', 'hash123', 'staged', '{}'),
          ('01HQW3P7X1', 'voice', 'test', 'hash456', 'staged', '{}')
      `
      ).run()

      // Check query plan for hash lookup
      const plan = db
        .prepare(
          `
        EXPLAIN QUERY PLAN
        SELECT * FROM captures WHERE content_hash = 'hash123'
      `
        )
        .all() as Array<{ detail: string }>

      const planText = plan.map((p) => p.detail).join(' ')
      expect(planText).toContain('USING INDEX captures_content_hash_idx')
    })

    it('should use status index for recovery queries', () => {
      // Insert test data
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES
          ('01HQW3P7X0', 'voice', 'test', 'staged', '{}'),
          ('01HQW3P7X1', 'voice', 'test', 'transcribed', '{}'),
          ('01HQW3P7X2', 'voice', 'test', 'exported', '{}')
      `
      ).run()

      // Check query plan for status lookup
      const plan = db
        .prepare(
          `
        EXPLAIN QUERY PLAN
        SELECT * FROM captures WHERE status = 'staged'
      `
        )
        .all() as Array<{ detail: string }>

      const planText = plan.map((p) => p.detail).join(' ')
      expect(planText).toContain('USING INDEX captures_status_idx')
    })

    it('should use created_at index for time-ordered queries', () => {
      // Insert test data
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES
          ('01HQW3P7X0', 'voice', 'test', 'staged', '{}'),
          ('01HQW3P7X1', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      // Check query plan for created_at ordering
      const plan = db
        .prepare(
          `
        EXPLAIN QUERY PLAN
        SELECT * FROM captures ORDER BY created_at DESC LIMIT 10
      `
        )
        .all() as Array<{ detail: string }>

      const planText = plan.map((p) => p.detail).join(' ')
      expect(planText).toContain('USING INDEX captures_created_at_idx')
    })

    it('should use capture_id index for exports_audit joins', () => {
      // Insert test data
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES ('01HQW3P7X0', 'voice', 'test', 'staged', '{}')
      `
      ).run()

      db.prepare(
        `
        INSERT INTO exports_audit (id, capture_id, vault_path, mode)
        VALUES ('01HQW3P7Y0', '01HQW3P7X0', '/inbox/test.md', 'initial')
      `
      ).run()

      // Check query plan for join
      const plan = db
        .prepare(
          `
        EXPLAIN QUERY PLAN
        SELECT * FROM exports_audit WHERE capture_id = '01HQW3P7X0'
      `
        )
        .all() as Array<{ detail: string }>

      const planText = plan.map((p) => p.detail).join(' ')
      expect(planText).toContain('USING INDEX exports_audit_capture_idx')
    })

    it('should use stage index for errors_log filtering', () => {
      // Insert test data
      db.prepare(
        `
        INSERT INTO errors_log (id, stage, message)
        VALUES
          ('01HQW3P7Z0', 'transcribe', 'error 1'),
          ('01HQW3P7Z1', 'export', 'error 2')
      `
      ).run()

      // Check query plan for stage filtering
      const plan = db
        .prepare(
          `
        EXPLAIN QUERY PLAN
        SELECT * FROM errors_log WHERE stage = 'transcribe'
      `
        )
        .all() as Array<{ detail: string }>

      const planText = plan.map((p) => p.detail).join(' ')
      expect(planText).toContain('USING INDEX errors_log_stage_idx')
    })

    it('should use created_at index for errors_log time queries', () => {
      // Insert test data
      db.prepare(
        `
        INSERT INTO errors_log (id, stage, message)
        VALUES
          ('01HQW3P7Z0', 'transcribe', 'error 1'),
          ('01HQW3P7Z1', 'export', 'error 2')
      `
      ).run()

      // Check query plan for time-ordered errors
      const plan = db
        .prepare(
          `
        EXPLAIN QUERY PLAN
        SELECT * FROM errors_log ORDER BY created_at DESC LIMIT 10
      `
        )
        .all() as Array<{ detail: string }>

      const planText = plan.map((p) => p.detail).join(' ')
      expect(planText).toContain('USING INDEX errors_log_created_at_idx')
    })
  })

  describe('Index Performance Benchmarks', () => {
    it('should perform duplicate detection in < 10ms with 1000 captures', () => {
      // Insert 1000 test captures
      const stmt = db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, 'voice', 'test', ?, 'staged', '{}')
      `)

      for (let i = 0; i < 1000; i++) {
        stmt.run(`01HQW3P7X${i.toString().padStart(3, '0')}`, `hash${i}`)
      }

      // Benchmark duplicate detection
      const start = performance.now()
      const result = db
        .prepare(
          `
        SELECT * FROM captures WHERE content_hash = 'hash500'
      `
        )
        .get()
      const duration = performance.now() - start

      expect(result).toBeDefined()
      expect(duration).toBeLessThan(10) // < 10ms
    })

    it('should perform status-based recovery query in < 20ms with 1000 captures', () => {
      // Insert 1000 test captures with various statuses
      const stmt = db.prepare(`
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES (?, 'voice', 'test', ?, '{}')
      `)

      const statuses = ['staged', 'transcribed', 'exported']
      for (let i = 0; i < 1000; i++) {
        stmt.run(`01HQW3P7X${i.toString().padStart(3, '0')}`, statuses[i % statuses.length])
      }

      // Benchmark status query
      const start = performance.now()
      const results = db
        .prepare(
          `
        SELECT * FROM captures WHERE status = 'staged'
      `
        )
        .all()
      const duration = performance.now() - start

      expect(results.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(20) // < 20ms
    })

    it('should perform time-ordered query in < 15ms with 1000 captures', () => {
      // Insert 1000 test captures
      const stmt = db.prepare(`
        INSERT INTO captures (id, source, raw_content, status, meta_json)
        VALUES (?, 'voice', 'test', 'staged', '{}')
      `)

      for (let i = 0; i < 1000; i++) {
        stmt.run(`01HQW3P7X${i.toString().padStart(3, '0')}`)
      }

      // Benchmark time-ordered query
      const start = performance.now()
      const results = db
        .prepare(
          `
        SELECT * FROM captures ORDER BY created_at DESC LIMIT 10
      `
        )
        .all()
      const duration = performance.now() - start

      expect(results).toHaveLength(10)
      expect(duration).toBeLessThan(15) // < 15ms
    })
  })
})
