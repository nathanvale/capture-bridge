/**
 * Security and validation tests for path resolver
 * Following TestKit 2.0.0 patterns from foundation package
 * Addresses P0-01 from code review: Path traversal prevention
 */

import { describe, it, expect } from 'vitest'

describe('Path Resolver Security Tests', () => {
  describe('ULID Validation - Path Traversal Prevention', () => {
    it('should reject path traversal with ../', async () => {
      const { resolveTempPath } = await import('../path-resolver.js')

      const maliciousId = '../../../etc/passwd'
      const vaultPath = '/test/vault'

      expect(() => {
        resolveTempPath(vaultPath, maliciousId)
      }).toThrow('Invalid capture_id format')
    })

    it('should reject absolute paths', async () => {
      const { resolveExportPath } = await import('../path-resolver.js')

      const maliciousId = '/etc/passwd'
      const vaultPath = '/test/vault'

      expect(() => {
        resolveExportPath(vaultPath, maliciousId)
      }).toThrow('Invalid capture_id format')
    })

    it('should reject relative paths with ./', async () => {
      const { resolveTempPath } = await import('../path-resolver.js')

      const maliciousId = './malicious'
      const vaultPath = '/test/vault'

      expect(() => {
        resolveTempPath(vaultPath, maliciousId)
      }).toThrow('Invalid capture_id format')
    })

    it('should reject ULID with special characters', async () => {
      const { resolveExportPath } = await import('../path-resolver.js')

      const maliciousId = '01HZVM8YWRQT5J3M3K7YPT/bin'
      const vaultPath = '/test/vault'

      expect(() => {
        resolveExportPath(vaultPath, maliciousId)
      }).toThrow('Invalid capture_id format')
    })

    it('should reject ULID with null bytes', async () => {
      const { resolveTempPath } = await import('../path-resolver.js')

      const maliciousId = '01HZVM8YWRQT5J3M3K7YPT\x00'
      const vaultPath = '/test/vault'

      expect(() => {
        resolveTempPath(vaultPath, maliciousId)
      }).toThrow('Invalid capture_id format')
    })

    it('should reject ULID with Windows drive letters', async () => {
      const { resolveExportPath } = await import('../path-resolver.js')

      const maliciousId = 'C:\\Windows\\System32'
      const vaultPath = '/test/vault'

      expect(() => {
        resolveExportPath(vaultPath, maliciousId)
      }).toThrow('Invalid capture_id format')
    })

    it('should accept valid ULID', async () => {
      const { resolveTempPath, resolveExportPath } = await import('../path-resolver.js')

      const validId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const vaultPath = '/test/vault'

      expect(() => {
        resolveTempPath(vaultPath, validId)
      }).not.toThrow()

      expect(() => {
        resolveExportPath(vaultPath, validId)
      }).not.toThrow()
    })
  })

  describe('ULID Length Validation', () => {
    it('should reject ULID shorter than 26 characters', async () => {
      const { resolveTempPath } = await import('../path-resolver.js')

      const shortId = '01HZVM8YWRQT5J3M3K7YPTX9R' // 25 chars
      const vaultPath = '/test/vault'

      expect(() => {
        resolveTempPath(vaultPath, shortId)
      }).toThrow('Invalid capture_id format')
    })

    it('should reject ULID longer than 26 characters', async () => {
      const { resolveExportPath } = await import('../path-resolver.js')

      const longId = '01HZVM8YWRQT5J3M3K7YPTX9RZZ' // 27 chars
      const vaultPath = '/test/vault'

      expect(() => {
        resolveExportPath(vaultPath, longId)
      }).toThrow('Invalid capture_id format')
    })

    it('should reject empty string', async () => {
      const { resolveTempPath } = await import('../path-resolver.js')

      const emptyId = ''
      const vaultPath = '/test/vault'

      expect(() => {
        resolveTempPath(vaultPath, emptyId)
      }).toThrow('Invalid capture_id format')
    })
  })

  describe('ULID Character Set Validation', () => {
    it('should reject ULID with lowercase letters', async () => {
      const { resolveTempPath } = await import('../path-resolver.js')

      const lowercaseId = '01hzvm8ywrqt5j3m3k7yptx9rz'
      const vaultPath = '/test/vault'

      expect(() => {
        resolveTempPath(vaultPath, lowercaseId)
      }).toThrow('Invalid capture_id format')
    })

    it('should reject ULID with excluded characters (I, L, O, U)', async () => {
      const { resolveExportPath } = await import('../path-resolver.js')

      // Crockford Base32 excludes I, L, O, U to avoid confusion
      const invalidIds = [
        '01HZVM8YWRQT5J3M3K7YPTX9RI', // Contains I
        '01HZVM8YWRQT5J3M3K7YPTX9RL', // Contains L
        '01HZVM8YWRQT5J3M3K7YPTX9RO', // Contains O
        '01HZVM8YWRQT5J3M3K7YPTX9RU', // Contains U
      ]

      const vaultPath = '/test/vault'

      for (const id of invalidIds) {
        expect(() => {
          resolveExportPath(vaultPath, id)
        }).toThrow('Invalid capture_id format')
      }
    })

    it('should accept all valid Crockford Base32 characters', async () => {
      const { resolveTempPath } = await import('../path-resolver.js')

      // Valid: 0-9, A-H, J-K, M-N, P-T, V-Z (excludes I, L, O, U)
      const validIds = [
        '01234567890123456789012345', // Numbers
        'ABCDEFGHJKMNPQRSTVWXYZ0123', // Letters
        '0123456789ABCDEFGHJKMNPQRS', // Mixed
      ]

      const vaultPath = '/test/vault'

      for (const id of validIds) {
        expect(() => {
          resolveTempPath(vaultPath, id)
        }).not.toThrow()
      }
    })
  })

  describe('Path Resolution Results', () => {
    it('should generate correct temp path', async () => {
      const { resolveTempPath } = await import('../path-resolver.js')

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const vaultPath = '/test/vault'

      const tempPath = resolveTempPath(vaultPath, captureId)

      expect(tempPath).toBe('/test/vault/.trash/01HZVM8YWRQT5J3M3K7YPTX9RZ.tmp')
    })

    it('should generate correct export path', async () => {
      const { resolveExportPath } = await import('../path-resolver.js')

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const vaultPath = '/test/vault'

      const exportPath = resolveExportPath(vaultPath, captureId)

      expect(exportPath).toBe('/test/vault/inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
    })

    it('should handle vault paths with trailing slashes', async () => {
      const { resolveTempPath, resolveExportPath } = await import('../path-resolver.js')

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const vaultPath = '/test/vault/'

      const tempPath = resolveTempPath(vaultPath, captureId)
      const exportPath = resolveExportPath(vaultPath, captureId)

      // path.join should handle trailing slashes correctly
      expect(tempPath).toContain('.trash')
      expect(tempPath).toContain('.tmp')
      expect(exportPath).toContain('inbox')
      expect(exportPath).toContain('.md')
    })
  })
})
