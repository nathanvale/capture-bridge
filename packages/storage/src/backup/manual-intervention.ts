
import { createBackup } from './backup.js'
import { handleVerificationResult } from './recovery.js'
import { verifyBackup, type VerificationResult } from './verification.js'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

export interface ForceBackupResult {
  success: boolean
  backup_path: string
  verification_result: VerificationResult
}

/**
 * Force immediate backup creation followed by verification.
 *
 * This is the implementation for `capture doctor --force-backup`.
 * If verification succeeds, resets escalation state to HEALTHY.
 *
 * @param db Database instance
 * @param vaultRoot Vault root directory for backup location
 * @returns Result with backup path and verification status
 */
export const forceBackupAndVerify = async (
  db: Database,
  vaultRoot: string
): Promise<ForceBackupResult> => {
  // Create backup using existing backup service
  const backupResult = createBackup(db, vaultRoot)

  // Verify the backup with restore test
  const verificationResult = await verifyBackup(backupResult.backup_path, db.name, {
    perform_restore_test: true,
  })

  // Update escalation state based on verification result
  await handleVerificationResult(db, verificationResult)

  return {
    success: verificationResult.success,
    backup_path: backupResult.backup_path,
    verification_result: verificationResult,
  }
}
