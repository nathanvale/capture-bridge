/**
 * Performance tests for atomic file writer
 * Following TestKit 2.0.0 patterns from foundation package
 * Part of ATOMIC_FILE_WRITER--T02 - AC07
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Atomic Writer Performance', () => {
  let tempDir: any // TestKit TempDirectory object with helper methods

  beforeEach(async () => {
    // ✅ Use TestKit's createTempDirectory (dynamic import)
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    tempDir = await createTempDirectory()
  })

  afterEach(async () => {
    // TestKit handles temp directory cleanup automatically!
    // Following the 4-step cleanup sequence from testkit-tdd-guide.md

    // 0. Settling delay (prevents race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // TestKit auto-cleanup handles the temp directory
    // No manual rmSync needed!

    // Force GC if available (last step)
    if (global.gc) global.gc()
  })

  describe('AC07: Performance requirement', () => {
    it('should complete write in < 50ms p95 for 1KB file', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')
      const { ulid } = await import('ulid')
      const content = 'x'.repeat(1024) // 1KB
      const times: number[] = []

      // Run 100 iterations
      for (let i = 0; i < 100; i++) {
        const captureId = ulid()
        const start = performance.now()
        await writeAtomic(captureId, content, tempDir.path)
        const duration = performance.now() - start
        times.push(duration)
      }

      // Calculate p95
      times.sort((a, b) => a - b)
      const p95Index = Math.floor(times.length * 0.95)
      // eslint-disable-next-line security/detect-object-injection, @typescript-eslint/no-non-null-assertion -- Safe: index calculated from non-empty array (100 items)
      const p95 = times[p95Index]!

      // eslint-disable-next-line no-console
      console.log(`✅ p95 latency: ${p95.toFixed(2)}ms`)
      expect(p95).toBeLessThan(50)
    }, 30000) // Extended timeout for performance test

    it('should maintain performance with collision detection', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')
      const { ulid } = await import('ulid')
      const content = 'x'.repeat(1024) // 1KB
      const times: number[] = []
      const captureIds: string[] = []

      // Pre-write some files to test collision detection performance
      for (let i = 0; i < 10; i++) {
        const captureId = ulid()
        captureIds.push(captureId)
        await writeAtomic(captureId, content, tempDir.path)
      }

      // Test duplicate detection performance (should be fast)
      for (let i = 0; i < 50; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe: index is modulo 10, captureIds has exactly 10 elements
        const captureId = captureIds[i % 10]! // Reuse existing IDs for duplicate detection
        const start = performance.now()
        await writeAtomic(captureId, content, tempDir.path) // These should be skipped
        const duration = performance.now() - start
        times.push(duration)
      }

      // Calculate p95
      times.sort((a, b) => a - b)
      const p95Index = Math.floor(times.length * 0.95)
      // eslint-disable-next-line security/detect-object-injection, @typescript-eslint/no-non-null-assertion -- Safe: index calculated from non-empty array (50 items)
      const p95 = times[p95Index]!

      // eslint-disable-next-line no-console
      console.log(`✅ p95 latency with collision detection: ${p95.toFixed(2)}ms`)
      expect(p95).toBeLessThan(50) // Should still meet performance target
    }, 30000)

    it('should handle small files efficiently', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')
      const { ulid } = await import('ulid')
      const content = 'Small content' // Very small file
      const times: number[] = []

      // Run 100 iterations with small files
      for (let i = 0; i < 100; i++) {
        const captureId = ulid()
        const start = performance.now()
        await writeAtomic(captureId, content, tempDir.path)
        const duration = performance.now() - start
        times.push(duration)
      }

      // Calculate statistics
      times.sort((a, b) => a - b)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe: index calculated from non-empty array (100 items)
      const median = times[Math.floor(times.length / 2)]!
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe: index calculated from non-empty array (100 items)
      const p95 = times[Math.floor(times.length * 0.95)]!
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Safe: index calculated from non-empty array (100 items)
      const p99 = times[Math.floor(times.length * 0.99)]!

      // eslint-disable-next-line no-console
      console.log(`✅ Small file performance stats:`)
      // eslint-disable-next-line no-console
      console.log(`   Median: ${median.toFixed(2)}ms`)
      // eslint-disable-next-line no-console
      console.log(`   p95: ${p95.toFixed(2)}ms`)
      // eslint-disable-next-line no-console
      console.log(`   p99: ${p99.toFixed(2)}ms`)

      expect(p95).toBeLessThan(50)
      expect(median).toBeLessThan(20) // Median should be even faster
    })
  })
})
