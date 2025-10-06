import { describe, it, expect, afterEach } from 'vitest'

describe('Schema Versioning', () => {
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

  describe('AC06: Schema version tracking in sync_state table', () => {
    it('should insert schema_version on initialization', async () => {
      // Dynamic imports (TestKit pattern)
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas } = await import('../schema/schema.js')

      // Create in-memory database
      const db = new Database(':memory:')
      databases.push(db)

      // Initialize database
      initializePragmas(db)
      createSchema(db)

      // Verify schema_version exists in sync_state
      const result = db.prepare("SELECT value FROM sync_state WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined

      expect(result).toBeDefined()
      expect(result?.value).toBe('1')
    })

    it('should use INSERT OR IGNORE to prevent duplication', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas } = await import('../schema/schema.js')

      const db = new Database(':memory:')
      databases.push(db)

      // Initialize database
      initializePragmas(db)
      createSchema(db)

      // Get initial version
      const getVersion = () =>
        db.prepare("SELECT value FROM sync_state WHERE key = 'schema_version'").get() as { value: string } | undefined

      const initialVersion = getVersion()
      expect(initialVersion?.value).toBe('1')

      // Re-run createSchema (simulates re-initialization)
      createSchema(db)

      // Verify no duplicate entries
      const count = db.prepare("SELECT COUNT(*) as count FROM sync_state WHERE key = 'schema_version'").get() as {
        count: number
      }

      expect(count.count).toBe(1)

      // Verify version unchanged
      const afterVersion = getVersion()
      expect(afterVersion?.value).toBe('1')
    })

    it('should preserve version across re-initialization', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas } = await import('../schema/schema.js')
      const { tmpdir } = await import('node:os')
      const { join } = await import('node:path')
      const { mkdirSync, rmSync } = await import('node:fs')

      // Create temp directory for file-based database (more realistic test)
      const testDir = join(tmpdir(), `test-version-${Date.now()}`)
      mkdirSync(testDir, { recursive: true })
      const dbPath = join(testDir, 'test.db')

      try {
        // Create and initialize database
        let db = new Database(dbPath)
        databases.push(db)

        initializePragmas(db)
        createSchema(db)

        // Verify initial version
        const getVersion = (database: any) =>
          database.prepare("SELECT value FROM sync_state WHERE key = 'schema_version'").get() as
            | { value: string }
            | undefined

        let version = getVersion(db)
        expect(version?.value).toBe('1')

        // Close database
        db.close()

        // Re-open database and re-initialize
        db = new Database(dbPath)
        databases.push(db)

        initializePragmas(db)
        createSchema(db)

        // Verify version preserved
        version = getVersion(db)
        expect(version?.value).toBe('1')

        // Verify still only one entry
        const count = db.prepare("SELECT COUNT(*) as count FROM sync_state WHERE key = 'schema_version'").get() as {
          count: number
        }
        expect(count.count).toBe(1)
      } finally {
        // Clean up test directory
        try {
          rmSync(testDir, { recursive: true, force: true })
           
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should store schema_version with correct timestamp', async () => {
      const Database = (await import('better-sqlite3')).default
      const { createSchema, initializePragmas } = await import('../schema/schema.js')

      const db = new Database(':memory:')
      databases.push(db)

      const before = Date.now()

      initializePragmas(db)
      createSchema(db)

      const after = Date.now()

      // Verify timestamp is set and within expected range
      const result = db.prepare("SELECT updated_at FROM sync_state WHERE key = 'schema_version'").get() as
        | { updated_at: string }
        | undefined

      expect(result).toBeDefined()
      expect(result?.updated_at).toBeDefined()

      // Parse the timestamp (SQLite format: 'YYYY-MM-DD HH:MM:SS')
      // Safe assertion: we've verified result is defined in expect() above
      if (!result) throw new Error('Result should be defined')
      const timestamp = result.updated_at
      const timestampMs = new Date(timestamp.replace(' ', 'T') + 'Z').getTime()

      // Timestamp should be between before and after (with some tolerance for timezone)
      expect(timestampMs).toBeGreaterThanOrEqual(before - 60000) // Allow 1 minute tolerance
      expect(timestampMs).toBeLessThanOrEqual(after + 60000)
    })
  })
})
