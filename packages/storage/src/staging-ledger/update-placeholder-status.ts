/**
 * Update Placeholder Status
 *
 * Updates capture status to 'exported_placeholder' after failed transcription.
 * Part of PLACEHOLDER_EXPORT--T02 - AC05
 *
 * Based on guide-error-recovery.md and spec-staging-tech.md
 */

import { assertValidTransition } from '../schema/service-layer.js'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

export class UpdatePlaceholderStatusError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message)
    this.name = 'UpdatePlaceholderStatusError'
  }
}

/**
 * Update capture status to 'exported_placeholder'
 *
 * Sets:
 * - status = 'exported_placeholder'
 * - raw_content = placeholderContent (the placeholder markdown)
 * - content_hash = NULL (hash unavailable for placeholder)
 * - updated_at = CURRENT_TIMESTAMP
 *
 * Atomically validates state transition and updates capture.
 * Uses single parameterized UPDATE with WHERE clause to detect concurrent state changes.
 * Prevents TOCTOU race condition by making validation and update atomic.
 *
 * @param db - SQLite database instance
 * @param captureId - ULID of the capture to update
 * @param placeholderContent - The placeholder markdown content to store
 * @throws {UpdatePlaceholderStatusError} If capture not found
 * @throws {StateTransitionError} If state transition is invalid (including concurrent changes)
 */
export const updateCaptureStatusToPlaceholder = (
  db: Database,
  captureId: string,
  placeholderContent: string
): void => {
  // First, fetch current capture to check if it exists and to validate state transition
  const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as
    | { status: string }
    | undefined

  if (!capture) {
    throw new UpdatePlaceholderStatusError('Capture not found', 'NOT_FOUND')
  }

  // Validate the transition is valid (will throw StateTransitionError if not)
  assertValidTransition(capture.status, 'exported_placeholder')

  // Atomic UPDATE: Include current status in WHERE clause to detect concurrent changes
  // If another process changed the status between our SELECT and UPDATE, this returns 0 changes
  const stmt = db.prepare(
    `UPDATE captures
     SET status = ?,
         raw_content = ?,
         content_hash = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = ?`
  )

  const result = stmt.run('exported_placeholder', placeholderContent, captureId, capture.status)

  // If no rows were updated, the status must have changed concurrently
  if (result.changes === 0) {
    // Re-fetch to determine the actual current status for error message
    const currentCapture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as
      | { status: string }
      | undefined

    if (!currentCapture) {
      // Capture was deleted between check and update
      throw new UpdatePlaceholderStatusError(
        'Capture was deleted during update',
        'CONCURRENT_DELETION'
      )
    }

    // Status changed concurrently - this is a race condition
    throw new UpdatePlaceholderStatusError(
      `Capture status changed concurrently from '${capture.status}' to '${currentCapture.status}'`,
      'CONCURRENT_STATE_CHANGE'
    )
  }
}
