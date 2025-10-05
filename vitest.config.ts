import { defineConfig } from 'vitest/config'
import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { getVitestProjects } from './vitest.projects.js'

/**
 * Root Vitest config that extends base configuration for Wallaby compatibility.
 * Ensures Wallaby picks up all project configurations and TestKit settings.
 */
export default defineConfig(
  createBaseVitestConfig({
    test: {
      // Use projects for multi-package testing
      projects: getVitestProjects(),
      // Override root-specific settings while preserving base config
      name: 'root',
      root: '.',
      environment: 'node',
      include: ['*.test.ts', 'tests/**/*.test.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/*.integration.test.*',
      ],
      // Override coverage to exclude root-level config files
      coverage: {
        enabled: process.env['CI'] === 'true',
        provider: 'v8' as const,
        reporter:
          process.env['CI'] === 'true'
            ? ['lcov', 'json-summary', 'json', 'text']
            : ['text', 'html'],
        reportsDirectory: './coverage',
        exclude: [
          'node_modules/',
          'dist/',
          'coverage/',
          '**/*.d.ts',
          '**/*.config.*',
          '**/index.ts',
          // Exclude root-level config files that shouldn't be counted
          'vitest.*.ts',
          'wallaby.cjs',
          '.github/**',
          'scripts/**',
          'packages/*/dist/**',
          'packages/**/node_modules/**',
        ],
        // Adjust thresholds as needed for the monorepo
        thresholds: {
          statements: 39,
          branches: 39,
          functions: 39,
          lines: 39,
        },
      },
    },
  }),
)
