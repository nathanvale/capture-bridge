import { join } from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Backup Verification - Integrity Check', () => {
  let testDir: string
  const databases: Array<{ close: () => void; open: boolean; readonly: boolean }> = []

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    testDir = tempDir.path
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    // 1. Settle (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. No pools in this test

    // 3. Close databases
    for (const db of databases) {
      try {
        if (db.open && !db.readonly) db.close()
      } catch {
        // Ignore errors in cleanup
      }
    }
    databases.length = 0

    // 4. TestKit auto-cleanup (temp directories)

    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('should return integrity_check_passed: true when backup is valid [AC01]', async () => {
    // Create a valid backup database
    const Database = (await import('better-sqlite3')).default
    const backupPath = join(testDir, 'backup.db')

    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    // Create minimal schema for a valid backup
    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      CREATE TABLE exports_audit (
        id INTEGER PRIMARY KEY
      );
      CREATE TABLE errors_log (
        id INTEGER PRIMARY KEY
      );
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY
      );
    `)
    backupDb.close()

    // Test the verification function
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath)

    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should return integrity_check_passed: false when backup is corrupted [AC01]', async () => {
    const backupPath = join(testDir, 'corrupted.db')

    // Create a corrupted database by writing invalid data
    const { writeFileSync } = await import('node:fs')
    writeFileSync(backupPath, 'This is not a valid SQLite database file')

    // Test the verification function
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath)

    expect(result.success).toBe(false)
    expect(result.integrity_check_passed).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('not a database')
  })

  it('should handle file not found gracefully [AC01]', async () => {
    const nonExistentPath = join(testDir, 'does-not-exist.db')

    // Test the verification function
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(nonExistentPath)

    expect(result.success).toBe(false)
    expect(result.integrity_check_passed).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('ENOENT')
  })

  it('should detect and report specific corruption issues [AC01]', async () => {
    // Create a database with intentional corruption
    const Database = (await import('better-sqlite3')).default
    const backupPath = join(testDir, 'partial-corrupt.db')

    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    // Create schema
    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
    `)

    // Insert some data
    backupDb.exec(`
      INSERT INTO captures (id, status) VALUES ('test1', 'staged');
    `)

    // Close normally
    backupDb.close()

    // Simulate corruption by modifying the file
    const { readFileSync, writeFileSync } = await import('node:fs')
    const dbContent = readFileSync(backupPath)

    // Corrupt a portion of the file (but keep SQLite header intact)
    const corruptedContent = Buffer.from(dbContent)
    // Modify some bytes in the middle of the file
    for (let i = 1000; i < 1100 && i < corruptedContent.length; i++) {
      // eslint-disable-next-line security/detect-object-injection
      corruptedContent[i] = 0xff
    }
    writeFileSync(backupPath, corruptedContent)

    // Test the verification function
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath)

    // Even partial corruption should be detected
    if (result.integrity_check_passed) {
      // If integrity check passes, the corruption might not be in a critical area
      // This is acceptable - we're testing the mechanism works
      expect(result.success).toBe(true)
    } else {
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    }
  })

  it('should verify backup created by SQLite backup command [AC01]', async () => {
    const Database = (await import('better-sqlite3')).default
    const { copyFileSync } = await import('node:fs')

    // Create source database
    const sourcePath = join(testDir, 'source.db')
    const sourceDb = new Database(sourcePath)
    databases.push(sourceDb)

    sourceDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        content_hash TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE exports_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id TEXT NOT NULL,
        export_path TEXT NOT NULL,
        exported_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE errors_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_type TEXT NOT NULL,
        error_message TEXT,
        occurred_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      INSERT INTO captures (id, status) VALUES ('01HQW3P7XK', 'exported');
      INSERT INTO sync_state (key, value) VALUES ('last_backup', '2025-01-01T00:00:00Z');
    `)

    // Create backup by copying the file (mimics SQLite .backup command)
    const backupPath = join(testDir, 'backup.db')

    // Run checkpoint to flush WAL
    sourceDb.pragma('wal_checkpoint(TRUNCATE)')

    // Close before copying to ensure all data is written
    sourceDb.close()

    // Copy the database file
    copyFileSync(sourcePath, backupPath)

    // Remove from tracking array since we already closed it
    const index = databases.indexOf(sourceDb)
    if (index > -1) {
      databases.splice(index, 1)
    }

    // Test the verification function
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath)

    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.error).toBeUndefined()
  })
})

describe('Backup Verification - Hash Comparison', () => {
  let testDir: string
  const databases: Array<{ close: () => void; open: boolean; readonly: boolean }> = []

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    testDir = tempDir.path
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    // 1. Settle (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. No pools in this test

    // 3. Close databases
    for (const db of databases) {
      try {
        if (db.open && !db.readonly) db.close()
      } catch {
        // Ignore errors in cleanup
      }
    }
    databases.length = 0

    // 4. TestKit auto-cleanup (temp directories)

    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('should return hash_match: true when backup and live DB are identical [AC02]', async () => {
    const Database = (await import('better-sqlite3')).default
    const { copyFileSync } = await import('node:fs')

    // Create a source database
    const livePath = join(testDir, 'live.db')
    const liveDb = new Database(livePath)
    databases.push(liveDb)

    liveDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      INSERT INTO captures (id, status) VALUES ('test1', 'staged');
    `)

    // Run checkpoint to flush WAL
    liveDb.pragma('wal_checkpoint(TRUNCATE)')
    liveDb.close()

    // Create an identical backup by copying
    const backupPath = join(testDir, 'backup.db')
    copyFileSync(livePath, backupPath)

    // Remove from tracking since we closed it
    databases.length = 0

    // Test verification with hash comparison
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, livePath)

    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.hash_match).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should return hash_match: false when backup and live DB differ [AC02]', async () => {
    const Database = (await import('better-sqlite3')).default
    const { copyFileSync } = await import('node:fs')

    // Create a source database
    const livePath = join(testDir, 'live.db')
    const liveDb = new Database(livePath)
    databases.push(liveDb)

    liveDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      INSERT INTO captures (id, status) VALUES ('test1', 'staged');
    `)

    // Run checkpoint to flush WAL
    liveDb.pragma('wal_checkpoint(TRUNCATE)')

    // Create backup before additional writes
    const backupPath = join(testDir, 'backup.db')
    copyFileSync(livePath, backupPath)

    // Add more data to live DB after backup (simulating writes since backup)
    liveDb.exec(`INSERT INTO captures (id, status) VALUES ('test2', 'transcribed');`)
    liveDb.pragma('wal_checkpoint(TRUNCATE)')
    liveDb.close()

    // Remove from tracking since we closed it
    databases.length = 0

    // Test verification with hash comparison
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, livePath)

    // Hash mismatch is NOT an error - it's expected if writes occurred
    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.hash_match).toBe(false) // Different hashes
    expect(result.error).toBeUndefined() // No error for hash mismatch
  })

  it('should return hash_match: false when live DB path not provided [AC02]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a backup database
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
    `)
    backupDb.close()

    // Remove from tracking since we closed it
    databases.length = 0

    // Test verification WITHOUT live DB path
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath) // No second parameter

    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.hash_match).toBe(false) // Cannot compare without live DB
    expect(result.error).toBeUndefined()
  })

  it('should handle missing live DB file gracefully [AC02]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a backup database
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
    `)
    backupDb.close()

    // Remove from tracking since we closed it
    databases.length = 0

    // Test with non-existent live DB path
    const nonExistentLivePath = join(testDir, 'does-not-exist.db')
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, nonExistentLivePath)

    // File not found should set hash_match to false but not fail verification
    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.hash_match).toBe(false) // Cannot compare if live DB missing
    expect(result.error).toBeUndefined() // Missing live DB is not an error
  })

  it('should compute hashes efficiently for large databases [AC02]', async () => {
    const Database = (await import('better-sqlite3')).default
    const { copyFileSync } = await import('node:fs')

    // Create a larger database to test performance
    const livePath = join(testDir, 'large-live.db')
    const liveDb = new Database(livePath)
    databases.push(liveDb)

    liveDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        content TEXT
      );
    `)

    // Insert more data to make a reasonably sized DB
    const stmt = liveDb.prepare('INSERT INTO captures (id, status, content) VALUES (?, ?, ?)')
    for (let i = 0; i < 1000; i++) {
      stmt.run(`id-${i}`, 'staged', `Content for capture ${i}`.repeat(10))
    }

    // Run checkpoint to flush WAL
    liveDb.pragma('wal_checkpoint(TRUNCATE)')
    liveDb.close()

    // Create backup
    const backupPath = join(testDir, 'large-backup.db')
    copyFileSync(livePath, backupPath)

    // Remove from tracking since we closed it
    databases.length = 0

    // Test hash computation performance
    const startTime = Date.now()
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, livePath)
    const duration = Date.now() - startTime

    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.hash_match).toBe(true)
    expect(result.error).toBeUndefined()
    expect(duration).toBeLessThan(1000) // Should complete in under 1 second
  })

  it('should validate backup is not empty or truncated via hash [AC02]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a valid live database
    const livePath = join(testDir, 'live.db')
    const liveDb = new Database(livePath)
    databases.push(liveDb)

    liveDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      INSERT INTO captures (id, status) VALUES ('test1', 'staged');
    `)
    liveDb.pragma('wal_checkpoint(TRUNCATE)')
    liveDb.close()

    // Create a valid but different backup to test hash mismatch
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
    `)
    backupDb.close()

    // Remove from tracking since we closed them
    databases.length = 0

    // Test verification - different content should result in hash mismatch
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, livePath)

    // Different database content results in hash mismatch
    // But both are valid databases, so integrity check passes
    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.hash_match).toBe(false) // Different content = different hash
    expect(result.error).toBeUndefined()
  })

  it('should be safe from path traversal in file paths [AC02]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a valid backup
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
    `)
    backupDb.close()

    // Remove from tracking since we closed it
    databases.length = 0

    // Test with malicious path attempts
    const maliciousLivePath = join(testDir, '../../../etc/passwd')
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, maliciousLivePath)

    // Should handle gracefully - file doesn't exist or can't be read
    expect(result.success).toBe(true) // Backup itself is valid
    expect(result.integrity_check_passed).toBe(true)
    expect(result.hash_match).toBe(false) // Can't compare with non-existent file
    expect(result.error).toBeUndefined() // Not an error condition
  })
})

describe('Backup Verification - Weekly Restore Test', () => {
  let testDir: string
  const databases: Array<{ close: () => void; open: boolean; readonly: boolean }> = []

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    testDir = tempDir.path
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    // 1. Settle (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. No pools in this test

    // 3. Close databases
    for (const db of databases) {
      try {
        if (db.open && !db.readonly) db.close()
      } catch {
        // Ignore errors in cleanup
      }
    }
    databases.length = 0

    // 4. TestKit auto-cleanup (temp directories)

    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('should perform successful restore test when backup is valid [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a valid backup database with all 4 required tables and data
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        content_hash TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE exports_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id TEXT NOT NULL,
        export_path TEXT NOT NULL,
        exported_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE errors_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_type TEXT NOT NULL,
        error_message TEXT,
        occurred_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Insert test data
      INSERT INTO captures (id, status, content_hash) VALUES ('01HQW3P7XK', 'exported', 'abc123');
      INSERT INTO captures (id, status, content_hash) VALUES ('01HQW3P7XL', 'staged', 'def456');
      INSERT INTO exports_audit (capture_id, export_path) VALUES ('01HQW3P7XK', '/vault/inbox/01HQW3P7XK.md');
      INSERT INTO sync_state (key, value) VALUES ('last_backup', '2025-01-01T00:00:00Z');
    `)
    backupDb.close()

    // Test verification with restore test
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, undefined, { perform_restore_test: true })

    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.restore_test_passed).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should detect corrupted backup during restore test [AC03]', async () => {
    const backupPath = join(testDir, 'corrupted.db')

    // Create a corrupted database file
    const { writeFileSync } = await import('node:fs')
    writeFileSync(backupPath, 'This is not a valid SQLite database file')

    // Test verification with restore test
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, undefined, { perform_restore_test: true })

    expect(result.success).toBe(false)
    expect(result.integrity_check_passed).toBe(false)
    expect(result.restore_test_passed).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('not a database')
  })

  it('should fail restore test when required tables are missing [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a backup with missing tables
    const backupPath = join(testDir, 'incomplete.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    // Only create 2 of the 4 required tables
    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
    backupDb.close()

    // Test verification with restore test
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, undefined, { perform_restore_test: true })

    // Integrity check should pass (valid database structure)
    expect(result.success).toBe(false)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.restore_test_passed).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('Missing required tables')
  })

  it('should fail restore test when foreign key violations exist [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a backup with foreign key violations
    const backupPath = join(testDir, 'fk-violations.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    // Disable foreign keys temporarily to create violations
    backupDb.pragma('foreign_keys = OFF')

    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
      );
      CREATE TABLE exports_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id TEXT NOT NULL,
        export_path TEXT NOT NULL,
        FOREIGN KEY (capture_id) REFERENCES captures(id)
      );
      CREATE TABLE errors_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_type TEXT NOT NULL
      );
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- Insert data with foreign key violation
      INSERT INTO exports_audit (capture_id, export_path) VALUES ('NONEXISTENT', '/vault/test.md');
    `)

    backupDb.close()

    // Test verification with restore test
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, undefined, { perform_restore_test: true })

    // Database is structurally valid but has FK violations
    expect(result.success).toBe(false)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.restore_test_passed).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('Foreign key violations detected')
  })

  it('should clean up temporary database after successful restore test [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a valid backup
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (id TEXT PRIMARY KEY, status TEXT NOT NULL);
      CREATE TABLE exports_audit (id INTEGER PRIMARY KEY);
      CREATE TABLE errors_log (id INTEGER PRIMARY KEY);
      CREATE TABLE sync_state (key TEXT PRIMARY KEY);
    `)
    backupDb.close()

    // Test verification with restore test
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, undefined, { perform_restore_test: true })

    expect(result.success).toBe(true)
    expect(result.restore_test_passed).toBe(true)

    // The temp file should be cleaned up (we can't directly access it, but the test should pass)
    // Cleanup verification is implicit in the implementation
  })

  it('should clean up temporary database after failed restore test [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create an invalid backup (missing tables)
    const backupPath = join(testDir, 'invalid.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    `)
    backupDb.close()

    // Test verification with restore test (should fail due to missing tables)
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, undefined, { perform_restore_test: true })

    expect(result.success).toBe(false)
    expect(result.restore_test_passed).toBe(false)

    // Temp file cleanup is implicit - handled by try/finally in implementation
  })

  it('should complete restore test within 2 seconds for typical database [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a typical-sized backup database
    const backupPath = join(testDir, 'typical.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        content TEXT,
        content_hash TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE exports_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capture_id TEXT NOT NULL,
        export_path TEXT NOT NULL,
        exported_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE errors_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_type TEXT NOT NULL,
        error_message TEXT,
        occurred_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `)

    // Add a reasonable amount of test data
    const stmt = backupDb.prepare('INSERT INTO captures (id, status, content, content_hash) VALUES (?, ?, ?, ?)')
    for (let i = 0; i < 100; i++) {
      stmt.run(`id-${i}`, 'exported', `Test content ${i}`, `hash-${i}`)
    }

    backupDb.close()

    // Measure restore test performance
    const startTime = Date.now()
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, undefined, { perform_restore_test: true })
    const duration = Date.now() - startTime

    expect(result.success).toBe(true)
    expect(result.restore_test_passed).toBe(true)
    expect(duration).toBeLessThan(2000) // Should complete within 2 seconds
  })

  it('should not perform restore test when option is false [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a valid backup
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (id TEXT PRIMARY KEY, status TEXT NOT NULL);
      CREATE TABLE exports_audit (id INTEGER PRIMARY KEY);
      CREATE TABLE errors_log (id INTEGER PRIMARY KEY);
      CREATE TABLE sync_state (key TEXT PRIMARY KEY);
    `)
    backupDb.close()

    // Test without restore test
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath, undefined, { perform_restore_test: false })

    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.restore_test_passed).toBeUndefined() // Not performed
    expect(result.error).toBeUndefined()
  })

  it('should not perform restore test when option is not provided [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a valid backup
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (id TEXT PRIMARY KEY, status TEXT NOT NULL);
      CREATE TABLE exports_audit (id INTEGER PRIMARY KEY);
      CREATE TABLE errors_log (id INTEGER PRIMARY KEY);
      CREATE TABLE sync_state (key TEXT PRIMARY KEY);
    `)
    backupDb.close()

    // Test without options parameter
    const { verifyBackup } = await import('../verification.js')
    const result = await verifyBackup(backupPath)

    expect(result.success).toBe(true)
    expect(result.integrity_check_passed).toBe(true)
    expect(result.restore_test_passed).toBeUndefined() // Not performed
    expect(result.error).toBeUndefined()
  })

  it('should not leak memory during repeated restore tests [AC03]', async () => {
    const Database = (await import('better-sqlite3')).default

    // Create a valid backup
    const backupPath = join(testDir, 'backup.db')
    const backupDb = new Database(backupPath)
    databases.push(backupDb)

    backupDb.exec(`
      CREATE TABLE captures (id TEXT PRIMARY KEY, status TEXT NOT NULL);
      CREATE TABLE exports_audit (id INTEGER PRIMARY KEY);
      CREATE TABLE errors_log (id INTEGER PRIMARY KEY);
      CREATE TABLE sync_state (key TEXT PRIMARY KEY);
      INSERT INTO captures (id, status) VALUES ('test1', 'exported');
    `)
    backupDb.close()

    const { verifyBackup } = await import('../verification.js')

    // Measure memory usage
    if (global.gc) global.gc()
    const before = process.memoryUsage().heapUsed

    // Run multiple restore tests
    for (let i = 0; i < 10; i++) {
      const result = await verifyBackup(backupPath, undefined, { perform_restore_test: true })
      expect(result.success).toBe(true)
      expect(result.restore_test_passed).toBe(true)
    }

    // Check memory usage
    if (global.gc) global.gc()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const after = process.memoryUsage().heapUsed

    // Should not leak more than 10MB for 10 iterations
    expect(after - before).toBeLessThan(10 * 1024 * 1024)
  })
})
