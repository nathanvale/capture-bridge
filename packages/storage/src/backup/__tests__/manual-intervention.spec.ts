import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Tests for AC06: Manual intervention - `capture doctor --force-backup`
 *
 * Force immediate backup creation followed by verification.
 * If verification succeeds, resets escalation state to HEALTHY.
 */
describe('Manual Intervention (AC06)', () => {
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
        if (db.open && !db.readonly) db.close()
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

  it('should force backup and verify, resetting DEGRADED state on success', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = `${tempDir.path}/ledger.sqlite`
    const db = new Database(dbPath)
    databases.push(db)

    // Create schema
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE captures (id TEXT PRIMARY KEY);
      CREATE TABLE exports_audit (id TEXT PRIMARY KEY);
      CREATE TABLE errors_log (id TEXT PRIMARY KEY);
    `)

    // Set up DEGRADED_BACKUP state
    const degradedState = {
      consecutive_failures: 2,
      last_success_timestamp: '2025-10-15T10:00:00Z',
      last_failure_timestamp: '2025-10-20T11:00:00Z',
      status: 'DEGRADED_BACKUP',
    }

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      'backup_verification_state',
      JSON.stringify(degradedState)
    )

    // Import the manual intervention module (to be created)
    const { forceBackupAndVerify } = await import('../manual-intervention.js')
    const { getVerificationState } = await import('../escalation.js')

    // Force backup and verify
    const result = await forceBackupAndVerify(db, tempDir.path)

    // Should succeed
    expect(result.success).toBe(true)
    expect(result.backup_path).toBeDefined()
    expect(result.verification_result.success).toBe(true)

    // Verify escalation state reset
    const newState = await getVerificationState(db)
    expect(newState.status).toBe('HEALTHY')
    expect(newState.consecutive_failures).toBe(0)
  })

  it('should force backup and verify, resetting HALT_PRUNING state on success', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = `${tempDir.path}/ledger.sqlite`
    const db = new Database(dbPath)
    databases.push(db)

    // Create schema
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE captures (id TEXT PRIMARY KEY);
      CREATE TABLE exports_audit (id TEXT PRIMARY KEY);
      CREATE TABLE errors_log (id TEXT PRIMARY KEY);
    `)

    // Set up HALT_PRUNING state
    const haltState = {
      consecutive_failures: 3,
      last_success_timestamp: '2025-10-14T10:00:00Z',
      last_failure_timestamp: '2025-10-20T11:00:00Z',
      status: 'HALT_PRUNING',
    }

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      'backup_verification_state',
      JSON.stringify(haltState)
    )

    // Import the manual intervention module
    const { forceBackupAndVerify } = await import('../manual-intervention.js')
    const { getVerificationState } = await import('../escalation.js')

    // Force backup and verify
    const result = await forceBackupAndVerify(db, tempDir.path)

    // Should succeed
    expect(result.success).toBe(true)

    // Verify escalation state reset
    const newState = await getVerificationState(db)
    expect(newState.status).toBe('HEALTHY')
    expect(newState.consecutive_failures).toBe(0)
  })

  it('should maintain escalation state if backup verification fails', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = `${tempDir.path}/ledger.sqlite`
    const db = new Database(dbPath)
    databases.push(db)

    // Create schema (missing required tables to cause verification failure)
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE captures (id TEXT PRIMARY KEY);
    `)
    // Missing exports_audit and errors_log tables

    // Set up DEGRADED_BACKUP state
    const degradedState = {
      consecutive_failures: 2,
      last_success_timestamp: '2025-10-15T10:00:00Z',
      last_failure_timestamp: '2025-10-20T11:00:00Z',
      status: 'DEGRADED_BACKUP',
    }

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      'backup_verification_state',
      JSON.stringify(degradedState)
    )

    // Import the manual intervention module
    const { forceBackupAndVerify } = await import('../manual-intervention.js')
    const { getVerificationState } = await import('../escalation.js')

    // Force backup and verify (should fail verification)
    const result = await forceBackupAndVerify(db, tempDir.path)

    // Should report failure
    expect(result.success).toBe(false)
    expect(result.verification_result.success).toBe(false)

    // Verify escalation state worsened (now HALT_PRUNING)
    const newState = await getVerificationState(db)
    expect(newState.status).toBe('HALT_PRUNING')
    expect(newState.consecutive_failures).toBe(3)
  })

  it('should create backup with correct filename format', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = `${tempDir.path}/ledger.sqlite`
    const db = new Database(dbPath)
    databases.push(db)

    // Create minimal schema
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE captures (id TEXT PRIMARY KEY);
      CREATE TABLE exports_audit (id TEXT PRIMARY KEY);
      CREATE TABLE errors_log (id TEXT PRIMARY KEY);
    `)

    const { forceBackupAndVerify } = await import('../manual-intervention.js')

    // Force backup and verify
    const result = await forceBackupAndVerify(db, tempDir.path)

    // Verify backup path format matches: ledger-YYYYMMDD-HH.sqlite
    expect(result.backup_path).toMatch(/ledger-\d{8}-\d{2}\.sqlite$/)
  })

  it('should return detailed result with backup path and verification status', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = `${tempDir.path}/ledger.sqlite`
    const db = new Database(dbPath)
    databases.push(db)

    // Create minimal schema
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE captures (id TEXT PRIMARY KEY);
      CREATE TABLE exports_audit (id TEXT PRIMARY KEY);
      CREATE TABLE errors_log (id TEXT PRIMARY KEY);
    `)

    const { forceBackupAndVerify } = await import('../manual-intervention.js')

    // Force backup and verify
    const result = await forceBackupAndVerify(db, tempDir.path)

    // Verify result structure
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('backup_path')
    expect(result).toHaveProperty('verification_result')
    expect(result.verification_result).toHaveProperty('success')
    expect(result.verification_result).toHaveProperty('integrity_check_passed')
    expect(result.verification_result).toHaveProperty('hash_match')
  })
})
