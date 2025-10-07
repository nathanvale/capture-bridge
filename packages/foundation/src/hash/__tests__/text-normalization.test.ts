import { describe, it, expect } from 'vitest'

import { normalizeText } from '../text-normalization.js'

describe('Text Normalization (AC01)', () => {
  it('should trim whitespace from start and end', () => {
    const input = '  hello world  '
    const result = normalizeText(input)
    expect(result).toBe('hello world')
  })

  it('should normalize CRLF to LF', () => {
    const input = 'line1\r\nline2\r\nline3'
    const result = normalizeText(input)
    expect(result).toBe('line1\nline2\nline3')
  })

  it('should normalize CR to LF', () => {
    const input = 'line1\rline2\rline3'
    const result = normalizeText(input)
    expect(result).toBe('line1\nline2\nline3')
  })

  it('should handle mixed line endings', () => {
    const input = 'line1\r\nline2\rline3\nline4'
    const result = normalizeText(input)
    expect(result).toBe('line1\nline2\nline3\nline4')
  })

  it('should handle empty string', () => {
    const result = normalizeText('')
    expect(result).toBe('')
  })

  it('should handle null by returning empty string', () => {
    const result = normalizeText(null as any)
    expect(result).toBe('')
  })

  it('should handle undefined by returning empty string', () => {
    const result = normalizeText(undefined as any)
    expect(result).toBe('')
  })

  it('should preserve single LF line endings', () => {
    const input = 'line1\nline2\nline3'
    const result = normalizeText(input)
    expect(result).toBe('line1\nline2\nline3')
  })

  it('should handle text with only whitespace', () => {
    const input = '   \t\n\r\n   '
    const result = normalizeText(input)
    // Text with only whitespace should normalize to empty string
    expect(result).toBe('')
  })

  it('should be deterministic for same input', () => {
    const input = '  Hello\r\nWorld  '
    const result1 = normalizeText(input)
    const result2 = normalizeText(input)
    expect(result1).toBe(result2)
    expect(result1).toBe('Hello\nWorld')
  })
})
