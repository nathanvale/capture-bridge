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

import { setupResourceCleanup } from '@orchestr8/testkit/config'
import { cleanupAllResources } from '@orchestr8/testkit/utils'
import { afterAll } from 'vitest'

// Configure automatic resource cleanup
// This hooks into Vitest's lifecycle to clean up after each test and test file
await setupResourceCleanup({
  cleanupAfterEach: true, // Clean up after each individual test
  cleanupAfterAll: true, // Clean up after all tests in a file
  enableLeakDetection: true, // Enable SQLite Guard for automatic leak detection and cleanup (TestKit 2.1.0+)
  logStats: process.env['LOG_CLEANUP_STATS'] === '1', // Log cleanup statistics if env var set
})

// Process listener cleanup function (shared between afterAll and exit handler)
const cleanupProcessListeners = () => {
  const events = [
    'exit',
    'SIGINT',
    'SIGTERM',
    'SIGHUP',
    'SIGQUIT',
    'beforeExit',
    'uncaughtException',
    'unhandledRejection',
  ] as const

  for (const event of events) {
    process.removeAllListeners(event)
  }
}

// Add global afterAll hook for comprehensive cleanup
// This ensures all resources are cleaned up even if individual tests miss cleanup
afterAll(async () => {
  await cleanupAllResources()

  // CRITICAL FIX Part 1: Clean up process listeners in fork workers
  // TestKit's register.ts only calls removeAllProcessListeners() in afterEach,
  // but NOT in afterAll. This leaves process event listeners attached after the entire suite
  // finishes in fork workers.
  // eslint-disable-next-line no-console -- Intentional debug log for test infrastructure
  console.log('[DEBUG] Cleaning up process listeners in global afterAll (fork worker)')
  cleanupProcessListeners()
})

// CRITICAL FIX Part 2: Clean up process listeners in parent process
// With Vitest's fork pool, the parent coordinator process never executes afterAll hooks.
// We need a process.on('exit') handler to clean up when the parent process exits.
// This resolves the architectural issue where 98 file handles remain open permanently.
// See: docs/backlog/UPGRADE-CLEANUP.md (TestKit 2.1.1 Process Listener Fix)
process.on('exit', () => {
  console.log('[DEBUG] Cleaning up process listeners on process exit (parent coordinator)')
  cleanupProcessListeners()
})

console.log('✅ TestKit resource cleanup configured (foundation package)')
