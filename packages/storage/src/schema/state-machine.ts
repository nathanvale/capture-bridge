/**
 * State Machine for Capture Status Transitions
 *
 * Enforces lifecycle invariants for capture status transitions.
 * Based on spec-staging-arch.md §5 and ADR-0004.
 *
 * Valid states:
 * - staged: Initial state when capture is recorded
 * - transcribed: Successfully transcribed (voice) or extracted (email)
 * - failed_transcription: Transcription failed
 * - exported: Successfully exported to Obsidian
 * - exported_duplicate: Detected as duplicate and skipped
 * - exported_placeholder: Exported with placeholder text due to failure
 */

export type CaptureStatus =
  | 'staged'
  | 'transcribed'
  | 'failed_transcription'
  | 'exported'
  | 'exported_duplicate'
  | 'exported_placeholder'

/**
 * State transition rules based on ADR-0004.
 * Terminal states (exported*) have no valid transitions.
 */
const VALID_TRANSITIONS = new Map<CaptureStatus, CaptureStatus[]>([
  ['staged', ['transcribed', 'failed_transcription', 'exported_duplicate']],
  ['transcribed', ['exported', 'exported_duplicate']],
  ['failed_transcription', ['exported_placeholder']],
  ['exported', []],
  ['exported_duplicate', []],
  ['exported_placeholder', []],
])

/**
 * Validates if a transition from current state to next state is allowed.
 */
export const validateTransition = (current: string, next: string): boolean => {
  const validNextStates = VALID_TRANSITIONS.get(current as CaptureStatus)
  if (!validNextStates) {
    return false
  }
  return validNextStates.includes(next as CaptureStatus)
}

/**
 * Returns array of valid next states for a given current state.
 */
export const getValidTransitions = (current: string): string[] => {
  return VALID_TRANSITIONS.get(current as CaptureStatus) ?? []
}

/**
 * Determines if a state is terminal (no further transitions allowed).
 * Terminal states start with "exported" per ADR-0004.
 */
export const isTerminalState = (state: string): boolean => {
  return state.startsWith('exported')
}
