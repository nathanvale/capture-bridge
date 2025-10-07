import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/obsidian-bridge',
      environment: 'node',

      // Bootstrap sequence (order matters!)
      setupFiles: [
        // 1. TestKit bootstrap (process mocking, cleanup handlers)
        '@orchestr8/testkit/register',
        // 2. Our setup (resource cleanup configuration)
        './test-setup.ts',
      ],

      // Prevent zombie processes and hanging tests
      reporters: process.env['CI'] ? ['default'] : ['default', 'hanging-process'],

      // Timeout configuration
      testTimeout: 10000, // 10s per test
      hookTimeout: 5000, // 5s for beforeEach/afterEach
      teardownTimeout: 60000, // 60s for final cleanup

      // Fork pool for process isolation (prevents cross-test leaks)
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
          maxForks: process.env['CI'] ? 2 : 6,
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
          autoUpdate: false,
          perFile: false,
        },
      },
    },
  })
)
