/**
 * Error Management Module
 *
 * Provides error logging and tracking functionality for the staging ledger.
 */

export {
  logError,
  getErrorSummaryLast24Hours,
  getErrorsByStageLastDay,
  trimErrorsOlderThan90Days,
  type ErrorLogEntry,
} from './error-logger.js'
