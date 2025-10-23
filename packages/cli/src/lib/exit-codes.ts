/**
 * Exit Code Registry
 *
 * Defines standard exit codes for CLI commands.
 * These codes follow POSIX conventions and are stable across versions.
 *
 * @see spec-cli-tech.md §5 Error Handling
 * @see CLI_FOUNDATION-AC07: Exit code registry (0=success, 1=error, 2=invalid input, etc.)
 *
 * **Contract Stability**: Exit codes are part of the CLI's public API.
 * Changes to exit codes constitute a breaking change and require a major version bump.
 */

/**
 * Standard Exit Codes
 *
 * Based on POSIX conventions and BSD sysexits.h:
 * - 0: Success
 * - 1: General error
 * - 2: Misuse of shell command (invalid arguments)
 * - 3-9: Application-specific errors
 * - 10-19: Infrastructure errors
 * - 20-29: Safety/integrity errors
 *
 * @see error registry (./errors/registry.ts) for mapping error codes to exit codes
 */
export const EXIT_CODES = {
  /**
   * Success - All operations completed successfully
   */
  SUCCESS: 0,

  /**
   * General Error - Generic failure (fallback for unexpected errors)
   */
  GENERAL_ERROR: 1,

  /**
   * Invalid Input - Validation or argument parsing failed
   * Maps to: CLI_INPUT_INVALID
   */
  INPUT_INVALID: 2,

  /**
   * Capture Not Found - Requested capture ID not found in ledger
   * Maps to: CLI_CAPTURE_NOT_FOUND
   */
  CAPTURE_NOT_FOUND: 3,

  /**
   * Voice File Missing - Voice memo file path not accessible
   * Maps to: CLI_VOICE_FILE_MISSING
   */
  VOICE_FILE_MISSING: 4,

  /**
   * Database Unavailable - SQLite connection or lock error
   * Maps to: CLI_DB_UNAVAILABLE
   */
  DB_UNAVAILABLE: 10,

  /**
   * Vault Not Writable - Obsidian vault path not writable
   * Maps to: CLI_VAULT_NOT_WRITABLE
   */
  VAULT_NOT_WRITABLE: 11,

  /**
   * Hash Migration Unsafe - Precondition unmet for hash migration phase
   * Maps to: CLI_HASH_MIGRATION_UNSAFE
   */
  HASH_MIGRATION_UNSAFE: 20,
} as const

/**
 * Type for valid exit code values
 */
export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]

/**
 * Check if a number is a valid exit code
 *
 * @param code - Number to check
 * @returns true if code is a valid exit code
 */
export const isValidExitCode = (code: number): code is ExitCode => {
  return Object.values(EXIT_CODES).includes(code as ExitCode)
}
