import { describe, it, expect } from 'vitest'

import { computeEmailHash } from '../email.js'

describe('Email Hash (AC04)', () => {
  it('should compute hash from messageId and body', () => {
    const messageId = 'message-123@gmail.com'
    const body = 'Hello world'
    const result = computeEmailHash(messageId, body)

    // Should return 64-character hex string
    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should normalize body text before hashing', () => {
    const messageId = 'msg-456@gmail.com'
    const body1 = '  Hello World  '
    const body2 = 'Hello World'

    const result1 = computeEmailHash(messageId, body1)
    const result2 = computeEmailHash(messageId, body2)

    // Both should produce same hash after normalization
    expect(result1).toBe(result2)
  })

  it('should normalize line endings in body', () => {
    const messageId = 'msg-789@gmail.com'
    const body1 = 'line1\r\nline2\r\nline3'
    const body2 = 'line1\nline2\nline3'

    const result1 = computeEmailHash(messageId, body1)
    const result2 = computeEmailHash(messageId, body2)

    expect(result1).toBe(result2)
  })

  it('should handle empty body', () => {
    const messageId = 'msg-empty@gmail.com'
    const body = ''
    const result = computeEmailHash(messageId, body)

    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should produce different hashes for different messageIds', () => {
    const body = 'Same body'
    const result1 = computeEmailHash('msg-1@gmail.com', body)
    const result2 = computeEmailHash('msg-2@gmail.com', body)

    expect(result1).not.toBe(result2)
  })

  it('should produce different hashes for different bodies', () => {
    const messageId = 'msg-same@gmail.com'
    const result1 = computeEmailHash(messageId, 'Body 1')
    const result2 = computeEmailHash(messageId, 'Body 2')

    expect(result1).not.toBe(result2)
  })

  it('should handle Unicode characters', () => {
    const messageId = 'msg-unicode@gmail.com'
    const body = 'Hello 世界 🌍'
    const result = computeEmailHash(messageId, body)

    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should be deterministic for same inputs', () => {
    const messageId = 'msg-test@gmail.com'
    const body = 'Test email body'

    const result1 = computeEmailHash(messageId, body)
    const result2 = computeEmailHash(messageId, body)

    expect(result1).toBe(result2)
  })

  it('should handle multi-line email bodies', () => {
    const messageId = 'msg-multiline@gmail.com'
    const body = `Line 1
Line 2
Line 3`

    const result = computeEmailHash(messageId, body)

    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should handle large email bodies', () => {
    const messageId = 'msg-large@gmail.com'
    const body = 'a'.repeat(10000)

    const result = computeEmailHash(messageId, body)

    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should handle special characters in messageId', () => {
    const messageId = '<msg-123@gmail.com>'
    const body = 'Test'

    const result = computeEmailHash(messageId, body)

    expect(result).toHaveLength(64)
    expect(result).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should combine messageId and body correctly', async () => {
    // Test that the format is messageId|body
    const messageId = 'test-msg'
    const body = 'test-body'

    // We can verify by manually computing expected hash
    const { computeSHA256 } = await import('../sha256-hash.js')
    const { normalizeText } = await import('../text-normalization.js')

    const normalizedBody = normalizeText(body)
    const combined = `${messageId}|${normalizedBody}`
    const expected = computeSHA256(combined)

    const result = computeEmailHash(messageId, body)

    expect(result).toBe(expected)
  })
})
