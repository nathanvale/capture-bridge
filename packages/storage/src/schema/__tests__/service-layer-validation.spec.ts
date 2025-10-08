/**
 * Service Layer Validation Tests (AC04, AC05, AC06)
 *
 * Tests for service layer validation and recovery query functionality.
 * Based on spec-staging-arch.md §4.4 and ADR-0004.
 *
 * AC04: Terminal states are immutable (exported*)
 * AC05: Validate transitions at service layer (throw error on invalid)
 * AC06: Recovery query returns non-terminal captures for resume
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import type DatabaseConstructor from 'better-sqlite3'


type Database = ReturnType<typeof DatabaseConstructor>

describe('Service Layer Validation (AC04, AC05, AC06)', () => {
  let assertValidTransition: (current: string, next: string) => void
  let StateTransitionError: new (message: string) => Error
  let queryRecoverableCaptures: (db: Database) => Array<{
    id: string
    status: string
    created_at: string
  }>
  let createSchema: (db: Database) => void
  let db: Database
  const databases: Database[] = []

  beforeEach(async () => {
    // Dynamic imports following TestKit pattern
    const DatabaseModule = await import('better-sqlite3')
    const Database = DatabaseModule.default
    
    db = new Database(':memory:')
    databases.push(db)
    const schemaModule = await import('../schema.js')
    ;({ createSchema } = schemaModule)

    // Import service layer functions (to be implemented)
    const serviceLayer = await import('../service-layer.js')
    ;({ assertValidTransition } = serviceLayer)
    ;({ StateTransitionError } = serviceLayer)
    ;({ queryRecoverableCaptures } = serviceLayer)

    // Create schema
    createSchema(db)
  })

  afterEach(() => {
    // Cleanup
    for (const database of databases) {
      database.close()
    }
    databases.length = 0

    if (global.gc) global.gc()
  })

  describe('AC04: Terminal state immutability', () => {
    it('should throw error when attempting to transition from exported', () => {
      expect(() => {
        assertValidTransition('exported', 'staged')
      }).toThrow('Cannot transition from terminal state: exported')
    })

    it('should throw error when attempting to transition from exported_duplicate', () => {
      expect(() => {
        assertValidTransition('exported_duplicate', 'transcribed')
      }).toThrow('Cannot transition from terminal state: exported_duplicate')
    })

    it('should throw error when attempting to transition from exported_placeholder', () => {
      expect(() => {
        assertValidTransition('exported_placeholder', 'staged')
      }).toThrow('Cannot transition from terminal state: exported_placeholder')
    })

    it('should throw StateTransitionError type', () => {
      try {
        assertValidTransition('exported', 'staged')
      } catch (error) {
        expect(error).toBeInstanceOf(StateTransitionError)
      }
    })
  })

  describe('AC05: Service layer validation with error throwing', () => {
    it('should allow valid transition from staged to transcribed', () => {
      expect(() => {
        assertValidTransition('staged', 'transcribed')
      }).not.toThrow()
    })

    it('should throw error for invalid transition from staged to exported', () => {
      expect(() => {
        assertValidTransition('staged', 'exported')
      }).toThrow(/Invalid transition/)
      expect(() => {
        assertValidTransition('staged', 'exported')
      }).toThrow(/staged/)
      expect(() => {
        assertValidTransition('staged', 'exported')
      }).toThrow(/exported/)
    })

    it('should include valid transitions in error message', () => {
      try {
        assertValidTransition('staged', 'exported')
      } catch (error) {
        const {message} = (error as Error)
        expect(message).toContain('transcribed')
        expect(message).toContain('failed_transcription')
        expect(message).toContain('exported_duplicate')
      }
    })

    it('should allow valid transition from transcribed to exported', () => {
      expect(() => {
        assertValidTransition('transcribed', 'exported')
      }).not.toThrow()
    })

    it('should throw error for invalid transition from transcribed to staged', () => {
      expect(() => {
        assertValidTransition('transcribed', 'staged')
      }).toThrow(/Invalid transition/)
    })

    it('should allow valid transition from failed_transcription to exported_placeholder', () => {
      expect(() => {
        assertValidTransition('failed_transcription', 'exported_placeholder')
      }).not.toThrow()
    })

    it('should throw error for invalid transition from failed_transcription to exported', () => {
      expect(() => {
        assertValidTransition('failed_transcription', 'exported')
      }).toThrow(/Invalid transition/)
    })
  })

  describe('AC06: Recovery query for non-terminal states', () => {
    beforeEach(() => {
      // Insert test captures with various statuses
      db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        '01HZVM8YWRQT5J3M3K7YPTX9R1',
        'voice',
        '',
        null,
        'staged',
        '{}',
        '2025-01-01T10:00:00Z',
        '2025-01-01T10:00:00Z'
      )

      db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        '01HZVM8YWRQT5J3M3K7YPTX9R2',
        'voice',
        'Test transcript',
        'abc123',
        'transcribed',
        '{}',
        '2025-01-01T10:01:00Z',
        '2025-01-01T10:01:00Z'
      )

      db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        '01HZVM8YWRQT5J3M3K7YPTX9R3',
        'voice',
        '',
        null,
        'failed_transcription',
        '{}',
        '2025-01-01T10:02:00Z',
        '2025-01-01T10:02:00Z'
      )

      db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        '01HZVM8YWRQT5J3M3K7YPTX9R4',
        'voice',
        'Exported content',
        'def456',
        'exported',
        '{}',
        '2025-01-01T10:03:00Z',
        '2025-01-01T10:03:00Z'
      )

      db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        '01HZVM8YWRQT5J3M3K7YPTX9R5',
        'voice',
        'Duplicate content',
        'ghi789',
        'exported_duplicate',
        '{}',
        '2025-01-01T10:04:00Z',
        '2025-01-01T10:04:00Z'
      )

      db.prepare(`
        INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        '01HZVM8YWRQT5J3M3K7YPTX9R6',
        'voice',
        '[TRANSCRIPTION_FAILED]',
        null,
        'exported_placeholder',
        '{}',
        '2025-01-01T10:05:00Z',
        '2025-01-01T10:05:00Z'
      )
    })

    it('should return only non-terminal captures', () => {
      const recoverable = queryRecoverableCaptures(db)
      
      expect(recoverable).toHaveLength(3)
      
      const statuses = recoverable.map(c => c.status)
      expect(statuses).toContain('staged')
      expect(statuses).toContain('transcribed')
      expect(statuses).toContain('failed_transcription')
      expect(statuses).not.toContain('exported')
      expect(statuses).not.toContain('exported_duplicate')
      expect(statuses).not.toContain('exported_placeholder')
    })

    it('should order captures by created_at ASC', () => {
      const recoverable = queryRecoverableCaptures(db)
      
      expect(recoverable).toHaveLength(3)
      expect(recoverable[0]!.id).toBe('01HZVM8YWRQT5J3M3K7YPTX9R1') // staged - earliest
      expect(recoverable[1]!.id).toBe('01HZVM8YWRQT5J3M3K7YPTX9R2') // transcribed
      expect(recoverable[2]!.id).toBe('01HZVM8YWRQT5J3M3K7YPTX9R3') // failed_transcription
    })

    it('should return empty array when no recoverable captures exist', () => {
      // Delete all non-terminal captures
      db.prepare(`DELETE FROM captures WHERE status NOT LIKE 'exported%'`).run()
      
      const recoverable = queryRecoverableCaptures(db)
      
      expect(recoverable).toEqual([])
    })

    it('should include all required fields', () => {
      const recoverable = queryRecoverableCaptures(db)
      
      expect(recoverable).toHaveLength(3)
      const capture = recoverable[0]!
      
      expect(capture).toHaveProperty('id')
      expect(capture).toHaveProperty('status')
      expect(capture).toHaveProperty('created_at')
      expect(typeof capture.id).toBe('string')
      expect(typeof capture.status).toBe('string')
      expect(typeof capture.created_at).toBe('string')
    })
  })
})
