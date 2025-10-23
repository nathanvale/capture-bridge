/**
 * Update Placeholder Status Tests
 *
 * Tests for PLACEHOLDER_EXPORT--T02 - AC05:
 * - Update captures: status='exported_placeholder'
 * - Update raw_content with placeholder markdown
 * - Set content_hash to NULL (hash unavailable for placeholder)
 * - Update updated_at timestamp
 * - Parameterized SQL query prevents injection
 *
 * Based on guide-error-recovery.md and spec-obsidian-tech.md
 */

import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

type DatabaseInstance = ReturnType<typeof Database>

type ULID = () => string

describe('Update Placeholder Status - AC05', () => {
  let db: DatabaseInstance
  const databases: DatabaseInstance[] = []
  let ulid: ULID

  beforeEach(async () => {
    // Import ulid dynamically
    const ulidModule = await import('ulid')
    ;({ ulid } = ulidModule)

    // Create in-memory database for testing
    db = new Database(':memory:')
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

  describe('Unit Tests: updateCaptureStatusToPlaceholder', () => {
    it('should update status to exported_placeholder for failed_transcription capture', async () => {
      // Import the function (will fail initially - RED phase)
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Insert capture in 'failed_transcription' state
      const captureId = ulid()
      const originalContent = 'path/to/voice-memo.m4a'
      const originalHash = 'sha256:original-hash'

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        originalContent,
        originalHash,
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act: Update status to placeholder
      const placeholderContent = '[TRANSCRIPTION_FAILED] - Failed to transcribe audio file'
      updateCaptureStatusToPlaceholder(db, captureId, placeholderContent)

      // Assert: Status updated
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
        id: string
        status: string
        raw_content: string
        content_hash: string | null
        updated_at: string
      }

      expect(capture).toBeDefined()
      expect(capture.status).toBe('exported_placeholder')
    })

    it('should update raw_content with placeholder markdown', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act
      const placeholderContent = '---\nstatus: failed\n---\n\n[TRANSCRIPTION_FAILED] - Audio file corrupt'
      updateCaptureStatusToPlaceholder(db, captureId, placeholderContent)

      // Assert
      const capture = db.prepare('SELECT raw_content FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
      }

      expect(capture.raw_content).toBe(placeholderContent)
    })

    it('should set content_hash to NULL (hash unavailable for placeholder)', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup
      const captureId = ulid()
      const originalHash = 'sha256:original-valid-hash'

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        originalHash,
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Verify original hash exists
      const before = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(captureId) as {
        content_hash: string | null
      }
      expect(before.content_hash).toBe(originalHash)

      // Act
      const placeholderContent = '[TRANSCRIPTION_FAILED]'
      updateCaptureStatusToPlaceholder(db, captureId, placeholderContent)

      // Assert
      const after = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(captureId) as {
        content_hash: string | null
      }

      expect(after.content_hash).toBeNull()
    })

    it('should update updated_at timestamp to current time', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup - Insert with old timestamp to ensure difference
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('2020-01-01 00:00:00'), datetime('2020-01-01 00:00:00'))
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Get original timestamp
      const before = db.prepare('SELECT updated_at FROM captures WHERE id = ?').get(captureId) as { updated_at: string }
      expect(before.updated_at).toBe('2020-01-01 00:00:00')

      // Act
      updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')

      // Assert - Timestamp should be updated to current time
      const after = db.prepare('SELECT updated_at FROM captures WHERE id = ?').get(captureId) as { updated_at: string }

      // Should not be the old timestamp
      expect(after.updated_at).not.toBe('2020-01-01 00:00:00')

      // Should be a recent timestamp (after 2025)
      expect(after.updated_at).toMatch(/^202[5-9]/)

      // Verify it's a valid ISO8601 timestamp
      expect(new Date(after.updated_at).getTime()).not.toBeNaN()
    })

    it('should validate state transition from failed_transcription to exported_placeholder', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Insert capture in 'failed_transcription' state
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act & Assert: Should not throw error
      expect(() => updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')).not.toThrow()

      // Verify status updated
      const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as { status: string }
      expect(capture.status).toBe('exported_placeholder')
    })

    it('should reject transition from invalid state (e.g., staged)', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Insert capture in 'staged' state (invalid source state)
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'staged',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act & Assert: Should throw StateTransitionError
      expect(() => updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')).toThrow(
        /Invalid transition.*staged.*exported_placeholder/
      )
    })

    it('should reject transition from terminal state (e.g., exported)', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Insert capture in 'exported' state (terminal)
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'Transcribed content',
        'sha256:hash',
        'exported',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act & Assert: Should throw StateTransitionError
      expect(() => updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')).toThrow(
        /Cannot transition from terminal state/
      )
    })

    it('should throw error if capture does not exist', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Act & Assert
      const nonExistentId = ulid()
      expect(() => updateCaptureStatusToPlaceholder(db, nonExistentId, '[TRANSCRIPTION_FAILED]')).toThrow(
        /Capture not found/
      )
    })
  })

  describe('Security Tests: SQL Injection Prevention', () => {
    it('should use parameterized query to prevent SQL injection in captureId', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Valid capture
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act: Attempt SQL injection via captureId
      const maliciousId = `${captureId}'; DROP TABLE captures; --`
      expect(() => updateCaptureStatusToPlaceholder(db, maliciousId, '[TRANSCRIPTION_FAILED]')).toThrow() // Should fail safely (capture not found)

      // Assert: Table still exists
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='captures'`)
        .all() as Array<{ name: string }>
      expect(tables).toHaveLength(1)
      const firstTable = tables[0]
      expect(firstTable).toBeDefined()
      expect(firstTable?.name).toBe('captures')
    })

    it('should use parameterized query to prevent SQL injection in placeholderContent', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act: Attempt SQL injection via placeholderContent
      const maliciousContent = `[FAILED]'; DROP TABLE captures; --`
      updateCaptureStatusToPlaceholder(db, captureId, maliciousContent)

      // Assert: Table still exists and content is safely stored
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='captures'`)
        .all() as Array<{ name: string }>
      expect(tables).toHaveLength(1)

      const capture = db.prepare('SELECT raw_content FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
      }
      expect(capture.raw_content).toBe(maliciousContent) // Stored as literal string
    })

    it('should handle very large placeholder content safely', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act: Very large content (10KB placeholder)
      const largeContent = '[TRANSCRIPTION_FAILED]\n' + 'A'.repeat(10000)
      updateCaptureStatusToPlaceholder(db, captureId, largeContent)

      // Assert
      const capture = db.prepare('SELECT raw_content FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
      }
      expect(capture.raw_content).toBe(largeContent)
      expect(capture.raw_content).toHaveLength(largeContent.length)
    })

    it('should handle empty placeholder content', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act: Empty string
      updateCaptureStatusToPlaceholder(db, captureId, '')

      // Assert
      const capture = db.prepare('SELECT raw_content, status FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
        status: string
      }
      expect(capture.raw_content).toBe('')
      expect(capture.status).toBe('exported_placeholder')
    })

    it('should handle special characters in placeholder content', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act: Special characters
      const specialContent = `[FAILED] "quoted" 'single' \n\t\\backslash <html> & | $ @ #`
      updateCaptureStatusToPlaceholder(db, captureId, specialContent)

      // Assert
      const capture = db.prepare('SELECT raw_content FROM captures WHERE id = ?').get(captureId) as {
        raw_content: string
      }
      expect(capture.raw_content).toBe(specialContent)
    })
  })

  describe('Integration Tests: Full Workflow', () => {
    it('should update status as part of placeholder export workflow', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Simulate failed transcription scenario
      const captureId = ulid()
      const voicePath = 'path/to/corrupted-audio.m4a'

      // 1. Insert capture in staged state
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        voicePath,
        'sha256:audio-fingerprint',
        'staged',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // 2. Simulate transcription failure (status -> failed_transcription)
      db.prepare(`UPDATE captures SET status = ? WHERE id = ?`).run('failed_transcription', captureId)

      // 3. Generate placeholder content (AC01-AC04 from T01)
      const placeholderMarkdown = `---
created: ${new Date().toISOString()}
source: voice
capture_id: ${captureId}
status: failed_transcription
error: CORRUPT_AUDIO
---

[TRANSCRIPTION_FAILED] - The audio file could not be transcribed.

**Original file**: ${voicePath}
**Failure reason**: Audio file is corrupt or unreadable
**Action**: Check the source file and retry if possible
`

      // 4. (Simulated) Write to vault/inbox/{ulid}.md (AC03 from T01)
      // (File write happens in obsidian package, not tested here)

      // 5. Update capture status (AC05 - THIS TEST)
      updateCaptureStatusToPlaceholder(db, captureId, placeholderMarkdown)

      // Assert: Capture updated correctly
      const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
        id: string
        status: string
        raw_content: string
        content_hash: string | null
      }

      expect(capture.status).toBe('exported_placeholder')
      expect(capture.raw_content).toBe(placeholderMarkdown)
      expect(capture.content_hash).toBeNull()

      // Verify state machine rules enforced
      const { isTerminalState } = await import('../../schema/state-machine.js')
      expect(isTerminalState(capture.status)).toBe(true)
    })

    it('should allow exports_audit insertion after status update', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act: Update status
      const placeholderContent = '[TRANSCRIPTION_FAILED]'
      updateCaptureStatusToPlaceholder(db, captureId, placeholderContent)

      // Insert exports_audit record (AC04 from T01)
      const auditId = ulid()
      db.prepare(
        `
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode, error_flag)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        auditId,
        captureId,
        `inbox/${captureId}.md`,
        null, // hash_at_export is NULL for placeholder
        'placeholder',
        1 // error_flag=1
      )

      // Assert: Audit record created successfully
      const audit = db.prepare('SELECT * FROM exports_audit WHERE capture_id = ?').get(captureId) as {
        id: string
        capture_id: string
        vault_path: string
        hash_at_export: string | null
        mode: string
        error_flag: number
      }

      expect(audit).toBeDefined()
      expect(audit.capture_id).toBe(captureId)
      expect(audit.mode).toBe('placeholder')
      expect(audit.error_flag).toBe(1)
      expect(audit.hash_at_export).toBeNull()
    })
  })

  describe('AC06: Terminal State Immutability (No Retrofit)', () => {
    it('should reject transition from exported terminal state', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Insert capture in 'exported' state (terminal)
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'Transcribed content',
        'sha256:hash',
        'exported',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act & Assert: Should throw StateTransitionError with terminal state message
      expect(() => updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')).toThrow(
        /Cannot transition from terminal state.*exported/
      )
    })

    it('should reject transition from exported_duplicate terminal state', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Insert capture in 'exported_duplicate' state (terminal)
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'email',
        'Duplicate email content',
        'sha256:duplicate-hash',
        'exported_duplicate',
        JSON.stringify({ channel: 'email', channel_native_id: `email-${captureId}` })
      )

      // Act & Assert: Should throw StateTransitionError
      expect(() => updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')).toThrow(
        /Cannot transition from terminal state.*exported_duplicate/
      )
    })

    it('should reject transition from exported_placeholder terminal state (no re-retry)', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Insert capture in 'exported_placeholder' state (already a placeholder)
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        '[TRANSCRIPTION_FAILED] - Previous failure',
        null, // content_hash is NULL for placeholder
        'exported_placeholder',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act & Assert: Cannot retry placeholder export
      expect(() => updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED] - Retry')).toThrow(
        /Cannot transition from terminal state.*exported_placeholder/
      )
    })

    it('should NOT modify database when rejecting terminal state transition', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Insert capture in 'exported' state with known content
      const captureId = ulid()
      const originalContent = 'Original exported content'
      const originalHash = 'sha256:original-hash'

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('2020-01-01 00:00:00'), datetime('2020-01-01 00:00:00'))
      `
      ).run(
        captureId,
        'voice',
        originalContent,
        originalHash,
        'exported',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Get before state
      const before = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
        id: string
        status: string
        raw_content: string
        content_hash: string | null
        updated_at: string
      }

      // Act: Attempt invalid transition (should throw)
      try {
        updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED] - Should not apply')
      } catch {
        // Expected error
      }

      // Assert: Database record unchanged
      const after = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as {
        id: string
        status: string
        raw_content: string
        content_hash: string | null
        updated_at: string
      }

      expect(after.status).toBe(before.status) // Still 'exported'
      expect(after.raw_content).toBe(before.raw_content) // Original content preserved
      expect(after.content_hash).toBe(before.content_hash) // Original hash preserved
      expect(after.updated_at).toBe(before.updated_at) // Timestamp not changed
    })

    it('should verify state machine enforces all 3 terminal states', async () => {
      // Import state machine to verify terminal state detection
      const { isTerminalState } = await import('../../schema/state-machine.js')

      // Assert: All three terminal states detected
      expect(isTerminalState('exported')).toBe(true)
      expect(isTerminalState('exported_duplicate')).toBe(true)
      expect(isTerminalState('exported_placeholder')).toBe(true)

      // Assert: Non-terminal states not detected
      expect(isTerminalState('staged')).toBe(false)
      expect(isTerminalState('transcribed')).toBe(false)
      expect(isTerminalState('failed_transcription')).toBe(false)
    })

    it('should throw StateTransitionError type for terminal state rejection', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')
      const { StateTransitionError } = await import('../../schema/service-layer.js')

      // Setup: Terminal state capture
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(captureId, 'voice', 'content', 'sha256:hash', 'exported', '{}')

      // Act & Assert: Error is correct type
      try {
        updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')
        throw new Error('Should have thrown StateTransitionError')
      } catch (error) {
        expect(error).toBeInstanceOf(StateTransitionError)
        expect((error as Error).name).toBe('StateTransitionError')
        expect((error as Error).message).toContain('terminal state')
      }
    })

    it('should document immutability constraint in error message', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup: Terminal state capture
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(captureId, 'voice', 'content', 'sha256:hash', 'exported_placeholder', '{}')

      // Act & Assert: Error message references immutability
      try {
        updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')
        throw new Error('Should have thrown')
      } catch (error) {
        const { message } = error as Error
        // Error should mention "terminal state" and the specific state
        expect(message).toContain('terminal')
        expect(message).toContain('exported_placeholder')
      }
    })
  })

  describe('Contract Tests: Schema Validation', () => {
    it('should validate status enum includes exported_placeholder', () => {
      // Query schema to verify status CHECK constraint
      const tableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='captures'`).get() as {
        sql: string
      }

      // Normalize whitespace for comparison (schema may have newlines/indentation)
      const normalizedSql = tableInfo.sql.replaceAll(/\s+/g, ' ')

      expect(tableInfo.sql).toContain('exported_placeholder')
      expect(normalizedSql).toContain(
        "status TEXT NOT NULL CHECK (status IN ( 'staged', 'transcribed', 'failed_transcription', 'exported', 'exported_duplicate', 'exported_placeholder' ))"
      )
    })

    it('should validate content_hash is nullable in schema', async () => {
      // Insert capture with NULL content_hash to verify column allows NULL
      const captureId = ulid()
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        null, // Explicitly insert NULL
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Update status (should not fail on NULL content_hash)
      updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')

      // Assert
      const capture = db.prepare('SELECT content_hash FROM captures WHERE id = ?').get(captureId) as {
        content_hash: string | null
      }
      expect(capture.content_hash).toBeNull()
    })

    it('should validate updated_at column exists and accepts CURRENT_TIMESTAMP', async () => {
      const { updateCaptureStatusToPlaceholder } = await import('../update-placeholder-status.js')

      // Setup
      const captureId = ulid()
      db.prepare(
        `
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(
        captureId,
        'voice',
        'path/to/voice.m4a',
        'sha256:hash',
        'failed_transcription',
        JSON.stringify({ channel: 'voice', channel_native_id: `voice-${captureId}` })
      )

      // Act
      updateCaptureStatusToPlaceholder(db, captureId, '[TRANSCRIPTION_FAILED]')

      // Assert: updated_at is a valid ISO8601 timestamp
      const capture = db.prepare('SELECT updated_at FROM captures WHERE id = ?').get(captureId) as {
        updated_at: string
      }

      expect(capture.updated_at).toBeDefined()
      expect(capture.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
      expect(new Date(capture.updated_at).getTime()).not.toBeNaN()
    })
  })
})
