/**
 * Placeholder Export Implementation - PLACEHOLDER_EXPORT--T01
 *
 * AC01: Trigger - Detect captures with status='failed_transcription'
 *
 * Medium Risk - TDD Required, Coverage ≥80%
 */

import type { FailedTranscription } from './types.js'
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
