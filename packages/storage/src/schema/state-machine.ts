/**
 * Capture Status State Machine
 *
 * Enforces valid state transitions for the capture lifecycle.
 * Based on spec-staging-arch.md §5 and ADR-0004.
 *
 * State transitions:
 * - staged → transcribed → exported (AC01: happy path)
 * - staged → failed_transcription → exported_placeholder (AC02: failure path)
 * - staged → exported_duplicate (AC03: duplicate detected early)
 * - transcribed → exported_duplicate (AC03: duplicate detected after transcription)
 *
 * Terminal states (immutable):
 * - exported
 * - exported_duplicate
 * - exported_placeholder
 */

/**
 * Valid capture statuses
 */
export type CaptureStatus =
  | 'staged'
  | 'transcribed'
  | 'failed_transcription'
  | 'exported'
  | 'exported_duplicate'
  | 'exported_placeholder'

/**
 * State transition rules map
 * Each state maps to an array of valid next states
 */
const TRANSITION_RULES: Record<CaptureStatus, CaptureStatus[]> = {
  // staged can transition to:
  // - transcribed (successful transcription) - AC01
  // - failed_transcription (transcription failed) - AC02
  // - exported_duplicate (duplicate detected before transcription) - AC03
  staged: ['transcribed', 'failed_transcription', 'exported_duplicate'],

  // transcribed can transition to:
  // - exported (successful export) - AC01
  // - exported_duplicate (duplicate detected after transcription) - AC03
  transcribed: ['exported', 'exported_duplicate'],

  // failed_transcription can only transition to:
  // - exported_placeholder (placeholder export after failure) - AC02
  failed_transcription: ['exported_placeholder'],

  // Terminal states cannot transition (immutable)
  exported: [],
  exported_duplicate: [],
  exported_placeholder: [],
}

/**
 * Terminal states set for quick lookup
 */
const TERMINAL_STATES = new Set<CaptureStatus>([
  'exported',
  'exported_duplicate',
  'exported_placeholder',
])

/**
 * Validate if a state transition is allowed
 *
 * @param current - Current status
 * @param next - Desired next status
 * @returns true if transition is valid, false otherwise
 *
 * @example
 * ```typescript
 * validateTransition('staged', 'transcribed') // true (AC01)
 * validateTransition('staged', 'exported') // false (must go through transcribed)
 * validateTransition('exported', 'staged') // false (terminal state)
 * ```
 */
export const validateTransition = (current: string, next: string): boolean => {
  // Unknown states are invalid
  if (!(current in TRANSITION_RULES) || !(next in TRANSITION_RULES)) {
    return false
  }

  const validNextStates = TRANSITION_RULES[current as CaptureStatus]
  return validNextStates.includes(next as CaptureStatus)
}

/**
 * Get all valid transitions for a given state
 *
 * @param current - Current status
 * @returns Array of valid next statuses (empty for terminal states or unknown states)
 *
 * @example
 * ```typescript
 * getValidTransitions('staged') // ['transcribed', 'failed_transcription', 'exported_duplicate']
 * getValidTransitions('exported') // [] (terminal state)
 * getValidTransitions('unknown') // [] (unknown state)
 * ```
 */
export const getValidTransitions = (current: string): string[] => {
  if (!(current in TRANSITION_RULES)) {
    return []
  }

  return [...TRANSITION_RULES[current as CaptureStatus]]
}

/**
 * Check if a status is a terminal state (immutable)
 *
 * Terminal states:
 * - exported: Successfully exported to vault
 * - exported_duplicate: Skipped as duplicate
 * - exported_placeholder: Exported as placeholder after failure
 *
 * @param status - Status to check
 * @returns true if status is terminal, false otherwise
 *
 * @example
 * ```typescript
 * isTerminalState('exported') // true
 * isTerminalState('staged') // false
 * isTerminalState('unknown') // false
 * ```
 */
export const isTerminalState = (status: string): boolean => {
  return TERMINAL_STATES.has(status as CaptureStatus)
}
