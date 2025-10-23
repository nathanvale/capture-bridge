/**
 * Error Formatting for CLI Error Handling
 *
 * Formats errors for JSON and human-readable output.
 *
 * @see spec-cli-tech.md §5.2 Error Output Formats
 */

import { CLIError } from './custom-error.js'

/**
 * Options for error formatting
 */
export interface FormatErrorOptions {
  /**
   * Format as JSON instead of human-readable text
   */
  json?: boolean
}

/**
 * JSON error structure
 */
export interface JSONErrorOutput {
  error: {
    code: string
    message: string
    hint?: string
    exit: number
  }
}

/**
 * Format error for output
 *
 * Formats CLIError instances as either JSON or human-readable text based on options.
 *
 * JSON Mode (stderr):
 * ```json
 * {
 *   "error": {
 *     "code": "CLI_INPUT_INVALID",
 *     "message": "text argument required when stdin empty",
 *     "hint": "Pass --text or pipe content",
 *     "exit": 2
 *   }
 * }
 * ```
 *
 * Human Mode (stderr):
 * ```
 * Error (CLI_INPUT_INVALID): text argument required
 * Hint: Pass --text or pipe content
 * ```
 *
 * @param error - The error to format
 * @param options - Formatting options
 * @returns Formatted error string
 */
export const formatError = (error: CLIError | Error, options: FormatErrorOptions): string => {
  if (error instanceof CLIError) {
    if (options.json) {
      // JSON mode
      const output: JSONErrorOutput = {
        error: {
          code: error.code,
          message: error.message,
          exit: error.exit,
        },
      }

      // Only include hint if it exists
      if (error.hint !== undefined) {
        output.error.hint = error.hint
      }

      return JSON.stringify(output)
    } else {
      // Human mode
      let output = `Error (${error.code}): ${error.message}`

      if (error.hint !== undefined) {
        output += `\nHint: ${error.hint}`
      }

      return output
    }
  }

  // Handle generic Error instances
  return error.message
}
