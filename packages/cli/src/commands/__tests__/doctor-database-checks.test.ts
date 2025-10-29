/**
 * Doctor Command Database Checks Tests (TDD - RED Phase)
 *
 * Tests for database-dependent health checks (AC07-AC11)
 * Following strict RED-GREEN-REFACTOR cycle
 */

import Database from 'better-sqlite3'
import { describe, it, expect, afterEach } from 'vitest'

describe('Doctor Command - AC07: Polling Timestamp Checks', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when last poll is recent (< 5 min)', async () => {
    const { checkPollingTimestamps } = await import('../../services/health-checks/polling-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    // Create sync_state table
    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert recent timestamps (2 minutes ago)
    const recentTime = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)').run(
      'voice_last_poll_at',
      recentTime,
      recentTime
    )
    db.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)').run(
      'email_last_poll_at',
      recentTime,
      recentTime
    )

    const result = await checkPollingTimestamps(db)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('polling_timestamps')
  })

  it('should return warn when last poll is 5-60 minutes ago', async () => {
    const { checkPollingTimestamps } = await import('../../services/health-checks/polling-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert timestamps from 10 minutes ago
    const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)').run(
      'voice_last_poll_at',
      oldTime,
      oldTime
    )

    const result = await checkPollingTimestamps(db)

    expect(result.status).toBe('warn')
  })

  it('should return error when last poll is > 60 minutes ago', async () => {
    const { checkPollingTimestamps } = await import('../../services/health-checks/polling-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert old timestamp (2 hours ago)
    const veryOldTime = new Date(Date.now() - 120 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)').run(
      'voice_last_poll_at',
      veryOldTime,
      veryOldTime
    )

    const result = await checkPollingTimestamps(db)

    expect(result.status).toBe('error')
  })

  it('should return error when polling has never happened (NULL)', async () => {
    const { checkPollingTimestamps } = await import('../../services/health-checks/polling-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // No polling records inserted - table is empty

    const result = await checkPollingTimestamps(db)

    expect(result.status).toBe('error')
    expect(result.message).toContain('never')
  })
})

describe('Doctor Command - AC08: Error Log Summary', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when 0-5 errors in last 24 hours', async () => {
    const { checkErrorLog } = await import('../../services/health-checks/errors-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE errors_log (
        id TEXT PRIMARY KEY,
        capture_id TEXT,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 3 recent errors
    const now = new Date().toISOString()
    for (let i = 0; i < 3; i++) {
      db.prepare('INSERT INTO errors_log (id, stage, message, created_at) VALUES (?, ?, ?, ?)').run(
        `error-${i}`,
        'transcribe',
        'Test error',
        now
      )
    }

    const result = await checkErrorLog(db)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('error_log_summary')
  })

  it('should return warn when 5-20 errors in last 24 hours', async () => {
    const { checkErrorLog } = await import('../../services/health-checks/errors-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE errors_log (
        id TEXT PRIMARY KEY,
        capture_id TEXT,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 10 recent errors
    const now = new Date().toISOString()
    for (let i = 0; i < 10; i++) {
      db.prepare('INSERT INTO errors_log (id, stage, message, created_at) VALUES (?, ?, ?, ?)').run(
        `error-${i}`,
        'transcribe',
        'Test error',
        now
      )
    }

    const result = await checkErrorLog(db)

    expect(result.status).toBe('warn')
  })

  it('should return error when > 20 errors in last 24 hours', async () => {
    const { checkErrorLog } = await import('../../services/health-checks/errors-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE errors_log (
        id TEXT PRIMARY KEY,
        capture_id TEXT,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 25 recent errors
    const now = new Date().toISOString()
    for (let i = 0; i < 25; i++) {
      db.prepare('INSERT INTO errors_log (id, stage, message, created_at) VALUES (?, ?, ?, ?)').run(
        `error-${i}`,
        'transcribe',
        'Test error',
        now
      )
    }

    const result = await checkErrorLog(db)

    expect(result.status).toBe('error')
  })
})

