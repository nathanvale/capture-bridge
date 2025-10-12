import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createBaseVitestConfig({
    resolve: {
      conditions: ['@capture-bridge/source', 'import', 'default'],
    },
    test: {
      name: '@capture-bridge/cli',
      environment: 'node',

      // Bootstrap sequence (order matters!)
      setupFiles: [
        '@orchestr8/testkit/register', // 1. TestKit bootstrap
        '@orchestr8/testkit/setup', // 2. Pre-configured resource cleanup
      ],

      // Prevent zombie processes and hanging tests
      reporters: process.env.CI ? ['default'] : ['default', 'hanging-process'],

      // Timeout configuration
      testTimeout: 10000, // 10s per test
      hookTimeout: 5000, // 5s for hooks
      teardownTimeout: 10000, // 10s for cleanup (TestKit 2.1.2 enables natural exit)

      // Fork pool for process isolation
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
          maxForks: process.env['CI'] ? 4 : 6, // CI: 4 workers for ubuntu-latest 4-core runners
          minForks: 1,
          execArgv: ['--max-old-space-size=1024'],
        },
      },

      // Coverage configuration with quality gates
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'json-summary', 'html'],
        reportsDirectory: './coverage',
        exclude: [
          'node_modules/**',
          'dist/**',
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/test-setup.ts',
          '**/__tests__/**',
          '**/vitest.config.ts',
          '**/tsup.config.ts',
        ],
        include: ['src/**/*.ts'],
        all: true,
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
      },
    },
  })
)
