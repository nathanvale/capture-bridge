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

// Schema module
export {
  createSchema,
  initializePragmas,
  initializeDatabase,
  verifySchema,
  verifyPragmas,
  verifyIntegrity,
  validateTransition,
  getValidTransitions,
  isTerminalState,
} from './schema/index.js'

export type { CaptureStatus } from './schema/index.js'
