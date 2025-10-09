/**
 * Handles transcription failures by updating capture status and metadata
 * Implements AC06: Update capture status='failed_transcription' on failure
 */

import type { Database } from 'better-sqlite3'

export type TranscriptionErrorType =
  | 'timeout'
  | 'oom'
  | 'corrupt_audio'
  | 'file_not_found'
  | 'file_unreadable'
  | 'model_load_failure'
  | 'whisper_error'
  | 'unknown'

export interface TranscriptionFailureResult {
  success: false
  errorType: TranscriptionErrorType
  captureId: string
}

/**
 * Classify error type from error message and properties
 */
const classifyError = (error: Error): TranscriptionErrorType => {
  const message = error.message.toLowerCase()
  const { name } = error

  // Check error name first for specific error types
  if (name === 'TimeoutError') return 'timeout'
  if (name === 'OOMError') return 'oom'

  // Check message patterns
  if (message.includes('enoent')) return 'file_not_found'
  if (message.includes('eacces')) return 'file_unreadable'
  if (message.includes('invalid audio format') || message.includes('corrupt'))
    return 'corrupt_audio'
  if (message.includes('model') && (message.includes('load') || message.includes('not found'))) {
    return 'model_load_failure'
  }
  if (message.includes('whisper')) return 'whisper_error'

  // Check memory usage for OOM detection
  if (message.includes('memory') || message.includes('heap')) return 'oom'

  return 'unknown'
}

/**
 * Update capture record with failed_transcription status and error metadata
 *
 * @param db - SQLite database instance
 * @param captureId - ID of the capture that failed transcription
 * @param error - The error that occurred during transcription
 * @param attemptCount - Number of attempts made
 * @returns Result object with error details
 */
export const handleTranscriptionFailure = (
  db: Database,
  captureId: string,
  error: Error,
  attemptCount: number
): TranscriptionFailureResult => {
  const errorType = classifyError(error)

  // Get existing meta_json
  const existingCapture = db
    .prepare('SELECT meta_json FROM captures WHERE id = ?')
    .get(captureId) as { meta_json: string } | undefined

  const existingMeta = existingCapture ? JSON.parse(existingCapture.meta_json) : {}

  // Add error details to metadata
  const updatedMeta = {
    ...existingMeta,
    error: {
      type: errorType,
      message: error.message,
      attemptCount,
      timestamp: new Date().toISOString(),
    },
  }

  // Update capture status to failed_transcription
  // Keep content_hash as NULL per ADR-0006 (late hash binding)
  const stmt = db.prepare(
    `UPDATE captures
     SET status = ?,
         meta_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )

  stmt.run('failed_transcription', JSON.stringify(updatedMeta), captureId)

  return {
    success: false,
    errorType,
    captureId,
  }
}
