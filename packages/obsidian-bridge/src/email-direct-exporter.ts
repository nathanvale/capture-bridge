/**
 * Email Direct Exporter
 *
 * Implements DIRECT_EXPORT_EMAIL--T01
 * Exports staged email captures to Obsidian vault inbox directory
 */

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

export interface CaptureRecord {
  id: string
  source: 'email' | 'voice'
  raw_content: string
  content_hash: string
  meta_json: Record<string, unknown>
  created_at: string
}

export interface ExportResult {
  success: boolean
  export_path?: string
  mode?: 'initial' | 'duplicate_skip'
  error?: {
    code: 'EACCES' | 'ENOSPC' | 'EEXIST' | 'EROFS' | 'ENETDOWN' | 'EUNKNOWN'
    message: string
    temp_path?: string
    export_path?: string
  }
}

/**
 * Export an email capture to the vault
 * AC01: Trigger on status='staged' (email) AND duplicate check passed
 * AC03: Atomic write to inbox/{capture.id}.md
 * AC04: Insert exports_audit record
 */
export const exportEmailCapture = async (
  captureId: string,
  vaultPath: string,
  db: Database
): Promise<ExportResult> => {
  // Import dependencies dynamically
  // eslint-disable-next-line import/no-unresolved -- TypeScript path mapping resolves this
  const { StagingLedger } = await import('@capture-bridge/storage')
  const { writeAtomic } = await import('./writer/index.js')

  // Fetch capture record
  const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(captureId) as
    | {
        id: string
        source: string
        raw_content: string
        content_hash: string
        status: string
        meta_json: string
        created_at: string
      }
    | undefined

  if (!capture) {
    throw new Error(`Capture not found: ${captureId}`)
  }

  // AC01: Validate source is email
  if (capture.source !== 'email') {
    throw new Error('source must be email')
  }

  // AC01: Validate status is staged
  if (capture.status !== 'staged') {
    throw new Error('status must be staged')
  }

  // Parse meta_json
  const metaJson = JSON.parse(capture.meta_json) as Record<string, unknown>

  // Create CaptureRecord for formatting
  const captureRecord: CaptureRecord = {
    id: capture.id,
    source: capture.source as 'email',
    raw_content: capture.raw_content,
    content_hash: capture.content_hash,
    meta_json: metaJson,
    created_at: capture.created_at,
  }

  // AC01: Check for duplicates using StagingLedger
  const ledger = new StagingLedger(db)
  const dupCheck = ledger.checkDuplicate(capture.content_hash)

  if (dupCheck.is_duplicate) {
    // Record as duplicate_skip
    await ledger.recordExport(captureId, {
      vault_path:
        'original_export_path' in dupCheck && dupCheck.original_export_path
          ? dupCheck.original_export_path
          : `inbox/${captureId}.md`,
      hash_at_export: capture.content_hash,
      mode: 'duplicate_skip',
      error_flag: false,
    })

    return {
      success: true,
      mode: 'duplicate_skip',
    }
  }

  // AC02: Format as markdown
  const markdown = formatEmailMarkdown(captureRecord)

  // AC03: Atomic write to vault
  const writeResult = await writeAtomic(captureId, markdown, vaultPath)

  if (!writeResult.success) {
    // Write failed, don't update status
    if (!writeResult.error) {
      throw new Error('Write failed but no error provided')
    }
    return {
      success: false,
      error: writeResult.error,
    }
  }

  // AC04: Record export in audit trail
  const exportPath = writeResult.export_path ?? `inbox/${captureId}.md`
  await ledger.recordExport(captureId, {
    vault_path: exportPath,
    hash_at_export: capture.content_hash,
    mode: 'initial',
    error_flag: false,
  })

  return {
    success: true,
    export_path: exportPath,
    mode: 'initial',
  }
}

/**
 * Format email capture as markdown
 * AC02: Generate markdown with email frontmatter + body
 */
export const formatEmailMarkdown = (capture: CaptureRecord): string => {
  const frontmatter: Record<string, string> = {
    id: capture.id,
    source: capture.source,
    captured_at: capture.created_at,
    content_hash: capture.content_hash,
  }

  // Add email-specific metadata if available
  if (capture.meta_json['From']) {
    frontmatter['from'] = String(capture.meta_json['From'])
  }
  if (capture.meta_json['Subject']) {
    frontmatter['subject'] = String(capture.meta_json['Subject'])
  }

  // Build YAML frontmatter
  const frontmatterLines = ['---']
  for (const [key, value] of Object.entries(frontmatter)) {
    frontmatterLines.push(`${key}: ${value}`)
  }
  frontmatterLines.push('---')

  // Combine frontmatter and body
  return `${frontmatterLines.join('\n')}\n\n${capture.raw_content}`
}
