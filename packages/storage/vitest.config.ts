import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/storage',
      environment: 'node',

      // Bootstrap sequence (order matters!)
      setupFiles: [
        '@orchestr8/testkit/register', // 1. TestKit bootstrap
        '@orchestr8/testkit/setup', // 2. Pre-configured resource cleanup
      ],

      // Prevent zombie processes and hanging tests
      // CI: basic reporter for clean logs + hanging-process for zombie detection
      // Local: default reporter for detailed output + hanging-process
      reporters: process.env['CI'] ? ['basic', 'hanging-process'] : ['default', 'hanging-process'],

      // Test isolation (disabled for 20-30% speedup, safe with TestKit cleanup)
      isolate: false,

      // Timeout configuration
      testTimeout: 10000, // 10s per test
      hookTimeout: 5000, // 5s for hooks
      teardownTimeout: 10000, // 10s for cleanup (TestKit 2.1.2 enables natural exit)

      // Fork pool for process isolation
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
          maxForks: process.env['CI'] ? 2 : 6, // Increased from 4 to 6 for better parallelization
          minForks: 1,
          execArgv: ['--max-old-space-size=1024'],
        },
      },

      // Coverage configuration
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
          '**/example.ts', // Exclude example file from coverage
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
