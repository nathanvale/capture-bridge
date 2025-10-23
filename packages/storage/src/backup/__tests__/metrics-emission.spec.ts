import { copyFileSync } from 'node:fs'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Tests for AC08: Metric - backup_verification_result{status=success|failure}
 *
 * Emit metric with labels status='success' or 'failure'
 * Emitted after every verification attempt
 */
describe('Metrics Emission (AC08)', () => {
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

  it('should emit backup_verification_result metric with status=success on successful verification', async () => {
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

    // Mock metrics client
    const metricsEmitted: Array<{ name: string; value: number; labels: Record<string, string> }> = []
    const mockMetricsClient = {
      emit: (metric: { name: string; value: number; labels: Record<string, string> }) => {
        metricsEmitted.push(metric)
      },
    }

    const { verifyBackupWithMetrics } = await import('../metrics.js')

    // Create backup using copyFileSync to avoid lock issues
    const backupPath = `${tempDir.path}/backup.sqlite`
    copyFileSync(dbPath, backupPath)

    // Verify with metrics
    const result = await verifyBackupWithMetrics(backupPath, dbPath, mockMetricsClient)

    // Should emit success metric
    expect(result.success).toBe(true)
    expect(metricsEmitted).toHaveLength(1)
    expect(metricsEmitted[0]).toEqual({
      name: 'backup_verification_result',
      value: 1,
      labels: { status: 'success' },
    })
  })

  it('should emit backup_verification_result metric with status=failure on failed verification', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    // Mock metrics client
    const metricsEmitted: Array<{ name: string; value: number; labels: Record<string, string> }> = []
    const mockMetricsClient = {
      emit: (metric: { name: string; value: number; labels: Record<string, string> }) => {
        metricsEmitted.push(metric)
      },
    }

    const { verifyBackupWithMetrics } = await import('../metrics.js')

    // Try to verify non-existent file
    const result = await verifyBackupWithMetrics(
      '/nonexistent/backup.sqlite',
      '/nonexistent/live.sqlite',
      mockMetricsClient
    )

    // Should emit failure metric
    expect(result.success).toBe(false)
    expect(metricsEmitted).toHaveLength(1)
    expect(metricsEmitted[0]).toEqual({
      name: 'backup_verification_result',
      value: 1,
      labels: { status: 'failure' },
    })
  })

  it('should emit metrics for manual intervention (forceBackupAndVerify)', async () => {
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

    // Mock metrics client
    const metricsEmitted: Array<{ name: string; value: number; labels: Record<string, string> }> = []
    const mockMetricsClient = {
      emit: (metric: { name: string; value: number; labels: Record<string, string> }) => {
        metricsEmitted.push(metric)
      },
    }

    const { forceBackupAndVerifyWithMetrics } = await import('../metrics.js')

    // Force backup and verify with metrics
    const result = await forceBackupAndVerifyWithMetrics(db, tempDir.path, mockMetricsClient)

    // Should emit success metric
    expect(result.success).toBe(true)
    expect(metricsEmitted.length).toBeGreaterThanOrEqual(1)

    // Check that at least one metric has the expected structure
    const verificationMetric = metricsEmitted.find((m) => m.name === 'backup_verification_result')
    expect(verificationMetric).toBeDefined()
    expect(verificationMetric?.labels['status']).toBe('success')
  })

  it('should emit metrics on every verification attempt (multiple calls)', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = `${tempDir.path}/ledger.sqlite`
    const db = new Database(dbPath)
    databases.push(db)

    // Create minimal schema
    db.exec(`
      CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE captures (id TEXT PRIMARY KEY);
      CREATE TABLE exports_audit (id TEXT PRIMARY KEY);
      CREATE TABLE errors_log (id TEXT PRIMARY KEY);
    `)

    // Mock metrics client
    const metricsEmitted: Array<{ name: string; value: number; labels: Record<string, string> }> = []
    const mockMetricsClient = {
      emit: (metric: { name: string; value: number; labels: Record<string, string> }) => {
        metricsEmitted.push(metric)
      },
    }

    const { verifyBackupWithMetrics } = await import('../metrics.js')

    // Create backup using copyFileSync to avoid lock issues
    const backupPath = `${tempDir.path}/backup.sqlite`
    copyFileSync(dbPath, backupPath)

    // Verify multiple times
    for (let i = 0; i < 3; i++) {
      await verifyBackupWithMetrics(backupPath, dbPath, mockMetricsClient)
    }

    // Should emit 3 metrics (one per verification)
    expect(metricsEmitted).toHaveLength(3)
    expect(metricsEmitted.every((m) => m.name === 'backup_verification_result')).toBe(true)
    expect(metricsEmitted.every((m) => m.labels['status'] === 'success')).toBe(true)
  })

  it('should emit metrics with correct format (timestamp, name, value, labels)', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    const Database = (await import('better-sqlite3')).default
    const dbPath = `${tempDir.path}/ledger.sqlite`
    const db = new Database(dbPath)
    databases.push(db)

    // Create minimal schema
    db.exec(`
      CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE captures (id TEXT PRIMARY KEY);
      CREATE TABLE exports_audit (id TEXT PRIMARY KEY);
      CREATE TABLE errors_log (id TEXT PRIMARY KEY);
    `)

    // Mock metrics client that validates structure
    const metricsEmitted: Array<{ name: string; value: number; labels: Record<string, string> }> = []
    const mockMetricsClient = {
      emit: (metric: { name: string; value: number; labels: Record<string, string> }) => {
        // Validate metric structure
        expect(metric).toHaveProperty('name')
        expect(metric).toHaveProperty('value')
        expect(metric).toHaveProperty('labels')
        expect(typeof metric.name).toBe('string')
        expect(typeof metric.value).toBe('number')
        expect(typeof metric.labels).toBe('object')
        expect(metric.labels).toHaveProperty('status')
        expect(['success', 'failure']).toContain(metric.labels['status'])

        metricsEmitted.push(metric)
      },
    }

    const { verifyBackupWithMetrics } = await import('../metrics.js')

    // Create backup using copyFileSync to avoid lock issues
    const backupPath = `${tempDir.path}/backup.sqlite`
    copyFileSync(dbPath, backupPath)

    // Verify with metrics
    await verifyBackupWithMetrics(backupPath, dbPath, mockMetricsClient)

    // All validations passed in emit callback
    expect(metricsEmitted).toHaveLength(1)
  })
})
