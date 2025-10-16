// Database type interface for better-sqlite3
interface Database {
  prepare: (sql: string) => {
    get: (param: string) => unknown
    run: (key: string, value: string) => void
  }
}

export type VerificationStatus = 'HEALTHY' | 'WARN' | 'DEGRADED_BACKUP' | 'HALT_PRUNING'

export interface VerificationState {
  consecutive_failures: number
  last_success_timestamp: Date | undefined
  last_failure_timestamp: Date | undefined
  status: VerificationStatus
}

const VERIFICATION_STATE_KEY = 'backup_verification_state'

/**
 * Derives the verification status from consecutive failure count.
 *
 * @param consecutive_failures Number of consecutive verification failures
 * @returns Verification status based on escalation policy
 */
export const getVerificationStatus = (consecutive_failures: number): VerificationStatus => {
  if (consecutive_failures === 0) return 'HEALTHY'
  if (consecutive_failures === 1) return 'WARN'
  if (consecutive_failures === 2) return 'DEGRADED_BACKUP'
  return 'HALT_PRUNING' // 3+ failures
}

/**
 * Loads the verification state from the sync_state table.
 * Returns default state if no state exists or on parse error.
 *
 * @param db Database instance
 * @returns Current verification state
 */
export const getVerificationState = (db: Database): Promise<VerificationState> => {
  try {
    // Get raw state from sync_state table
    const row = db
      .prepare('SELECT value FROM sync_state WHERE key = ?')
      .get(VERIFICATION_STATE_KEY) as { value: string } | undefined

    if (!row) {
      // Return default state if no state exists
      return Promise.resolve({
        consecutive_failures: 0,
        last_success_timestamp: undefined,
        last_failure_timestamp: undefined,
        status: 'HEALTHY',
      })
    }

    // Parse stored JSON state
    try {
      const parsedState = JSON.parse(row.value)

      // Convert timestamp strings to Date objects
      return Promise.resolve({
        consecutive_failures: parsedState.consecutive_failures ?? 0,
        last_success_timestamp: parsedState.last_success_timestamp
          ? new Date(parsedState.last_success_timestamp)
          : undefined,
        last_failure_timestamp: parsedState.last_failure_timestamp
          ? new Date(parsedState.last_failure_timestamp)
          : undefined,
        status: parsedState.status ?? getVerificationStatus(parsedState.consecutive_failures ?? 0),
      })
    } catch {
      // Return default state on parse error
      return Promise.resolve({
        consecutive_failures: 0,
        last_success_timestamp: undefined,
        last_failure_timestamp: undefined,
        status: 'HEALTHY',
      })
    }
  } catch (error) {
    // Re-throw if sync_state table doesn't exist
    if (error instanceof Error && error.message.includes('no such table')) {
      return Promise.reject(error)
    }
    // Return default state for other errors
    return Promise.resolve({
      consecutive_failures: 0,
      last_success_timestamp: undefined,
      last_failure_timestamp: undefined,
      status: 'HEALTHY',
    })
  }
}

/**
 * Saves the verification state to the sync_state table.
 *
 * @param db Database instance
 * @param state Verification state to persist
 */
const saveVerificationState = (db: Database, state: VerificationState): Promise<void> => {
  const stateJson = JSON.stringify({
    consecutive_failures: state.consecutive_failures,
    last_success_timestamp: state.last_success_timestamp?.toISOString() ?? undefined,
    last_failure_timestamp: state.last_failure_timestamp?.toISOString() ?? undefined,
    status: state.status,
  })

  // Use INSERT OR REPLACE to handle both new and existing state
  db.prepare(
    `
    INSERT OR REPLACE INTO sync_state (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `
  ).run(VERIFICATION_STATE_KEY, stateJson)

  return Promise.resolve()
}

/**
 * Records a successful backup verification.
 * Resets consecutive failures to 0 and updates last success timestamp.
 *
 * @param db Database instance
 */
export const recordVerificationSuccess = async (db: Database): Promise<void> => {
  const currentState = await getVerificationState(db)

  const newState: VerificationState = {
    consecutive_failures: 0,
    last_success_timestamp: new Date(),
    last_failure_timestamp: currentState.last_failure_timestamp, // Keep previous failure timestamp
    status: 'HEALTHY',
  }

  await saveVerificationState(db, newState)
}

/**
 * Records a failed backup verification.
 * Increments consecutive failures and updates last failure timestamp.
 *
 * @param db Database instance
 */
export const recordVerificationFailure = async (db: Database): Promise<void> => {
  const currentState = await getVerificationState(db)

  const newFailureCount = currentState.consecutive_failures + 1
  const newStatus = getVerificationStatus(newFailureCount)

  const newState: VerificationState = {
    consecutive_failures: newFailureCount,
    last_success_timestamp: currentState.last_success_timestamp, // Keep previous success timestamp
    last_failure_timestamp: new Date(),
    status: newStatus,
  }

  await saveVerificationState(db, newState)
}
