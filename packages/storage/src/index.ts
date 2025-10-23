/**
 * @capture-bridge/storage
 *
 * SQLite staging ledger for durable capture ingestion
 *
 * Implements the 4-table hard cap architecture with:
 * - captures: Ephemeral staging
 * - exports_audit: Immutable trail
 * - errors_log: Diagnostics
 * - sync_state: Cursors
 *
 * Source: docs/features/staging-ledger/spec-staging-tech.md
 */

export const storageVersion = '0.1.0'

// Schema module (bundled exports)
export {
  createSchema,
  initializePragmas,
  initializeDatabase,
  verifySchema,
  verifyPragmas,
  verifyIntegrity,
  type CaptureStatus,
  validateTransition,
  getValidTransitions,
  isTerminalState,
  assertValidTransition,
  StateTransitionError,
  queryRecoverableCaptures,
} from './schema/index.js'

// Staging ledger module
export {
  StagingLedger,
  type ExportAudit,
  type DuplicateCheckResult,
  StagingLedgerError,
} from './staging-ledger/staging-ledger.js'

// Placeholder export utilities
export {
  updateCaptureStatusToPlaceholder,
  UpdatePlaceholderStatusError,
} from './staging-ledger/update-placeholder-status.js'

// Backup utilities
export { createBackup, verifyBackup, pruneOldBackups } from './backup/backup.js'

export { startBackupScheduler } from './backup/scheduler.js'

export {
  promoteToDailyBackup,
  pruneDailyBackups,
  type PromotionResult,
  type PruneResult,
} from './backup/daily-promotion.js'
