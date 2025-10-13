/**
 * Crash Recovery Tests - CRASH_RECOVERY_MECHANISM--T01
 *
 * TDD Implementation for startup reconciliation & resume processing
 * Based on spec-staging-arch.md §4.4 - Crash Recovery Flow
 *
 * High Risk task - TDD Required, Coverage ≥80%
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('CRASH_RECOVERY_MECHANISM--T01: Startup Reconciliation', () => {
  let db: Database.Database
  const databases: Database.Database[] = []

  beforeEach(() => {
    db = new Database(':memory:')
    databases.push(db)

    // Create captures schema
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
    // 5-step cleanup
    for (const database of databases) {
      try {
        if (database.open) {
          database.close()
        }
      } catch {
        // Safe to ignore
      }
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  describe('AC01: Recovery Query', () => {
    it('should query captures with non-terminal status', async () => {
      // Insert test data with mixed statuses
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-staged',
        'voice',
        'test content',
        'staged'
      )
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-transcribed',
        'voice',
        'test content',
        'transcribed'
      )
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-failed',
        'voice',
        'test content',
        'failed_transcription'
      )
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-exported',
        'voice',
        'test content',
        'exported'
      )

      // This will fail - function doesn't exist yet
      const { queryRecoverableCaptures } = await import('./crash-recovery')
      const result = queryRecoverableCaptures(db)

      expect(result).toHaveLength(3)
      expect(result.map((r) => r.id)).toEqual(['test-staged', 'test-transcribed', 'test-failed'])
    })

    it('should order results by created_at ASC', async () => {
      // Insert with different created_at times
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        'test-new',
        'voice',
        'content',
        'staged',
        '2025-10-14 12:00:00'
      )
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        'test-old',
        'voice',
        'content',
        'transcribed',
        '2025-10-14 10:00:00'
      )

      const { queryRecoverableCaptures } = await import('./crash-recovery')
      const result = queryRecoverableCaptures(db)

      expect(result[0].id).toBe('test-old')
      expect(result[1].id).toBe('test-new')
    })

    it('should exclude terminal statuses (exported*)', async () => {
      // Insert only terminal statuses
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-exported',
        'voice',
        'content',
        'exported'
      )
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-duplicate',
        'voice',
        'content',
        'exported_duplicate'
      )
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-placeholder',
        'voice',
        'content',
        'exported_placeholder'
      )

      const { queryRecoverableCaptures } = await import('./crash-recovery')
      const result = queryRecoverableCaptures(db)

      expect(result).toHaveLength(0)
    })

    it('should return empty array if no pending captures', async () => {
      const { queryRecoverableCaptures } = await import('./crash-recovery')
      const result = queryRecoverableCaptures(db)

      expect(result).toEqual([])
    })
  })

  describe('AC02: Resume Processing', () => {
    it('should resume transcription for status=staged', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-staged',
        'voice',
        'content',
        'staged'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result.capturesRecovered).toBe(1)
      expect(result.capturesFound).toBe(1)
    })

    it('should resume export for status=transcribed', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-transcribed',
        'voice',
        'content',
        'transcribed'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result.capturesRecovered).toBe(1)
      expect(result.capturesFound).toBe(1)
    })

    it('should export placeholder for status=failed_transcription', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-failed',
        'voice',
        'content',
        'failed_transcription'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result.capturesRecovered).toBe(1)
      expect(result.capturesFound).toBe(1)
    })

    it('should skip terminal statuses', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-exported',
        'voice',
        'content',
        'exported'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result.capturesFound).toBe(0)
      expect(result.capturesRecovered).toBe(0)
    })

    it('should process captures sequentially (no parallel)', async () => {
      // Insert multiple captures
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-1',
        'voice',
        'content',
        'staged'
      )
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-2',
        'voice',
        'content',
        'transcribed'
      )

      // Mock sequential processing check
      const processedOrder: string[] = []
      vi.spyOn(console, 'log').mockImplementation((msg: string) => {
        if (msg.includes('Processing')) {
          processedOrder.push(msg)
        }
      })

      const { recoverCaptures } = await import('./crash-recovery')
      await recoverCaptures(db)

      // Verify sequential processing (implementation will log processing order)
      expect(processedOrder.length).toBe(2)
    })

    it('should handle errors without blocking other captures', async () => {
      // Insert captures where one will fail
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)`).run(
        'test-good',
        'voice',
        'content',
        'staged',
        '{}'
      )
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)`).run(
        'test-bad',
        'voice',
        'content',
        'staged',
        '{"will_fail": true}'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      // Should recover at least the good one
      expect(result.capturesFound).toBe(2)
      expect(result.capturesRecovered).toBeGreaterThan(0)
    })
  })

  describe('AC03: Timeout Detection', () => {
    it('should detect captures stuck > 10 minutes', async () => {
      // Insert capture with old updated_at (> 10 minutes)
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString()
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
        'test-stuck',
        'voice',
        'content',
        'staged',
        elevenMinutesAgo
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result.capturesTimedOut).toBe(1)
    })

    it('should calculate timeout from updated_at field', async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
        'test-recent',
        'voice',
        'content',
        'staged',
        fiveMinutesAgo
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      // Should NOT be timed out
      expect(result.capturesTimedOut).toBe(0)
    })

    it('should log warning for timed-out captures', async () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString()
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
        'test-stuck',
        'voice',
        'content',
        'staged',
        elevenMinutesAgo
      )

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { recoverCaptures } = await import('./crash-recovery')
      await recoverCaptures(db)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('stuck in state'))

      consoleSpy.mockRestore()
    })

    it('should include timeout info in recovery result', async () => {
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString()
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
        'test-stuck',
        'voice',
        'content',
        'staged',
        elevenMinutesAgo
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result).toHaveProperty('capturesTimedOut')
      expect(typeof result.capturesTimedOut).toBe('number')
    })
  })

  describe('AC04: Quarantine Flag', () => {
    it('should quarantine voice captures with missing files', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)`).run(
        'test-voice',
        'voice',
        'content',
        'staged',
        '{"file_path": "/nonexistent/file.m4a"}'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result.capturesQuarantined).toBe(1)

      // Check quarantine flag was set
      const capture = db.prepare('SELECT meta_json FROM captures WHERE id = ?').get('test-voice') as {
        meta_json: string
      }
      const meta = JSON.parse(capture.meta_json)
      expect(meta.integrity?.quarantine_reason).toBe('missing_file')
    })

    it('should set metadata.integrity.quarantine_reason', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)`).run(
        'test-voice',
        'voice',
        'content',
        'staged',
        '{"file_path": "/nonexistent/file.m4a"}'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      await recoverCaptures(db)

      const capture = db.prepare('SELECT meta_json FROM captures WHERE id = ?').get('test-voice') as {
        meta_json: string
      }
      const meta = JSON.parse(capture.meta_json)

      expect(meta.integrity).toBeDefined()
      expect(meta.integrity.quarantine).toBe(true)
      expect(meta.integrity.quarantine_reason).toBe('missing_file')
    })

    it('should not retry quarantined captures', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)`).run(
        'test-voice',
        'voice',
        'content',
        'staged',
        '{"file_path": "/nonexistent/file.m4a"}'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      // Should be quarantined, not recovered
      expect(result.capturesQuarantined).toBe(1)
      expect(result.capturesRecovered).toBe(0)
    })

    it('should include quarantine count in recovery result', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status, meta_json) VALUES (?, ?, ?, ?, ?)`).run(
        'test-voice',
        'voice',
        'content',
        'staged',
        '{"file_path": "/nonexistent/file.m4a"}'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result).toHaveProperty('capturesQuarantined')
      expect(typeof result.capturesQuarantined).toBe('number')
      expect(result.capturesQuarantined).toBe(1)
    })
  })

  describe('Integration: Full Recovery Flow', () => {
    it('should recover all pending captures < 250ms', async () => {
      // Insert multiple types of captures
      for (let i = 0; i < 10; i++) {
        db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
          `test-${i}`,
          'voice',
          'content',
          'staged'
        )
      }

      const { recoverCaptures } = await import('./crash-recovery')
      const startTime = performance.now()
      const result = await recoverCaptures(db)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(250)
      expect(result.duration).toBeLessThan(250)
    })

    it('should log "Recovered N captures" message', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-capture',
        'voice',
        'content',
        'staged'
      )

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const { recoverCaptures } = await import('./crash-recovery')
      await recoverCaptures(db)

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/Recovered \d+ captures/))

      consoleSpy.mockRestore()
    })

    it('should continue normal operation after recovery', async () => {
      db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`).run(
        'test-capture',
        'voice',
        'content',
        'staged'
      )

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      // Should complete without throwing
      expect(result).toBeDefined()
      expect(result.capturesFound).toBeGreaterThan(0)
    })
  })

  describe('Performance: Recovery Time', () => {
    it('should complete recovery query < 50ms (1000 captures)', async () => {
      // Insert 1000 captures with mix of statuses
      const stmt = db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`)
      for (let i = 0; i < 1000; i++) {
        const status = i % 3 === 0 ? 'staged' : i % 3 === 1 ? 'transcribed' : 'failed_transcription'
        stmt.run(`test-${i}`, 'voice', 'content', status)
      }

      const { queryRecoverableCaptures } = await import('./crash-recovery')
      const startTime = performance.now()
      const result = queryRecoverableCaptures(db)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(50)
      expect(result.length).toBe(1000) // All are recoverable
    })

    it('should complete full recovery < 250ms target', async () => {
      // Insert many captures
      const stmt = db.prepare(`INSERT INTO captures (id, source, raw_content, status) VALUES (?, ?, ?, ?)`)
      for (let i = 0; i < 100; i++) {
        stmt.run(`test-${i}`, 'voice', 'content', 'staged')
      }

      const { recoverCaptures } = await import('./crash-recovery')
      const result = await recoverCaptures(db)

      expect(result.duration).toBeLessThan(250)
    })
  })
})
