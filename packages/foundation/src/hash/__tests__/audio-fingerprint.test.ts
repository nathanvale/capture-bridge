import { Readable } from 'node:stream'

import { describe, it, expect } from 'vitest'

import { computeAudioFingerprint } from '../audio-fingerprint.js'

describe('Audio Fingerprint (AC03)', () => {
  const FOUR_MB = 4 * 1024 * 1024

  it('should compute SHA-256 hash of first 4MB of buffer', async () => {
    const buffer = Buffer.alloc(FOUR_MB + 1024, 'a')
    const result = await computeAudioFingerprint(buffer)

    // Should only hash first 4MB
    const expectedBuffer = Buffer.alloc(FOUR_MB, 'a')
    const { computeSHA256 } = await import('../sha256-hash.js')
    const expected = computeSHA256(expectedBuffer)

    expect(result).toBe(expected)
    expect(result).toHaveLength(64)
  })

  it('should handle buffers smaller than 4MB', async () => {
    const smallBuffer = Buffer.alloc(1024, 'b')
    const result = await computeAudioFingerprint(smallBuffer)

    const { computeSHA256 } = await import('../sha256-hash.js')
    const expected = computeSHA256(smallBuffer)

    expect(result).toBe(expected)
  })

  it('should handle exactly 4MB buffer', async () => {
    const buffer = Buffer.alloc(FOUR_MB, 'c')
    const result = await computeAudioFingerprint(buffer)

    const { computeSHA256 } = await import('../sha256-hash.js')
    const expected = computeSHA256(buffer)

    expect(result).toBe(expected)
  })

  it('should compute fingerprint from stream', async () => {
    // Create a readable stream with 5MB of data
    const chunks: Buffer[] = []
    for (let i = 0; i < 5; i++) {
      chunks.push(Buffer.alloc(1024 * 1024, 'd'))
    }

    const stream = Readable.from(chunks)
    const result = await computeAudioFingerprint(stream)

    // Should only process first 4MB
    const expectedBuffer = Buffer.alloc(FOUR_MB, 'd')
    const { computeSHA256 } = await import('../sha256-hash.js')
    const expected = computeSHA256(expectedBuffer)

    expect(result).toBe(expected)
  })

  it('should handle stream smaller than 4MB', async () => {
    const chunks = [Buffer.alloc(512 * 1024, 'e'), Buffer.alloc(512 * 1024, 'e')]

    const stream = Readable.from(chunks)
    const result = await computeAudioFingerprint(stream)

    const expectedBuffer = Buffer.concat(chunks)
    const { computeSHA256 } = await import('../sha256-hash.js')
    const expected = computeSHA256(expectedBuffer)

    expect(result).toBe(expected)
  })

  it('should handle file path input', async () => {
    // We'll create a test file in the actual test when we have file system access
    // For now, test with a mock path that doesn't exist
    const testPath = '/nonexistent/test.m4a'

    try {
      await computeAudioFingerprint(testPath)
      expect.fail('Should have thrown an error')
    } catch (error: any) {
      expect(error.code).toBe('ENOENT')
    }
  })

  it('should handle empty buffer', async () => {
    const emptyBuffer = Buffer.alloc(0)
    const result = await computeAudioFingerprint(emptyBuffer)

    const { computeSHA256 } = await import('../sha256-hash.js')
    const expected = computeSHA256(emptyBuffer)

    expect(result).toBe(expected)
    // SHA-256 of empty buffer
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('should be deterministic for same input', async () => {
    const buffer = Buffer.alloc(FOUR_MB + 2048, 'f')

    const result1 = await computeAudioFingerprint(buffer)
    const result2 = await computeAudioFingerprint(buffer)

    expect(result1).toBe(result2)
  })

  it('should handle null input', async () => {
    try {
      await computeAudioFingerprint(null as any)
      expect.fail('Should have thrown an error')
    } catch (error: any) {
      expect(error.message).toMatch(/Invalid input/)
    }
  })

  it('should handle undefined input', async () => {
    try {
      await computeAudioFingerprint(undefined as any)
      expect.fail('Should have thrown an error')
    } catch (error: any) {
      expect(error.message).toMatch(/Invalid input/)
    }
  })
})
