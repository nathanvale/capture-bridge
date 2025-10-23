import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Tests for AC05: Automatic recovery on next successful verification
 *
 * When escalation_state='DEGRADED_BACKUP' or 'HALT_PRUNING' and next
 * verification succeeds → reset to HEALTHY
 */
describe('Automatic Recovery (AC05)', () => {
  const databases: Array<{ close: () => void; open: boolean; readonly: boolean }> = []

  beforeEach(async () => {
    // Clean state - each test creates its own in-memory db
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

    // 4. TestKit auto-cleanup (no temp directories in this test)

    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('should reset from DEGRADED_BACKUP to HEALTHY on success', async () => {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(':memory:')
    databases.push(db)

    // Create sync_state table
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Set up DEGRADED_BACKUP state (2 consecutive failures)
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

    // Import the recovery module (to be created)
    const { handleVerificationResult } = await import('../recovery.js')
    const { getVerificationState } = await import('../escalation.js')

    // Simulate successful verification
    await handleVerificationResult(db, { success: true, integrity_check_passed: true, hash_match: true })

    // Verify state reset to HEALTHY
    const newState = await getVerificationState(db)
    expect(newState.status).toBe('HEALTHY')
    expect(newState.consecutive_failures).toBe(0)
    expect(newState.last_success_timestamp).not.toBeNull()
  })

  it('should reset from HALT_PRUNING to HEALTHY on success', async () => {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(':memory:')
    databases.push(db)

    // Create sync_state table
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Set up HALT_PRUNING state (3+ consecutive failures)
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

    // Import the recovery module
    const { handleVerificationResult } = await import('../recovery.js')
    const { getVerificationState } = await import('../escalation.js')

    // Simulate successful verification
    await handleVerificationResult(db, { success: true, integrity_check_passed: true, hash_match: true })

    // Verify state reset to HEALTHY
    const newState = await getVerificationState(db)
    expect(newState.status).toBe('HEALTHY')
    expect(newState.consecutive_failures).toBe(0)
    expect(newState.last_success_timestamp).not.toBeNull()
  })

  it('should reset from WARN to HEALTHY on success', async () => {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(':memory:')
    databases.push(db)

    // Create sync_state table
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Set up WARN state (1 consecutive failure)
    const warnState = {
      consecutive_failures: 1,
      last_success_timestamp: '2025-10-15T10:00:00Z',
      last_failure_timestamp: '2025-10-20T11:00:00Z',
      status: 'WARN',
    }

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      'backup_verification_state',
      JSON.stringify(warnState)
    )

    // Import the recovery module
    const { handleVerificationResult } = await import('../recovery.js')
    const { getVerificationState } = await import('../escalation.js')

    // Simulate successful verification
    await handleVerificationResult(db, { success: true, integrity_check_passed: true, hash_match: true })

    // Verify state reset to HEALTHY
    const newState = await getVerificationState(db)
    expect(newState.status).toBe('HEALTHY')
    expect(newState.consecutive_failures).toBe(0)
  })

  it('should increment failures on verification failure', async () => {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(':memory:')
    databases.push(db)

    // Create sync_state table
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Start from WARN state (1 failure)
    const warnState = {
      consecutive_failures: 1,
      last_success_timestamp: '2025-10-15T10:00:00Z',
      last_failure_timestamp: '2025-10-19T11:00:00Z',
      status: 'WARN',
    }

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      'backup_verification_state',
      JSON.stringify(warnState)
    )

    // Import the recovery module
    const { handleVerificationResult } = await import('../recovery.js')
    const { getVerificationState } = await import('../escalation.js')

    // Simulate failed verification
    await handleVerificationResult(db, {
      success: false,
      integrity_check_passed: false,
      hash_match: false,
      error: 'Integrity check failed',
    })

    // Verify state escalated to DEGRADED_BACKUP
    const newState = await getVerificationState(db)
    expect(newState.status).toBe('DEGRADED_BACKUP')
    expect(newState.consecutive_failures).toBe(2)
    expect(newState.last_failure_timestamp).not.toBeNull()
  })

  it('should preserve last_failure_timestamp on success', async () => {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(':memory:')
    databases.push(db)

    // Create sync_state table
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Set up DEGRADED_BACKUP state with known timestamps
    const originalFailureTime = '2025-10-20T11:00:00Z'
    const degradedState = {
      consecutive_failures: 2,
      last_success_timestamp: '2025-10-15T10:00:00Z',
      last_failure_timestamp: originalFailureTime,
      status: 'DEGRADED_BACKUP',
    }

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      'backup_verification_state',
      JSON.stringify(degradedState)
    )

    const { handleVerificationResult } = await import('../recovery.js')
    const { getVerificationState } = await import('../escalation.js')

    // Simulate successful verification
    await handleVerificationResult(db, { success: true, integrity_check_passed: true, hash_match: true })

    // Verify last_failure_timestamp preserved
    const newState = await getVerificationState(db)
    expect(newState.last_failure_timestamp).toEqual(new Date(originalFailureTime))
  })

  it('should preserve last_success_timestamp on failure', async () => {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(':memory:')
    databases.push(db)

    // Create sync_state table
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Set up WARN state with known timestamps
    const originalSuccessTime = '2025-10-15T10:00:00Z'
    const warnState = {
      consecutive_failures: 1,
      last_success_timestamp: originalSuccessTime,
      last_failure_timestamp: '2025-10-19T11:00:00Z',
      status: 'WARN',
    }

    db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?)').run(
      'backup_verification_state',
      JSON.stringify(warnState)
    )

    const { handleVerificationResult } = await import('../recovery.js')
    const { getVerificationState } = await import('../escalation.js')

    // Simulate failed verification
    await handleVerificationResult(db, {
      success: false,
      integrity_check_passed: false,
      hash_match: false,
      error: 'Integrity check failed',
    })

    // Verify last_success_timestamp preserved
    const newState = await getVerificationState(db)
    expect(newState.last_success_timestamp).toEqual(new Date(originalSuccessTime))
  })
})
