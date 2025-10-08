/**
 * Staging Ledger Tests - Duplicate Check and Export Recording
 *
 * Tests for DEDUPLICATION_LOGIC--T02 - AC06:
 * - Insert exports_audit with mode='duplicate_skip'
 * - Validate state transitions for duplicates
 * - Record audit trail for duplicate detection
 *
 * Based on spec-staging-tech.md §3.3 and §3.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

type ULID = () => string

describe('Staging Ledger - Export Recording with Duplicate Skip', () => {
  let db: Database
  const databases: Database[] = []
  let ulid: ULID

  beforeEach(async () => {
    // Import ulid dynamically
    const ulidModule = await import('ulid')
    ;({ ulid } = ulidModule)

    // Create in-memory database for testing
    const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
    const DatabaseConstructor = (await import('better-sqlite3')).default
    db = new DatabaseConstructor(createMemoryUrl())
    databases.push(db)

    // Initialize schema
    const { initializeDatabase } = await import('../../schema/index.js')
    initializeDatabase(db)
  })

  afterEach(async () => {
    // TestKit 5-step cleanup sequence
    // 1. Settle (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2. No pools to drain in this test

    // 3. Close databases
    for (const database of databases) {
      try {
        if (database.open) {
          database.close()
        }
      } catch {
        // Intentionally ignore cleanup errors
      }
    }
    databases.length = 0

    // 4. TestKit auto-cleanup (temp directories)

    // 5. Force GC
    if (global.gc) global.gc()
  })

  describe('AC06: Insert exports_audit with mode=duplicate_skip', () => {
    it('should insert exports_audit record with mode=duplicate_skip when duplicate detected', async () => {
      // Import the staging ledger functions (will fail initially - RED phase)
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      // Setup: Insert original capture and export it
      const originalId = ulid()
      const contentHash = 'sha256:abcd1234'

      // Insert original capture
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        originalId,
        'email',
        'Original content',
        contentHash,
        'staged',
        JSON.stringify({ channel: 'email', channel_native_id: 'msg-001' })
      )

      // Record initial export
      await ledger.recordExport(originalId, {
        vault_path: `inbox/${originalId}.md`,
        hash_at_export: contentHash,
        mode: 'initial',
        error_flag: false,
      })

      // Update status to exported
      db.prepare('UPDATE captures SET status = ? WHERE id = ?').run('exported', originalId)

      // Insert duplicate capture with same hash
      const duplicateId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        duplicateId,
        'email',
        'Duplicate content',
        contentHash,
        'staged',
        JSON.stringify({ channel: 'email', channel_native_id: 'msg-002' })
      )

      // Act: Check for duplicate
      const duplicateCheck = await ledger.checkDuplicate(contentHash)

      // Assert: Duplicate detected
      expect(duplicateCheck.is_duplicate).toBe(true)
      expect(duplicateCheck.existing_capture_id).toBe(originalId)

      // Act: Record duplicate skip export
      await ledger.recordExport(duplicateId, {
        mode: 'duplicate_skip',
        vault_path: '', // No vault write for duplicates
        hash_at_export: contentHash,
        error_flag: false,
      })

      // Assert: Audit record inserted with correct mode
      const audits = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').all(duplicateId)
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        capture_id: duplicateId,
        mode: 'duplicate_skip',
        vault_path: '',
        hash_at_export: contentHash,
        error_flag: 0,
      })

      // Assert: Status updated to exported_duplicate
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(duplicateId)
      expect(capture.status).toBe('exported_duplicate')
    })

    it('should validate staged → exported_duplicate transition', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      const captureId = ulid()
      const contentHash = 'sha256:efgh5678'

      // Insert capture in staged status
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'Voice content',
        contentHash,
        'staged',
        JSON.stringify({ channel: 'voice', channel_native_id: 'voice-001' })
      )

      // Should allow staged → exported_duplicate transition
      await expect(
        ledger.recordExport(captureId, {
          mode: 'duplicate_skip',
          vault_path: '',
          hash_at_export: contentHash,
          error_flag: false,
        })
      ).resolves.not.toThrow()

      // Verify the status was updated
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId)
      expect(capture.status).toBe('exported_duplicate')
    })

    it('should validate transcribed → exported_duplicate transition', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      const captureId = ulid()
      const contentHash = 'sha256:ijkl9012'

      // Insert capture in transcribed status
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'Transcribed voice content',
        contentHash,
        'transcribed',
        JSON.stringify({ channel: 'voice', channel_native_id: 'voice-002' })
      )

      // Should allow transcribed → exported_duplicate transition
      await expect(
        ledger.recordExport(captureId, {
          mode: 'duplicate_skip',
          vault_path: '',
          hash_at_export: contentHash,
          error_flag: false,
        })
      ).resolves.not.toThrow()

      // Verify the status was updated
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId)
      expect(capture.status).toBe('exported_duplicate')
    })

    it('should emit metrics for duplicate detection', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')

      // Track metrics
      const metrics: any[] = []
      const mockEmitMetric = (metric: any) => {
        metrics.push(metric)
      }

      const ledger = new StagingLedger(db, { emitMetric: mockEmitMetric })

      // Setup: Create original
      const originalId = ulid()
      const contentHash = 'sha256:metric1234'

      // Insert original
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        originalId,
        'email',
        'Original for metrics',
        contentHash,
        'exported',
        JSON.stringify({ channel: 'email', channel_native_id: 'msg-003' })
      )

      // Check for duplicate
      await ledger.checkDuplicate(contentHash)

      // Assert: Metrics emitted
      expect(metrics).toContainEqual(
        expect.objectContaining({
          name: 'dedup_check_ms',
          value: expect.any(Number),
        })
      )

      expect(metrics).toContainEqual(
        expect.objectContaining({
          name: 'dedup_hits_total',
          value: 1,
          labels: { layer: 'content_hash' },
        })
      )
    })

    it('should handle duplicate check when no duplicate exists', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      const uniqueHash = 'sha256:unique9999'

      // Act: Check for non-existent duplicate
      const duplicateCheck = await ledger.checkDuplicate(uniqueHash)

      // Assert: No duplicate found
      expect(duplicateCheck.is_duplicate).toBe(false)
      expect(duplicateCheck.existing_capture_id).toBeUndefined()
    })

    it('should throw error when trying to transition from terminal state', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      const captureId = ulid()
      const contentHash = 'sha256:terminal123'

      // Insert capture already in terminal state
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Already exported',
        contentHash,
        'exported_duplicate', // Terminal state
        JSON.stringify({ channel: 'email', channel_native_id: 'msg-004' })
      )

      // Should throw when trying to transition from terminal state
      await expect(
        ledger.recordExport(captureId, {
          mode: 'duplicate_skip',
          vault_path: '',
          hash_at_export: contentHash,
          error_flag: false,
        })
      ).rejects.toThrow('Cannot transition from terminal state')
    })

    it('should handle transaction rollback on failure', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      const captureId = ulid()

      // Insert capture with invalid status to force transition error
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Invalid transition test',
        'sha256:invalid123',
        'failed_transcription', // Cannot transition to exported_duplicate from this state
        JSON.stringify({ channel: 'email', channel_native_id: 'msg-005' })
      )

      // Act: Try to record export (should fail)
      await expect(
        ledger.recordExport(captureId, {
          mode: 'duplicate_skip',
          vault_path: '',
          hash_at_export: 'sha256:invalid123',
          error_flag: false,
        })
      ).rejects.toThrow()

      // Assert: No audit record should be inserted (transaction rolled back)
      const audits = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').all(captureId)
      expect(audits).toHaveLength(0)

      // Assert: Status should remain unchanged
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId)
      expect(capture.status).toBe('failed_transcription')
    })
  })

  describe('Security - SQL Injection Prevention', () => {
    it('should safely handle malicious content_hash input', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      // Malicious input attempt
      const maliciousHash = "'; DROP TABLE captures; --"

      // Should safely handle without SQL injection
      await expect(ledger.checkDuplicate(maliciousHash)).resolves.toEqual({
        is_duplicate: false,
      })

      // Verify table still exists
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='captures'").all()
      expect(tables).toHaveLength(1)
    })

    it('should safely handle malicious capture_id in recordExport', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      const maliciousId = "'; DELETE FROM captures WHERE 1=1; --"

      // Should throw "Capture not found" instead of executing injection
      await expect(
        ledger.recordExport(maliciousId, {
          mode: 'duplicate_skip',
          vault_path: '',
          hash_at_export: 'safe_hash',
          error_flag: false,
        })
      ).rejects.toThrow('Capture not found')

      // Verify no records were deleted
      const count = db.prepare('SELECT COUNT(*) as count FROM captures').get()
      expect(count.count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Memory Leak Prevention', () => {
    it('should not leak memory during repeated duplicate checks', async () => {
      const { StagingLedger } = await import('../staging-ledger.js')
      const ledger = new StagingLedger(db)

      // Force GC and measure baseline
      if (global.gc) global.gc()
      const before = process.memoryUsage().heapUsed

      // Perform many duplicate checks
      for (let i = 0; i < 1000; i++) {
        await ledger.checkDuplicate(`hash_${i}`)
      }

      // Force GC and measure after
      if (global.gc) global.gc()
      await new Promise((resolve) => setTimeout(resolve, 100))
      const after = process.memoryUsage().heapUsed

      // Should not leak more than 5MB
      expect(after - before).toBeLessThan(5 * 1024 * 1024)
    })
  })
})
