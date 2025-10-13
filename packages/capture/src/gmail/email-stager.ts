import { ulid } from 'ulid'

import type * as BetterSqlite3 from 'better-sqlite3'

type MetricTags = Record<string, string | number | boolean>

interface MetricsLike {
  histogram: (name: string, value: number, tags?: MetricTags) => void
}

export interface EmailMetadata {
  channel: 'email'
  channel_native_id: string
  message_id: string
  from?: string
  subject?: string
  date?: string
  [key: string]: unknown
}

export interface StageCaptureParams {
  messageId: string
  body: string
  metadata: EmailMetadata
}

export interface StageCaptureResult {
  captureId: string
  status: 'staged'
  createdAt: string
}

export type StagingError =
  | 'staging.duplicate_id'
  | 'staging.invalid_metadata'
  | 'staging.database_locked'
  | 'staging.constraint'
  | 'staging.disk_full'

/**
 * EmailStager inserts email captures into the captures table.
 * - source = 'email'
 * - status = 'staged'
 * - content_hash = NULL (late binding)
 * - meta_json = JSON stringified metadata
 */
export class EmailStager {
  private readonly db: BetterSqlite3.Database
  private readonly metrics: MetricsLike | undefined
  private readonly insertStmt: BetterSqlite3.Statement

  constructor(db: BetterSqlite3.Database, metrics?: MetricsLike) {
    this.db = db
    this.metrics = metrics
    this.insertStmt = this.db.prepare(
      `INSERT INTO captures (
        id,
        source,
        raw_content,
        content_hash,
        status,
        meta_json
      ) VALUES (
        ?,             -- id (ULID)
        'email',       -- source
        ?,             -- raw_content
        NULL,          -- content_hash
        'staged',      -- status
        ?              -- meta_json
      )`
    )
  }

  stageCapture(params: StageCaptureParams): StageCaptureResult {
    const start = performance.now()

    // Validate metadata serializable
    const metaJson = this.safeStringify(params.metadata)

    const captureId = ulid()

    try {
      this.insertStmt.run(captureId, params.body, metaJson)

      // Get created_at from DB to return authoritative timestamp
      const row = this.db.prepare('SELECT created_at FROM captures WHERE id = ?').get(captureId) as
        | { created_at: string }
        | undefined

      const createdAt = row?.created_at ?? new Date().toISOString()

      // metrics
      this.emitMetric('capture_email_staging_ms', performance.now() - start, {
        source: 'email',
        message_id: params.messageId,
        capture_id: captureId,
      })

      const result: StageCaptureResult = {
        captureId,
        status: 'staged',
        createdAt,
      }
      return result
    } catch (error) {
      // Emit error metric (still record duration)
      this.emitMetric('capture_email_staging_ms', performance.now() - start, {
        source: 'email',
        message_id: params.messageId,
        error: true,
      })

      // Re-throw for stageCapture; use stageCaptureSafe for mapping
      throw error
    }
  }

  stageCaptureSafe(params: StageCaptureParams): StageCaptureResult | { error: StagingError } {
    // Validate JSON serializable
    let metaJson: string
    try {
      metaJson = JSON.stringify(params.metadata)
      // round-trip validation
      JSON.parse(metaJson)
    } catch {
      return { error: 'staging.invalid_metadata' }
    }

    const start = performance.now()
    const captureId = ulid()

    try {
      this.insertStmt.run(captureId, params.body, metaJson)

      const row = this.db.prepare('SELECT created_at FROM captures WHERE id = ?').get(captureId) as
        | { created_at: string }
        | undefined

      const createdAt = row?.created_at ?? new Date().toISOString()

      this.emitMetric('capture_email_staging_ms', performance.now() - start, {
        source: 'email',
        message_id: params.messageId,
        capture_id: captureId,
      })

      return { captureId, status: 'staged', createdAt }
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (err.code === 'SQLITE_CONSTRAINT') {
        // ULID collision or other constraint
        return { error: 'staging.duplicate_id' }
      }
      if (err.code === 'SQLITE_BUSY') {
        return { error: 'staging.database_locked' }
      }
      if ((err.message ?? '').toLowerCase().includes('disk full')) {
        return { error: 'staging.disk_full' }
      }
      return { error: 'staging.constraint' }
    }
  }

  private safeStringify(obj: unknown): string {
    try {
      const s = JSON.stringify(obj)
      JSON.parse(s)
      return s
    } catch (e) {
      const err = new Error('Metadata is not JSON-serializable')
      // Preserve cause without relying on ErrorOptions typing
      const cause: unknown = e
      ;(err as unknown as { cause?: unknown }).cause = cause
      throw err
    }
  }

  private emitMetric(name: string, value: number, tags?: MetricTags): void {
    if (!this.metrics) return
    if (process.env['CAPTURE_METRICS'] !== '1') return
    try {
      this.metrics.histogram(name, value, tags)
    } catch {
      // Best-effort metrics; never throw
    }
  }
}
