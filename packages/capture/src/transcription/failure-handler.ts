/**
 * Handles transcription failures by updating capture status and metadata
 * Implements AC06: Update capture status='failed_transcription' on failure
 * Implements AC07: Insert errors_log on failure
 * Implements AC08: Placeholder export on failure
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

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
 * Generate a ULID (Universally Unique Lexicographically Sortable Identifier)
 * Format: 26-character string (10 chars timestamp + 16 chars randomness)
 */
const generateULID = (): string => {
  const timestamp = Date.now()
  const timestampStr = timestamp.toString(36).toUpperCase().padStart(10, '0')

  const randomStr = Array.from({ length: 16 }, () =>
    // eslint-disable-next-line sonarjs/pseudo-random -- ULID generation requires randomness, not crypto-secure
    Math.floor(Math.random() * 36)
      .toString(36)
      .toUpperCase()
  ).join('')

  return timestampStr + randomStr
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
 * Determine if error is permanent (should go to DLQ)
 */
const isPermanentError = (errorType: TranscriptionErrorType): boolean => {
  return errorType === 'oom' || errorType === 'corrupt_audio'
}

/**
 * Get escalation action for error type
 */
const getEscalationAction = (errorType: TranscriptionErrorType): string | undefined => {
  if (isPermanentError(errorType)) {
    return 'export_placeholder'
  }
  return undefined // Retriable errors have no escalation action yet
}

/**
 * Insert error log entry
 */
const insertErrorLog = (
  db: Database,
  captureId: string,
  error: Error,
  errorType: TranscriptionErrorType,
  attemptCount: number,
  contextMeta: Record<string, unknown>
): void => {
  const errorId = generateULID()
  const escalationAction = getEscalationAction(errorType)
  const dlq = isPermanentError(errorType) ? 1 : 0

  const stmt = db.prepare(
    `INSERT INTO errors_log (
      id, capture_id, operation, error_type, error_message,
      stack_trace, context_json, attempt_count, escalation_action, dlq, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )

  stmt.run(
    errorId,
    captureId,
    'transcribe',
    errorType,
    error.message,
    error.stack ?? undefined,
    JSON.stringify(contextMeta),
    attemptCount,
    escalationAction,
    dlq,
    new Date().toISOString()
  )
}

/**
 * Export placeholder markdown file to vault on permanent transcription failure
 * Implements ADR-0014: Placeholder Export Immutability
 *
 * @param db - SQLite database instance
 * @param captureId - ID of the capture that failed transcription
 * @param errorType - Type of transcription error
 * @param vaultRoot - Root directory of the vault
 */
export const exportPlaceholder = async (
  db: Database,
  captureId: string,
  errorType: TranscriptionErrorType,
  vaultRoot: string
): Promise<void> => {
  // Fetch capture record
  const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as
    | {
        id: string
        source: string
        status: string
        meta_json: string
        created_at: string
      }
    | undefined

  if (!capture) {
    throw new Error(`Capture ${captureId} not found`)
  }

  const meta = JSON.parse(capture.meta_json)
  const errorMessage = meta.error?.message ?? 'Unknown error'
  const attemptCount = meta.error?.attemptCount ?? meta.attempt_count ?? 0
  const filePath = meta.file_path ?? 'Unknown file path'

  // Generate placeholder content
  const placeholder = `[TRANSCRIPTION_FAILED: ${errorType}]

---
Capture ID: ${captureId}
Source: ${capture.source}
Audio file: ${filePath}
Error: ${errorMessage}
Attempts: ${attemptCount}
Captured At: ${capture.created_at}
Failed At: ${new Date().toISOString()}
---

Original content unavailable due to processing failure.
This placeholder is PERMANENT and cannot be retried in MPPP.

For manual recovery, see: docs/guides/guide-error-recovery.md
`

  // Create inbox directory if it doesn't exist
  const inboxDir = join(vaultRoot, 'inbox')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- vaultRoot is controlled, inbox is constant
  await fs.mkdir(inboxDir, { recursive: true })

  // Use atomic write pattern (temp file + rename)
  const tempDir = join(vaultRoot, '.trash')
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- vaultRoot is controlled, .trash is constant
  await fs.mkdir(tempDir, { recursive: true })

  const tempPath = join(tempDir, `${captureId}.tmp`)
  const finalPath = join(inboxDir, `${captureId}.md`)

  // Write to temp file
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath constructed from controlled inputs
  await fs.writeFile(tempPath, placeholder, 'utf-8')

  // Atomic rename
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths constructed from controlled inputs
  await fs.rename(tempPath, finalPath)

  // Update capture status to exported_placeholder
  db.prepare(
    `UPDATE captures
     SET status = ?,
         raw_content = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run('exported_placeholder', placeholder, captureId)

  // Insert exports_audit record
  const auditId = generateULID()
  db.prepare(
    `INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode, error_flag, exported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    auditId,
    captureId,
    `inbox/${captureId}.md`,
    undefined, // hash_at_export is NULL for placeholder per spec
    'placeholder',
    1, // error_flag = 1
    new Date().toISOString()
  )
}

/**
 * Update capture record with failed_transcription status and error metadata
 *
 * @param db - SQLite database instance
 * @param captureId - ID of the capture that failed transcription
 * @param error - The error that occurred during transcription
 * @param attemptCount - Number of attempts made
 * @param vaultRoot - Optional vault root for placeholder export (permanent errors only)
 * @param metricsClient - Optional metrics client for emitting failure metrics
 * @returns Result object with error details
 */
export const handleTranscriptionFailure = async (
  db: Database,
  captureId: string,
  error: Error,
  attemptCount: number,
  vaultRoot?: string,
  metricsClient?: { counter: (name: string, tags?: Record<string, string>) => void }
): Promise<TranscriptionFailureResult> => {
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

  // Insert error log entry
  insertErrorLog(db, captureId, error, errorType, attemptCount, existingMeta)

  // Emit metrics after error logging but before returning
  if (metricsClient) {
    metricsClient.counter('transcription_failure_total', { error_type: errorType })
  }

  // Export placeholder for permanent errors when vaultRoot is provided
  if (vaultRoot && isPermanentError(errorType)) {
    await exportPlaceholder(db, captureId, errorType, vaultRoot)
  }

  return {
    success: false,
    errorType,
    captureId,
  }
}
