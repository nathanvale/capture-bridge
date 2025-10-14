/**
 * Crash Recovery Tests - CRASH_RECOVERY_MECHANISM--T02
 *
 * AC05: User notification: Only emit `Recovered N captures in Xms` when N > 0
 * Requirements:
 *  - Suppress message entirely when 0 captures recovered (no stray log)
 *  - Emit exactly once when capturesRecovered > 0
 *  - Message format: `Recovered {N} captures in {duration}ms` (duration with one decimal place)
 *  - Duration should match returned result.duration (within tolerance)
 *  - Must not emit alternative pluralization variants (keep existing wording)
 *
 * High Risk (continuation) → TDD Red phase for AC05.
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('CRASH_RECOVERY_MECHANISM--T02: AC05 Notification Behavior', () => {
  let db: Database.Database
  const databases: Database.Database[] = []

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)

    db.exec(`
      CREATE TABLE captures (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK(source IN ('voice', 'email')),
        raw_content TEXT NOT NULL,
        content_hash TEXT,
        status TEXT NOT NULL CHECK(status IN (
          'staged',
          'transcribed', 
          'failed_transcription',
          'exported',
          'exported_duplicate',
          'exported_placeholder'
        )) DEFAULT 'staged',
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
  })

  afterEach(() => {
    for (const database of databases) {
      try {
        if (database.open) database.close()
      } catch {
        // ignore
      }
    }
    databases.length = 0
    if (global.gc) global.gc()
  })

  it('should NOT log recovery message when zero captures recovered', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      // suppress output during test
    })

    const { recoverCaptures } = await import('./crash-recovery.js')
    const result = await recoverCaptures(db)

    expect(result.capturesRecovered).toBe(0)
    // Current implementation logs even when zero (expected to FAIL until fixed)
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringMatching(/^Recovered 0 captures/))

    logSpy.mockRestore()
  })

  it('should log exactly once when capturesRecovered > 0', async () => {
    db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
      'test-1',
      'voice',
      'content',
      'staged'
    )

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      // suppress output
    })

    const { recoverCaptures } = await import('./crash-recovery.js')
    const result = await recoverCaptures(db)

    const matchingCalls = logSpy.mock.calls.filter((args) => {
      const first = args[0]
      return typeof first === 'string' && /^Recovered \d+ captures in \d+\.\dms$/.test(first)
    })

    // Failing expectation until implementation gates zero and preserves format
    expect(matchingCalls).toHaveLength(1)
    expect(result.capturesRecovered).toBeGreaterThan(0)

    logSpy.mockRestore()
  })

  it('should include duration matching result.duration (±5ms tolerance)', async () => {
    db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
      'test-2',
      'voice',
      'content',
      'staged'
    )

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      // suppress output
    })
    const { recoverCaptures } = await import('./crash-recovery.js')
    const result = await recoverCaptures(db)

    const call = logSpy.mock.calls.find((args) => {
      const first = args[0]
      return typeof first === 'string' && /^Recovered \d+ captures in \d+\.\dms$/.test(first)
    })

    expect(call).toBeDefined()
    const message = call?.[0] as string
    const durationMatch = /in (\d+\.\d)ms$/.exec(message)
    const durationPart = durationMatch?.[1]
    expect(durationPart).toBeDefined()
    if (durationPart) {
      const logged = parseFloat(durationPart)
      const diff = Math.abs(logged - result.duration)
      expect(diff).toBeLessThanOrEqual(5)
    }

    logSpy.mockRestore()
  })
})
