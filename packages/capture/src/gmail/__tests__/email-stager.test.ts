import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('EmailStager', () => {
  const databases: any[] = []
  const tempDirs: Array<{ path: string; dispose?: () => Promise<void> }> = []

  beforeEach(async () => {
    const { default: Database } = await import('better-sqlite3')
    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      PRAGMA journal_mode = MEMORY;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('voice', 'email')),
        raw_content TEXT,
        content_hash TEXT,
        status TEXT NOT NULL CHECK (status IN ('staged', 'transcribed', 'exported', 'exported_duplicate', 'exported_placeholder', 'failed_transcription')),
        meta_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE INDEX idx_captures_source_created ON captures(source, created_at);
      CREATE INDEX idx_captures_status ON captures(status);
    `)
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    for (const db of databases) {
      try {
        db.close()
      } catch {
        // Intentionally ignore errors during cleanup
      }
    }
    databases.length = 0

    for (const dir of tempDirs) {
      if (dir.dispose) await dir.dispose().catch(() => undefined)
    }
    tempDirs.length = 0

    if (global.gc) global.gc()
  })

  it('stages email capture with all fields', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const result = await stager.stageCapture({
      messageId: 'test123@example.com',
      body: 'This is the plain text email body',
      metadata: {
        channel: 'email',
        channel_native_id: 'test123@example.com',
        message_id: 'test123@example.com',
        from: 'sender@example.com',
        subject: 'Test Email',
        date: '2025-10-13T10:30:00Z',
      },
    })

    expect(result.captureId).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/)
    expect(result.status).toBe('staged')
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:/)

    const row = db.prepare('SELECT * FROM captures WHERE id = ?').get(result.captureId)
    expect(row).toBeDefined()
    expect(row).toMatchObject({
      id: result.captureId,
      source: 'email',
      raw_content: 'This is the plain text email body',
      content_hash: null,
      status: 'staged',
    })

    const metadata = JSON.parse(row.meta_json)
    expect(metadata).toMatchObject({
      channel: 'email',
      channel_native_id: 'test123@example.com',
      from: 'sender@example.com',
      subject: 'Test Email',
    })
  })

  it('generates unique time-sortable ULIDs', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const captureIds: string[] = []
    for (let i = 0; i < 10; i++) {
      const result = await stager.stageCapture({
        messageId: `msg${i}@example.com`,
        body: 'Test body',
        metadata: {
          channel: 'email',
          channel_native_id: `msg${i}@example.com`,
          message_id: `msg${i}@example.com`,
          from: 'sender@example.com',
          subject: 'Test',
        },
      })
      captureIds.push(result.captureId)
      await new Promise((r) => setTimeout(r, 2))
    }

    const unique = new Set(captureIds)
    expect(unique.size).toBe(10)
    const sorted = [...captureIds].sort((a, b) => a.localeCompare(b))
    expect(sorted).toEqual(captureIds)
  })

  it('completes staging in < 25ms (p95)', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const durations: number[] = []
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      await stager.stageCapture({
        messageId: `msg${i}@example.com`,
        body: 'Test body',
        metadata: {
          channel: 'email',
          channel_native_id: `msg${i}@example.com`,
          message_id: `msg${i}@example.com`,
          from: 'sender@example.com',
          subject: 'Test',
        },
      })
      durations.push(performance.now() - start)
    }
    durations.sort((a, b) => a - b)
    const p95 = durations[Math.floor(durations.length * 0.95)]
    expect(p95).toBeLessThan(25)
  })

  it('sets content_hash to NULL initially', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const result = await stager.stageCapture({
      messageId: 'test@example.com',
      body: 'Test',
      metadata: {
        channel: 'email',
        channel_native_id: 'test@example.com',
        message_id: 'test@example.com',
        from: 'sender@example.com',
        subject: 'Test',
      },
    })

    const row = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(result.captureId)
    expect(row.content_hash).toBeNull()
  })

  it('allows empty raw_content body', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const result = await stager.stageCapture({
      messageId: 'empty@example.com',
      body: '',
      metadata: {
        channel: 'email',
        channel_native_id: 'empty@example.com',
        message_id: 'empty@example.com',
        from: 'sender@example.com',
        subject: 'Empty',
      },
    })

    const row = db.prepare('SELECT raw_content FROM captures WHERE id = ?').get(result.captureId)
    expect(row.raw_content).toBe('')
  })

  it('handles large bodies (>1MB)', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const bigBody = 'A'.repeat(2 * 1024 * 1024) // 2MB
    const result = await stager.stageCapture({
      messageId: 'big@example.com',
      body: bigBody,
      metadata: {
        channel: 'email',
        channel_native_id: 'big@example.com',
        message_id: 'big@example.com',
        from: 'sender@example.com',
        subject: 'Big',
      },
    })
    const row = db.prepare('SELECT length(raw_content) AS len FROM captures WHERE id = ?').get(result.captureId)
    expect(row.len).toBe(bigBody.length)
  })

  it('returns error for invalid (non-serializable) metadata', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const circular: any = { channel: 'email' }
    circular.self = circular

    const result = await stager.stageCaptureSafe({
      messageId: 'bad@example.com',
      body: 'Test',
      metadata: circular,
    })

    expect(result).toEqual({ error: 'staging.invalid_metadata' })
  })

  it('maps SQLITE_BUSY to staging.database_locked', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager: any = new EmailStager(db)

    // Force the insert statement to throw SQLITE_BUSY
    stager['insertStmt'] = {
      run: () => {
        const err: any = new Error('database is locked')
        err.code = 'SQLITE_BUSY'
        throw err
      },
    }

    const result = stager.stageCaptureSafe({
      messageId: 'busy@example.com',
      body: 'Test',
      metadata: {
        channel: 'email',
        channel_native_id: 'busy@example.com',
        message_id: 'busy@example.com',
        from: 'sender@example.com',
        subject: 'Busy',
      },
    })

    expect(result).toEqual({ error: 'staging.database_locked' })
  })

  it('emits capture_email_staging_ms metric when enabled', async () => {
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const metricsDir = await createTempDirectory()
    tempDirs.push(metricsDir)
    process.env['CAPTURE_METRICS'] = '1'

    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const { MetricsClient } = await import('@capture-bridge/foundation')

    const metricsClient = new MetricsClient({
      metricsDir: metricsDir.path,
      enabled: true,
      bufferSize: 10,
      flushIntervalMs: 50,
    })

    const stager = new EmailStager(db, metricsClient)

    await stager.stageCapture({
      messageId: 'metric@example.com',
      body: 'Test',
      metadata: {
        channel: 'email',
        channel_native_id: 'metric@example.com',
        message_id: 'metric@example.com',
        from: 'sender@example.com',
        subject: 'Metric',
      },
    })

    await metricsClient.flush()

    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const files = await fs.readdir(metricsDir.path)
    const metricsFiles = files.filter((f) => f.endsWith('.ndjson'))
    expect(metricsFiles.length).toBeGreaterThan(0)
    const firstMetricsFile = metricsFiles.find(() => true)
    if (!firstMetricsFile) throw new Error('No metrics files found')
    const filePath = path.join(metricsDir.path, firstMetricsFile)
    const content = await fs.readFile(filePath, 'utf-8')
    const events = content
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))

    const found = events.find(
      (e: any) => e.metric === 'capture_email_staging_ms' || e.metric === 'capture.email.staging_ms'
    )
    expect(found).toBeDefined()

    await metricsClient.shutdown()
    delete process.env['CAPTURE_METRICS']
  })

  it('stageCapture throws and emits error metric when insert fails', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')

    const calls: Array<{ name: string; value: number; tags?: Record<string, unknown> }> = []
    const metricsMock = {
      histogram: (name: string, value: number, tags?: Record<string, unknown>) => {
        if (tags) calls.push({ name, value, tags })
        else calls.push({ name, value })
      },
    }

    process.env['CAPTURE_METRICS'] = '1'
    const stager: any = new EmailStager(db, metricsMock as any)

    stager['insertStmt'] = {
      run: () => {
        throw new Error('insert failed for test')
      },
    }

    expect(() =>
      stager.stageCapture({
        messageId: 'err@example.com',
        body: 'body',
        metadata: {
          channel: 'email',
          channel_native_id: 'err@example.com',
          message_id: 'err@example.com',
        },
      })
    ).toThrow(/insert failed/)

    // Ensure error metric was emitted with error: true tag
    expect(calls.length).toBeGreaterThan(0)
    const errMetric = calls.find(
      (c) => c.name === 'capture_email_staging_ms' && c.tags && (c.tags as any).error === true
    )
    expect(errMetric).toBeDefined()

    delete process.env['CAPTURE_METRICS']
  })

  it('stageCaptureSafe maps SQLITE_CONSTRAINT to staging.duplicate_id', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager: any = new EmailStager(db)

    stager['insertStmt'] = {
      run: () => {
        const err: any = new Error('UNIQUE constraint failed: captures.id')
        err.code = 'SQLITE_CONSTRAINT'
        throw err
      },
    }

    const result = stager.stageCaptureSafe({
      messageId: 'dup@example.com',
      body: 'body',
      metadata: {
        channel: 'email',
        channel_native_id: 'dup@example.com',
        message_id: 'dup@example.com',
      },
    })

    expect(result).toEqual({ error: 'staging.duplicate_id' })
  })

  it('stageCaptureSafe maps disk full errors correctly', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager: any = new EmailStager(db)

    stager['insertStmt'] = {
      run: () => {
        throw new Error('Disk full while writing to database')
      },
    }

    const result = stager.stageCaptureSafe({
      messageId: 'disk@example.com',
      body: 'body',
      metadata: {
        channel: 'email',
        channel_native_id: 'disk@example.com',
        message_id: 'disk@example.com',
      },
    })

    expect(result).toEqual({ error: 'staging.disk_full' })
  })

  it('stageCaptureSafe maps other errors to staging.constraint', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager: any = new EmailStager(db)

    stager['insertStmt'] = {
      run: () => {
        throw new Error('some other sqlite error')
      },
    }

    const result = stager.stageCaptureSafe({
      messageId: 'other@example.com',
      body: 'body',
      metadata: {
        channel: 'email',
        channel_native_id: 'other@example.com',
        message_id: 'other@example.com',
      },
    })

    expect(result).toEqual({ error: 'staging.constraint' })
  })

  it('does not emit metrics when CAPTURE_METRICS is not enabled', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')

    const calls: Array<{ name: string; value: number; tags?: Record<string, unknown> }> = []
    const metricsMock = {
      histogram: (name: string, value: number, tags?: Record<string, unknown>) => {
        if (tags) calls.push({ name, value, tags })
        else calls.push({ name, value })
      },
    }

    delete process.env['CAPTURE_METRICS']
    const stager = new EmailStager(db, metricsMock as any)

    const result = await stager.stageCapture({
      messageId: 'nometrics@example.com',
      body: 'body',
      metadata: {
        channel: 'email',
        channel_native_id: 'nometrics@example.com',
        message_id: 'nometrics@example.com',
      },
    })

    expect(result.status).toBe('staged')
    expect(calls).toHaveLength(0)
  })

  it('stageCapture throws for non-serializable metadata (safeStringify)', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const circular: any = { channel: 'email' }
    circular.self = circular

    expect(() =>
      stager.stageCapture({
        messageId: 'circular@example.com',
        body: 'body',
        metadata: circular,
      })
    ).toThrow(/Metadata is not JSON-serializable/)
  })

  it('does not throw when metrics client throws internally', async () => {
    const db = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const metricsThatThrows = {
      histogram: () => {
        throw new Error('metrics failure')
      },
    }

    process.env['CAPTURE_METRICS'] = '1'
    const stager = new EmailStager(db, metricsThatThrows as any)

    const result = await stager.stageCapture({
      messageId: 'ok@example.com',
      body: 'body',
      metadata: {
        channel: 'email',
        channel_native_id: 'ok@example.com',
        message_id: 'ok@example.com',
      },
    })

    expect(result.status).toBe('staged')
    delete process.env['CAPTURE_METRICS']
  })

  it('stageCapture uses Date fallback when created_at not found', async () => {
    const db: any = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const originalPrepare = db.prepare.bind(db)
    db.prepare = (sql: string) => {
      if (typeof sql === 'string' && sql.startsWith('SELECT created_at FROM captures')) {
        return { get: () => undefined }
      }
      return originalPrepare(sql)
    }

    const result = await stager.stageCapture({
      messageId: 'fallback@example.com',
      body: 'body',
      metadata: {
        channel: 'email',
        channel_native_id: 'fallback@example.com',
        message_id: 'fallback@example.com',
      },
    })

    expect(result.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
    // restore
    db.prepare = originalPrepare
  })

  it('stageCaptureSafe uses Date fallback when created_at not found', async () => {
    const db: any = databases[0]
    const { EmailStager } = await import('../email-stager.js')
    const stager = new EmailStager(db)

    const originalPrepare = db.prepare.bind(db)
    db.prepare = (sql: string) => {
      if (typeof sql === 'string' && sql.startsWith('SELECT created_at FROM captures')) {
        return { get: () => undefined }
      }
      return originalPrepare(sql)
    }

    const result = stager.stageCaptureSafe({
      messageId: 'fallback2@example.com',
      body: 'body',
      metadata: {
        channel: 'email',
        channel_native_id: 'fallback2@example.com',
        message_id: 'fallback2@example.com',
      },
    }) as any

    expect(result.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
    db.prepare = originalPrepare
  })
})
