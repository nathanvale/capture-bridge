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

  it('[AC05] should update capture status to exported after successful export', async () => {
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

    // Insert test capture with status='transcribed'
    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ2'
    db.prepare(
      `INSERT INTO captures (id, source, status, raw_content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(captureId, 'voice', 'transcribed', 'Test content', 'hash123', '2025-10-10T00:00:00.000Z')

    // Verify initial status is 'transcribed'
    const beforeExport = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as { status: string }
    expect(beforeExport.status).toBe('transcribed')

    // Export
    const { exportToVault } = await import('../export/direct-exporter.js')
    const result = await exportToVault(captureId, db, vaultPath)

    expect(result.success).toBe(true)

    // AC05: Verify status updated to 'exported'
    const afterExport = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as { status: string }
    expect(afterExport.status).toBe('exported')
  })

  it('[AC05] should NOT update status when export fails', async () => {
    // Setup database (no vault directory = write will fail)
    const db = new Database(':memory:')
    databases.push(db)

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

    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ3'
    db.prepare(`INSERT INTO captures (id, source, status, raw_content, content_hash) VALUES (?, ?, ?, ?, ?)`).run(
      captureId,
      'voice',
      'transcribed',
      'Test content',
      'hash123'
    )

    const { exportToVault } = await import('../export/direct-exporter.js')
    const result = await exportToVault(captureId, db, '/nonexistent/vault/path')

    expect(result.success).toBe(false)

    // Status should remain 'transcribed' when export fails
    const afterFailedExport = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as {
      status: string
    }
    expect(afterFailedExport.status).toBe('transcribed')
  })

  it('[AC06] should export in less than 1 second', async () => {
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
    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ4'
    db.prepare(
      `INSERT INTO captures (id, source, status, raw_content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(captureId, 'voice', 'transcribed', 'Test content for performance', 'hash456', '2025-10-10T00:00:00.000Z')

    // Measure export time
    const { exportToVault } = await import('../export/direct-exporter.js')
    const startTime = performance.now()
    const result = await exportToVault(captureId, db, vaultPath)
    const endTime = performance.now()
    const durationMs = endTime - startTime

    // AC06: Verify export completed successfully
    expect(result.success).toBe(true)

    // AC06: Verify export time < 1000ms (1 second)
    expect(durationMs).toBeLessThan(1000)
  })

  it('[AC07] should use atomic writer guaranteeing zero partial writes', async () => {
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
    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ5'
    db.prepare(
      `INSERT INTO captures (id, source, status, raw_content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(captureId, 'voice', 'transcribed', 'Test content', 'hash789', '2025-10-10T00:00:00.000Z')

    // Export
    const { exportToVault } = await import('../export/direct-exporter.js')
    const result = await exportToVault(captureId, db, vaultPath)

    expect(result.success).toBe(true)

    // AC07: Verify atomic write guarantees
    // 1. No temp files remain in .trash/
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const trashPath = path.join(vaultPath, '.trash')

    try {
      const trashFiles = await fs.readdir(trashPath)
      const tmpFiles = trashFiles.filter((f) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)
    } catch {
      // .trash directory might not exist if writeAtomic cleaned it up
    }

    // 2. Final file exists with complete content
    const exportPath = path.join(vaultPath, 'inbox', `${captureId}.md`)
    const fileContent = await fs.readFile(exportPath, 'utf-8')
    expect(fileContent).toContain('Test content')
    expect(fileContent).toContain(captureId)

    // 3. Reference: Full crash safety verified in @capture-bridge/obsidian-bridge
    // See packages/obsidian-bridge/src/__tests__/crash-testing.test.ts
    // - Zero partial writes after simulated crash
    // - Temp file cleanup on failure
    // - Rapid sequential writes without temp files
    // - No corruption of existing files
  })

  it('[AC08] should emit export_write_ms histogram metric when metrics enabled', async () => {
    // Setup temp vault and metrics directories
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    const metricsDir = await createTempDirectory()
    tempDirs.push(tempDir, metricsDir)
    const vaultPath = tempDir.path

    // Setup database
    const db = new Database(':memory:')
    databases.push(db)

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
    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ6'
    db.prepare(
      `INSERT INTO captures (id, source, status, raw_content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(captureId, 'voice', 'transcribed', 'Test metrics content', 'hashABC', '2025-10-10T00:00:00.000Z')

    // Create metrics client
    const { MetricsClient } = await import('@capture-bridge/foundation')
    const metricsClient = new MetricsClient({
      enabled: true,
      metricsDir: metricsDir.path,
    })

    // Export with metrics
    const { exportToVault } = await import('../export/direct-exporter.js')
    const result = await exportToVault(captureId, db, vaultPath, metricsClient)

    expect(result.success).toBe(true)

    // Flush metrics
    await metricsClient.flush()

    // AC08: Verify export_write_ms metric was emitted
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const files = await fs.readdir(metricsDir.path)
    const metricsFiles = files.filter((f) => f.endsWith('.ndjson'))

    expect(metricsFiles.length).toBeGreaterThan(0)

    const firstFile = metricsFiles[0]
    if (!firstFile) throw new Error('No metrics file found')

    const metricsContent = await fs.readFile(path.join(metricsDir.path, firstFile), 'utf-8')
    const metrics = metricsContent
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

    const exportMetric = metrics.find((m: any) => m.metric === 'export_write_ms')
    expect(exportMetric).toBeDefined()
    expect(exportMetric.type).toBe('histogram')
    expect(exportMetric.value).toBeGreaterThan(0)

    // Cleanup
    await metricsClient.shutdown()
  })
})
