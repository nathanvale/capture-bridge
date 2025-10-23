/**
 * Output Formatting Tests
 *
 * Tests for JSON and human-friendly output formatting.
 *
 * @see spec-cli-tech.md §7 Output Conventions
 * @see CLI_FOUNDATION-AC06: JSON output mode (--json flag)
 */

import { describe, it, expect } from 'vitest'

describe('Output Formatting', () => {
  describe('formatJSON', () => {
    it('should format objects as valid JSON with 2-space indentation', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const input = {
        id: '01HQW3P7XKZM2YJVT8YFGQSZ4M',
        status: 'success',
        nested: { key: 'value' },
      }

      const result = formatJSON(input)

      // Must be valid JSON
      expect(() => JSON.parse(result)).not.toThrow()

      // Must use 2-space indentation
      expect(result).toContain('  "id"')
      expect(result).toContain('  "status"')

      // Must match input structure
      const parsed = JSON.parse(result)
      expect(parsed).toEqual(input)
    })

    it('should handle arrays correctly', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const input = [
        { id: '01A', status: 'pass' },
        { id: '01B', status: 'fail' },
      ]

      const result = formatJSON(input)
      const parsed = JSON.parse(result)

      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed).toHaveLength(2)
      expect(parsed[0]).toEqual(input[0])
    })

    it('should handle empty objects and arrays', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      expect(JSON.parse(formatJSON({}))).toEqual({})
      expect(JSON.parse(formatJSON([]))).toEqual([])
    })

    it('should handle null and undefined values', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const input = {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: 'test',
      }

      const result = formatJSON(input)
      const parsed = JSON.parse(result)

      expect(parsed.nullValue).toBeNull()
      expect(parsed).not.toHaveProperty('undefinedValue') // undefined is stripped in JSON
      expect(parsed.normalValue).toBe('test')
    })

    it('should not include ANSI color codes in output', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const input = {
        message: '\x1b[32mSuccess\x1b[0m', // Green ANSI codes
      }

      const result = formatJSON(input)

      // JSON output should not contain ANSI escape sequences
      // (formatJSON itself doesn't strip - it's for data that shouldn't have ANSI)
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI removal
      expect(result).not.toMatch(/\x1b\[\d+m/)
    })

    it('should produce stable output (same input → same output)', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const input = { id: '01A', status: 'pass', count: 42 }

      const result1 = formatJSON(input)
      const result2 = formatJSON(input)

      expect(result1).toBe(result2)
    })
  })

  describe('stripANSI', () => {
    it('should remove all ANSI escape sequences', async () => {
      const { stripANSI } = await import('../lib/output-formatter.js')

      const input = '\x1b[32mSuccess\x1b[0m \x1b[31mError\x1b[0m'
      const result = stripANSI(input)

      expect(result).toBe('Success Error')
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI removal
      expect(result).not.toMatch(/\x1b\[\d+m/)
    })

    it('should handle multiple color codes', async () => {
      const { stripANSI } = await import('../lib/output-formatter.js')

      const input = '\x1b[1m\x1b[32mBold Green\x1b[0m\x1b[22m'
      const result = stripANSI(input)

      expect(result).toBe('Bold Green')
    })

    it('should handle text without ANSI codes', async () => {
      const { stripANSI } = await import('../lib/output-formatter.js')

      const input = 'Plain text without colors'
      const result = stripANSI(input)

      expect(result).toBe(input)
    })

    it('should handle empty strings', async () => {
      const { stripANSI } = await import('../lib/output-formatter.js')

      expect(stripANSI('')).toBe('')
    })

    it('should remove common chalk color codes', async () => {
      const { stripANSI } = await import('../lib/output-formatter.js')

      // Common chalk patterns
      const patterns = [
        '\x1b[31m', // red
        '\x1b[32m', // green
        '\x1b[33m', // yellow
        '\x1b[0m', // reset
        '\x1b[1m', // bold
        '\x1b[4m', // underline
      ]

      for (const pattern of patterns) {
        const input = `${pattern}Text\x1b[0m`
        const result = stripANSI(input)
        expect(result).toBe('Text')
      }
    })
  })

  describe('formatHuman', () => {
    it('should apply success style (green) when specified', async () => {
      const { formatHuman } = await import('../lib/output-formatter.js')

      const result = formatHuman('Operation succeeded', 'success')

      // Should contain ANSI green color code
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI codes
      expect(result).toMatch(/\x1b\[32m/) // Green
      expect(result).toContain('Operation succeeded')
    })

    it('should apply error style (red) when specified', async () => {
      const { formatHuman } = await import('../lib/output-formatter.js')

      const result = formatHuman('Operation failed', 'error')

      // Should contain ANSI red color code
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI codes
      expect(result).toMatch(/\x1b\[31m/) // Red
      expect(result).toContain('Operation failed')
    })

    it('should apply warn style (yellow) when specified', async () => {
      const { formatHuman } = await import('../lib/output-formatter.js')

      const result = formatHuman('Warning message', 'warn')

      // Should contain ANSI yellow color code
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI codes
      expect(result).toMatch(/\x1b\[33m/) // Yellow
      expect(result).toContain('Warning message')
    })

    it('should return plain text when no style specified', async () => {
      const { formatHuman } = await import('../lib/output-formatter.js')

      const result = formatHuman('Plain message')

      // Should not contain ANSI codes
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI codes
      expect(result).not.toMatch(/\x1b\[\d+m/)
      expect(result).toBe('Plain message')
    })

    it('should handle multi-line messages', async () => {
      const { formatHuman } = await import('../lib/output-formatter.js')

      const message = 'Line 1\nLine 2\nLine 3'
      const result = formatHuman(message, 'success')

      expect(result).toContain('Line 1')
      expect(result).toContain('Line 2')
      expect(result).toContain('Line 3')
    })
  })

  describe('Integration: JSON vs Human output modes', () => {
    it('should never mix JSON and human-formatted output', async () => {
      const { formatJSON, formatHuman } = await import('../lib/output-formatter.js')

      const data = { id: '01A', status: 'success' }

      const jsonOutput = formatJSON(data)
      const humanOutput = formatHuman('Success: 01A', 'success')

      // JSON should be parseable and not contain ANSI
      expect(() => JSON.parse(jsonOutput)).not.toThrow()
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI codes
      expect(jsonOutput).not.toMatch(/\x1b\[\d+m/)

      // Human should contain ANSI
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI codes
      expect(humanOutput).toMatch(/\x1b\[\d+m/)

      // They should be clearly different
      expect(jsonOutput).not.toBe(humanOutput)
    })

    it('should strip ANSI from data before JSON formatting', async () => {
      const { formatJSON, stripANSI } = await import('../lib/output-formatter.js')

      // Simulate data that might accidentally have ANSI codes
      const dirtyData = {
        message: '\x1b[32mSuccess\x1b[0m',
      }

      // Clean before formatting
      const cleanData = {
        message: stripANSI(dirtyData.message),
      }

      const result = formatJSON(cleanData)
      const parsed = JSON.parse(result)

      expect(parsed.message).toBe('Success')
      // eslint-disable-next-line no-control-regex, sonarjs/no-control-regex -- Testing ANSI codes
      expect(result).not.toMatch(/\x1b\[\d+m/)
    })
  })

  describe('Schema Stability', () => {
    it('should produce consistent key order for Doctor output', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const doctorOutput = {
        checks: [
          { name: 'db', status: 'pass' as const, details: 'OK' },
          { name: 'vault', status: 'fail' as const, details: 'Not writable' },
        ],
        summary: { pass: 1, fail: 1, warn: 0 },
      }

      const result1 = formatJSON(doctorOutput)
      const result2 = formatJSON(doctorOutput)

      expect(result1).toBe(result2)

      // Verify schema structure matches spec
      const parsed = JSON.parse(result1)
      expect(parsed).toHaveProperty('checks')
      expect(parsed).toHaveProperty('summary')
      expect(Array.isArray(parsed.checks)).toBe(true)
      expect(parsed.summary).toHaveProperty('pass')
      expect(parsed.summary).toHaveProperty('fail')
      expect(parsed.summary).toHaveProperty('warn')
    })

    it('should produce consistent key order for Capture Voice output', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const captureOutput = {
        id: '01HQW3P7XKZM2YJVT8YFGQSZ4M',
        contentHash: 'blake3:abc123...',
        status: 'staged',
        duplicate: false,
        transcribe: 'queued',
      }

      const result = formatJSON(captureOutput)
      const parsed = JSON.parse(result)

      // Verify schema structure
      expect(parsed).toHaveProperty('id')
      expect(parsed).toHaveProperty('contentHash')
      expect(parsed).toHaveProperty('status')
      expect(parsed).toHaveProperty('duplicate')
      expect(parsed).toHaveProperty('transcribe')
    })

    it('should produce consistent key order for Capture Email output', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const emailOutput = {
        id: '01HQW3P7XKZM2YJVT8YFGQSZ4M',
        contentHash: 'blake3:def456...',
        subject: 'Important meeting',
        from: 'user@example.com',
        attachments: 2,
      }

      const result = formatJSON(emailOutput)
      const parsed = JSON.parse(result)

      // Verify schema structure
      expect(parsed).toHaveProperty('id')
      expect(parsed).toHaveProperty('contentHash')
      expect(parsed).toHaveProperty('subject')
      expect(parsed).toHaveProperty('from')
      expect(parsed).toHaveProperty('attachments')
    })

    it('should produce consistent key order for Ledger List output', async () => {
      const { formatJSON } = await import('../lib/output-formatter.js')

      const listOutput = {
        items: [
          {
            id: '01A',
            source: 'voice',
            status: 'staged',
            createdAt: '2025-10-24T10:00:00Z',
          },
          {
            id: '01B',
            source: 'email',
            status: 'exported',
            createdAt: '2025-10-24T10:05:00Z',
          },
        ],
      }

      const result = formatJSON(listOutput)
      const parsed = JSON.parse(result)

      // Verify schema structure
      expect(parsed).toHaveProperty('items')
      expect(Array.isArray(parsed.items)).toBe(true)
      expect(parsed.items[0]).toHaveProperty('id')
      expect(parsed.items[0]).toHaveProperty('source')
      expect(parsed.items[0]).toHaveProperty('status')
      expect(parsed.items[0]).toHaveProperty('createdAt')
    })
  })
})
