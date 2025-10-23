/**
 * Global Error Handler for CLI Error Handling
 *
 * Handles unhandled errors and formats them for output.
 *
 * @see spec-cli-tech.md §5.3 Global Error Handler
 */

import { CLIError } from './custom-error.js'
import { formatError, type FormatErrorOptions } from './error-handler.js'

/**
 * Handle global error
 *
 * Formats the error for output, writes to stderr, and exits with appropriate code.
 *
 * @param error - The error to handle
 * @param options - Formatting options
 */
export const handleGlobalError = (error: unknown, options: FormatErrorOptions): void => {
  // Convert unknown to Error if needed
  const errorInstance = error instanceof Error ? error : new Error(String(error))

  // Format the error
  const formatted = formatError(errorInstance, options)

  // Write to stderr
  // eslint-disable-next-line no-console -- Intentional stderr output for error handling
  console.error(formatted)

  // Determine exit code
  const exitCode = error instanceof CLIError ? error.exit : 1

  // Exit with appropriate code
  process.exit(exitCode)
}
