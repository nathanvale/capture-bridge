/**
 * Capture Content Hash Updater
 *
 * Updates captures table with raw_content and computed content_hash.
 * Part of EMAIL_NORMALIZATION--T01 AC04.
 *
 * Pipeline integration:
 * Email Polling → Staging → Normalization (this module) → Export
 *
 * Security: Uses parameterized SQL queries to prevent injection attacks.
 * Idempotency: Safe to call multiple times with same data.
 */

import { computeEmailContentHash } from './email-hasher.js'

import type DatabaseConstructor from 'better-sqlite3'


type Database = ReturnType<typeof DatabaseConstructor>

/**
 * Update capture with raw content and computed content hash
 *
 * This function:
 * 1. Stores the original raw_content (email body, preserving HTML/whitespace)
 * 2. Computes content_hash using AC01→AC02→AC03 pipeline
 * 3. Updates the captures table using parameterized SQL
 *
 * @param db - better-sqlite3 Database instance
 * @param captureId - ULID of the capture to update
 * @param rawContent - Original email body content (with HTML/whitespace)
 *
 * @example
 * ```typescript
 * const db = new Database(':memory:')
 * initializeDatabase(db)
 *
 * // Create staged capture
 * db.prepare(`
 *   INSERT INTO captures (id, source, raw_content, content_hash, status, meta_json)
 *   VALUES (?, 'email', '', NULL, 'staged', '{}')
 * `).run(captureId)
 *
 * // Update with email body
 * updateCaptureContentHash(db, captureId, emailBody)
 * ```
 */
export const updateCaptureContentHash = (
  db: Database,
  captureId: string,
  rawContent: string
): void => {
  // Compute hash from normalized content
  const contentHash = computeEmailContentHash(rawContent)

  // Update capture with raw content and hash (parameterized query for security)
  const stmt = db.prepare(`
    UPDATE captures
    SET raw_content = ?, content_hash = ?
    WHERE id = ?
  `)

  stmt.run(rawContent, contentHash, captureId)
}
