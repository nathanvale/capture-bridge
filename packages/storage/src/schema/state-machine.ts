/**
 * Capture Status State Machine
 *
 * Implements status-driven state machine for capture lifecycle management.
 * Enforces immutable terminal states and valid transitions.
 *
 * State Flows:
 * - Happy path: staged → transcribed → exported
 * - Failure path: staged → failed_transcription → exported_placeholder
 * - Duplicate path: staged → exported_duplicate (or transcribed → exported_duplicate)
 *
 * Source: docs/features/staging-ledger/spec-staging-arch.md §5
 * ADR: docs/adr/0004-status-driven-state-machine.md
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
 * State transition map defining valid next states for each current state
 */
const STATE_TRANSITIONS: Record<CaptureStatus, CaptureStatus[]> = {
  staged: ['transcribed', 'failed_transcription', 'exported_duplicate'],
  transcribed: ['exported', 'exported_duplicate'],
  failed_transcription: ['exported_placeholder'],
  exported: [],
  exported_duplicate: [],
  exported_placeholder: [],
}

/**
 * Terminal states that cannot transition to any other state
 */
const TERMINAL_STATES = new Set<CaptureStatus>([
  'exported',
  'exported_duplicate',
  'exported_placeholder',
])

/**
 * Validates if a state transition is allowed
 *
 * @param current - Current capture status
 * @param next - Target capture status
 * @returns true if transition is valid, false otherwise
 *
 * @example
 * ```typescript
 * validateTransition('staged', 'transcribed') // true
 * validateTransition('exported', 'staged')    // false (terminal state)
 * validateTransition('staged', 'exported')    // false (invalid transition)
 * ```
 */
export const validateTransition = (current: string, next: string): boolean => {
  // Unknown states are rejected
  if (!(current in STATE_TRANSITIONS) || !(next in STATE_TRANSITIONS)) {
    return false
  }

  const validNextStates = STATE_TRANSITIONS[current as CaptureStatus]
  return validNextStates.includes(next as CaptureStatus)
}

/**
 * Returns array of valid next states for the given current state
 *
 * @param current - Current capture status
 * @returns Array of valid next states (empty for terminal states or unknown states)
 *
 * @example
 * ```typescript
 * getValidTransitions('staged')           // ['transcribed', 'failed_transcription', 'exported_duplicate']
 * getValidTransitions('exported')         // [] (terminal state)
 * getValidTransitions('unknown')          // [] (unknown state)
 * ```
 */
export const getValidTransitions = (current: string): string[] => {
  if (!(current in STATE_TRANSITIONS)) {
    return []
  }

  return STATE_TRANSITIONS[current as CaptureStatus]
}

/**
 * Checks if a status is a terminal state (immutable)
 *
 * @param state - Capture status to check
 * @returns true if state is terminal, false otherwise
 *
 * @example
 * ```typescript
 * isTerminalState('exported')             // true
 * isTerminalState('staged')               // false
 * isTerminalState('unknown')              // false
 * ```
 */
export const isTerminalState = (state: string): boolean => {
  return TERMINAL_STATES.has(state as CaptureStatus)
}
