/**
 * State machine transition logic for capture status
 *
 * Implements the transition rules defined in ADR-0004:
 * - staged → {transcribed, failed_transcription, exported_duplicate}
 * - transcribed → {exported, exported_duplicate}
 * - failed_transcription → {exported_placeholder}
 * - exported* → (no transitions - immutable)
 */

import { TERMINAL_STATES, type CaptureStatus } from './types.js'

/**
 * Map of valid state transitions
 * Key: current state
 * Value: array of valid next states
 */
const VALID_TRANSITIONS = new Map<CaptureStatus, CaptureStatus[]>([
  ['staged', ['transcribed', 'failed_transcription', 'exported_duplicate']],
  ['transcribed', ['exported', 'exported_duplicate']],
  ['failed_transcription', ['exported_placeholder']],
  // Terminal states have no valid transitions
  ['exported', []],
  ['exported_duplicate', []],
  ['exported_placeholder', []],
])

/**
 * Validates if a state transition is allowed
 * @param current The current state
 * @param next The desired next state
 * @returns true if the transition is valid, false otherwise
 */
export const validateTransition = (current: CaptureStatus, next: CaptureStatus): boolean => {
  const allowedTransitions = VALID_TRANSITIONS.get(current)
  if (!allowedTransitions) {
    return false
  }
  return allowedTransitions.includes(next)
}

/**
 * Checks if a state is terminal (cannot transition to any other state)
 * @param state The state to check
 * @returns true if the state is terminal, false otherwise
 */
export const isTerminalState = (state: CaptureStatus): boolean => {
  return TERMINAL_STATES.includes(state)
}

/**
 * Gets the list of valid transitions from a given state
 * @param state The current state
 * @returns Array of valid next states (empty for terminal states)
 */
export const getValidTransitions = (state: CaptureStatus): CaptureStatus[] => {
  return VALID_TRANSITIONS.get(state) ?? []
}

/**
 * Validates that a complete state path is valid
 * @param path Array of states representing a transition path
 * @returns true if the entire path is valid, false otherwise
 */
export const validateStatePath = (path: CaptureStatus[]): boolean => {
  if (path.length < 2) {
    return path.length === 1 // Single state is always valid
  }

  for (let i = 0; i < path.length - 1; i++) {
    const current = path.at(i)
    const next = path.at(i + 1)

    if (!current || !next) {
      return false
    }

    if (!validateTransition(current, next)) {
      return false
    }
  }

  return true
}

/**
 * Gets the terminal state for a given path type
 * Useful for determining the expected end state
 */
export const getTerminalStateForPath = (
  pathType: 'success' | 'failure' | 'duplicate'
): CaptureStatus => {
  switch (pathType) {
    case 'success':
      return 'exported'
    case 'failure':
      return 'exported_placeholder'
    case 'duplicate':
      return 'exported_duplicate'
  }
}
