/**
 * Hourly Backup Scheduler Tests (AC01)
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type DatabaseInstance = ReturnType<typeof Database>

describe('Backup Scheduler', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []
  let vaultRoot: string

  beforeEach(async () => {
    vi.useFakeTimers()

    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    vaultRoot = tempDir.path

    const { join } = await import('node:path')
    const fs = await import('node:fs')
    fs.mkdirSync(join(vaultRoot, '.capture-bridge'), { recursive: true })

    db = new Database(join(vaultRoot, '.capture-bridge', 'ledger.sqlite'))
    databases.push(db)

    const { initializeDatabase } = await import('../index.js')
    initializeDatabase(db)
  })

  afterEach(() => {
    // Cleanup timers
    vi.useRealTimers()

    for (const database of databases) {
      try {
        if (database.open && !database.readonly) database.close()
      } catch {
        // Ensure non-empty catch; ignoring close errors in test cleanup
        void 0
      }
    }
    databases.length = 0
  })

  it('AC01: triggers backups on interval', async () => {
    // Mock createBackup to count invocations (must spy on the SAME module path used by scheduler)
    const backupModule = await import('../backup/backup.js')
    const createBackupSpy = vi.spyOn(backupModule, 'createBackup').mockResolvedValue({
      success: true,
      backup_path: `${vaultRoot}/.capture-bridge/.backups/fake.sqlite`,
      size_bytes: 123,
      duration_ms: 1,
    })

    const { startBackupScheduler } = await import('../index.js')

    const scheduler = startBackupScheduler(db, vaultRoot, { intervalMs: 1000 })

    // Advance 3 seconds → expect ~3 executions (initial tick not immediate)
    await vi.advanceTimersByTimeAsync(3100)

    // Allow microtasks to flush
    await Promise.resolve()

    expect(createBackupSpy).toHaveBeenCalledTimes(3)

    // Cleanup
    await scheduler.shutdown()
  })
})
