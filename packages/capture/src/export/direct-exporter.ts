import { randomBytes } from 'node:crypto'

import { writeAtomic } from '@capture-bridge/obsidian-bridge'

import { formatMarkdown } from './markdown-formatter.js'

import type Database from 'better-sqlite3'

/**
 * Check if a capture should be exported to the vault.
 *
 * A capture is eligible for export if:
 * 1. Its status is 'transcribed'
 * 2. It hasn't been successfully exported yet (not in exports_audit with error_flag=0)
 *
 * @param captureId - ULID of the capture to check
 * @param db - SQLite database instance
 * @returns true if the capture should be exported, false otherwise
 */
export const shouldExport = (captureId: string, db: Database.Database): boolean => {
  const result = db
    .prepare(
      `
      SELECT COUNT(*) as count
      FROM captures
      WHERE id = ?
        AND status = 'transcribed'
        AND id NOT IN (
          SELECT capture_id
          FROM exports_audit
          WHERE error_flag = 0
        )
    `
    )
    .get(captureId) as { count: number } | undefined

  return result?.count === 1
}

/**
 * Generate a ULID (Universally Unique Lexicographically Sortable Identifier)
 * Format: 26-character string (10 chars timestamp + 16 chars randomness)
 * Uses cryptographically secure randomness via crypto.randomBytes()
 */
const generateULID = (): string => {
  const timestamp = Date.now()
  const timestampStr = timestamp.toString(36).toUpperCase().padStart(10, '0')

  const bytes = randomBytes(10)
  const randomStr = Array.from(bytes)
    .map((byte) => (byte % 36).toString(36).toUpperCase())
    .slice(0, 16)
    .join('')
    .padEnd(16, '0')

  return timestampStr + randomStr
}

export interface ExportResult {
  success: boolean
  export_path?: string
  mode?: 'initial' | 'duplicate_skip'
  error?: {
    code: string
    message: string
  }
}

/**
 * Export a capture to the Obsidian vault.
 *
 * Performs atomic write to vault/inbox/{capture.id}.md and records export in exports_audit.
 *
 * @param captureId - ULID of capture to export
 * @param db - SQLite database instance
 * @param vaultPath - Absolute path to Obsidian vault root
 * @returns Export result with success status
 */
export const exportToVault = async (
  captureId: string,
  db: Database.Database,
  vaultPath: string
): Promise<ExportResult> => {
  try {
    // Check if should export
    if (!shouldExport(captureId, db)) {
      return {
        success: false,
        error: {
          code: 'ALREADY_EXPORTED',
          message: 'Capture already exported or not eligible',
        },
      }
    }

    // Get capture record
    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as
      | {
          id: string
          source: string
          raw_content: string
          content_hash: string
          created_at: string
        }
      | undefined

    if (!capture) {
      return {
        success: false,
        error: {
          code: 'CAPTURE_NOT_FOUND',
          message: `Capture ${captureId} not found`,
        },
      }
    }

    // Format markdown
    const markdown = formatMarkdown(capture)

    // Write atomically using obsidian-bridge's writeAtomic
    const writeResult = await writeAtomic(captureId, markdown, vaultPath)

    if (!writeResult.success) {
      return {
        success: false,
        error: {
          code: writeResult.error?.code ?? 'WRITE_FAILED',
          message: writeResult.error?.message ?? 'Failed to write file',
        },
      }
    }

    // Export path is guaranteed to exist when success is true
    if (!writeResult.export_path) {
      return {
        success: false,
        error: {
          code: 'WRITE_FAILED',
          message: 'Export path missing from successful write result',
        },
      }
    }

    // Insert exports_audit record
    const auditId = generateULID()
    db.prepare(
      `INSERT INTO exports_audit (id, capture_id, vault_path, hash_at_export, exported_at, mode, error_flag)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      auditId,
      captureId,
      writeResult.export_path,
      capture.content_hash,
      new Date().toISOString(),
      'initial',
      0
    )

    return {
      success: true,
      export_path: writeResult.export_path,
      mode: 'initial',
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    }
  }
}
