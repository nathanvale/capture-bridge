/**
 * Error Registry for CLI Error Handling
 *
 * Defines all structured error codes with their exit codes, categories, and message templates.
 *
 * @see spec-cli-tech.md §5.1 Error Registry
 */

import { EXIT_CODES } from '../lib/exit-codes.js'

/**
 * Error categories for retry strategies and error handling
 */
export type ErrorCategory = 'user' | 'integrity' | 'infra' | 'safety'

/**
 * Error definition structure
 */
export interface ErrorDefinition {
  /**
   * Exit code to use when this error causes program termination
   */
  exit: number

  /**
   * Category for retry strategy classification
   */
  category: ErrorCategory

  /**
   * Message template function that accepts error details
   */
  message: (details: string) => string
}

/**
 * Error Registry
 *
 * Maps error codes to their definitions including exit codes, categories, and message templates.
 */
export const errorRegistry = {
  /**
   * CLI_INPUT_INVALID - Validation failed
   * Exit: 2, Category: user
   * Retry: Per User Error Pattern
   */
  CLI_INPUT_INVALID: {
    exit: EXIT_CODES.INPUT_INVALID,
    category: 'user',
    message: (details: string) => `Invalid input: ${details}`,
  },

  /**
   * CLI_CAPTURE_NOT_FOUND - Capture id unknown
   * Exit: 3, Category: user
   * Retry: depends
   */
  CLI_CAPTURE_NOT_FOUND: {
    exit: EXIT_CODES.CAPTURE_NOT_FOUND,
    category: 'user',
    message: (details: string) => `Capture not found: ${details}`,
  },

  /**
   * CLI_VOICE_FILE_MISSING - Voice memo path missing
   * Exit: 4, Category: integrity
   * Retry: after-fix
   */
  CLI_VOICE_FILE_MISSING: {
    exit: EXIT_CODES.VOICE_FILE_MISSING,
    category: 'integrity',
    message: (details: string) => `Voice file missing: ${details}`,
  },

  /**
   * CLI_DB_UNAVAILABLE - SQLite open / lock error
   * Exit: 10, Category: infra
   * Retry: yes
   */
  CLI_DB_UNAVAILABLE: {
    exit: EXIT_CODES.DB_UNAVAILABLE,
    category: 'infra',
    message: (details: string) => `Database unavailable: ${details}`,
  },

  /**
   * CLI_VAULT_NOT_WRITABLE - Vault path not writable
   * Exit: 11, Category: infra
   * Retry: after-fix
   */
  CLI_VAULT_NOT_WRITABLE: {
    exit: EXIT_CODES.VAULT_NOT_WRITABLE,
    category: 'infra',
    message: (details: string) => `Vault not writable: ${details}`,
  },

  /**
   * CLI_HASH_MIGRATION_UNSAFE - Phase precondition unmet
   * Exit: 20, Category: safety
   * Retry: after-fix
   */
  CLI_HASH_MIGRATION_UNSAFE: {
    exit: EXIT_CODES.HASH_MIGRATION_UNSAFE,
    category: 'safety',
    message: (details: string) => `Hash migration unsafe: ${details}`,
  },
} as const satisfies Record<string, ErrorDefinition>

/**
 * Type-safe error code type derived from registry keys
 */
export type ErrorCode = keyof typeof errorRegistry
