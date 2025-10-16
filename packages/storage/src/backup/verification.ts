import { existsSync } from 'node:fs'

export interface VerificationResult {
  success: boolean
  integrity_check_passed: boolean
  hash_match: boolean
  error?: string
}

/**
 * Verifies the integrity of a SQLite backup file.
 *
 * Executes PRAGMA integrity_check on the backup database to ensure:
 * - The database file is valid and can be opened
 * - All database pages are intact and readable
 * - No corruption is detected in the database structure
 *
 * @param backup_path - Path to the backup file to verify
 * @returns VerificationResult with integrity check status
 */
export const verifyBackup = async (backup_path: string): Promise<VerificationResult> => {
  // Check if backup file exists
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!existsSync(backup_path)) {
    return {
      success: false,
      integrity_check_passed: false,
      hash_match: false, // Hash validation not implemented in this AC
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

    // db is guaranteed to be defined here after successful assignment
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

    return integrity_check_passed
      ? {
          success: true,
          integrity_check_passed: true,
          hash_match: false, // Hash validation not implemented in this AC
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
