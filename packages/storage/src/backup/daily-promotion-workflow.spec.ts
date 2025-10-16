/**
 * Daily Backup Promotion Workflow Tests (AC06-08)
 *
 * AC06: Prune oldest after successful verification
 * AC07: Performance < 5s backup creation
 * AC08: Metric backup_duration_ms histogram
 *
 * Test Requirements:
 * - Automatically prunes daily backups after successful promotion
 * - Verifies performance targets met
 * - Emits backup_duration_ms metrics
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

type DatabaseInstance = ReturnType<typeof Database>

describe('Daily Backup Workflow (AC06-08)', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []
  let vaultRoot: string
  interface CleanupHandle {
    cleanup: () => Promise<void>
  }
  const cleanupHandles: CleanupHandle[] = []

  beforeEach(async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    vaultRoot = tempDir.path
    cleanupHandles.push(tempDir)

    const dbPath = join(vaultRoot, '.capture-bridge', 'ledger.sqlite')
    const fs = await import('node:fs')
    fs.mkdirSync(join(vaultRoot, '.capture-bridge'), { recursive: true })
    db = new Database(dbPath)
    databases.push(db)

    const { initializeDatabase } = await import('../schema/index.js')
    initializeDatabase(db)

    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')
    const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')
    fs.mkdirSync(hourlyDir, { recursive: true })
    fs.mkdirSync(dailyDir, { recursive: true })
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const database of databases) {
      try {
        if (database.open && !database.readonly) database.close()
      } catch {
        void 0
      }
    }
    databases.length = 0

    for (const handle of cleanupHandles) {
      try {
        await handle.cleanup()
      } catch {
        void 0
      }
    }
    cleanupHandles.length = 0

    if (global.gc) global.gc()
  })

  it('AC06: prunes old daily backups after successful promotion', async () => {
    const { promoteToDailyBackup, pruneDailyBackups } = await import('./daily-promotion.js')
    const { createBackup } = await import('./backup.js')

    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')
    const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')

    // Create 8 daily backups (Oct 1-8)
    for (let i = 1; i <= 8; i++) {
      const dateStr = `2025-10-${String(i).padStart(2, '0')}`
      const filename = `ledger-${dateStr.replace(/-/g, '')}.sqlite`
      const filePath = join(dailyDir, filename)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.writeFile(filePath, Buffer.from('dummy backup'))
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.chmod(filePath, 0o600)
    }

    // Create hourly backup for Oct 9
    const time = new Date('2025-10-09T12:00:00.000Z')
    const result = await createBackup(db, vaultRoot, { now: time })
    const filename = `ledger-20251009-12.sqlite`
    const hourlyPath = join(hourlyDir, filename)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.rename(result.backup_path, hourlyPath)

    // Promote Oct 9 (should succeed)
    const promotionResult = await promoteToDailyBackup(vaultRoot, {
      date: new Date('2025-10-09T23:59:59.000Z'),
    })
    expect(promotionResult.success).toBe(true)

    // Now we have 9 daily backups total - prune to keep last 7
    const pruneResult = await pruneDailyBackups(vaultRoot, { keep: 7 })

    expect(pruneResult.deleted_count).toBe(2) // Delete Oct 1-2, keep Oct 3-9

    // Verify only 7 remain
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    const remainingFiles = await fsp.readdir(dailyDir)
    const dailyBackups = remainingFiles.filter((f) => f.startsWith('ledger-') && f.endsWith('.sqlite'))
    expect(dailyBackups).toHaveLength(7)

    // Verify correct ones kept (Oct 3-9)
    const sortedBackups = dailyBackups.toSorted((a, b) => a.localeCompare(b))
    expect(sortedBackups[0]).toBe('ledger-20251003.sqlite')
    expect(sortedBackups[6]).toBe('ledger-20251009.sqlite')
  })

  it('AC07: backup creation completes in < 5s', async () => {
    const { createBackup } = await import('./backup.js')

    const start = performance.now()
    const result = await createBackup(db, vaultRoot)
    const duration = performance.now() - start

    expect(result.success).toBe(true)
    expect(result.duration_ms).toBeLessThan(5000) // < 5s
    expect(duration).toBeLessThan(5000) // Actual wall-clock time also < 5s
  })

  it('AC08: backup result includes duration_ms for histogram metric', async () => {
    const { createBackup } = await import('./backup.js')

    const result = await createBackup(db, vaultRoot)

    expect(result.duration_ms).toBeDefined()
    expect(typeof result.duration_ms).toBe('number')
    expect(result.duration_ms).toBeGreaterThan(0)
    expect(result.duration_ms).toBeLessThan(5000)
  })

  it('workflow: promote + verify + prune in sequence', async () => {
    const { promoteToDailyBackup, pruneDailyBackups } = await import('./daily-promotion.js')
    const { createBackup } = await import('./backup.js')

    const hourlyDir = join(vaultRoot, '.capture-bridge', '.backups', 'hourly')
    const dailyDir = join(vaultRoot, '.capture-bridge', '.backups', 'daily')

    // Create 10 daily backups
    for (let i = 1; i <= 10; i++) {
      const dateStr = `2025-10-${String(i).padStart(2, '0')}`
      const filename = `ledger-${dateStr.replace(/-/g, '')}.sqlite`
      const filePath = join(dailyDir, filename)
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.writeFile(filePath, Buffer.from('dummy'))
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
      await fsp.chmod(filePath, 0o600)
    }

    // Create hourly for Oct 11
    const time = new Date('2025-10-11T12:00:00.000Z')
    const backupResult = await createBackup(db, vaultRoot, { now: time })
    const hourlyPath = join(hourlyDir, `ledger-20251011-12.sqlite`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    await fsp.rename(backupResult.backup_path, hourlyPath)

    // Step 1: Promote
    const promotionResult = await promoteToDailyBackup(vaultRoot, {
      date: new Date('2025-10-11T23:59:59.000Z'),
    })
    expect(promotionResult.success).toBe(true)

    // Step 2: Prune (now 11 backups, keep 7)
    const pruneResult = await pruneDailyBackups(vaultRoot, { keep: 7 })
    expect(pruneResult.deleted_count).toBe(4) // Delete Oct 1-4

    // Verify final state: Oct 5-11 (7 backups)
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path is safely constructed from controlled inputs
    const files = await fsp.readdir(dailyDir)
    const dailyBackups = files.filter((f) => f.startsWith('ledger-'))
    expect(dailyBackups).toHaveLength(7)

    const sorted = dailyBackups.toSorted((a, b) => a.localeCompare(b))
    expect(sorted[0]).toBe('ledger-20251005.sqlite')
    expect(sorted[6]).toBe('ledger-20251011.sqlite')

    // Verify backup duration was measured
    expect(backupResult.duration_ms).toBeLessThan(5000)
  })
})
