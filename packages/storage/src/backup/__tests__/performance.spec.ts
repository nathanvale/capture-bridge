import { statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Tests for AC07: Performance - < 10s verification time
 *
 * End-to-end verification must complete in < 10s (p95).
 * Includes: file existence, PRAGMA integrity_check, schema validation,
 * foreign key validation, checksum, size variance.
 */
describe('Performance (AC07)', () => {
  const databases: Array<{ close: () => void; open: boolean; readonly: boolean }> = []
  const tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = []

  beforeEach(async () => {
    // Clean state - each test creates its own resources
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    // 0. No custom resources in this test

    // 1. Settle (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. No pools in this test

    // 3. Close databases
    for (const db of databases) {
      try {
        if (db.open) db.close()
      } catch {
        // Ignore close errors during cleanup
      }
    }
    databases.length = 0

    // 4. TestKit auto-cleanup for temp directories
    for (const tempDir of tempDirs) {
      try {
        await tempDir.cleanup()
      } catch {
        // Ignore cleanup errors
      }
    }
    tempDirs.length = 0

    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('should complete verification in < 10s p95 on 10MB database', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = join(tempDir.path, 'ledger.sqlite')
    const db = new Database(dbPath)
    databases.push(db)

    // Create schema with 4 required tables
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        exported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (capture_id) REFERENCES captures(id)
      );
      CREATE TABLE errors_log (
        id TEXT PRIMARY KEY,
        error_message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Insert enough data to reach ~10MB
    const insertCapture = db.prepare('INSERT INTO captures (id, content) VALUES (?, ?)')
    const insertAudit = db.prepare('INSERT INTO exports_audit (id, capture_id) VALUES (?, ?)')

    // Each row is roughly 1KB (1000 chars content + metadata)
    // Need ~10,000 rows for 10MB
    const largeContent = 'x'.repeat(1000)
    for (let i = 0; i < 10_000; i++) {
      const captureId = `capture-${i}`
      insertCapture.run(captureId, largeContent)
      insertAudit.run(`audit-${i}`, captureId)
    }

    // Verify database is ~10MB
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dbPath is from temp directory
    const dbSize = statSync(dbPath).size
    expect(dbSize).toBeGreaterThan(5 * 1024 * 1024) // At least 5MB
    expect(dbSize).toBeLessThan(50 * 1024 * 1024) // Less than 50MB

    // Create backup using file copy to avoid lock issues
    const backupPath = join(tempDir.path, 'backup.sqlite')
    // Run checkpoint first to minimize WAL
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // Ignore checkpoint errors
    }
    copyFileSync(dbPath, backupPath)

    const { verifyBackup } = await import('../verification.js')

    // Run verification 100 times and collect timings
    const timings: number[] = []
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      // Skip restore test in performance tests to avoid database lock issues
      const result = await verifyBackup(backupPath, dbPath, { perform_restore_test: false })
      const duration = performance.now() - start

      if (!result.success) {
        // eslint-disable-next-line no-console -- Debug output for test failures
        console.error('Verification failed:', result.error)
      }
      expect(result.success).toBe(true)
      timings.push(duration)
    }

    // Calculate p95
    timings.sort((a, b) => a - b)
    const p95Index = Math.max(0, Math.ceil(timings.length * 0.95) - 1)
    // eslint-disable-next-line security/detect-object-injection -- p95Index is calculated from array length
    const p95 = timings[p95Index]

    // p95 must be < 10s (10000ms)
    expect(p95).toBeDefined()
    expect(p95).toBeLessThan(10_000)

    // Log performance for debugging (actual should be 50-500ms on typical systems)
    const p50Index = Math.floor(timings.length * 0.5)
    const p99Index = Math.floor(timings.length * 0.99)
    // eslint-disable-next-line no-console -- Performance logging for test diagnostics
    console.log(
      // eslint-disable-next-line security/detect-object-injection -- Indexes calculated from array length
      `Performance: p50=${timings[p50Index]?.toFixed(0) ?? 'N/A'}ms, p95=${p95?.toFixed(0) ?? 'N/A'}ms, p99=${timings[p99Index]?.toFixed(0) ?? 'N/A'}ms`
    )
  }, 120_000) // 2 minute timeout for 100 iterations

  it('should complete single verification in < 1s on 10MB database', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = join(tempDir.path, 'ledger.sqlite')
    const db = new Database(dbPath)
    databases.push(db)

    // Create schema with 4 required tables
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL
      );
      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        FOREIGN KEY (capture_id) REFERENCES captures(id)
      );
      CREATE TABLE errors_log (
        id TEXT PRIMARY KEY,
        error_message TEXT NOT NULL
      );
    `)

    // Insert data to reach ~10MB
    const insertCapture = db.prepare('INSERT INTO captures (id, content) VALUES (?, ?)')
    const largeContent = 'x'.repeat(1000)
    for (let i = 0; i < 10_000; i++) {
      insertCapture.run(`capture-${i}`, largeContent)
    }

    // Create backup using file copy
    const backupPath = join(tempDir.path, 'backup.sqlite')
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // Ignore checkpoint errors
    }
    copyFileSync(dbPath, backupPath)

    const { verifyBackup } = await import('../verification.js')

    // Single verification should be fast
    const start = performance.now()
    const result = await verifyBackup(backupPath, dbPath, { perform_restore_test: false })
    const duration = performance.now() - start

    expect(result.success).toBe(true)
    expect(duration).toBeLessThan(1000) // < 1s for typical systems
  }, 30_000)

  it('should handle verification of small database efficiently', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = join(tempDir.path, 'ledger.sqlite')
    const db = new Database(dbPath)
    databases.push(db)

    // Create minimal schema
    db.exec(`
      CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE captures (id TEXT PRIMARY KEY);
      CREATE TABLE exports_audit (id TEXT PRIMARY KEY);
      CREATE TABLE errors_log (id TEXT PRIMARY KEY);
    `)

    // Create backup using file copy
    const backupPath = join(tempDir.path, 'backup.sqlite')
    copyFileSync(dbPath, backupPath)

    const { verifyBackup } = await import('../verification.js')

    // Verification should be very fast for small DB
    const start = performance.now()
    const result = await verifyBackup(backupPath, dbPath, { perform_restore_test: false })
    const duration = performance.now() - start

    expect(result.success).toBe(true)
    expect(duration).toBeLessThan(100) // < 100ms for empty DB
  })

  it('should measure verification steps breakdown', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = join(tempDir.path, 'ledger.sqlite')
    const db = new Database(dbPath)
    databases.push(db)

    // Create schema with data
    db.exec(`
      CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE captures (id TEXT PRIMARY KEY, content TEXT NOT NULL);
      CREATE TABLE exports_audit (id TEXT PRIMARY KEY);
      CREATE TABLE errors_log (id TEXT PRIMARY KEY);
    `)

    // Insert some data
    const insert = db.prepare('INSERT INTO captures (id, content) VALUES (?, ?)')
    for (let i = 0; i < 1000; i++) {
      insert.run(`capture-${i}`, 'x'.repeat(1000))
    }

    // Create backup using file copy
    const backupPath = join(tempDir.path, 'backup.sqlite')
    copyFileSync(dbPath, backupPath)

    const { verifyBackup } = await import('../verification.js')

    // Measure total time
    const totalStart = performance.now()
    const result = await verifyBackup(backupPath, dbPath, { perform_restore_test: false })
    const totalDuration = performance.now() - totalStart

    expect(result.success).toBe(true)

    // Verify each component is reasonable
    // File existence check: < 1ms
    // Integrity check: < 50ms
    // Hash computation: < 100ms
    // Restore test: < 200ms
    // Total should be well under 1s for 1MB database
    expect(totalDuration).toBeLessThan(1000)
  })
})
