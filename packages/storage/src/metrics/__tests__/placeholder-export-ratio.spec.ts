/**
 * Tests for placeholder_export_ratio metric calculation
 *
 * Validates daily aggregation of placeholder exports vs total exports.
 * Metric formula: (placeholder_count / total_count) * 100
 *
 * Source: PLACEHOLDER_EXPORT--T02, PLACEHOLDER_EXPORT-AC07
 * Related: prd-master-condensed.md (Metrics section)
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

describe('placeholder_export_ratio metric', () => {
  let db: Database
  const databases: Database[] = []

  beforeEach(async () => {
    const Database = (await import('better-sqlite3')).default
    db = new Database(':memory:')
    databases.push(db)

    // Initialize schema
    const { initializeDatabase } = await import('../../schema/index.js')
    initializeDatabase(db)

    // Seed captures table with test data
    const insertCapture = db.prepare(`
      INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    insertCapture.run('cap-001', 'voice', 'test content 1', 'hash1', 'exported', '{}')
    insertCapture.run('cap-002', 'voice', 'test content 2', 'hash2', 'exported', '{}')
    insertCapture.run('cap-003', 'voice', 'test content 3', 'hash3', 'exported_placeholder', '{}')
  })

  afterEach(() => {
    // Close databases
    for (const database of databases) {
      database.close()
    }
    databases.length = 0

    // Force GC
    if (global.gc) global.gc()
  })

  describe('Basic calculation', () => {
    it('should calculate ratio when no exports exist', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      const ratio = calculatePlaceholderExportRatio(db)

      // No exports = 0.0 ratio
      expect(ratio).toBe(0.0)
    })

    it('should calculate ratio when no placeholders exist', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      // Insert exports without placeholders
      const insertExport = db.prepare(`
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
        VALUES (?, ?, ?, ?, ?)
      `)

      insertExport.run('exp-001', 'cap-001', '/vault/001.md', 'hash1', 'initial')
      insertExport.run('exp-002', 'cap-002', '/vault/002.md', 'hash2', 'initial')

      const ratio = calculatePlaceholderExportRatio(db)

      // 0 placeholders / 2 total = 0.0%
      expect(ratio).toBe(0.0)
    })

    it('should calculate ratio when all exports are placeholders', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      // Insert only placeholder exports
      const insertExport = db.prepare(`
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
        VALUES (?, ?, ?, ?, ?)
      `)

      insertExport.run('exp-001', 'cap-003', '/vault/003.md', null, 'placeholder')

      const ratio = calculatePlaceholderExportRatio(db)

      // 1 placeholder / 1 total = 100.0%
      expect(ratio).toBe(100.0)
    })

    it('should calculate ratio for mixed exports', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      // Insert mixed exports (3 placeholders out of 100 total)
      const insertExport = db.prepare(`
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
        VALUES (?, ?, ?, ?, ?)
      `)

      // 97 successful exports
      for (let i = 1; i <= 97; i++) {
        insertExport.run(`exp-${String(i).padStart(3, '0')}`, 'cap-001', `/vault/${i}.md`, 'hash1', 'initial')
      }

      // 3 placeholder exports
      for (let i = 98; i <= 100; i++) {
        insertExport.run(`exp-${String(i).padStart(3, '0')}`, 'cap-003', `/vault/${i}.md`, null, 'placeholder')
      }

      const ratio = calculatePlaceholderExportRatio(db)

      // 3 placeholders / 100 total = 3.0%
      expect(ratio).toBe(3.0)
    })
  })

  describe('Date filtering', () => {
    it('should filter exports by date when date parameter provided', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      // Insert exports with specific dates
      const insertExport = db.prepare(`
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode, exported_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      // Today: 2 initial, 1 placeholder
      insertExport.run('exp-001', 'cap-001', '/vault/001.md', 'hash1', 'initial', '2025-10-23 10:00:00')
      insertExport.run('exp-002', 'cap-002', '/vault/002.md', 'hash2', 'initial', '2025-10-23 11:00:00')
      insertExport.run('exp-003', 'cap-003', '/vault/003.md', null, 'placeholder', '2025-10-23 12:00:00')

      // Yesterday: 1 initial, 0 placeholder
      insertExport.run('exp-004', 'cap-001', '/vault/004.md', 'hash1', 'initial', '2025-10-22 10:00:00')

      const ratioToday = calculatePlaceholderExportRatio(db, '2025-10-23')
      const ratioYesterday = calculatePlaceholderExportRatio(db, '2025-10-22')

      // Today: 1/3 = 33.33%
      expect(ratioToday).toBeCloseTo(33.33, 1)

      // Yesterday: 0/1 = 0.0%
      expect(ratioYesterday).toBe(0.0)
    })

    it('should use current date when no date parameter provided', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      // Insert exports with current timestamp (CURRENT_TIMESTAMP default)
      const insertExport = db.prepare(`
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
        VALUES (?, ?, ?, ?, ?)
      `)

      insertExport.run('exp-001', 'cap-001', '/vault/001.md', 'hash1', 'initial')
      insertExport.run('exp-002', 'cap-003', '/vault/003.md', null, 'placeholder')

      const ratio = calculatePlaceholderExportRatio(db)

      // Should calculate for current date: 1/2 = 50.0%
      expect(ratio).toBe(50.0)
    })
  })

  describe('Security', () => {
    it('should prevent SQL injection via date parameter', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      // Attempt SQL injection
      const maliciousDate = "2025-10-23'; DROP TABLE exports_audit; --"

      // Should handle safely (either error or safe execution)
      expect(() => {
        calculatePlaceholderExportRatio(db, maliciousDate)
      }).not.toThrow(/syntax error/)

      // Verify table still exists
      const tableCheck = db
        .prepare(
          `
        SELECT name FROM sqlite_master WHERE type='table' AND name='exports_audit'
      `
        )
        .get() as { name: string } | undefined

      expect(tableCheck?.name).toBe('exports_audit')
    })
  })

  describe('Performance', () => {
    it('should calculate ratio in < 100ms for 10k exports', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      // Insert 10k exports (9,700 initial, 300 placeholder = 3% ratio)
      const insertExport = db.prepare(`
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
        VALUES (?, ?, ?, ?, ?)
      `)

      for (let i = 1; i <= 9700; i++) {
        insertExport.run(`exp-${String(i).padStart(5, '0')}`, 'cap-001', `/vault/${i}.md`, 'hash1', 'initial')
      }

      for (let i = 9701; i <= 10000; i++) {
        insertExport.run(`exp-${String(i).padStart(5, '0')}`, 'cap-003', `/vault/${i}.md`, null, 'placeholder')
      }

      const startTime = performance.now()
      const ratio = calculatePlaceholderExportRatio(db)
      const endTime = performance.now()

      const duration = endTime - startTime

      expect(ratio).toBe(3.0)
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Edge cases', () => {
    it('should handle duplicate_skip mode (not counted as placeholder)', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      const insertExport = db.prepare(`
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
        VALUES (?, ?, ?, ?, ?)
      `)

      insertExport.run('exp-001', 'cap-001', '/vault/001.md', 'hash1', 'initial')
      insertExport.run('exp-002', 'cap-002', '/vault/002.md', 'hash2', 'duplicate_skip')
      insertExport.run('exp-003', 'cap-003', '/vault/003.md', null, 'placeholder')

      const ratio = calculatePlaceholderExportRatio(db)

      // Only 1 placeholder out of 3 total = 33.33%
      expect(ratio).toBeCloseTo(33.33, 1)
    })

    it('should handle precision correctly for small percentages', async () => {
      const { calculatePlaceholderExportRatio } = await import('../placeholder-export-ratio.js')

      const insertExport = db.prepare(`
        INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode)
        VALUES (?, ?, ?, ?, ?)
      `)

      // 1 placeholder out of 1000 = 0.1%
      for (let i = 1; i <= 999; i++) {
        insertExport.run(`exp-${String(i).padStart(4, '0')}`, 'cap-001', `/vault/${i}.md`, 'hash1', 'initial')
      }
      insertExport.run('exp-1000', 'cap-003', '/vault/1000.md', null, 'placeholder')

      const ratio = calculatePlaceholderExportRatio(db)

      expect(ratio).toBeCloseTo(0.1, 2)
    })
  })
})
