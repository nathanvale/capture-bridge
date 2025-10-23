
import { createBackup } from './backup.js'
import { handleVerificationResult } from './recovery.js'
import { verifyBackup, type VerificationResult } from './verification.js'

import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

export interface MetricsClient {
  emit: (metric: { name: string; value: number; labels: Record<string, string> }) => void
}

/**
 * Verifies a backup and emits backup_verification_result metric.
 *
 * @param backup_path Path to the backup file
 * @param live_db_path Optional path to live database for hash comparison
 * @param metricsClient Metrics client to emit verification result
 * @param options Optional verification options
 * @returns VerificationResult
 */
export const verifyBackupWithMetrics = async (
  backup_path: string,
  live_db_path?: string,
  metricsClient?: MetricsClient,
  options?: { perform_restore_test?: boolean }
): Promise<VerificationResult> => {
  // Perform verification
  const result = await verifyBackup(backup_path, live_db_path, options)

  // Emit metric if client provided
  if (metricsClient) {
    metricsClient.emit({
      name: 'backup_verification_result',
      value: 1,
      labels: {
        status: result.success ? 'success' : 'failure',
      },
    })
  }

  return result
}

/**
 * Force immediate backup creation followed by verification, with metrics emission.
 *
 * @param db Database instance
 * @param vaultRoot Vault root directory for backup location
 * @param metricsClient Metrics client to emit verification result
 * @returns Result with backup path and verification status
 */
export const forceBackupAndVerifyWithMetrics = async (
  db: Database,
  vaultRoot: string,
  metricsClient?: MetricsClient
): Promise<{
  success: boolean
  backup_path: string
  verification_result: VerificationResult
}> => {
  // Create backup
  const backupResult = createBackup(db, vaultRoot)

  // Verify with metrics
  const verificationResult = await verifyBackupWithMetrics(
    backupResult.backup_path,
    db.name,
    metricsClient,
    { perform_restore_test: true }
  )

  // Update escalation state
  await handleVerificationResult(db, verificationResult)

  return {
    success: verificationResult.success,
    backup_path: backupResult.backup_path,
    verification_result: verificationResult,
  }
}
