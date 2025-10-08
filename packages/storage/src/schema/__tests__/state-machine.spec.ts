/**
 * State Machine Transition Validation Tests
 *
 * Tests for the capture status state machine that enforces lifecycle invariants.
 * Based on spec-staging-arch.md §5 and ADR-0004.
 *
 * State transitions:
 * - staged → transcribed → exported (happy path)
 * - staged → failed_transcription → exported_placeholder (failure path)
 * - staged → exported_duplicate (duplicate detected early)
 */

import { describe, it, expect, beforeEach } from 'vitest'

describe('State Machine Transition Validation', () => {
  let validateTransition: (current: string, next: string) => boolean
  let getValidTransitions: (current: string) => string[]
  let isTerminalState: (state: string) => boolean

  beforeEach(async () => {
    // Dynamic import following TestKit pattern
    const {
      validateTransition: vt,
      getValidTransitions: gvt,
      isTerminalState: its,
    } = await import('../state-machine.js')
    validateTransition = vt
    getValidTransitions = gvt
    isTerminalState = its
  })

  describe('AC01: Happy path transitions', () => {
    it('should allow staged → transcribed transition', () => {
      const result = validateTransition('staged', 'transcribed')
      expect(result).toBe(true)
    })

    it('should allow transcribed → exported transition', () => {
      const result = validateTransition('transcribed', 'exported')
      expect(result).toBe(true)
    })

    it('should return valid transitions for staged status', () => {
      const validTransitions = getValidTransitions('staged')
      expect(validTransitions).toContain('transcribed')
      expect(validTransitions).toContain('failed_transcription')
      expect(validTransitions).toContain('exported_duplicate')
      expect(validTransitions).toHaveLength(3)
    })

    it('should return valid transitions for transcribed status', () => {
      const validTransitions = getValidTransitions('transcribed')
      expect(validTransitions).toContain('exported')
      expect(validTransitions).toContain('exported_duplicate')
      expect(validTransitions).toHaveLength(2)
    })
  })

  describe('AC02: Failure path transitions', () => {
    it('should allow staged → failed_transcription transition', () => {
      const result = validateTransition('staged', 'failed_transcription')
      expect(result).toBe(true)
    })

    it('should allow failed_transcription → exported_placeholder transition', () => {
      const result = validateTransition('failed_transcription', 'exported_placeholder')
      expect(result).toBe(true)
    })

    it('should only allow exported_placeholder from failed_transcription', () => {
      const validTransitions = getValidTransitions('failed_transcription')
      expect(validTransitions).toEqual(['exported_placeholder'])
      expect(validTransitions).toHaveLength(1)
    })
  })

  describe('AC03: Duplicate path transitions', () => {
    it('should allow staged → exported_duplicate transition', () => {
      const result = validateTransition('staged', 'exported_duplicate')
      expect(result).toBe(true)
    })

    it('should allow transcribed → exported_duplicate transition', () => {
      const result = validateTransition('transcribed', 'exported_duplicate')
      expect(result).toBe(true)
    })
  })

  describe('Invalid transition rejection', () => {
    it('should reject transition from terminal state exported', () => {
      const result = validateTransition('exported', 'staged')
      expect(result).toBe(false)
    })

    it('should reject transition from terminal state exported_duplicate', () => {
      const result = validateTransition('exported_duplicate', 'transcribed')
      expect(result).toBe(false)
    })

    it('should reject transition from terminal state exported_placeholder', () => {
      const result = validateTransition('exported_placeholder', 'staged')
      expect(result).toBe(false)
    })

    it('should reject invalid transitions from staged', () => {
      expect(validateTransition('staged', 'exported')).toBe(false)
      expect(validateTransition('staged', 'exported_placeholder')).toBe(false)
    })

    it('should reject invalid transitions from transcribed', () => {
      expect(validateTransition('transcribed', 'staged')).toBe(false)
      expect(validateTransition('transcribed', 'failed_transcription')).toBe(false)
      expect(validateTransition('transcribed', 'exported_placeholder')).toBe(false)
      expect(validateTransition('transcribed', 'transcribed')).toBe(false)
    })

    it('should reject invalid transitions from failed_transcription', () => {
      expect(validateTransition('failed_transcription', 'exported')).toBe(false)
      expect(validateTransition('failed_transcription', 'exported_duplicate')).toBe(false)
      expect(validateTransition('failed_transcription', 'staged')).toBe(false)
      expect(validateTransition('failed_transcription', 'transcribed')).toBe(false)
    })

    it('should return empty array for terminal states', () => {
      expect(getValidTransitions('exported')).toEqual([])
      expect(getValidTransitions('exported_duplicate')).toEqual([])
      expect(getValidTransitions('exported_placeholder')).toEqual([])
    })

    it('should reject unknown states', () => {
      expect(validateTransition('unknown', 'staged')).toBe(false)
      expect(validateTransition('staged', 'unknown')).toBe(false)
      expect(getValidTransitions('unknown')).toEqual([])
    })
  })

  describe('Terminal state detection', () => {
    it('should identify terminal states', () => {
      expect(isTerminalState('exported')).toBe(true)
      expect(isTerminalState('exported_duplicate')).toBe(true)
      expect(isTerminalState('exported_placeholder')).toBe(true)
    })

    it('should identify non-terminal states', () => {
      expect(isTerminalState('staged')).toBe(false)
      expect(isTerminalState('transcribed')).toBe(false)
      expect(isTerminalState('failed_transcription')).toBe(false)
    })

    it('should handle unknown states', () => {
      expect(isTerminalState('unknown')).toBe(false)
      expect(isTerminalState('')).toBe(false)
    })
  })
})
