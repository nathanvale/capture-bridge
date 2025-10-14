/**
 * Hourly Backup Tests (TDD)
 *
 * ACs:
 * - AC01: Backup every hour (covered in scheduler.spec.ts)
 * - AC02: Backup command produces file in ./.backups
 * - AC03: Timestamp-based naming (ISO 8601 date hour)
 * - AC04: Retention policy: keep last 24 hourly
 *
 * Spec: docs/features/staging-ledger/spec-staging-tech.md §2.4
 * Guides: guide-backup-verification.md, guide-backup-restore-drill.md
 */

import { join } from 'node:path'

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

type DatabaseInstance = ReturnType<typeof Database>

describe('SQLite Backups', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []
  let vaultRoot: string

  beforeEach(async () => {
    // Use TestKit temp directory
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    vaultRoot = tempDir.path

    // Initialize a file-based database under vaultRoot/.capture-bridge/ledger.sqlite
    const dbPath = join(vaultRoot, '.capture-bridge', 'ledger.sqlite')
    const fs = await import('node:fs')
    fs.mkdirSync(join(vaultRoot, '.capture-bridge'), { recursive: true })
    db = new Database(dbPath)
    databases.push(db)

    const { initializeDatabase } = await import('../schema/index.js')
    initializeDatabase(db)

    // Seed a tiny bit of data
    db.prepare(
      `INSERT INTO captures (id, source, raw_content, status, meta_json)
       VALUES ('01TESTCAPTURE', 'voice', 'seed', 'staged', '{"channel":"voice","channel_native_id":"seed"}')`
    ).run()
  })

  afterEach(async () => {
    // Settling
    await new Promise((r) => setTimeout(r, 50))
    // Close DBs
    for (const database of databases) {
      try {
        if (database.open && !database.readonly) database.close()
      } catch {
        // Swallow close errors in tests; ensure block is non-empty per eslint(no-empty)
        void 0
      }
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('AC02/AC03: creates backup file with correct timestamped name', async () => {
    const { createBackup, verifyBackup } = await import('../index.js')

    // Fix the time to ensure deterministic filename (UTC 2025-10-15T07:00:00Z)
    const fixed = new Date('2025-10-15T07:00:00.000Z')

    const result = await createBackup(db, vaultRoot, { now: fixed })

    expect(result.success).toBe(true)
    // Expect path like <vault>/.capture-bridge/.backups/ledger-20251015-07.sqlite
    const expectedDir = join(vaultRoot, '.capture-bridge', '.backups')
    expect(result.backup_path.startsWith(expectedDir)).toBe(true)
    expect(result.backup_path.endsWith('ledger-20251015-07.sqlite')).toBe(true)
    expect(result.size_bytes).toBeGreaterThan(0)

    // Open backup and verify integrity
    const ok = await verifyBackup(result.backup_path)
    expect(ok.success).toBe(true)
    expect(ok.integrity_check_passed).toBe(true)
  })

  it('AC04: enforces retention policy (keep last 24 hourly)', async () => {
    const { createBackup, pruneOldBackups } = await import('../index.js')

    const base = new Date('2025-10-15T00:00:00.000Z')

    // Create 30 hourly backups (should prune to 24 later)
    for (let i = 0; i < 30; i++) {
      const when = new Date(base.getTime() + i * 60 * 60 * 1000)
      await createBackup(db, vaultRoot, { now: when })
    }

    const backupDir = join(vaultRoot, '.capture-bridge', '.backups')

    // Prune to 24
    const pruned = await pruneOldBackups(backupDir, { keep: 24 })
    expect(pruned.deleted_count).toBe(6)

    const fs = await import('node:fs/promises')
    const files = await fs.readdir(backupDir)
    expect(files.filter((f) => f.startsWith('ledger-'))).toHaveLength(24)

    // Ensure the kept ones are the newest 24 (hours 6..29)
    const names = files.filter((f) => f.startsWith('ledger-')).sort((a, b) => a.localeCompare(b))
    expect(names[0]).toBe('ledger-20251015-06.sqlite')
    expect(names.at(-1)).toBe('ledger-20251016-05.sqlite')
  })
})
