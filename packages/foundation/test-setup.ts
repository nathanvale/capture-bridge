/**
 * Global test setup for foundation package
 */

import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: process.env.LOG_CLEANUP_STATS === '1',
})

console.log('✅ TestKit resource cleanup configured (foundation package)')
