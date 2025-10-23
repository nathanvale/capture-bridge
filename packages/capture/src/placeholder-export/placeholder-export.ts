/**
 * Placeholder Export Implementation - PLACEHOLDER_EXPORT--T01
 *
 * AC01: Trigger - Detect captures with status='failed_transcription'
 * AC02: Generate placeholder markdown content
 *
 * Medium Risk - TDD Required, Coverage ≥80%
 */

import type { FailedTranscription, CaptureMetadata, TranscriptionErrorType } from './types.js'
import type Database from 'better-sqlite3'

/**
 * AC01: Detect captures with status='failed_transcription'
 *
 * @param db SQLite database instance
 * @returns Array of failed transcription captures ordered by created_at ASC
 */
export const detectFailedTranscriptions = (db: Database.Database): FailedTranscription[] => {
  // GREEN phase - implement parameterized query
  const query = `
    SELECT
      id,
      source,
      raw_content,
      content_hash,
      status,
      meta_json,
      created_at,
      updated_at
    FROM captures
    WHERE status = ?
    ORDER BY created_at ASC
  `

  return db.prepare(query).all('failed_transcription') as FailedTranscription[]
}

/**
 * AC02: Generate placeholder markdown content
 *
 * @param capture Failed transcription capture from database
 * @param errorType Type of transcription error
 * @param reason Human-readable error message
 * @returns Formatted markdown placeholder content
 */
export const generatePlaceholderMarkdown = (
  capture: FailedTranscription,
  errorType: TranscriptionErrorType,
  reason: string
): string => {
  // Parse metadata JSON
  const metadata: CaptureMetadata = JSON.parse(capture.meta_json)
  const attemptCount = metadata.attempt_count ?? 0

  // Build source-specific metadata section
  let sourceMetadata = ''
  if (capture.source === 'voice' && metadata.file_path) {
    sourceMetadata = `Audio file: ${metadata.file_path}`
  } else if (capture.source === 'email' && metadata.message_id) {
    sourceMetadata = `Message-ID: ${metadata.message_id}`
  }

  // Format placeholder markdown
  const placeholder = `[TRANSCRIPTION_FAILED: ${errorType}]

---
${sourceMetadata}
Captured at: ${capture.created_at}
Error: ${reason}
Retry count: ${attemptCount}
---

This placeholder is PERMANENT and cannot be retried in MPPP.
Original content unavailable due to processing failure.`

  return placeholder
}
