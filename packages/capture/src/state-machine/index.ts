/**
 * State machine for capture status transitions
 *
 * This module implements the state machine defined in ADR-0004
 * for managing capture lifecycle transitions.
 */

export type { CaptureStatus } from './types.js'

export { TERMINAL_STATES, NON_TERMINAL_STATES, isValidCaptureStatus } from './types.js'

export {
  validateTransition,
  isTerminalState,
  getValidTransitions,
  validateStatePath,
  getTerminalStateForPath,
} from './transitions.js'
