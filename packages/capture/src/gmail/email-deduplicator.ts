/**
 * EmailDeduplicator
 * AC08: Duplicate check by Message-ID (channel_native_id)
 */

import type DatabaseConstructor from 'better-sqlite3'

// Keep alignment with other gmail modules' DB type
type Database = ReturnType<typeof DatabaseConstructor>

export interface DuplicateCheckResult {
  isDuplicate: boolean
  matchedCaptureId?: string
  matchType?: 'message_id' | 'content_hash'
  matchedAt?: string
  error?: string
}

const MESSAGE_ID_QUERY = `
  SELECT id, created_at
  FROM captures
  WHERE source = 'email'
    AND json_extract(meta_json, '$.channel_native_id') = ?
  ORDER BY created_at ASC
  LIMIT 1
`

/**
 * Provides layer-1 deduplication based on Gmail Message-ID.
 * Case-sensitive compare per RFC 5322.
 */
export class EmailDeduplicator {
  private readonly stmtMessageId: ReturnType<Database['prepare']>

  constructor(private readonly db: Database) {
    this.stmtMessageId = this.db.prepare(MESSAGE_ID_QUERY)
  }

  /**
   * Check if a message with the given Message-ID already exists.
   * - Returns oldest match if multiple exist
   * - Handles invalid input gracefully (error field)
   */
  checkDuplicate(params: { messageId: string }): Promise<DuplicateCheckResult> {
    const messageId = params?.messageId
    if (!messageId || messageId.trim() === '') {
      return Promise.resolve({ isDuplicate: false, error: 'dedup.invalid_message_id' })
    }

    // Simple timeout guard (5s) using Promise.race
    const exec = (): Promise<DuplicateCheckResult> => {
      try {
        const row = this.stmtMessageId.get(messageId) as
          | { id: string; created_at: string }
          | undefined
        if (row) {
          return Promise.resolve({
            isDuplicate: true,
            matchedCaptureId: row.id,
            matchType: 'message_id',
            matchedAt: row.created_at,
          })
        }
        return Promise.resolve({ isDuplicate: false })
      } catch (error) {
        const err = error as { code?: unknown; message?: unknown }
        if (err && (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED')) {
          return Promise.resolve({ isDuplicate: false, error: 'dedup.database_error' })
        }
        if (typeof err?.message === 'string' && err.message.includes('timeout')) {
          return Promise.resolve({ isDuplicate: false, error: 'dedup.query_timeout' })
        }
        throw error
      }
    }

    const timeout = new Promise<DuplicateCheckResult>((resolve) => {
      setTimeout(() => resolve({ isDuplicate: false, error: 'dedup.query_timeout' }), 5000)
    })

    return Promise.race([exec(), timeout])
  }
}
