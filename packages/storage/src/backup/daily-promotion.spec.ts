/**
 * Daily Backup Promotion Tests (TDD)
 *
 * AC05: Daily promotion - copy 1 per day to daily set (keep last 7)
 *
 * Test Requirements:
 * - Promotes one hourly backup per day to daily set
 * - Keeps last 7 daily backups only
 * - Selects noon backup for daily promotion (or earliest if noon unavailable)
 * - Skips promotion if verification fails
 * - Preserves file permissions (0600)
 *
 * Spec: docs/features/staging-ledger/spec-staging-tech.md §2.4
 * Guides: guide-backup-verification.md, guide-backup-restore-drill.md
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type DatabaseInstance = ReturnType<typeof Database>

describe('Daily Backup Promotion', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []
  let vaultRoot: string
  interface CleanupHandle {
    cleanup: () => Promise<void>
  }
  const cleanupHandles: CleanupHandle[] = []

  beforeEach(async () => {
    // Use TestKit temp directory
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    vaultRoot = tempDir.path
    // Track for filesystem cleanup in afterEach
    cleanupHandles.push(tempDir)

    // Initialize a file-based database for backup testing
    const dbPath = join(vaultRoot, '.capture-bridge', 'ledger.sqlite')
    const fs = await import('node:fs')
    fs.mkdirSync(join(vaultRoot, '.capture-bridge'), { recursive: true })
    db = new Database(dbPath)
    databases.push(db)

    const { initializeDatabase } = await import('../schema/index.js')
    initializeDatabase(db)

    // Create hourly and daily backup directories
    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')
    const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')
    fs.mkdirSync(hourlyDir, { recursive: true })
    fs.mkdirSync(dailyDir, { recursive: true })
  })

  afterEach(async () => {
    // 5-step cleanup: custom resources → settle → pools → databases → GC

    // Step 0: Custom resources (none in this test)

    // Step 1: Settle 100ms (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Step 2: Pools (none in this test)

    // Step 3: Databases
    for (const database of databases) {
      try {
        if (database.open && !database.readonly) database.close()
      } catch {
        // Swallow close errors in tests
        void 0
      }
    }
    databases.length = 0

    // Step 4: Filesystem (TestKit auto-cleanup)
    for (const handle of cleanupHandles) {
      try {
        await handle.cleanup()
      } catch {
        void 0
      }
    }
    cleanupHandles.length = 0

    // Step 5: GC
    if (global.gc) global.gc()
  })

  it('promotes one hourly backup per day to daily set', async () => {
    // RED: This import will fail because the module doesn't exist yet
    const { promoteToDailyBackup } = await import('./daily-promotion.js')
    const { createBackup, verifyBackup } = await import('../backup/backup.js')

    // Create hourly backups for a specific day
    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')
    const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')

    // Create 3 hourly backups for 2025-10-15
    const times = [
      new Date('2025-10-15T08:00:00.000Z'),
      new Date('2025-10-15T12:00:00.000Z'), // Noon
      new Date('2025-10-15T16:00:00.000Z'),
    ]

    for (const time of times) {
      const result = await createBackup(db, vaultRoot, { now: time })
      // Move to hourly directory
      const filename = `ledger-${time.toISOString().slice(0, 10).replace(/-/g, '')}-${String(time.getUTCHours()).padStart(2, '0')}.sqlite`
      const hourlyPath = join(hourlyDir, filename)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.rename(result.backup_path, hourlyPath)
    }

    // Run daily promotion
    const promotionResult = await promoteToDailyBackup(vaultRoot, {
      date: new Date('2025-10-15T23:59:59.000Z'),
    })

    expect(promotionResult.success).toBe(true)
    expect(promotionResult.promoted_from).toContain('ledger-20251015-12.sqlite')
    expect(promotionResult.promoted_to).toContain('ledger-20251015.sqlite')

    // Verify daily backup exists
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    const dailyFiles = await fsp.readdir(dailyDir)
    expect(dailyFiles).toContain('ledger-20251015.sqlite')

    // Verify file permissions are 0600
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    const stats = await fsp.stat(join(dailyDir, 'ledger-20251015.sqlite'))
    expect(stats.mode & 0o777).toBe(0o600)

    // Verify backup integrity
    const verifyResult = await verifyBackup(join(dailyDir, 'ledger-20251015.sqlite'))
    expect(verifyResult.success).toBe(true)
    expect(verifyResult.integrity_check_passed).toBe(true)
  })

  it('keeps last 7 daily backups only', async () => {
    const { pruneDailyBackups } = await import('./daily-promotion.js')
    const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')

    // Create 10 daily backups with different dates (October 1-10, 2025)
    for (let i = 1; i <= 10; i++) {
      const dateStr = `2025-10-${String(i).padStart(2, '0')}`
      const filename = `ledger-${dateStr.replace(/-/g, '')}.sqlite`
      const filePath = join(dailyDir, filename)
      // Create a dummy backup file
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.writeFile(filePath, Buffer.from('dummy backup content'))
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.chmod(filePath, 0o600)
    }

    // Run pruning logic
    const pruneResult = await pruneDailyBackups(vaultRoot, { keep: 7 })

    expect(pruneResult.deleted_count).toBe(3)

    // Verify only 7 most recent backups remain
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    const remainingFiles = await fsp.readdir(dailyDir)
    const dailyBackups = remainingFiles.filter((f) => f.startsWith('ledger-') && f.endsWith('.sqlite'))
    expect(dailyBackups).toHaveLength(7)

    // Verify the kept ones are the newest 7 (October 4-10)
    const sortedBackups = dailyBackups.toSorted((a, b) => a.localeCompare(b))
    expect(sortedBackups[0]).toBe('ledger-20251004.sqlite')
    expect(sortedBackups[6]).toBe('ledger-20251010.sqlite')
  })

  it('selects noon backup for daily promotion', async () => {
    const { promoteToDailyBackup } = await import('./daily-promotion.js')
    const { createBackup } = await import('../backup/backup.js')

    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')

    // Create hourly backups at different times
    const times = [
      new Date('2025-10-15T06:00:00.000Z'),
      new Date('2025-10-15T09:00:00.000Z'),
      new Date('2025-10-15T12:00:00.000Z'), // Noon - should be selected
      new Date('2025-10-15T15:00:00.000Z'),
      new Date('2025-10-15T18:00:00.000Z'),
    ]

    for (const time of times) {
      const result = await createBackup(db, vaultRoot, { now: time })
      const filename = `ledger-${time.toISOString().slice(0, 10).replace(/-/g, '')}-${String(time.getUTCHours()).padStart(2, '0')}.sqlite`
      const hourlyPath = join(hourlyDir, filename)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.rename(result.backup_path, hourlyPath)
    }

    // Run promotion
    const promotionResult = await promoteToDailyBackup(vaultRoot, {
      date: new Date('2025-10-15T23:59:59.000Z'),
    })

    expect(promotionResult.success).toBe(true)
    expect(promotionResult.promoted_from).toContain('ledger-20251015-12.sqlite')
    expect(promotionResult.selected_reason).toBe('noon_backup')
  })

  it('selects earliest backup if noon unavailable', async () => {
    const { promoteToDailyBackup } = await import('./daily-promotion.js')
    const { createBackup } = await import('../backup/backup.js')

    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')

    // Create hourly backups without a noon backup
    const times = [
      new Date('2025-10-15T06:00:00.000Z'), // Should be selected (earliest)
      new Date('2025-10-15T09:00:00.000Z'),
      new Date('2025-10-15T15:00:00.000Z'),
      new Date('2025-10-15T18:00:00.000Z'),
    ]

    for (const time of times) {
      const result = await createBackup(db, vaultRoot, { now: time })
      const filename = `ledger-${time.toISOString().slice(0, 10).replace(/-/g, '')}-${String(time.getUTCHours()).padStart(2, '0')}.sqlite`
      const hourlyPath = join(hourlyDir, filename)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.rename(result.backup_path, hourlyPath)
    }

    // Run promotion
    const promotionResult = await promoteToDailyBackup(vaultRoot, {
      date: new Date('2025-10-15T23:59:59.000Z'),
    })

    expect(promotionResult.success).toBe(true)
    expect(promotionResult.promoted_from).toContain('ledger-20251015-06.sqlite')
    expect(promotionResult.selected_reason).toBe('earliest_available')
  })

  it('skips promotion if verification fails', async () => {
    const { promoteToDailyBackup } = await import('./daily-promotion.js')
    const { createBackup } = await import('../backup/backup.js')
    const backupModule = await import('../backup/backup.js')

    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')
    const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')

    // Create a hourly backup
    const time = new Date('2025-10-15T12:00:00.000Z')
    const result = await createBackup(db, vaultRoot, { now: time })
    const filename = `ledger-20251015-12.sqlite`
    const hourlyPath = join(hourlyDir, filename)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.rename(result.backup_path, hourlyPath)

    // Mock verifyBackup to return failure
    const verifyBackupSpy = vi.spyOn(backupModule, 'verifyBackup').mockResolvedValue({
      success: false,
      integrity_check_passed: false,
      hash_match: false,
      error: 'Simulated verification failure',
    })

    // Run promotion
    const promotionResult = await promoteToDailyBackup(vaultRoot, {
      date: new Date('2025-10-15T23:59:59.000Z'),
    })

    expect(promotionResult.success).toBe(false)
    expect(promotionResult.error).toContain('verification failed')

    // Verify no daily backup was created
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    const dailyFiles = await fsp.readdir(dailyDir)
    expect(dailyFiles.filter((f) => f.startsWith('ledger-'))).toHaveLength(0)

    // Verify warning was logged (check that verifyBackup was called)
    expect(verifyBackupSpy).toHaveBeenCalled()

    verifyBackupSpy.mockRestore()
  })

  it('does not re-promote if daily backup already exists', async () => {
    const { promoteToDailyBackup } = await import('./daily-promotion.js')
    const { createBackup } = await import('../backup/backup.js')

    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')
    const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')

    // Create a hourly backup
    const time = new Date('2025-10-15T12:00:00.000Z')
    const result = await createBackup(db, vaultRoot, { now: time })
    const filename = `ledger-20251015-12.sqlite`
    const hourlyPath = join(hourlyDir, filename)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.rename(result.backup_path, hourlyPath)

    // Pre-create a daily backup for the same date
    const dailyPath = join(dailyDir, 'ledger-20251015.sqlite')
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.writeFile(dailyPath, Buffer.from('existing daily backup'))
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.chmod(dailyPath, 0o600)

    // Run promotion
    const promotionResult = await promoteToDailyBackup(vaultRoot, {
      date: new Date('2025-10-15T23:59:59.000Z'),
    })

    expect(promotionResult.success).toBe(true)
    expect(promotionResult.skipped).toBe(true)
    expect(promotionResult.reason).toBe('daily_backup_exists')

    // Verify the existing daily backup wasn't overwritten
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    const content = await fsp.readFile(dailyPath, 'utf-8')
    expect(content).toBe('existing daily backup')
  })

  it('handles promotion for memory leak detection', async () => {
    const { promoteToDailyBackup } = await import('./daily-promotion.js')
    const { createBackup } = await import('../backup/backup.js')

    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')

    // Create a single hourly backup
    const time = new Date('2025-10-15T12:00:00.000Z')
    const result = await createBackup(db, vaultRoot, { now: time })
    const filename = `ledger-20251015-12.sqlite`
    const hourlyPath = join(hourlyDir, filename)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.rename(result.backup_path, hourlyPath)

    // Memory leak test - run promotion 100 times
    if (global.gc) global.gc()
    const before = process.memoryUsage().heapUsed

    for (let i = 0; i < 100; i++) {
      await promoteToDailyBackup(vaultRoot, {
        date: new Date('2025-10-15T23:59:59.000Z'),
      })
    }

    if (global.gc) global.gc()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const after = process.memoryUsage().heapUsed

    expect(after - before).toBeLessThan(5 * 1024 * 1024) // < 5MB growth
  })
})
