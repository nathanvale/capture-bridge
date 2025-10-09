import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Direct Export Trigger [AC01]', () => {
  const databases: Database.Database[] = []

  beforeEach(async () => {
    // Test setup
  })

  afterEach(async () => {
    // 5-step cleanup
    await new Promise((resolve) => setTimeout(resolve, 100))

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

  it('should trigger export for transcribed captures not in exports_audit', async () => {
    // RED phase - write failing test
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

    // Insert test captures
    const transcribedId = '01HZVM8YWRQT5J3M3K7YPTXFZ1'
    const stagedId = '01HZVM8YWRQT5J3M3K7YPTXFZ2'
    const exportedId = '01HZVM8YWRQT5J3M3K7YPTXFZ3'

    db.prepare(`INSERT INTO captures (id, source, status, content_hash) VALUES (?, ?, ?, ?)`).run(
      transcribedId,
      'voice',
      'transcribed',
      'abc123'
    )
    db.prepare(`INSERT INTO captures (id, source, status, content_hash) VALUES (?, ?, ?, ?)`).run(
      stagedId,
      'voice',
      'staged',
      'def456'
    )
    db.prepare(`INSERT INTO captures (id, source, status, content_hash) VALUES (?, ?, ?, ?)`).run(
      exportedId,
      'voice',
      'transcribed',
      'ghi789'
    )

    // Mark one as already exported
    db.prepare(`INSERT INTO exports_audit (id, capture_id, vault_path, mode, error_flag) VALUES (?, ?, ?, ?, ?)`).run(
      '01AUDIT000000000000000001',
      exportedId,
      `inbox/${exportedId}.md`,
      'initial',
      0
    )

    // Import function under test - will fail initially
    const { shouldExport } = await import('../export/direct-exporter.js')

    // Test assertions
    const shouldExportTranscribed = shouldExport(transcribedId, db)
    const shouldExportStaged = shouldExport(stagedId, db)
    const shouldExportAlreadyExported = shouldExport(exportedId, db)

    expect(shouldExportTranscribed).toBe(true) // Transcribed, not exported
    expect(shouldExportStaged).toBe(false) // Not transcribed yet
    expect(shouldExportAlreadyExported).toBe(false) // Already exported
  })
})
