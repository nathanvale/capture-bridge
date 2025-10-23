import { createHash } from 'node:crypto'
import { existsSync, createReadStream, copyFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'

export interface VerificationResult {
  success: boolean
  integrity_check_passed: boolean
  hash_match: boolean
  error?: string
  restore_test_passed?: boolean | undefined // true if restore test completed successfully
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
 * Compares hashes of backup and live database files.
 *
 * @param backup_path - Path to the backup file
 * @param live_db_path - Path to the live database file
 * @returns true if hashes match, false otherwise
 */
const compareHashes = async (backup_path: string, live_db_path: string): Promise<boolean> => {
  const backupHash = await computeFileHash(backup_path)
  const liveHash = await computeFileHash(live_db_path)

  // Only return true if both hashes exist and are identical
  // If either file can't be read, return false
  return backupHash !== undefined && liveHash !== undefined && backupHash === liveHash
}

/**
 * Performs a restore test by copying the backup to a temporary database
 * and validating its structure and integrity.
 *
 * @param backup_path - Path to the backup file to test
 * @returns true if restore test passed, error message if failed
 */
const performRestoreTest = async (
  backup_path: string
): Promise<{ success: boolean; error?: string }> => {
  // Create temporary database path
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const tempDbPath = join(tmpdir(), `restore-test-${timestamp}-${process.pid}.db`)

  let tempDb:
    | {
        open: boolean
        close: () => void
        prepare: (sql: string) => {
          pluck: () => { all: () => unknown[] }
          all: () => unknown[]
          get: () => unknown
        }
      }
    | undefined

  try {
    // Dynamic import better-sqlite3
    const Database = (await import('better-sqlite3')).default

    // Copy backup to temp location
    copyFileSync(backup_path, tempDbPath)

    // Open temp database for validation
    tempDb = new Database(tempDbPath, { readonly: true })

    // Check tempDb is defined after assignment
    if (!tempDb) {
      throw new Error('Failed to open temp database')
    }

    // Run integrity check on temp database
    const tempIntegrityResults = tempDb.prepare('PRAGMA integrity_check').pluck().all() as string[]
    if (tempIntegrityResults.length !== 1 || tempIntegrityResults[0] !== 'ok') {
      throw new Error(`Temp database integrity check failed: ${tempIntegrityResults.join(', ')}`)
    }

    // Check that all 4 required tables exist
    const requiredTables = ['captures', 'exports_audit', 'errors_log', 'sync_state']
    const tablesQuery = tempDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('captures', 'exports_audit', 'errors_log', 'sync_state')"
      )
      .all() as Array<{ name: string }>

    const foundTables = new Set(tablesQuery.map((row) => row.name))
    const missingTables = requiredTables.filter((table: string) => !foundTables.has(table))

    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`)
    }

    // Run foreign key check
    const fkResults = tempDb.prepare('PRAGMA foreign_key_check').all() as Array<{
      table: string
    }>
    if (fkResults.length > 0) {
      throw new Error(
        `Foreign key violations detected in tables: ${fkResults.map((r) => r.table).join(', ')}`
      )
    }

    // Run sample query to verify database is queryable
    const countResult = tempDb.prepare('SELECT COUNT(*) as count FROM captures').get() as {
      count: number
    }
    if (typeof countResult?.count !== 'number') {
      throw new Error('Sample query failed: unable to count captures')
    }

    // All checks passed
    return { success: true }
  } catch (restoreError) {
    const errorMessage = restoreError instanceof Error ? restoreError.message : String(restoreError)
    return { success: false, error: errorMessage }
  } finally {
    // Always close temp database connection
    if (tempDb?.open) {
      try {
        tempDb.close()
      } catch {
        // Ignore close errors
      }
    }

    // Always clean up temp file
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      if (existsSync(tempDbPath)) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        unlinkSync(tempDbPath)
      }
    } catch {
      // Best effort cleanup - ignore errors
    }
  }
}

/**
 * Performs integrity check on a SQLite database file.
 *
 * @param backup_path - Path to the database file to check
 * @returns Object with integrity status and any error message
 */
const performIntegrityCheck = async (
  backup_path: string
): Promise<{
  success: boolean
  error?: string
}> => {
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

    if (!integrity_check_passed) {
      return {
        success: false,
        error: `Integrity check failed: ${results.join(', ')}`,
      }
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
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
 * If perform_restore_test is true, also performs a restore test by:
 * - Copying backup to temporary database
 * - Running PRAGMA integrity_check on temp database
 * - Verifying all 4 required tables exist
 * - Running PRAGMA foreign_key_check
 * - Running sample query
 * - Cleaning up temporary database
 *
 * @param backup_path - Path to the backup file to verify
 * @param live_db_path - Optional path to live database for hash comparison
 * @param options - Optional verification options
 * @returns VerificationResult with integrity check, hash comparison, and restore test status
 */
export const verifyBackup = async (
  backup_path: string,
  live_db_path?: string,
  options?: { perform_restore_test?: boolean }
): Promise<VerificationResult> => {
  // Check if backup file exists
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!existsSync(backup_path)) {
    return {
      success: false,
      integrity_check_passed: false,
      hash_match: false,
      error: `ENOENT: no such file or directory, open '${backup_path}'`,
      restore_test_passed: options?.perform_restore_test ? false : undefined,
    }
  }

  // Perform integrity check on backup
  const integrityResult = await performIntegrityCheck(backup_path)

  if (!integrityResult.success) {
    return {
      success: false,
      integrity_check_passed: false,
      hash_match: false,
      error: integrityResult.error ?? 'Integrity check failed',
      restore_test_passed: options?.perform_restore_test ? false : undefined,
    }
  }

  // Compute hash comparison if live DB path provided
  let hash_match = false
  if (live_db_path) {
    hash_match = await compareHashes(backup_path, live_db_path)
  }

  // Perform restore test if requested
  let restore_test_passed: boolean | undefined = undefined
  if (options?.perform_restore_test) {
    const restoreResult = await performRestoreTest(backup_path)
    if (!restoreResult.success) {
      return {
        success: false,
        integrity_check_passed: true, // Main backup integrity was OK
        hash_match,
        error: restoreResult.error ?? 'Restore test failed',
        restore_test_passed: false,
      }
    }
    restore_test_passed = true
  }

  return {
    success: true,
    integrity_check_passed: true,
    hash_match,
    restore_test_passed,
  }
}
