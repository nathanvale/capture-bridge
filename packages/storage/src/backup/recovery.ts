
import { recordVerificationSuccess, recordVerificationFailure } from './escalation.js'

import type { VerificationResult } from './verification.js'
import type DatabaseConstructor from 'better-sqlite3'

type Database = ReturnType<typeof DatabaseConstructor>

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
