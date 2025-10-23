/**
 * Placeholder Export Implementation - PLACEHOLDER_EXPORT--T01
 *
 * AC01: Trigger - Detect captures with status='failed_transcription'
 * AC02: Generate placeholder markdown content
 * AC03: Atomic write to inbox/{capture.id}.md
 *
 * Medium Risk - TDD Required, Coverage ≥80%
 */

import { writeAtomic } from '@capture-bridge/obsidian-bridge'

import type {
  FailedTranscription,
  CaptureMetadata,
  TranscriptionErrorType,
  PlaceholderExportResult,
} from './types.js'
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
  // Parse metadata JSON with fallback to empty object on parse failure
  let metadata: CaptureMetadata = {}
  try {
    metadata = JSON.parse(capture.meta_json) as CaptureMetadata
  } catch {
    // Malformed JSON - safe to use empty metadata as fallback
  }
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

This placeholder is permanent and will not be retried automatically.
Original content unavailable due to processing failure.`

  return placeholder
}

/**
 * AC03: Export placeholder markdown to vault inbox directory
 *
 * @param vaultRoot Absolute path to vault root
 * @param captureId ULID from captures.id
 * @param placeholder Placeholder markdown content
 * @returns Result with success status and export path
 */
export const exportPlaceholderToVault = async (
  vaultRoot: string,
  captureId: string,
  placeholder: string
): Promise<PlaceholderExportResult> => {
  // Validate absolute vault path per operational file guidelines
  const path = await import('node:path')
  if (!path.isAbsolute(vaultRoot)) {
    return {
      success: false,
      error: {
        code: 'INVALID_VAULT_PATH',
        message: 'Vault root must be an absolute path',
      },
    }
  }

  // GREEN phase - use existing atomic writer from obsidian-bridge
  const result = await writeAtomic(captureId, placeholder, vaultRoot)

  // Handle optional export_path properly for exactOptionalPropertyTypes
  if (result.export_path === undefined) {
    return { success: result.success }
  }

  return {
    success: result.success,
    export_path: result.export_path,
  }
}

/**
 * AC04: Insert exports_audit record for placeholder export
 *
 * @param db SQLite database instance
 * @param captureId ULID from captures.id
 * @param vaultPath Relative path to exported file (e.g., "inbox/{id}.md")
 * @param _errorType Type of transcription error (reserved for future use)
 * @param _reason Human-readable error message (reserved for future use)
 * @returns Result with success status
 */
export const insertPlaceholderAuditRecord = async (
  db: Database.Database,
  captureId: string,
  vaultPath: string,
  _errorType: TranscriptionErrorType,
  _reason: string
): Promise<{ success: boolean; error?: { code: string; message: string } }> => {
  try {
    // Generate ULID for audit record
    const { ulid } = await import('ulid')
    const auditId = ulid()

    // Insert exports_audit record with NULL hash_at_export
    db.prepare(
      `INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode, error_flag, exported_at)
       VALUES (?, ?, ?, NULL, 'placeholder', 1, ?)`
    ).run(auditId, captureId, vaultPath, new Date().toISOString())

    // Update capture status to 'exported_placeholder'
    db.prepare(`UPDATE captures SET status = 'exported_placeholder' WHERE id = ?`).run(captureId)

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'AUDIT_INSERT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
