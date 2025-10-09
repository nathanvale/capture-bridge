import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Transcription Failure Metrics [AC09]', () => {
  const databases: any[] = []

  beforeEach(async () => {
    // No temp directory needed for metrics tests
  })

  afterEach(async () => {
    // 5-step cleanup sequence
    // 1. Settle
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. No pools in this test

    // 3. Close databases
    for (const db of databases) {
      try {
        if (db.open && !db.readonly) db.close()
      } catch {
        // Safe to ignore cleanup errors
      }
    }
    databases.length = 0

    // 4. TestKit auto-cleanup
    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('should emit transcription_failure_total metric with error_type tag', async () => {
    // Setup database
    const Database = (await import('better-sqlite3')).default
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    db.exec(`
      CREATE TABLE errors_log (
        id TEXT PRIMARY KEY,
        capture_id TEXT,
        operation TEXT NOT NULL,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        stack_trace TEXT,
        context_json TEXT DEFAULT '{}',
        attempt_count INTEGER NOT NULL DEFAULT 1,
        escalation_action TEXT,
        dlq INTEGER NOT NULL DEFAULT 0 CHECK (dlq IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (capture_id) REFERENCES captures(id) ON DELETE SET NULL
      )
    `)

    // Insert test capture
    const captureId = '01HZVM8YWRQT5J3M3K7YPTXFZ'
    db.prepare(
      `INSERT INTO captures (id, source, status)
       VALUES (?, ?, ?)`
    ).run(captureId, 'voice', 'staged')

    // Import handleTranscriptionFailure - the function doesn't accept metricsClient yet
    // This test will FAIL (RED phase) because we haven't implemented metrics support
    const { handleTranscriptionFailure } = await import('../transcription/failure-handler.js')

    // Create OOM error
    const oomError = new Error('JavaScript heap out of memory')
    oomError.name = 'OOMError'

    // Track emitted metrics
    let metricEmitted = false
    let emittedName = ''
    let emittedTags: Record<string, string> | undefined

    // Create a mock metrics client
    const mockMetricsClient = {
      counter: (name: string, tags?: Record<string, string>) => {
        metricEmitted = true
        emittedName = name
        emittedTags = tags
      },
    }

    // Call handleTranscriptionFailure with the mock metrics client
    const result = await handleTranscriptionFailure(db, captureId, oomError, 3, undefined, mockMetricsClient)

    // Verify the result
    expect(result.success).toBe(false)
    expect(result.errorType).toBe('oom')
    expect(result.captureId).toBe(captureId)

    // Verify the metric was emitted
    expect(metricEmitted).toBe(true)
    expect(emittedName).toBe('transcription_failure_total')
    expect(emittedTags).toEqual({ error_type: 'oom' })
  })
})
