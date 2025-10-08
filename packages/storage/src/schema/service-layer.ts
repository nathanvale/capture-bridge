/**
 * Service Layer for State Machine Validation and Recovery
 *
 * Provides service layer functions that wrap state machine validation
 * with error handling and recovery query functionality.
 * Based on spec-staging-arch.md §4.4, §5.4 and ADR-0004.
 */

import { validateTransition, getValidTransitions, isTerminalState } from './state-machine.js'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

/**
 * Custom error for state transition violations
 */
export class StateTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StateTransitionError'
  }
}

/**
 * Asserts that a state transition is valid, throwing an error if not.
 * 
 * AC04: Enforces terminal state immutability (exported* states)
 * AC05: Service layer validation with error throwing
 *
 * @param current - Current capture status
 * @param next - Desired next status
 * @throws {StateTransitionError} If transition is invalid or from terminal state
 */
export const assertValidTransition = (current: string, next: string): void => {
  // AC04: Terminal states cannot transition
  if (isTerminalState(current)) {
    throw new StateTransitionError(
      `Cannot transition from terminal state: ${current}`
    )
  }

  // AC05: Validate transition and throw detailed error
  if (!validateTransition(current, next)) {
    const validTransitions = getValidTransitions(current)
    throw new StateTransitionError(
      `Invalid transition: ${current} → ${next}. Valid transitions: ${validTransitions.join(', ')}`
    )
  }
}

/**
 * Capture interface for recovery query results
 */
interface RecoverableCapture {
  id: string
  status: string
  created_at: string
}

/**
 * Queries for captures in non-terminal states that can be resumed.
 * 
 * AC06: Recovery query for crash recovery and startup resume
 *
 * @param db - SQLite database instance
 * @returns Array of captures with status in ('staged', 'transcribed', 'failed_transcription'), ordered by created_at ASC
 */
export const queryRecoverableCaptures = (db: Database): RecoverableCapture[] => {
  const stmt = db.prepare(`
    SELECT id, status, created_at
    FROM captures
    WHERE status IN ('staged', 'transcribed', 'failed_transcription')
    ORDER BY created_at ASC
  `)

  const rows = stmt.all() as RecoverableCapture[]
  return rows
}
