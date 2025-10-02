import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/foundation',
      environment: 'node',

      // Bootstrap sequence (order matters!)
      setupFiles: [
        // 1. TestKit bootstrap (process mocking, cleanup handlers)
        '@orchestr8/testkit/register',
        // 2. Our setup (resource cleanup configuration)
        './test-setup.ts',
      ],

      // Prevent zombie processes and hanging tests
      reporters: process.env.CI ? ['default'] : ['default', 'hanging-process'],

      // Timeout configuration
      testTimeout: 10000,      // 10s per test (doubled for database/file tests)
      hookTimeout: 5000,       // 5s for beforeEach/afterEach
      teardownTimeout: 20000,  // 20s for final cleanup

      // Fork pool for process isolation (prevents cross-test leaks)
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
          maxForks: process.env.CI ? 2 : 4,  // Limit workers in CI
          minForks: 1,
          // Memory limit per worker (512MB default, 1GB for DB tests)
          execArgv: ['--max-old-space-size=1024'],
        },
      },
    },
  })
)
