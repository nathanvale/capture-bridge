/**
 * Determinism Tests for Content Hash Implementation
 * AC05: 100% deterministic (same input → same hash)
 *
 * Tests verify that:
 * - normalizeText() produces identical output for same input across multiple runs
 * - computeSHA256() produces identical hash for same content
 * - computeAudioFingerprint() produces identical hash for same audio file
 * - computeEmailHash() produces identical hash for same email data
 */

import { describe, it, expect, beforeEach } from 'vitest'

describe('AC05: Content Hash Determinism', () => {
  describe('normalizeText() determinism', () => {
    it('should produce identical output for same input across 100 runs', async () => {
      const { normalizeText } = await import('../text-normalization.js')

      const input = '  Hello\r\nWorld\r\n  '
      const hashes = new Set<string>()

      // Run 100 times and collect all outputs
      for (let i = 0; i < 100; i++) {
        const normalized = normalizeText(input)
        hashes.add(normalized)
      }

      // Should only have ONE unique output
      expect(hashes.size).toBe(1)
      const uniqueOutput = Array.from(hashes)[0]
      expect(uniqueOutput).toBe('Hello\nWorld')
    })

    it('should produce identical output for complex mixed line endings', async () => {
      const { normalizeText } = await import('../text-normalization.js')

      const input = 'Line1\r\nLine2\rLine3\nLine4'
      const results: string[] = []

      for (let i = 0; i < 50; i++) {
        results.push(normalizeText(input))
      }

      // All results should be identical
      const uniqueResults = new Set(results)
      expect(uniqueResults.size).toBe(1)
      expect(results[0]).toBe('Line1\nLine2\nLine3\nLine4')
    })

    it('should produce identical output for empty strings', async () => {
      const { normalizeText } = await import('../text-normalization.js')

      const results: string[] = []
      for (let i = 0; i < 50; i++) {
        results.push(normalizeText(''))
      }

      expect(new Set(results).size).toBe(1)
      expect(results[0]).toBe('')
    })

    it('should produce identical output for null/undefined inputs', async () => {
      const { normalizeText } = await import('../text-normalization.js')

      const nullResults: string[] = []
      const undefinedResults: string[] = []

      for (let i = 0; i < 50; i++) {
        nullResults.push(normalizeText(null))
        undefinedResults.push(normalizeText(undefined))
      }

      expect(new Set(nullResults).size).toBe(1)
      expect(new Set(undefinedResults).size).toBe(1)
      expect(nullResults[0]).toBe('')
      expect(undefinedResults[0]).toBe('')
    })
  })

  describe('computeSHA256() determinism', () => {
    it('should produce identical hash for same string across 100 runs', async () => {
      const { computeSHA256 } = await import('../sha256-hash.js')

      const input = 'Test content for hashing'
      const hashes = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const hash = computeSHA256(input)
        hashes.add(hash)
      }

      expect(hashes.size).toBe(1)
      const hash = Array.from(hashes)[0]
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should produce identical hash for same Buffer across 100 runs', async () => {
      const { computeSHA256 } = await import('../sha256-hash.js')

      const buffer = Buffer.from('Test buffer content')
      const hashes = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const hash = computeSHA256(buffer)
        hashes.add(hash)
      }

      expect(hashes.size).toBe(1)
    })

    it('should produce identical hash for empty string', async () => {
      const { computeSHA256 } = await import('../sha256-hash.js')

      const hashes: string[] = []
      for (let i = 0; i < 50; i++) {
        hashes.push(computeSHA256(''))
      }

      expect(new Set(hashes).size).toBe(1)
    })

    it('should produce identical hash for large content (1KB)', async () => {
      const { computeSHA256 } = await import('../sha256-hash.js')

      const largeContent = 'x'.repeat(1024)
      const hashes: string[] = []

      for (let i = 0; i < 50; i++) {
        hashes.push(computeSHA256(largeContent))
      }

      expect(new Set(hashes).size).toBe(1)
    })
  })

  describe('computeAudioFingerprint() determinism', () => {
    let tempDir: any

    beforeEach(async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      tempDir = await createTempDirectory()
    })

    it('should produce identical hash for same Buffer across 100 runs', async () => {
      const { computeAudioFingerprint } = await import('../audio-fingerprint.js')

      const audioBuffer = Buffer.alloc(1024 * 1024) // 1MB
      audioBuffer.fill('test audio data')

      const hashes = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const hash = await computeAudioFingerprint(audioBuffer)
        hashes.add(hash)
      }

      expect(hashes.size).toBe(1)
    })

    it('should produce identical hash for same file across 100 runs', async () => {
      const { computeAudioFingerprint } = await import('../audio-fingerprint.js')

      // Create test audio file
      const audioPath = tempDir.getPath('test-audio.m4a')
      const audioContent = Buffer.alloc(2 * 1024 * 1024) // 2MB
      audioContent.fill('deterministic test audio')
      await tempDir.writeFile('test-audio.m4a', audioContent)

      const hashes = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const hash = await computeAudioFingerprint(audioPath)
        hashes.add(hash)
      }

      expect(hashes.size).toBe(1)
    })

    it('should produce identical hash for 4MB+ file (first 4MB only)', async () => {
      const { computeAudioFingerprint } = await import('../audio-fingerprint.js')

      const audioPath = tempDir.getPath('large-audio.m4a')
      const audioContent = Buffer.alloc(5 * 1024 * 1024) // 5MB
      audioContent.fill('large audio file content')
      await tempDir.writeFile('large-audio.m4a', audioContent)

      const hashes: string[] = []

      for (let i = 0; i < 50; i++) {
        hashes.push(await computeAudioFingerprint(audioPath))
      }

      expect(new Set(hashes).size).toBe(1)
    })
  })

  describe('computeEmailHash() determinism', () => {
    it('should produce identical hash for same email across 100 runs', async () => {
      const { computeEmailHash } = await import('../email.js')

      const messageId = '<test@example.com>'
      const body = 'Email body content\r\nWith multiple lines\r\n'

      const hashes = new Set<string>()

      for (let i = 0; i < 100; i++) {
        const hash = computeEmailHash(messageId, body)
        hashes.add(hash)
      }

      expect(hashes.size).toBe(1)
    })

    it('should produce identical hash for complex email body', async () => {
      const { computeEmailHash } = await import('../email.js')

      const messageId = '<complex@example.com>'
      const body = `
Subject: Test
From: test@example.com

Body with whitespace
  Indented lines
\r\n
Mixed line endings\r
`

      const hashes: string[] = []

      for (let i = 0; i < 50; i++) {
        hashes.push(computeEmailHash(messageId, body))
      }

      expect(new Set(hashes).size).toBe(1)
    })

    it('should produce identical hash for empty body', async () => {
      const { computeEmailHash } = await import('../email.js')

      const messageId = '<empty@example.com>'
      const hashes: string[] = []

      for (let i = 0; i < 50; i++) {
        hashes.push(computeEmailHash(messageId, ''))
      }

      expect(new Set(hashes).size).toBe(1)
    })
  })

  describe('Cross-run determinism (process restart simulation)', () => {
    it('should produce same hash after module reload', async () => {
      // First run
      const { computeSHA256: firstRun } = await import('../sha256-hash.js')
      const hash1 = firstRun('test content')

      // Simulate module reload by importing again
      const { computeSHA256: secondRun } = await import('../sha256-hash.js')
      const hash2 = secondRun('test content')

      expect(hash1).toBe(hash2)
    })

    it('should produce same normalized text after module reload', async () => {
      const { normalizeText: firstRun } = await import('../text-normalization.js')
      const result1 = firstRun('  Test\r\n  ')

      const { normalizeText: secondRun } = await import('../text-normalization.js')
      const result2 = secondRun('  Test\r\n  ')

      expect(result1).toBe(result2)
    })
  })
})
