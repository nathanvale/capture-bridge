/**
 * Global test setup for foundation package
 *
 * This file configures automatic resource cleanup for all tests using TestKit's
 * resource management system. This ensures proper cleanup of:
 * - Database connections and pools
 * - Temporary files and directories
 * - Child processes
 * - Event listeners
 * - File descriptors
 */

import { afterAll } from 'vitest'
import { setupResourceCleanup } from '@orchestr8/testkit/config'
import { cleanupAllResources } from '@orchestr8/testkit/utils'

// Configure automatic resource cleanup
// This hooks into Vitest's lifecycle to clean up after each test and test file
await setupResourceCleanup({
  cleanupAfterEach: true,   // Clean up after each individual test
  cleanupAfterAll: true,    // Clean up after all tests in a file
  enableLeakDetection: true, // Detect and warn about resource leaks
  logStats: process.env.LOG_CLEANUP_STATS === '1', // Log cleanup statistics if env var set
})

// Add global afterAll hook for comprehensive cleanup
// This ensures all resources are cleaned up even if individual tests miss cleanup
afterAll(async () => {
  await cleanupAllResources()
})

console.log('✅ TestKit resource cleanup configured (foundation package)')
