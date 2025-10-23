import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Error Handling - AC05', () => {
  describe('Error Registry', () => {
    it('should have all required error codes', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry).toHaveProperty('CLI_INPUT_INVALID')
      expect(errorRegistry).toHaveProperty('CLI_CAPTURE_NOT_FOUND')
      expect(errorRegistry).toHaveProperty('CLI_VOICE_FILE_MISSING')
      expect(errorRegistry).toHaveProperty('CLI_DB_UNAVAILABLE')
      expect(errorRegistry).toHaveProperty('CLI_VAULT_NOT_WRITABLE')
      expect(errorRegistry).toHaveProperty('CLI_HASH_MIGRATION_UNSAFE')
    })

    it('should map CLI_INPUT_INVALID to exit code 2', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_INPUT_INVALID.exit).toBe(2)
      expect(errorRegistry.CLI_INPUT_INVALID.category).toBe('user')
    })

    it('should map CLI_CAPTURE_NOT_FOUND to exit code 3', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_CAPTURE_NOT_FOUND.exit).toBe(3)
      expect(errorRegistry.CLI_CAPTURE_NOT_FOUND.category).toBe('user')
    })

    it('should map CLI_VOICE_FILE_MISSING to exit code 4', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_VOICE_FILE_MISSING.exit).toBe(4)
      expect(errorRegistry.CLI_VOICE_FILE_MISSING.category).toBe('integrity')
    })

    it('should map CLI_DB_UNAVAILABLE to exit code 10', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_DB_UNAVAILABLE.exit).toBe(10)
      expect(errorRegistry.CLI_DB_UNAVAILABLE.category).toBe('infra')
    })

    it('should map CLI_VAULT_NOT_WRITABLE to exit code 11', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_VAULT_NOT_WRITABLE.exit).toBe(11)
      expect(errorRegistry.CLI_VAULT_NOT_WRITABLE.category).toBe('infra')
    })

    it('should map CLI_HASH_MIGRATION_UNSAFE to exit code 20', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_HASH_MIGRATION_UNSAFE.exit).toBe(20)
      expect(errorRegistry.CLI_HASH_MIGRATION_UNSAFE.category).toBe('safety')
    })

    it('should have message functions for all error codes', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(typeof errorRegistry.CLI_INPUT_INVALID.message).toBe('function')
      expect(errorRegistry.CLI_INPUT_INVALID.message('test details')).toContain('test details')
    })
  })

  describe('CLIError Class', () => {
    it('should create error with code, details, and hint', async () => {
      const { CLIError } = await import('../errors/custom-error.js')

      const error = new CLIError('CLI_INPUT_INVALID', 'test argument missing', 'Use --text flag')

      expect(error.code).toBe('CLI_INPUT_INVALID')
      expect(error.details).toBe('test argument missing')
      expect(error.hint).toBe('Use --text flag')
      expect(error.name).toBe('CLIError')
    })

    it('should generate message from registry', async () => {
      const { CLIError } = await import('../errors/custom-error.js')

      const error = new CLIError('CLI_INPUT_INVALID', 'test details')

      expect(error.message).toContain('test details')
    })

    it('should provide exit code from registry', async () => {
      const { CLIError } = await import('../errors/custom-error.js')

      const error = new CLIError('CLI_INPUT_INVALID', 'test details')

      expect(error.exit).toBe(2)
    })

    it('should provide category from registry', async () => {
      const { CLIError } = await import('../errors/custom-error.js')

      const error = new CLIError('CLI_INPUT_INVALID', 'test details')

      expect(error.category).toBe('user')
    })

    it('should work without hint', async () => {
      const { CLIError } = await import('../errors/custom-error.js')

      const error = new CLIError('CLI_DB_UNAVAILABLE', 'Connection failed')

      expect(error.code).toBe('CLI_DB_UNAVAILABLE')
      expect(error.hint).toBeUndefined()
    })
  })

  describe('Error Formatting - JSON Mode', () => {
    it('should format CLIError as JSON', async () => {
      const { CLIError } = await import('../errors/custom-error.js')
      const { formatError } = await import('../errors/error-handler.js')

      const error = new CLIError('CLI_INPUT_INVALID', 'test argument required', 'Pass --text or pipe content')
      const formatted = formatError(error, { json: true })
      const parsed = JSON.parse(formatted)

      expect(parsed.error.code).toBe('CLI_INPUT_INVALID')
      expect(parsed.error.message).toContain('test argument required')
      expect(parsed.error.hint).toBe('Pass --text or pipe content')
      expect(parsed.error.exit).toBe(2)
    })

    it('should include hint in JSON when present', async () => {
      const { CLIError } = await import('../errors/custom-error.js')
      const { formatError } = await import('../errors/error-handler.js')

      const error = new CLIError('CLI_VAULT_NOT_WRITABLE', 'Permission denied', 'Check vault permissions')
      const formatted = formatError(error, { json: true })
      const parsed = JSON.parse(formatted)

      expect(parsed.error.hint).toBe('Check vault permissions')
    })

    it('should handle CLIError without hint in JSON', async () => {
      const { CLIError } = await import('../errors/custom-error.js')
      const { formatError } = await import('../errors/error-handler.js')

      const error = new CLIError('CLI_DB_UNAVAILABLE', 'Connection timeout')
      const formatted = formatError(error, { json: true })
      const parsed = JSON.parse(formatted)

      expect(parsed.error.hint).toBeUndefined()
    })
  })

  describe('Error Formatting - Human Mode', () => {
    it('should format CLIError for human reading', async () => {
      const { CLIError } = await import('../errors/custom-error.js')
      const { formatError } = await import('../errors/error-handler.js')

      const error = new CLIError('CLI_INPUT_INVALID', 'test argument required', 'Pass --text or pipe content')
      const formatted = formatError(error, { json: false })

      expect(formatted).toContain('Error (CLI_INPUT_INVALID)')
      expect(formatted).toContain('test argument required')
      expect(formatted).toContain('Hint: Pass --text or pipe content')
    })

    it('should format human mode without hint when not present', async () => {
      const { CLIError } = await import('../errors/custom-error.js')
      const { formatError } = await import('../errors/error-handler.js')

      const error = new CLIError('CLI_DB_UNAVAILABLE', 'Connection timeout')
      const formatted = formatError(error, { json: false })

      expect(formatted).toContain('Error (CLI_DB_UNAVAILABLE)')
      expect(formatted).toContain('Connection timeout')
      expect(formatted).not.toContain('Hint:')
    })

    it('should handle non-CLIError instances', async () => {
      const { formatError } = await import('../errors/error-handler.js')

      const error = new Error('Generic error message')
      const formatted = formatError(error, { json: false })

      expect(formatted).toBe('Generic error message')
    })
  })

  describe('Global Error Handler', () => {
    let mockExit: typeof process.exit
    let mockConsoleError: typeof console.error
    let exitCode: number | undefined
    let errorOutput: string | undefined

    beforeEach(() => {
      // Mock process.exit
      mockExit = process.exit
      process.exit = ((code?: number) => {
        exitCode = code
        return undefined as never
      }) as typeof process.exit

      // Mock console.error
      // eslint-disable-next-line no-console -- Saving original console.error for test mock
      mockConsoleError = console.error
      // eslint-disable-next-line no-console -- Testing error output
      console.error = (message?: unknown) => {
        errorOutput = String(message)
      }
    })

    afterEach(() => {
      // Restore mocks
      process.exit = mockExit
      // eslint-disable-next-line no-console -- Restoring original console.error
      console.error = mockConsoleError
      exitCode = undefined
      errorOutput = undefined
    })

    it('should handle CLIError and exit with correct code', async () => {
      const { CLIError } = await import('../errors/custom-error.js')
      const { handleGlobalError } = await import('../errors/global-handler.js')

      const error = new CLIError('CLI_INPUT_INVALID', 'test error')
      handleGlobalError(error, { json: false })

      expect(exitCode).toBe(2)
      expect(errorOutput).toContain('CLI_INPUT_INVALID')
    })

    it('should format error as JSON when json flag is true', async () => {
      const { CLIError } = await import('../errors/custom-error.js')
      const { handleGlobalError } = await import('../errors/global-handler.js')

      const error = new CLIError('CLI_DB_UNAVAILABLE', 'Connection failed')
      handleGlobalError(error, { json: true })

      expect(exitCode).toBe(10)
      expect(errorOutput).toBeDefined()
      if (errorOutput === undefined) {
        throw new Error('errorOutput should be defined')
      }
      const parsed = JSON.parse(errorOutput)
      expect(parsed.error.code).toBe('CLI_DB_UNAVAILABLE')
    })

    it('should handle non-CLIError with exit code 1', async () => {
      const { handleGlobalError } = await import('../errors/global-handler.js')

      const error = new Error('Unknown error')
      handleGlobalError(error, { json: false })

      expect(exitCode).toBe(1)
      expect(errorOutput).toBe('Unknown error')
    })

    it('should handle unknown error types', async () => {
      const { handleGlobalError } = await import('../errors/global-handler.js')

      handleGlobalError('string error', { json: false })

      expect(exitCode).toBe(1)
    })
  })

  describe('Error Categories and Retry Strategies', () => {
    it('should categorize user errors correctly', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_INPUT_INVALID.category).toBe('user')
      expect(errorRegistry.CLI_CAPTURE_NOT_FOUND.category).toBe('user')
    })

    it('should categorize infrastructure errors correctly', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_DB_UNAVAILABLE.category).toBe('infra')
      expect(errorRegistry.CLI_VAULT_NOT_WRITABLE.category).toBe('infra')
    })

    it('should categorize integrity errors correctly', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_VOICE_FILE_MISSING.category).toBe('integrity')
    })

    it('should categorize safety errors correctly', async () => {
      const { errorRegistry } = await import('../errors/registry.js')

      expect(errorRegistry.CLI_HASH_MIGRATION_UNSAFE.category).toBe('safety')
    })
  })
})
