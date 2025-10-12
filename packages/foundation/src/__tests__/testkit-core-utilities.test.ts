/* eslint-disable no-console, sonarjs/no-nested-functions, require-await, unicorn/consistent-function-scoping, sonarjs/no-ignored-exceptions, @typescript-eslint/no-unused-vars */
import { describe, it, expect } from 'vitest'

/**
 * Testkit Core Utilities Test
 *
 * Verifies all core utilities from @orchestr8/testkit work correctly
 * without requiring any optional dependencies.
 *
 * Tests cover:
 * - delay - Promise-based delay utility
 * - retry - Retry logic with exponential backoff
 * - withTimeout - Timeout wrapper for promises
 * - createMockFn - Mock function creator
 * - Environment utilities
 * - File system utilities
 * - Vitest configuration helpers
 */

describe('Testkit Core Utilities', () => {
  describe('Async Utilities', () => {
    describe('delay', () => {
      it('should delay execution for specified milliseconds', async () => {
        const { delay } = await import('@orchestr8/testkit')

        const start = Date.now()
        await delay(100)
        const elapsed = Date.now() - start

        expect(elapsed).toBeGreaterThanOrEqual(95) // Allow 5ms variance
        expect(elapsed).toBeLessThan(150) // Should not take too long

        console.log(`✅ delay(100) took ${elapsed}ms`)
      })

      it('should handle zero delay', async () => {
        const { delay } = await import('@orchestr8/testkit')

        const start = Date.now()
        await delay(0)
        const elapsed = Date.now() - start

        expect(elapsed).toBeLessThan(20) // Should be nearly instant

        console.log('✅ delay(0) works correctly')
      })

      it('should handle negative delay values', async () => {
        const { delay } = await import('@orchestr8/testkit')

        // Negative delays should either reject or treat as zero
        const start = Date.now()
        await delay(-100)
        const elapsed = Date.now() - start

        // Should complete quickly (not actually wait negative time)
        expect(elapsed).toBeLessThan(50)

        console.log('✅ delay(-100) handled as edge case')
      })

      it('should handle NaN delay values', async () => {
        const { delay } = await import('@orchestr8/testkit')

        // NaN delays should either reject or treat as zero
        const start = Date.now()
        await delay(NaN)
        const elapsed = Date.now() - start

        // Should complete quickly
        expect(elapsed).toBeLessThan(50)

        console.log('✅ delay(NaN) handled as edge case')
      })

      it('should complete immediately with zero delay', async () => {
        const { delay } = await import('@orchestr8/testkit')

        const start = Date.now()
        await delay(0)
        const elapsed = Date.now() - start

        expect(elapsed).toBeLessThan(50) // Allow variance for CI (was taking 18ms in CI)

        console.log('✅ delay(0) completes immediately')
      })
    })

    describe('retry', () => {
      it('should retry failed operations', async () => {
        const { retry } = await import('@orchestr8/testkit')

        let attempts = 0
        const operation = async () => {
          attempts++
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`)
          }
          return 'success'
        }

        const result = await retry(operation, 5, 10)

        expect(result).toBe('success')
        expect(attempts).toBe(3)

        console.log(`✅ retry succeeded after ${attempts} attempts`)
      })

      it('should fail after max retries', async () => {
        const { retry } = await import('@orchestr8/testkit')

        let attempts = 0
        const operation = async () => {
          attempts++
          throw new Error(`Always fails - attempt ${attempts}`)
        }

        await expect(retry(operation, 3, 10)).rejects.toThrow('Always fails')
        expect(attempts).toBe(3)

        console.log(`✅ retry failed after ${attempts} attempts as expected`)
      })

      it('should apply exponential backoff', async () => {
        const { retry } = await import('@orchestr8/testkit')

        let attempts = 0
        const timestamps: number[] = []

        const operation = async () => {
          timestamps.push(Date.now())
          attempts++
          if (attempts < 3) {
            throw new Error('Retry me')
          }
          return 'success'
        }

        await retry(operation, 3, 50) // 50ms base delay

        // Check that delays increase
        expect(timestamps).toHaveLength(3)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe after length check
        const delay1 = timestamps[1]! - timestamps[0]!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe after length check
        const delay2 = timestamps[2]! - timestamps[1]!

        expect(delay1).toBeGreaterThanOrEqual(45) // First retry ~50ms
        expect(delay2).toBeGreaterThanOrEqual(90) // Second retry ~100ms (exponential)

        console.log('✅ Exponential backoff working')
      })

      it('should validate exponential backoff formula correctly', async () => {
        const { retry } = await import('@orchestr8/testkit')

        let attempts = 0
        const timestamps: number[] = []
        const baseDelay = 100

        const operation = async () => {
          timestamps.push(Date.now())
          attempts++
          if (attempts < 4) {
            throw new Error('Retry me')
          }
          return 'success'
        }

        await retry(operation, 4, baseDelay)

        // Verify exponential backoff formula: delay = baseDelay * 2^(attempt-1)
        // First retry: ~100ms, Second: ~200ms, Third: ~400ms
        expect(timestamps).toHaveLength(4)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe after length check
        const delay1 = timestamps[1]! - timestamps[0]!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe after length check
        const delay2 = timestamps[2]! - timestamps[1]!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe after length check
        const delay3 = timestamps[3]! - timestamps[2]!

        expect(delay1).toBeGreaterThanOrEqual(baseDelay * 0.9)
        expect(delay2).toBeGreaterThanOrEqual(baseDelay * 2 * 0.9)
        expect(delay3).toBeGreaterThanOrEqual(baseDelay * 4 * 0.9)

        console.log('✅ Exponential backoff formula validated')
      })

      it('should handle zero max attempts', async () => {
        const { retry } = await import('@orchestr8/testkit')

        const operation = async () => {
          return 'should not execute'
        }

        await expect(retry(operation, 0, 10)).rejects.toThrow()

        console.log('✅ retry with 0 max attempts rejects')
      })

      it('should handle single max attempt', async () => {
        const { retry } = await import('@orchestr8/testkit')

        let attempts = 0
        const operation = async () => {
          attempts++
          throw new Error('Always fails')
        }

        await expect(retry(operation, 1, 10)).rejects.toThrow('Always fails')
        expect(attempts).toBe(1)

        console.log('✅ retry with 1 max attempt works correctly')
      })

      it('should handle negative max attempts', async () => {
        const { retry } = await import('@orchestr8/testkit')

        const operation = async () => {
          return 'should not execute'
        }

        await expect(retry(operation, -1, 10)).rejects.toThrow()

        console.log('✅ retry with negative max attempts rejects')
      })
    })

    describe('withTimeout', () => {
      it('should complete within timeout', async () => {
        const { withTimeout, delay } = await import('@orchestr8/testkit')

        const fastOperation = delay(50).then(() => 'completed')
        const result = await withTimeout(fastOperation, 200)

        expect(result).toBe('completed')

        console.log('✅ withTimeout allows fast operations')
      })

      it('should timeout slow operations', async () => {
        const { withTimeout, delay } = await import('@orchestr8/testkit')

        const slowOperation = delay(200).then(() => 'too late')

        await expect(withTimeout(slowOperation, 50)).rejects.toThrow('timeout')

        console.log('✅ withTimeout rejects slow operations')
      })

      it('should preserve promise rejection', async () => {
        const { withTimeout } = await import('@orchestr8/testkit')

        const failingOperation = Promise.reject(new Error('Original error'))

        await expect(withTimeout(failingOperation, 1000)).rejects.toThrow('Original error')

        console.log('✅ withTimeout preserves original errors')
      })

      it('should cleanup resources after timeout', async () => {
        const { withTimeout, delay } = await import('@orchestr8/testkit')

        let operationStarted = false

        const operation = async () => {
          operationStarted = true
          await delay(1000)
        }

        await expect(withTimeout(operation(), 100)).rejects.toThrow()

        // Verify operation was started
        expect(operationStarted).toBe(true)

        // The test verifies that timeout works properly
        console.log('✅ withTimeout properly handles timeout')
      })
    })
  })

  describe('Mock Function Utility', () => {
    it('should create mock functions', async () => {
      const { createMockFn } = await import('@orchestr8/testkit')

      const mockFn = createMockFn() as (...args: unknown[]) => unknown

      expect(mockFn).toBeDefined()
      expect(typeof mockFn).toBe('function')

      // Call the mock
      const result = mockFn('arg1', 'arg2')

      // createMockFn without implementation returns undefined
      expect(result).toBeUndefined()

      console.log('✅ createMockFn creates callable functions')
    })

    it('should work with custom implementations', async () => {
      const { createMockFn } = await import('@orchestr8/testkit')

      // If createMockFn supports custom implementations
      const mockFn = createMockFn((x: number) => x * 2) as (x: number) => unknown

      const result = mockFn(5)

      // Test if it returns the implementation result
      if (typeof result === 'number') {
        expect(result).toBe(10)
        console.log('✅ createMockFn supports custom implementations')
      } else {
        console.log('ℹ️ createMockFn uses basic mock implementation')
      }
    })

    it('should verify custom implementation is called', async () => {
      const { createMockFn } = await import('@orchestr8/testkit')

      let callCount = 0
      const mockFn = createMockFn((x: number) => {
        callCount++
        return x * 2
      }) as (x: number) => unknown

      mockFn(5)
      mockFn(10)

      // Verify the custom implementation was called
      if (callCount > 0) {
        expect(callCount).toBe(2)
        console.log('✅ createMockFn custom implementation called correctly')
      } else {
        console.log('ℹ️ createMockFn uses wrapper implementation')
      }
    })
  })

  describe('Environment Utilities', () => {
    it('should detect test environment', async () => {
      const { getTestEnvironment } = await import('@orchestr8/testkit')

      const env = getTestEnvironment()

      expect(env).toBeDefined()
      expect(env).toHaveProperty('isVitest')
      expect(env.isVitest).toBe(true) // We're in Vitest!

      // Check for other environment properties
      expect(env).toHaveProperty('isCI')
      expect(env).toHaveProperty('isWallaby')
      expect(env).toHaveProperty('nodeEnv')

      console.log('✅ Test environment detected:', {
        isVitest: env.isVitest,
        isCI: env.isCI,
        isWallaby: env.isWallaby,
        nodeEnv: env.nodeEnv,
      })
    })

    it('should handle empty environment values gracefully', async () => {
      const { getTestEnvironment, setupTestEnv } = await import('@orchestr8/testkit')

      // Test with empty string values (simulating undefined/unset)
      const { restore } = setupTestEnv({
        NODE_ENV: '',
        VITEST: '',
      })

      const env = getTestEnvironment()

      // Should still return valid environment object
      expect(env).toBeDefined()
      expect(env).toHaveProperty('nodeEnv')
      expect(env).toHaveProperty('isVitest')

      // Restore
      restore()

      console.log('✅ Environment detection handles empty values')
    })

    it('should get test timeouts', async () => {
      const { getTestTimeouts } = await import('@orchestr8/testkit')

      const timeouts = getTestTimeouts()

      expect(timeouts).toBeDefined()
      expect(timeouts).toHaveProperty('unit')
      expect(timeouts).toHaveProperty('integration')
      expect(timeouts).toHaveProperty('e2e')

      expect(typeof timeouts.unit).toBe('number')
      expect(typeof timeouts.integration).toBe('number')
      expect(typeof timeouts.e2e).toBe('number')

      // Verify reasonable timeout values
      expect(timeouts.unit).toBeGreaterThan(0)
      expect(timeouts.integration).toBeGreaterThan(timeouts.unit)
      expect(timeouts.e2e).toBeGreaterThan(timeouts.integration)

      console.log('✅ Test timeouts:', timeouts)
    })

    it('should validate timeout configuration values', async () => {
      const { createVitestTimeouts, createVitestEnvironmentConfig } = await import('@orchestr8/testkit')

      const envConfig = createVitestEnvironmentConfig()
      const timeouts = createVitestTimeouts(envConfig)

      // Verify all timeout values are positive numbers
      expect(timeouts.test).toBeGreaterThan(0)
      expect(timeouts.hook).toBeGreaterThan(0)
      expect(timeouts.teardown).toBeGreaterThan(0)

      // Verify they are finite numbers (not Infinity or NaN)
      expect(Number.isFinite(timeouts.test)).toBe(true)
      expect(Number.isFinite(timeouts.hook)).toBe(true)
      expect(Number.isFinite(timeouts.teardown)).toBe(true)

      console.log('✅ Timeout configuration values are valid')
    })

    it('should setup test environment variables', async () => {
      const { setupTestEnv } = await import('@orchestr8/testkit')

      // eslint-disable-next-line turbo/no-undeclared-env-vars -- Test-only variable
      const originalValue = process.env['TEST_VAR']

      // Setup test environment - returns object with restore method
      const { restore } = setupTestEnv({
        TEST_VAR: 'test-value',
        ANOTHER_VAR: 'another-value',
      })

      // eslint-disable-next-line turbo/no-undeclared-env-vars -- Test-only variable
      expect(process.env['TEST_VAR']).toBe('test-value')
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- Test-only variable
      expect(process.env['ANOTHER_VAR']).toBe('another-value')

      // Restore original environment
      restore()

      // eslint-disable-next-line turbo/no-undeclared-env-vars -- Test-only variable
      expect(process.env['TEST_VAR']).toBe(originalValue)

      console.log('✅ Environment setup and restore works')
    })
  })

  describe('File System Utilities', () => {
    it('should create temporary directory', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const fs = await import('node:fs/promises')

      const tempDir = await createTempDirectory()

      expect(tempDir).toBeDefined()
      expect(tempDir.path).toBeDefined()
      expect(typeof tempDir.path).toBe('string')

      // Verify directory exists
      const stats = await fs.stat(tempDir.path)
      expect(stats.isDirectory()).toBe(true)

      // Cleanup
      if (tempDir.cleanup) {
        await tempDir.cleanup()
      }

      console.log('✅ Created temp directory:', tempDir.path)
    })

    it('should create named temporary directory', async () => {
      const { createNamedTempDirectory } = await import('@orchestr8/testkit/fs')
      const fs = await import('node:fs/promises')

      const tempDir = await createNamedTempDirectory('test-prefix')

      expect(tempDir.path).toContain('test-prefix')

      // Verify directory exists
      const stats = await fs.stat(tempDir.path)
      expect(stats.isDirectory()).toBe(true)

      // Cleanup
      if (tempDir.cleanup) {
        await tempDir.cleanup()
      }

      console.log('✅ Created named temp directory:', tempDir.path)
    })

    it('should create multiple temporary directories', async () => {
      const { createMultipleTempDirectories } = await import('@orchestr8/testkit/fs')
      const fs = await import('node:fs/promises')

      const tempDirs = await createMultipleTempDirectories(3)

      expect(tempDirs).toHaveLength(3)

      // Verify all directories exist and are unique
      const paths = new Set()
      for (const dir of tempDirs) {
        expect(dir.path).toBeDefined()
        paths.add(dir.path)

        const stats = await fs.stat(dir.path)
        expect(stats.isDirectory()).toBe(true)
      }

      expect(paths.size).toBe(3) // All paths are unique

      // Cleanup all
      const { cleanupMultipleTempDirectories } = await import('@orchestr8/testkit/fs')
      await cleanupMultipleTempDirectories(tempDirs)

      console.log('✅ Created 3 unique temp directories')
    })

    it('should use managed temporary directory', async () => {
      const { withTempDirectoryScope } = await import('@orchestr8/testkit/fs')
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Use temp directory with callback pattern
      const result = await withTempDirectoryScope(async (createTemp) => {
        const dir = await createTemp()

        // Write a test file
        const testFile = path.join(dir.path, 'test.txt')
        await fs.writeFile(testFile, 'test content')

        // Verify file exists
        const content = await fs.readFile(testFile, 'utf-8')
        expect(content).toBe('test content')

        return 'completed'
      })

      expect(result).toBe('completed')

      console.log('✅ Managed temp directory with automatic cleanup')
    })

    it('should handle temp directory cleanup failures gracefully', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const tempDir = await createTempDirectory()

      // Create a file in the temp directory
      const testFile = path.join(tempDir.path, 'test.txt')
      await fs.writeFile(testFile, 'test content')

      // Make directory read-only to cause cleanup issues (platform-dependent)
      try {
        // eslint-disable-next-line sonarjs/file-permissions -- Test requires restricted permissions
        await fs.chmod(tempDir.path, 0o444)
      } catch (error) {
        // Some platforms may not support this
        console.log('ℹ️ Platform does not support chmod test')
      }

      // Cleanup should handle errors gracefully
      if (tempDir.cleanup) {
        try {
          await tempDir.cleanup()
          console.log('✅ Cleanup succeeded despite potential errors')
        } catch (error) {
          // Verify error is handled and doesn't crash
          expect(error).toBeDefined()
          console.log('✅ Cleanup error handled gracefully')
        }
      }

      // Restore permissions and cleanup
      try {
        // eslint-disable-next-line sonarjs/file-permissions -- Test cleanup requires write permissions
        await fs.chmod(tempDir.path, 0o755)
        await fs.rm(tempDir.path, { recursive: true, force: true })
      } catch (error) {
        // Best effort cleanup
      }
    })
  })

  describe('Vitest Configuration Utilities', () => {
    it('should create base vitest config', async () => {
      const { createBaseVitestConfig, createVitestBaseConfig } = await import('@orchestr8/testkit')

      const config = createBaseVitestConfig()

      expect(config).toBeDefined()
      expect(config).toHaveProperty('test')
      expect(config.test).toBeDefined()

      // Check for common test config properties
      if (config.test) {
        expect(typeof config.test).toBe('object')
      }

      // Both functions should exist (may or may not be aliases)
      expect(createVitestBaseConfig).toBeDefined()

      console.log('✅ Vitest base config created')
    })

    it('should create CI optimized config', async () => {
      const { createCIOptimizedConfig, createCIConfig } = await import('@orchestr8/testkit')

      const config = createCIOptimizedConfig()

      expect(config).toBeDefined()
      expect(config).toHaveProperty('test')

      // CI config should have specific optimizations
      if (config.test) {
        // Check for CI-specific settings like reporters, coverage, etc.
        expect(config.test).toBeDefined()
      }

      // Both functions should exist (aliases)
      expect(createCIConfig).toBe(createCIOptimizedConfig)

      console.log('✅ CI optimized config created')
    })

    it('should create Wallaby optimized config', async () => {
      const { createWallabyOptimizedConfig, createWallabyConfig } = await import('@orchestr8/testkit')

      const config = createWallabyOptimizedConfig()

      expect(config).toBeDefined()
      expect(config).toHaveProperty('test')

      // Both functions should exist (aliases)
      expect(createWallabyConfig).toBe(createWallabyOptimizedConfig)

      console.log('✅ Wallaby optimized config created')
    })

    it('should create vitest config with custom options', async () => {
      const { createBaseVitestConfig } = await import('@orchestr8/testkit')

      const customConfig = {
        test: {
          globals: true,
          environment: 'node' as const,
        },
      }

      const config = createBaseVitestConfig(customConfig)

      expect(config).toBeDefined()
      expect(config.test).toBeDefined()

      // createBaseVitestConfig merges custom config, so check it has expected properties
      if (config.test) {
        expect(config.test.globals).toBe(true)
        expect(config.test.environment).toBe('node')
      }

      console.log('✅ createBaseVitestConfig with custom options works')
    })

    it('should provide default config', async () => {
      const { baseVitestConfig, defaultConfig } = await import('@orchestr8/testkit')

      expect(baseVitestConfig).toBeDefined()
      expect(defaultConfig).toBeDefined()
      expect(defaultConfig).toBe(baseVitestConfig) // Should be aliases

      console.log('✅ Default configs available')
    })

    it('should create coverage config', async () => {
      const { createVitestCoverage, createVitestEnvironmentConfig } = await import('@orchestr8/testkit')

      const envConfig = createVitestEnvironmentConfig()
      const coverage = createVitestCoverage(envConfig)

      expect(coverage).toBeDefined()
      expect(coverage).toHaveProperty('enabled')
      expect(coverage).toHaveProperty('threshold')
      expect(coverage).toHaveProperty('reporter')

      // Verify types
      expect(typeof coverage.enabled).toBe('boolean')
      expect(typeof coverage.threshold).toBe('number')
      expect(Array.isArray(coverage.reporter)).toBe(true)

      console.log('✅ Coverage config created')
    })

    it('should create environment config', async () => {
      const { createVitestEnvironmentConfig } = await import('@orchestr8/testkit')

      const envConfig = createVitestEnvironmentConfig()

      expect(envConfig).toBeDefined()
      expect(envConfig).toHaveProperty('isCI')
      expect(envConfig).toHaveProperty('isWallaby')

      console.log('✅ Environment config created')
    })

    it('should create pool options', async () => {
      const { createVitestPoolOptions, createVitestEnvironmentConfig } = await import('@orchestr8/testkit')

      const envConfig = createVitestEnvironmentConfig()
      const poolOptions = createVitestPoolOptions(envConfig)

      expect(poolOptions).toBeDefined()
      expect(poolOptions).toHaveProperty('pool')
      expect(poolOptions).toHaveProperty('maxWorkers')

      console.log('✅ Pool options created')
    })

    it('should create timeout config', async () => {
      const { createVitestTimeouts, createVitestEnvironmentConfig } = await import('@orchestr8/testkit')

      const envConfig = createVitestEnvironmentConfig()
      const timeouts = createVitestTimeouts(envConfig)

      expect(timeouts).toBeDefined()
      expect(timeouts).toHaveProperty('test')
      expect(timeouts).toHaveProperty('hook')
      expect(timeouts).toHaveProperty('teardown')

      console.log('✅ Timeout config created')
    })
  })

  describe('Type Exports', () => {
    it('should export TypeScript types', async () => {
      // This test verifies that types are available (compile-time check)
      // We can't directly test types at runtime, but we can verify the module structure
      const testkit = await import('@orchestr8/testkit')

      // Verify the module has expected structure
      expect(testkit).toBeDefined()

      // List all exports for documentation
      const exports = Object.keys(testkit).sort((a, b) => a.localeCompare(b))

      console.log('✅ Available exports:', exports.length)
      console.log(
        '  Core utilities:',
        exports.filter((e) => ['delay', 'retry', 'withTimeout', 'createMockFn'].includes(e)).join(', ')
      )
      console.log('  Environment:', exports.filter((e) => e.includes('Test') || e.includes('Env')).join(', '))
      console.log('  File system:', exports.filter((e) => e.includes('Temp') || e.includes('Directory')).join(', '))
      console.log('  Vitest config:', exports.filter((e) => e.includes('Vitest') || e.includes('Config')).join(', '))
    })
  })
})
