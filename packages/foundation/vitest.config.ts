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
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
        },
      },
    },
  })
)
