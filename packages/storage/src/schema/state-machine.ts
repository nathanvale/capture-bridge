/**
 * Capture Status State Machine
 *
 * Implements the state machine for capture lifecycle management.
 * Based on spec-staging-arch.md §5 and ADR-0004.
 *
 * State transitions:
 * - staged → {transcribed, failed_transcription, exported_duplicate}
 * - transcribed → {exported, exported_duplicate}
 * - failed_transcription → {exported_placeholder}
 * - exported* → {} (terminal states, no transitions)
 */

/**
 * Valid capture status states
 */
export type CaptureStatus =
  | 'staged'
  | 'transcribed'
  | 'failed_transcription'
  | 'exported'
  | 'exported_duplicate'
  | 'exported_placeholder'

/**
 * State transition map defining valid transitions for each state
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
 * Validates if a state transition is allowed
 *
 * @param current - Current capture status
 * @param next - Desired next status
 * @returns true if transition is valid, false otherwise
 */
export function validateTransition(current: string, next: string): boolean {
  // Unknown states cannot transition
  if (!(current in STATE_TRANSITIONS)) {
    return false
  }

  const validNextStates = STATE_TRANSITIONS[current as CaptureStatus]
  return validNextStates.includes(next as CaptureStatus)
}

/**
 * Get all valid next states for a given current state
 *
 * @param current - Current capture status
 * @returns Array of valid next states (empty for terminal states or unknown states)
 */
export function getValidTransitions(current: string): string[] {
  if (!(current in STATE_TRANSITIONS)) {
    return []
  }

  return STATE_TRANSITIONS[current as CaptureStatus]
}

/**
 * Check if a state is terminal (no valid transitions)
 *
 * @param state - State to check
 * @returns true if state is terminal, false otherwise
 */
export function isTerminalState(state: string): boolean {
  if (!(state in STATE_TRANSITIONS)) {
    return false
  }

  return STATE_TRANSITIONS[state as CaptureStatus].length === 0
}
