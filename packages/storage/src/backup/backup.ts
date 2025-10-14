import { mkdirSync, statSync, copyFileSync, promises as fsp } from 'node:fs'

import { join } from 'node:path'
import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

export interface BackupOptions {
  now?: Date
}

export interface BackupResult {
  success: boolean
  backup_path: string
  size_bytes: number
  duration_ms: number
}

export interface VerificationResult {
  success: boolean
  integrity_check_passed: boolean
  hash_match: boolean
  error?: string
}

/**
 * Create a timestamped backup of the ledger.sqlite file under
 * <vaultRoot>/.capture-bridge/.backups/ledger-YYYYMMDD-HH.sqlite
 */
export const createBackup = (
  db: Database,
  vaultRoot: string,
  options: BackupOptions = {}
): BackupResult => {
  const start = performance.now()
  const now = options.now ?? new Date()

  // Ensure backup directory exists
  const captureDir = join(vaultRoot, '.capture-bridge')
  const backupDir = join(captureDir, '.backups')
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  mkdirSync(backupDir, { recursive: true })

  // Compose filename using UTC components as per spec
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const filename = `ledger-${yyyy}${mm}${dd}-${hh}.sqlite`
  const destPath = join(backupDir, filename)

  // Live DB path (better-sqlite3 exposes .name)
  const livePath = db.name as string

  // Use SQLite shell .backup equivalent by copying file while in WAL mode
  // For better-sqlite3 with WAL, copying the main db file is acceptable for local use.
  // Optionally, run a quick checkpoint to reduce WAL drift (non-fatal if fails).
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // Ignore checkpoint errors; proceed with copy
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  copyFileSync(livePath, destPath)

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const { size } = statSync(destPath)
  const duration = performance.now() - start

  return {
    success: true,
    backup_path: destPath,
    size_bytes: size,
    duration_ms: duration,
  }
}

/** Verify a backup by running PRAGMA integrity_check via a temporary connection */
export const verifyBackup = async (backupPath: string): Promise<VerificationResult> => {
  try {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(backupPath, { readonly: true })
    try {
      const results = db.pragma('integrity_check', { simple: false }) as Array<{
        integrity_check: string
      }>

      const ok = results?.[0]?.integrity_check === 'ok'
      return {
        success: ok,
        integrity_check_passed: ok,
        hash_match: false, // not computed here (optional)
      }
    } finally {
      db.close()
    }
  } catch (error) {
    return {
      success: false,
      integrity_check_passed: false,
      hash_match: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const pruneOldBackups = async (
  backupDir: string,
  options: { keep: number }
): Promise<{ deleted_count: number }> => {
  const keep = Math.max(0, options.keep)
  const entries = await fsp.readdir(backupDir)
  const files = entries
    .filter((f) => f.startsWith('ledger-') && f.endsWith('.sqlite'))
    .sort((a, b) => a.localeCompare(b)) // lexicographic sort aligns with chronological for our format

  const toDelete = files.length > keep ? files.slice(0, files.length - keep) : []

  await Promise.all(toDelete.map((name) => fsp.unlink(join(backupDir, name))))

  return { deleted_count: toDelete.length }
}
