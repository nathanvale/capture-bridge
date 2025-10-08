/**
 * Schema Module
 *
 * Exports schema definition and initialization functions for the staging ledger.
 */

export {
  createSchema,
  initializePragmas,
  initializeDatabase,
  verifySchema,
  verifyPragmas,
  verifyIntegrity,
} from './schema.js'

export {
  validateTransition,
  getValidTransitions,
  isTerminalState,
  type CaptureStatus,
} from './state-machine.js'
