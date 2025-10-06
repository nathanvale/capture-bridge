/**
 * Database Integrity Check Tests (SQLITE_SCHEMA-AC07)
 *
 * Validates PRAGMA integrity_check functionality for the staging ledger.
 * Tests cover clean databases, file-based databases, and databases with data.
 *
 * Source: docs/features/staging-ledger/spec-staging-test.md
 * ADR: docs/adr/0003-four-table-hard-cap.md
 */

import { describe, it, expect, afterEach } from 'vitest'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

describe('Database Integrity Check (SQLITE_SCHEMA-AC07)', () => {
  const databases: Database[] = []

  afterEach(async () => {
    // 4-step cleanup sequence (TestKit pattern)
    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const database of databases) {
      try {
        if (database.open && !database.readonly) {
          database.close()
        }
      } catch {
        // Ignore close errors
      }
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  describe('Clean Database Validation', () => {
    it('should pass integrity check on clean in-memory database', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase, verifyIntegrity } = await import('../schema/schema.js')

      const db = new Database(':memory:')
      databases.push(db)

      // Initialize with full schema
      initializeDatabase(db)

      // Verify integrity
      const result = verifyIntegrity(db)

      expect(result.valid).toBe(true)
      expect(result.result).toBe('ok')
      expect(result.issues).toHaveLength(0)
    })

    it('should pass integrity check on clean file-based database', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase, verifyIntegrity } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      const testDir = join(tmpdir(), `test-integrity-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        const db = new Database(dbPath)
        databases.push(db)

        initializeDatabase(db)

        // Verify integrity
        const result = verifyIntegrity(db)

        expect(result.valid).toBe(true)
        expect(result.result).toBe('ok')
        expect(result.issues).toHaveLength(0)
      } finally {
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should pass integrity check after data insertion', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase, verifyIntegrity } = await import('../schema/schema.js')

      const db = new Database(':memory:')
      databases.push(db)

      initializeDatabase(db)

      // Insert test data
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run('01HQW3P7XKZM2YJVT8YFGQSZ4M', 'voice', 'test content', 'hash123', 'staged', '{}')

      // Verify integrity after insertion
      const result = verifyIntegrity(db)

      expect(result.valid).toBe(true)
      expect(result.result).toBe('ok')
      expect(result.issues).toHaveLength(0)
    })
  })

  describe('Integration with initializeDatabase', () => {
    it('should pass integrity check after full initialization', async () => {
      const Database = (await import('better-sqlite3')).default
      const { initializeDatabase, verifyIntegrity } = await import('../schema/schema.js')

      const db = new Database(':memory:')
      databases.push(db)

      // Full initialization (PRAGMAs + schema + version)
      initializeDatabase(db)

      // Verify integrity
      const result = verifyIntegrity(db)

      expect(result.valid).toBe(true)
      expect(result.result).toBe('ok')
      expect(result.issues).toHaveLength(0)
    })
  })
})
