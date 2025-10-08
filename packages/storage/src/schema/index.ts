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
  type CaptureStatus,
  validateTransition,
  getValidTransitions,
  isTerminalState,
} from './state-machine.js'
