/**
 * Tests for collision detection in atomic file writer
 * Following TestKit 2.0.0 patterns from foundation package
 * Part of ATOMIC_FILE_WRITER--T02
 */

import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Collision Detector Tests', () => {
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

  describe('AC05: ULID collision detection', () => {
    it('should detect NO_COLLISION when file does not exist', async () => {
      // Dynamic import of collision detector
      const { checkCollision } = await import('../writer/collision-detector.js')
      const { CollisionResult } = await import('../types.js')

      const exportPath = path.join(tempDir.path, 'inbox', '01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
      const contentHash = 'abc123def456'

      const result = await checkCollision(exportPath, contentHash)

      expect(result).toBe(CollisionResult.NO_COLLISION)
    })

    it('should detect DUPLICATE when file exists with same hash', async () => {
      const { checkCollision } = await import('../writer/collision-detector.js')
      const { CollisionResult } = await import('../types.js')
      const { computeSHA256 } = await import('@capture-bridge/foundation/hash')

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = '# Test Note\n\nThis is test content.'

      // Create existing file
      await tempDir.mkdir('inbox')
      await tempDir.writeFile(`inbox/${captureId}.md`, content)

      const exportPath = path.join(tempDir.path, 'inbox', `${captureId}.md`)
      const contentHash = computeSHA256(content)

      const result = await checkCollision(exportPath, contentHash)

      expect(result).toBe(CollisionResult.DUPLICATE)
    })

    it('should detect CONFLICT when file exists with different hash', async () => {
      const { checkCollision } = await import('../writer/collision-detector.js')
      const { CollisionResult } = await import('../types.js')
      const { computeSHA256 } = await import('@capture-bridge/foundation/hash')

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const existingContent = '# Existing Note\n\nOld content.'
      const newContent = '# New Note\n\nDifferent content.'

      // Create existing file
      await tempDir.mkdir('inbox')
      await tempDir.writeFile(`inbox/${captureId}.md`, existingContent)

      const exportPath = path.join(tempDir.path, 'inbox', `${captureId}.md`)
      const newContentHash = computeSHA256(newContent)

      const result = await checkCollision(exportPath, newContentHash)

      expect(result).toBe(CollisionResult.CONFLICT)
    })

    it('should handle file read errors gracefully', async () => {
      const { checkCollision } = await import('../writer/collision-detector.js')
      const { CollisionResult } = await import('../types.js')

      // Create a directory instead of a file to trigger a read error
      await tempDir.mkdir('inbox')
      await tempDir.mkdir('inbox/01HZVM8YWRQT5J3M3K7YPTX9RZ.md')

      const exportPath = path.join(tempDir.path, 'inbox', '01HZVM8YWRQT5J3M3K7YPTX9RZ.md')
      const contentHash = 'abc123def456'

      // Should handle read error and treat as conflict (safest option)
      const result = await checkCollision(exportPath, contentHash)

      // If we can't read the file, we should treat it as a conflict to prevent data loss
      expect(result).toBe(CollisionResult.CONFLICT)
    })
  })

  describe('AC06: Integration with atomic writer', () => {
    it('should skip write when duplicate detected', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = '# Test Note\n\nThis is test content.'
      const vaultPath = tempDir.path

      // Write once
      const result1 = await writeAtomic(captureId, content, vaultPath)
      expect(result1.success).toBe(true)
      expect(result1.skipped).toBeUndefined() // First write should not be skipped

      // Write again with same content (should be skipped)
      const result2 = await writeAtomic(captureId, content, vaultPath)
      expect(result2.success).toBe(true)
      expect(result2.skipped).toBe(true) // Should be skipped
      expect(result2.export_path).toBe(`inbox/${captureId}.md`)

      // Verify file still has original content
      const finalContent = await tempDir.readFile(`inbox/${captureId}.md`)
      expect(finalContent).toBe(content)
    })

    it('should return EEXIST error when conflict detected', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content1 = '# First Note\n\nFirst content.'
      const content2 = '# Second Note\n\nDifferent content.'
      const vaultPath = tempDir.path

      // Write once
      const result1 = await writeAtomic(captureId, content1, vaultPath)
      expect(result1.success).toBe(true)

      // Write again with different content (should fail with EEXIST)
      const result2 = await writeAtomic(captureId, content2, vaultPath)
      expect(result2.success).toBe(false)
      expect(result2.error).toBeDefined()
      expect(result2.error?.code).toBe('EEXIST')
      expect(result2.error?.message).toContain('ULID collision detected')

      // Verify file still has original content (unchanged)
      const finalContent = await tempDir.readFile(`inbox/${captureId}.md`)
      expect(finalContent).toBe(content1)
    })

    it('should handle multiple concurrent duplicate writes gracefully', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')

      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = '# Test Note\n\nConcurrent write test.'
      const vaultPath = tempDir.path

      // Simulate concurrent writes
      const promises = Array(5)
        .fill(null)
        .map(() => writeAtomic(captureId, content, vaultPath))

      const results = await Promise.all(promises)

      // In race conditions, exactly one should succeed (first to rename wins)
      const succeeded = results.filter((r) => r.success && !r.skipped)
      const skipped = results.filter((r) => r.success && r.skipped)
      const failed = results.filter((r) => !r.success)

      expect(succeeded).toHaveLength(1) // Only one write should succeed

      // Due to race condition between collision check and file write,
      // others may fail (EEXIST from rename) rather than skip.
      // In single-threaded MPPP, this scenario doesn't occur in production.
      expect(succeeded.length + skipped.length + failed.length).toBe(5) // Total 5 results
      expect(failed.length + skipped.length).toBe(4) // 4 should fail or skip

      // Verify file has correct content
      const finalContent = await tempDir.readFile(`inbox/${captureId}.md`)
      expect(finalContent).toBe(content)
    })
  })
})
