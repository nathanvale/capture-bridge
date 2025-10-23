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
 * Validates state transition using assertValidTransition (must be from 'failed_transcription').
 *
 * @param db - SQLite database instance
 * @param captureId - ULID of the capture to update
 * @param placeholderContent - The placeholder markdown content to store
 * @throws {UpdatePlaceholderStatusError} If capture not found
 * @throws {StateTransitionError} If state transition is invalid
 */
export const updateCaptureStatusToPlaceholder = (
  db: Database,
  captureId: string,
  placeholderContent: string
): void => {
  // 1. Fetch current capture to validate state transition
  const capture = db.prepare('SELECT status FROM captures WHERE id = ?').get(captureId) as
    | { status: string }
    | undefined

  if (!capture) {
    throw new UpdatePlaceholderStatusError('Capture not found', 'NOT_FOUND')
  }

  // 2. Validate state transition (will throw if invalid)
  assertValidTransition(capture.status, 'exported_placeholder')

  // 3. Update capture with parameterized query
  db.prepare(
    `UPDATE captures
     SET status = ?,
         raw_content = ?,
         content_hash = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run('exported_placeholder', placeholderContent, captureId)
}
