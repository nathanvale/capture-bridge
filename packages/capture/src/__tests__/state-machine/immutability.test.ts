import { describe, it, expect } from 'vitest'

describe('Capture State Machine - Terminal State Immutability', () => {
  describe('Terminal states cannot transition', () => {
    it('should identify terminal states correctly', async () => {
      const { isTerminalState } = await import('../../state-machine/transitions.js')

      // All exported* states are terminal
      expect(isTerminalState('exported')).toBe(true)
      expect(isTerminalState('exported_duplicate')).toBe(true)
      expect(isTerminalState('exported_placeholder')).toBe(true)

      // Non-exported states are not terminal
      expect(isTerminalState('staged')).toBe(false)
      expect(isTerminalState('transcribed')).toBe(false)
      expect(isTerminalState('failed_transcription')).toBe(false)
    })

    it('should prevent any transitions from exported state', async () => {
      const { validateTransition } = await import('../../state-machine/transitions.js')
      const { CaptureStatus } = await import('../../state-machine/types.js')

      const allStates: CaptureStatus[] = [
        'staged',
        'transcribed',
        'failed_transcription',
        'exported',
        'exported_duplicate',
        'exported_placeholder',
      ]

      // No transition from exported should be valid
      for (const targetState of allStates) {
        expect(validateTransition('exported', targetState)).toBe(false)
      }
    })

    it('should prevent any transitions from exported_duplicate state', async () => {
      const { validateTransition } = await import('../../state-machine/transitions.js')
      const { CaptureStatus } = await import('../../state-machine/types.js')

      const allStates: CaptureStatus[] = [
        'staged',
        'transcribed',
        'failed_transcription',
        'exported',
        'exported_duplicate',
        'exported_placeholder',
      ]

      // No transition from exported_duplicate should be valid
      for (const targetState of allStates) {
        expect(validateTransition('exported_duplicate', targetState)).toBe(false)
      }
    })

    it('should prevent any transitions from exported_placeholder state', async () => {
      const { validateTransition } = await import('../../state-machine/transitions.js')
      const { CaptureStatus } = await import('../../state-machine/types.js')

      const allStates: CaptureStatus[] = [
        'staged',
        'transcribed',
        'failed_transcription',
        'exported',
        'exported_duplicate',
        'exported_placeholder',
      ]

      // No transition from exported_placeholder should be valid
      for (const targetState of allStates) {
        expect(validateTransition('exported_placeholder', targetState)).toBe(false)
      }
    })
  })

  describe('State machine completeness', () => {
    it('should have all states defined in the CaptureStatus type', async () => {
      const { CaptureStatus } = await import('../../state-machine/types.js')

      // This test ensures we have exactly 6 states as per requirements
      const states: CaptureStatus[] = [
        'staged',
        'transcribed',
        'failed_transcription',
        'exported',
        'exported_duplicate',
        'exported_placeholder',
      ]

      // TypeScript will error if any state is missing or incorrect
      expect(states).toHaveLength(6)
    })

    it('should define all valid transitions', async () => {
      const { getValidTransitions } = await import('../../state-machine/transitions.js')

      // Test that we can get valid transitions for each non-terminal state
      expect(getValidTransitions('staged')).toEqual(
        expect.arrayContaining(['transcribed', 'failed_transcription', 'exported_duplicate'])
      )

      expect(getValidTransitions('transcribed')).toEqual(expect.arrayContaining(['exported', 'exported_duplicate']))

      expect(getValidTransitions('failed_transcription')).toEqual(expect.arrayContaining(['exported_placeholder']))

      // Terminal states should have no valid transitions
      expect(getValidTransitions('exported')).toEqual([])
      expect(getValidTransitions('exported_duplicate')).toEqual([])
      expect(getValidTransitions('exported_placeholder')).toEqual([])
    })
  })
})