describe('Doctor Command - AC10: Queue Depth Check', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when queue depth < 10', async () => {
    const { checkQueueDepth } = await import('../../services/health-checks/queue-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 5 items in queue
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)').run(
        `capture-${i}`,
        'voice',
        'content',
        'staged',
        '{}'
      )
    }

    const result = await checkQueueDepth(db)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('queue_depth')
  })

  it('should return warn when queue depth is 10-50', async () => {
    const { checkQueueDepth } = await import('../../services/health-checks/queue-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 20 items in queue
    for (let i = 0; i < 20; i++) {
      db.prepare('INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)').run(
        `capture-${i}`,
        'voice',
        'content',
        'staged',
        '{}'
      )
    }

    const result = await checkQueueDepth(db)

    expect(result.status).toBe('warn')
  })

  it('should return error when queue depth > 50', async () => {
    const { checkQueueDepth } = await import('../../services/health-checks/queue-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 60 items in queue
    for (let i = 0; i < 60; i++) {
      db.prepare('INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)').run(
        `capture-${i}`,
        'voice',
        'content',
        'staged',
        '{}'
      )
    }

    const result = await checkQueueDepth(db)

    expect(result.status).toBe('error')
  })
})

describe('Doctor Command - AC11: Placeholder Ratio Check', () => {
  const databases: any[] = []
  const pools: any[] = []
  const resources: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const resource of resources) {
      await resource.shutdown()
    }
    resources.length = 0

    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const pool of pools) {
      await pool.drain()
    }
    pools.length = 0

    for (const db of databases) {
      db.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  it('should return ok when placeholder ratio < 5%', async () => {
    const { checkPlaceholderRatio } = await import('../../services/health-checks/placeholder-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 95 exported + 5 placeholder (5% ratio)
    const now = new Date().toISOString()
    for (let i = 0; i < 95; i++) {
      db.prepare(
        'INSERT INTO captures (id, source, raw_content, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`capture-${i}`, 'voice', 'content', 'exported', '{}', now)
    }
    for (let i = 95; i < 100; i++) {
      db.prepare(
        'INSERT INTO captures (id, source, raw_content, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`capture-${i}`, 'voice', 'content', 'exported_placeholder', '{}', now)
    }

    const result = await checkPlaceholderRatio(db)

    expect(result.status).toBe('ok')
    expect(result.name).toBe('placeholder_ratio')
  })

  it('should return warn when placeholder ratio is 5-25%', async () => {
    const { checkPlaceholderRatio } = await import('../../services/health-checks/placeholder-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 85 exported + 15 placeholder (15% ratio)
    const now = new Date().toISOString()
    for (let i = 0; i < 85; i++) {
      db.prepare(
        'INSERT INTO captures (id, source, raw_content, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`capture-${i}`, 'voice', 'content', 'exported', '{}', now)
    }
    for (let i = 85; i < 100; i++) {
      db.prepare(
        'INSERT INTO captures (id, source, raw_content, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`capture-${i}`, 'voice', 'content', 'exported_placeholder', '{}', now)
    }

    const result = await checkPlaceholderRatio(db)

    expect(result.status).toBe('warn')
  })

  it('should return error when placeholder ratio > 25%', async () => {
    const { checkPlaceholderRatio } = await import('../../services/health-checks/placeholder-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert 60 exported + 40 placeholder (40% ratio)
    const now = new Date().toISOString()
    for (let i = 0; i < 60; i++) {
      db.prepare(
        'INSERT INTO captures (id, source, raw_content, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`capture-${i}`, 'voice', 'content', 'exported', '{}', now)
    }
    for (let i = 60; i < 100; i++) {
      db.prepare(
        'INSERT INTO captures (id, source, raw_content, status, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`capture-${i}`, 'voice', 'content', 'exported_placeholder', '{}', now)
    }

    const result = await checkPlaceholderRatio(db)

    expect(result.status).toBe('error')
  })

  it('should return ok when no captures exist (0% ratio)', async () => {
    const { checkPlaceholderRatio } = await import('../../services/health-checks/placeholder-check.js')

    const db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        status TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // No captures inserted - empty table

    const result = await checkPlaceholderRatio(db)

    expect(result.status).toBe('ok')
    expect(result.message).toContain('No exports')
  })
})
