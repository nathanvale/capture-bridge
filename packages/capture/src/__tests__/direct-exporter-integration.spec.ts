import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Direct Exporter Integration [AC03+AC04]', () => {
  const databases: Database.Database[] = []
  let tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = []

  beforeEach(async () => {
    // Test setup
  })

  afterEach(async () => {
    // 5-step cleanup
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Clean temp directories
    for (const dir of tempDirs) {
      try {
        await dir.cleanup()
      } catch {
        // Safe to ignore
      }
    }
    tempDirs = []

    // Close databases
    for (const db of databases) {
      try {
        if (db.open) db.close()
      } catch {
        // Safe to ignore
      }
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should export capture with atomic write and audit record', async () => {
    // Setup temp vault directory
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)
    const vaultPath = tempDir.path

    // Setup database
    const db = new Database(':memory:')
    databases.push(db)

    // Create schema
    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        raw_content TEXT,
        content_hash TEXT,
        meta_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    db.exec(`
      CREATE TABLE exports_audit (
        id TEXT PRIMARY KEY,
        capture_id TEXT NOT NULL,
        vault_path TEXT NOT NULL,
        hash_at_export TEXT,
        exported_at TEXT DEFAULT CURRENT_TIMESTAMP,
        mode TEXT,
        error_flag INTEGER DEFAULT 0,
        FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE CASCADE
      )
    `)

    // Insert test capture
    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ1'
    const rawContent = 'Test voice capture content'
    const contentHash = 'abc123def456'
    const createdAt = '2025-10-09T21:00:00.000Z'

    db.prepare(
      `INSERT INTO captures (id, source, status, raw_content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(captureId, 'voice', 'transcribed', rawContent, contentHash, createdAt)

    // Import and execute exporter
    const { exportToVault } = await import('../export/direct-exporter.js')

    const result = await exportToVault(captureId, db, vaultPath)

    // AC03: Verify atomic write to inbox/{capture.id}.md
    expect(result.success).toBe(true)
    expect(result.export_path).toBe(`inbox/${captureId}.md`)

    // Verify file exists
    const fs = await import('node:fs/promises')
    const { join } = await import('node:path')
    const exportPath = join(vaultPath, 'inbox', `${captureId}.md`)
    const fileContent = await fs.readFile(exportPath, 'utf-8')

    // Verify file content has frontmatter and transcript
    expect(fileContent).toContain(`id: ${captureId}`)
    expect(fileContent).toContain(`source: voice`)
    expect(fileContent).toContain(rawContent)
    expect(fileContent).toContain(contentHash)

    // AC04: Verify exports_audit record inserted
    const auditRecord = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').get(captureId) as
      | {
          id: string
          capture_id: string
          vault_path: string
          hash_at_export: string
          mode: string
          error_flag: number
        }
      | undefined

    expect(auditRecord).toBeDefined()
    expect(auditRecord?.capture_id).toBe(captureId)
    expect(auditRecord?.vault_path).toBe(`inbox/${captureId}.md`)
    expect(auditRecord?.hash_at_export).toBe(contentHash)
    expect(auditRecord?.mode).toBe('initial')
    expect(auditRecord?.error_flag).toBe(0)
  })
})
