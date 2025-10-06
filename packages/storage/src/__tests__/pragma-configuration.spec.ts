import { describe, it, expect, afterEach } from 'vitest'

describe('PRAGMA Configuration', () => {
  const databases: any[] = []

  afterEach(async () => {
    // 4-step cleanup sequence (TestKit pattern)
    // 0. Settling delay
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 1. Close databases
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

    // 2. Clean filesystem (not needed for in-memory)

    // 3. Force GC if available
    if (global.gc) global.gc()
  })

  describe('AC04: WAL mode enabled', () => {
    it('should enable WAL journal mode', async () => {
      // Dynamic imports (TestKit pattern)
      const Database = (await import('better-sqlite3')).default
      const { createSchema } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      // Create temp directory for file-based database (WAL requires file)
      const testDir = join(tmpdir(), `test-pragma-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        // Create file-based database (WAL mode requires file-based DB)
        const db = new Database(dbPath)
        databases.push(db)

        // Initialize PRAGMAs first (per existing test pattern)
        const { initializePragmas } = await import('../schema/schema.js')
        initializePragmas(db)

        // Then create schema
        createSchema(db)

        // Verify journal_mode is WAL
        const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
        expect(result).toBeDefined()
        expect(result.journal_mode.toLowerCase()).toBe('wal')
      } finally {
        // Clean up test directory
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should persist WAL mode after initialization', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      const testDir = join(tmpdir(), `test-pragma-persist-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        const db = new Database(dbPath)
        databases.push(db)

        // Initialize PRAGMAs first (per existing test pattern)
        const { initializePragmas } = await import('../schema/schema.js')
        initializePragmas(db)

        // Then create schema
        createSchema(db)

        // Execute a write operation
        db.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY)')

        // Re-check journal mode
        const result = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
        expect(result.journal_mode.toLowerCase()).toBe('wal')

        // Clean up test table
        db.exec('DROP TABLE test_table')
      } finally {
        // Clean up test directory
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })
  })

  describe('AC05: Multi-PRAGMA verification', () => {
    it('should set synchronous to NORMAL', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      const testDir = join(tmpdir(), `test-pragma-sync-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        const db = new Database(dbPath)
        databases.push(db)

        initializePragmas(db)
        createSchema(db)

        // Verify synchronous is NORMAL (returns '1' for NORMAL)
        const result = db.prepare('PRAGMA synchronous').get() as { synchronous: number }
        expect(result).toBeDefined()
        expect(result.synchronous).toBe(1) // 1 = NORMAL
      } finally {
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should enable foreign keys', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      const testDir = join(tmpdir(), `test-pragma-fk-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        const db = new Database(dbPath)
        databases.push(db)

        initializePragmas(db)
        createSchema(db)

        // Verify foreign_keys is ON (returns 1)
        const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
        expect(result).toBeDefined()
        expect(result.foreign_keys).toBe(1) // 1 = ON
      } finally {
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should set busy_timeout to 5000ms', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      const testDir = join(tmpdir(), `test-pragma-timeout-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        const db = new Database(dbPath)
        databases.push(db)

        initializePragmas(db)
        createSchema(db)

        // Verify busy_timeout is 5000 (returns as 'timeout' property)
        const result = db.prepare('PRAGMA busy_timeout').get() as { timeout: number }
        expect(result).toBeDefined()
        expect(result.timeout).toBe(5000)
      } finally {
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should verify all PRAGMAs together', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      const testDir = join(tmpdir(), `test-pragma-all-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        const db = new Database(dbPath)
        databases.push(db)

        initializePragmas(db)
        createSchema(db)

        // Check all critical PRAGMAs at once
        const journalMode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
        const synchronous = db.prepare('PRAGMA synchronous').get() as { synchronous: number }
        const foreignKeys = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
        const busyTimeout = db.prepare('PRAGMA busy_timeout').get() as { timeout: number }

        expect(journalMode.journal_mode.toLowerCase()).toBe('wal')
        expect(synchronous.synchronous).toBe(1) // NORMAL
        expect(foreignKeys.foreign_keys).toBe(1) // ON
        expect(busyTimeout.timeout).toBe(5000)
      } finally {
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })
  })

  describe('verifyPragmas utility', () => {
    it('should validate all PRAGMAs are correctly set', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas, verifyPragmas } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      const testDir = join(tmpdir(), `test-verify-pragmas-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        const db = new Database(dbPath)
        databases.push(db)

        // Verify before initialization
        let result = verifyPragmas(db)
        expect(result.valid).toBe(false)
        expect(result.issues.length).toBeGreaterThan(0) // At least some PRAGMAs incorrect

        // Initialize PRAGMAs
        initializePragmas(db)
        createSchema(db)

        // Verify after initialization
        result = verifyPragmas(db)
        expect(result.valid).toBe(true)
        expect(result.issues).toHaveLength(0)
      } finally {
        try {
          rmSync(testDir, { recursive: true, force: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should handle in-memory databases correctly', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas, verifyPragmas } = await import('../schema/schema.js')

      const db = new Database(':memory:')
      databases.push(db)

      initializePragmas(db)
      createSchema(db)

      // Verify PRAGMAs (journal_mode will be 'memory' for in-memory DBs)
      const result = verifyPragmas(db)
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })
  })
})
