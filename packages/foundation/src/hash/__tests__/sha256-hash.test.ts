import { describe, it, expect } from 'vitest'

import { computeSHA256 } from '../sha256-hash.js'

describe('SHA-256 Hash Computation (AC02)', () => {
  it('should compute SHA-256 hash for simple text', () => {
    const input = 'hello world'
    const result = computeSHA256(input)
    // Known SHA-256 hash for "hello world"
    expect(result).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('should return 64-character hex string', () => {
    const input = 'test'
    const result = computeSHA256(input)
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should handle empty string', () => {
    const input = ''
    const result = computeSHA256(input)
    // Known SHA-256 hash for empty string
    expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('should handle Buffer input', () => {
    const input = Buffer.from('hello world', 'utf8')
    const result = computeSHA256(input)
    expect(result).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('should handle Unicode text', () => {
    const input = 'Hello 世界 🌍'
    const result = computeSHA256(input)
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should be deterministic for same input', () => {
    const input = 'test data'
    const result1 = computeSHA256(input)
    const result2 = computeSHA256(input)
    expect(result1).toBe(result2)
  })

  it('should produce different hashes for different inputs', () => {
    const result1 = computeSHA256('input1')
    const result2 = computeSHA256('input2')
    expect(result1).not.toBe(result2)
  })

  it('should handle large text', () => {
    const largeText = 'a'.repeat(10000)
    const result = computeSHA256(largeText)
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should handle multi-line text', () => {
    const input = 'line1\nline2\nline3'
    const result = computeSHA256(input)
    // Known SHA-256 hash for this specific multi-line text
    expect(result).toBe('6bb6a5ad9b9c43a7cb535e636578716b64ac42edea814a4cad102ba404946837')
  })

  it('should handle binary data in Buffer', () => {
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd])
    const result = computeSHA256(binaryData)
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })
})
