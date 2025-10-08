/**
 * Staging Ledger Service
 *
 * Implements duplicate checking and export recording for the staging ledger.
 * Based on spec-staging-tech.md §3.3 and §3.4
 */

import { ulid } from 'ulid'

import { assertValidTransition } from '../schema/service-layer.js'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

export interface ExportAudit {
  vault_path: string
  hash_at_export: string | null
  mode: 'initial' | 'duplicate_skip' | 'placeholder'
  error_flag: boolean
}

export interface DuplicateCheckResult {
  is_duplicate: boolean
  existing_capture_id?: string
}

export interface MetricsEmitter {
  emitMetric: (metric: { name: string; value: number; labels?: Record<string, string> }) => void
}

export interface StagingLedgerOptions {
  emitMetric?: MetricsEmitter['emitMetric']
}

export class StagingLedgerError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message)
    this.name = 'StagingLedgerError'
  }
}

/**
 * Staging Ledger Service
 *
 * Provides duplicate checking and export recording functionality
 * for the staging ledger database.
 */
export class StagingLedger {
  private db: Database
  private emitMetric: MetricsEmitter['emitMetric']

  constructor(db: Database, options: StagingLedgerOptions = {}) {
    this.db = db
    this.emitMetric =
      options.emitMetric ??
      (() => {
        // Default no-op metrics emitter
      })
  }

  /**
   * Check if a content hash already exists in the database
   */
  checkDuplicate(content_hash: string): DuplicateCheckResult {
    const startTime = performance.now()

    try {
      // Use parameterized query to prevent SQL injection
      const result = this.db
        .prepare('SELECT id FROM captures WHERE content_hash = ? LIMIT 1')
        .get(content_hash) as { id: string } | undefined

      // Emit timing metric
      const duration = performance.now() - startTime
      this.emitMetric({
        name: 'dedup_check_ms',
        value: duration,
      })

      if (result) {
        // Duplicate found
        this.emitMetric({
          name: 'dedup_hits_total',
          value: 1,
          labels: { layer: 'content_hash' },
        })

        return {
          is_duplicate: true,
          existing_capture_id: result.id,
        }
      }

      // No duplicate
      return { is_duplicate: false }
    } catch (error) {
      // Log error to errors_log table
      this.logError({
        // eslint-disable-next-line unicorn/no-null -- SQLite uses NULL for missing foreign keys
        capture_id: null,
        stage: 'export',
        message: `Duplicate check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
      throw error
    }
  }

  /**
   * Record an export to the audit trail and update capture status
   */
  recordExport(capture_id: string, audit: ExportAudit): void {
    // Use transaction for atomicity
    const transaction = this.db.transaction(() => {
      // 1. Fetch current capture
      const capture = this.db.prepare('SELECT * FROM captures WHERE id = ?').get(capture_id) as
        | { id: string; status: string }
        | undefined

      if (!capture) {
        throw new StagingLedgerError('Capture not found', 'NOT_FOUND')
      }

      // 2. Determine next status based on mode
      let nextStatus: string
      if (audit.mode === 'duplicate_skip') {
        nextStatus = 'exported_duplicate'
      } else if (audit.mode === 'placeholder') {
        nextStatus = 'exported_placeholder'
      } else {
        nextStatus = 'exported'
      }

      // 3. Validate state transition
      assertValidTransition(capture.status, nextStatus)

      // 4. Insert audit record
      const auditId = ulid()
      this.db
        .prepare(
          `INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, mode, error_flag)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          auditId,
          capture_id,
          audit.vault_path,
          audit.hash_at_export,
          audit.mode,
          audit.error_flag ? 1 : 0
        )

      // 5. Update capture status (terminal state, immutable)
      this.db
        .prepare(
          `UPDATE captures
           SET status = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(nextStatus, capture_id)

      // 6. Emit metrics
      this.emitMetric({
        name: 'captures_exported_total',
        value: 1,
        labels: { mode: audit.mode },
      })

      if (audit.mode === 'placeholder') {
        this.emitMetric({
          name: 'placeholder_exports_total',
          value: 1,
        })
      }
    })

    // Execute transaction
    transaction()
  }

  /**
   * Log an error to the errors_log table
   */
  private logError(error: { capture_id: string | null; stage: string; message: string }): void {
    try {
      const errorId = ulid()
      this.db
        .prepare(
          `INSERT INTO errors_log (id, capture_id, stage, message)
           VALUES (?, ?, ?, ?)`
        )
        .run(errorId, error.capture_id, error.stage, error.message)
    } catch {
      // Ignore logging errors to prevent cascading failures
    }
  }
}
