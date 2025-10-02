import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/capture',
      environment: 'node',

      // Bootstrap sequence (order matters!)
      setupFiles: [
        '@orchestr8/testkit/register',  // 1. TestKit bootstrap
        './test-setup.ts',               // 2. Resource cleanup config
      ],

      // Prevent zombie processes and hanging tests
      reporters: process.env.CI ? ['default'] : ['default', 'hanging-process'],

      // Timeout configuration
      testTimeout: 10000,      // 10s per test
      hookTimeout: 5000,       // 5s for hooks
      teardownTimeout: 20000,  // 20s for cleanup

      // Fork pool for process isolation
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
          maxForks: process.env.CI ? 2 : 4,
          minForks: 1,
          execArgv: ['--max-old-space-size=1024'],
        },
      },
    },
  })
)
