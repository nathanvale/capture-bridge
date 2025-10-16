import { createHash } from 'node:crypto'
import { existsSync, createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

export interface VerificationResult {
  success: boolean
  integrity_check_passed: boolean
  hash_match: boolean
  error?: string
}

/**
 * Computes SHA-256 hash of a file using streams for memory efficiency.
 *
 * @param filePath - Path to the file to hash
 * @returns SHA-256 hash as hex string, or undefined if file doesn't exist
 */
const computeFileHash = async (filePath: string): Promise<string | undefined> => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!existsSync(filePath)) {
    return undefined
  }

  try {
    const hash = createHash('sha256')
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const stream = createReadStream(filePath)
    await pipeline(stream, hash)
    return hash.digest('hex')
  } catch {
    // File read errors return undefined (not a verification failure)
    return undefined
  }
}

/**
 * Verifies the integrity of a SQLite backup file and optionally compares hash with live database.
 *
 * Executes PRAGMA integrity_check on the backup database to ensure:
 * - The database file is valid and can be opened
 * - All database pages are intact and readable
 * - No corruption is detected in the database structure
 *
 * If live_db_path is provided, also computes SHA-256 hashes of both files to detect differences.
 * Hash mismatch is NOT an error - it's expected if writes occurred since backup.
 *
 * @param backup_path - Path to the backup file to verify
 * @param live_db_path - Optional path to live database for hash comparison
 * @returns VerificationResult with integrity check and hash comparison status
 */
export const verifyBackup = async (
  backup_path: string,
  live_db_path?: string
): Promise<VerificationResult> => {
  // Check if backup file exists
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!existsSync(backup_path)) {
    return {
      success: false,
      integrity_check_passed: false,
      hash_match: false,
      error: `ENOENT: no such file or directory, open '${backup_path}'`,
    }
  }

  let db:
    | {
        open: boolean
        close: () => void
        prepare: (sql: string) => { pluck: () => { all: () => unknown[] } }
      }
    | undefined

  try {
    // Dynamic import better-sqlite3
    const Database = (await import('better-sqlite3')).default

    // Open the backup database in readonly mode to prevent accidental modifications
    db = new Database(backup_path, { readonly: true })

    // db is guaranteed to be defined after successful assignment
    if (!db) {
      throw new Error('Failed to open database')
    }

    // Execute PRAGMA integrity_check
    // This command checks the entire database for corruption
    // Returns 'ok' for valid databases, or a list of corruption issues
    const results = db.prepare('PRAGMA integrity_check').pluck().all() as string[]

    // Check if integrity check passed
    // A successful check returns exactly one row with the value 'ok'
    const integrity_check_passed = results.length === 1 && results[0] === 'ok'

    // Compute hash comparison if live DB path provided
    let hash_match = false
    if (live_db_path) {
      const backupHash = await computeFileHash(backup_path)
      const liveHash = await computeFileHash(live_db_path)

      // Only set hash_match to true if both hashes exist and are identical
      // If either file can't be read, hash_match remains false
      hash_match = backupHash !== undefined && liveHash !== undefined && backupHash === liveHash
    }

    return integrity_check_passed
      ? {
          success: true,
          integrity_check_passed: true,
          hash_match,
        }
      : {
          success: false,
          integrity_check_passed: false,
          hash_match: false,
          error: `Integrity check failed: ${results.join(', ')}`,
        }
  } catch (error) {
    // Handle database errors (e.g., corrupted file that can't be opened)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      integrity_check_passed: false,
      hash_match: false,
      error: errorMessage,
    }
  } finally {
    // Ensure database connection is always closed
    if (db?.open) {
      try {
        db.close()
      } catch {
        // Ignore close errors in finally block
      }
    }
  }
}
