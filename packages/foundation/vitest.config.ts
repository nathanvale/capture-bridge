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
      reporters: process.env['CI'] ? ['default'] : ['default', 'hanging-process'],

      // Timeout configuration
      testTimeout: 10000, // 10s per test (doubled for database/file tests)
      hookTimeout: 5000, // 5s for beforeEach/afterEach
      teardownTimeout: 120000, // 120s for final cleanup (handles file handles from pool tests)

      // Fork pool for process isolation (prevents cross-test leaks)
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
          maxForks: process.env['CI'] ? 2 : 6, // Increased from 4 to 6 (no performance regression, better scalability for future tests)
          minForks: 1,
          // Memory limit per worker (512MB default, 1GB for DB tests)
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
          '**/vitest.projects.ts',
          '**/test-hook.ts',
          '**/test-prettier.ts',
          '**/tsup.config.ts',
          '**/wallaby.cjs',
        ],
        // Include only actual source code
        include: ['src/**/*.ts'],
        all: true,
        // Quality gate thresholds (enforced in CI workflow, not during test runs)
        // Note: This is a test-focused package with minimal source code
        // Thresholds apply to src/index.ts and any future source files
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
          // Don't auto-fail on threshold violations during test runs
          autoUpdate: false,
          perFile: false,
        },
      },
    },
  })
)
