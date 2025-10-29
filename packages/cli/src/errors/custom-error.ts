/**
 * Custom Error Class for CLI Error Handling
 *
 * Provides structured error handling with error codes, exit codes, and optional hints.
 *
 * @see spec-cli-tech.md §5.3 Global Error Handler
 */

import { errorRegistry, type ErrorCode } from './registry.js'

/**
 * CLIError - Custom error class with structured error codes
 *
 * Extends the standard Error class with CLI-specific properties:
 * - code: Structured error code from registry
 * - details: Human-readable error details
 * - hint: Optional hint for resolving the error
 * - exit: Exit code from registry
 *
 * @example
 * ```typescript
 * throw new CLIError(
 *   'CLI_INPUT_INVALID',
 *   'text argument required',
 *   'Pass --text or pipe content'
 * )
 * ```
 */
export class CLIError extends Error {
  /**
   * Structured error code from registry
   */
  public readonly code: ErrorCode

  /**
   * Human-readable error details
   */
  public readonly details: string

  /**
   * Optional hint for resolving the error
   */
  public readonly hint?: string

  /**
   * Create a new CLIError
   *
   * @param code - Error code from registry
   * @param details - Human-readable error details
   * @param hint - Optional hint for resolving the error
   */
  constructor(code: ErrorCode, details: string, hint?: string) {
    // eslint-disable-next-line security/detect-object-injection -- code is type-safe from ErrorCode union
    const definition = errorRegistry[code]
    const message = definition.message(details)

    super(message)

    this.name = 'CLIError'
    this.code = code
    this.details = details
    if (hint !== undefined) {
      this.hint = hint
    }

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CLIError)
    }
  }

  /**
   * Get exit code from registry
   */
  get exit(): number {
    return errorRegistry[this.code].exit
  }

  /**
   * Get error category from registry
   */
  get category(): string {
    return errorRegistry[this.code].category
  }
}
