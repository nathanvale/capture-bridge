import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Import schemas that we'll create
import {
  captureVoiceSchema,
  captureEmailSchema,
  captureListSchema,
  captureShowSchema,
  doctorSchema,
  ledgerListSchema,
  ledgerInspectSchema,
  validateInput,
} from '../utils/validation.js'

describe('Zod Validation Schemas', () => {
  describe('captureVoiceSchema', () => {
    it('should validate valid voice file path', () => {
      const input = { filePath: '/path/to/audio.m4a' }
      const result = captureVoiceSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.filePath).toBe('/path/to/audio.m4a')
      }
    })

    it('should fail with missing file path', () => {
      const input = {}
      const result = captureVoiceSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should fail with empty file path', () => {
      const input = { filePath: '' }
      const result = captureVoiceSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should parse optional transcribe flag', () => {
      const input = { filePath: '/path/to/audio.m4a', transcribe: true }
      const result = captureVoiceSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.transcribe).toBe(true)
      }
    })

    it('should parse optional tags array', () => {
      const input = {
        filePath: '/path/to/audio.m4a',
        tags: ['urgent', 'work'],
      }
      const result = captureVoiceSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.tags).toEqual(['urgent', 'work'])
      }
    })

    it('should apply default priority', () => {
      const input = { filePath: '/path/to/audio.m4a' }
      const result = captureVoiceSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.priority).toBe('normal')
      }
    })

    it('should validate priority enum', () => {
      const input = { filePath: '/path/to/audio.m4a', priority: 'high' }
      const result = captureVoiceSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.priority).toBe('high')
      }
    })

    it('should fail with invalid priority', () => {
      const input = { filePath: '/path/to/audio.m4a', priority: 'critical' }
      const result = captureVoiceSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('captureEmailSchema', () => {
    it('should validate valid email file path', () => {
      const input = { filePath: '/path/to/email.eml' }
      const result = captureEmailSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.filePath).toBe('/path/to/email.eml')
      }
    })

    it('should fail with missing file path', () => {
      const input = {}
      const result = captureEmailSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should fail with empty file path', () => {
      const input = { filePath: '' }
      const result = captureEmailSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('captureListSchema', () => {
    it('should validate with no filters', () => {
      const input = {}
      const result = captureListSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should validate with valid source filter', () => {
      const input = { source: 'voice' }
      const result = captureListSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.source).toBe('voice')
      }
    })

    it('should validate with email source filter', () => {
      const input = { source: 'email' }
      const result = captureListSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.source).toBe('email')
      }
    })

    it('should fail with invalid source', () => {
      const input = { source: 'sms' }
      const result = captureListSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should validate with valid limit', () => {
      const input = { limit: 50 }
      const result = captureListSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(50)
      }
    })

    it('should fail with negative limit', () => {
      const input = { limit: -1 }
      const result = captureListSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should fail with zero limit', () => {
      const input = { limit: 0 }
      const result = captureListSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should validate with both source and limit', () => {
      const input = { source: 'voice', limit: 25 }
      const result = captureListSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.source).toBe('voice')
        expect(result.data.limit).toBe(25)
      }
    })
  })

  describe('captureShowSchema', () => {
    it('should validate valid ULID format', () => {
      const input = { id: '01HQWP7XKZM2YJVT8YFGQSZ4MN' }
      const result = captureShowSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe('01HQWP7XKZM2YJVT8YFGQSZ4MN')
      }
    })

    it('should fail with missing id', () => {
      const input = {}
      const result = captureShowSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should fail with empty id', () => {
      const input = { id: '' }
      const result = captureShowSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should fail with short id', () => {
      const input = { id: '01HQWP7XKZM2YJVT8Y' }
      const result = captureShowSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should accept 26+ character ids', () => {
      const input = { id: '01HQWP7XKZM2YJVT8YFGQSZ4MXYZ' }
      const result = captureShowSchema.safeParse(input)
      expect(result.success).toBe(true)
    })
  })

  describe('doctorSchema', () => {
    it('should validate with no flags', () => {
      const input = {}
      const result = doctorSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should validate with verbose flag true', () => {
      const input = { verbose: true }
      const result = doctorSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.verbose).toBe(true)
      }
    })

    it('should validate with verbose flag false', () => {
      const input = { verbose: false }
      const result = doctorSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.verbose).toBe(false)
      }
    })

    it('should default verbose to false', () => {
      const input = {}
      const result = doctorSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.verbose).toBe(false)
      }
    })
  })

  describe('ledgerListSchema', () => {
    it('should validate with no filters', () => {
      const input = {}
      const result = ledgerListSchema.safeParse(input)
      expect(result.success).toBe(true)
    })

    it('should validate with valid source filter', () => {
      const input = { source: 'voice' }
      const result = ledgerListSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.source).toBe('voice')
      }
    })

    it('should fail with invalid source', () => {
      const input = { source: 'web' }
      const result = ledgerListSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should validate with valid limit', () => {
      const input = { limit: 100 }
      const result = ledgerListSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.limit).toBe(100)
      }
    })

    it('should fail with negative limit', () => {
      const input = { limit: -5 }
      const result = ledgerListSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('ledgerInspectSchema', () => {
    it('should validate valid ULID format', () => {
      const input = { id: '01HQWP7XKZM2YJVT8YFGQSZ4MN' }
      const result = ledgerInspectSchema.safeParse(input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe('01HQWP7XKZM2YJVT8YFGQSZ4MN')
      }
    })

    it('should fail with missing id', () => {
      const input = {}
      const result = ledgerInspectSchema.safeParse(input)
      expect(result.success).toBe(false)
    })

    it('should fail with short id', () => {
      const input = { id: '01HQWP7XKZM' }
      const result = ledgerInspectSchema.safeParse(input)
      expect(result.success).toBe(false)
    })
  })

  describe('validateInput helper', () => {
    it('should return parsed data on success', () => {
      const schema = z.object({ name: z.string() })
      const input = { name: 'test' }
      const result = validateInput(schema, input)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('test')
      }
    })

    it('should return error details on failure', () => {
      const schema = z.object({ age: z.number().positive() })
      const input = { age: -1 }
      const result = validateInput(schema, input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors).toBeDefined()
        expect(result.errors.length).toBeGreaterThan(0)
      }
    })

    it('should aggregate multiple errors', () => {
      const schema = z.object({
        name: z.string().min(2),
        age: z.number().positive(),
        email: z.string().email(),
      })
      const input = { name: 'a', age: -1, email: 'invalid' }
      const result = validateInput(schema, input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors).toBeDefined()
        expect(result.errors).toHaveLength(3)
      }
    })

    it('should include field paths in errors', () => {
      const schema = z.object({ user: z.object({ name: z.string().min(2) }) })
      const input = { user: { name: 'a' } }
      const result = validateInput(schema, input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors[0]).toHaveProperty('field')
        expect(result.errors[0]?.field).toContain('name')
      }
    })

    it('should include error messages', () => {
      const schema = z.object({ age: z.number().positive() })
      const input = { age: -1 }
      const result = validateInput(schema, input)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors[0]).toHaveProperty('message')
        expect(result.errors[0]?.message).toBeTruthy()
      }
    })
  })
})
