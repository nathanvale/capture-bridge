import { recordVerificationSuccess, recordVerificationFailure } from './escalation.js'

import type { VerificationResult } from './verification.js'

// Database type interface for better-sqlite3
interface Database {
  prepare: (sql: string) => {
    get: (param: string) => unknown
    run: (key: string, value: string) => void
  }
}

/**
 * Handles verification result and updates escalation state accordingly.
 *
 * If verification succeeds, resets escalation state to HEALTHY.
 * If verification fails, increments consecutive failures and escalates.
 *
 * @param db Database instance
 * @param result Verification result from verifyBackup
 */
export const handleVerificationResult = async (
  db: Database,
  result: VerificationResult
): Promise<void> => {
  // Success: Reset to HEALTHY, or Failure: Increment and escalate
  return result.success ? await recordVerificationSuccess(db) : await recordVerificationFailure(db)
}
