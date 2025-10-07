/**
 * Global test setup for obsidian-bridge package
 */

import { afterAll } from 'vitest'
import { setupResourceCleanup } from '@orchestr8/testkit/config'
import { cleanupAllResources } from '@orchestr8/testkit/utils'

// Configure automatic resource cleanup
await setupResourceCleanup({
  cleanupAfterEach: true, // Clean up after each individual test
  cleanupAfterAll: true, // Clean up after all tests in a file
  enableLeakDetection: true, // Detect and warn about resource leaks
  logStats: process.env['LOG_CLEANUP_STATS'] === '1', // Log cleanup statistics
})

// Add global afterAll hook for comprehensive cleanup
afterAll(async () => {
  await cleanupAllResources()
})

console.log('✅ TestKit resource cleanup configured (obsidian-bridge package)')
