import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/capture',
      environment: 'node',

      // Bootstrap sequence
      setupFiles: ['@orchestr8/testkit/register', './test-setup.ts'],

      // Prevent zombie processes
      reporters: process.env.CI ? ['default'] : ['default', 'hanging-process'],
      pool: 'forks',
    },
  })
)
