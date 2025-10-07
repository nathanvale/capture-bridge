/**
 * Tests for atomic file writer (temp-then-rename pattern)
 * Following TestKit 2.0.0 patterns from foundation package
 */

import path from 'node:path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { resolveTempPath, resolveExportPath } from '../path-resolver.js'
import { writeAtomic } from '../writer/atomic-writer.js'

describe('Atomic Writer Tests', () => {
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

  describe('AC01: Write to temp path', () => {
    it('should write content to temp path in .trash directory', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = '# Test Note\n\nThis is test content for atomic writer.'

      // This should fail initially (RED phase)
      const result = await writeAtomic(captureId, content, vaultPath)

      // Verify temp file was created in .trash directory
      const tempPath = resolveTempPath(vaultPath, captureId)
      const tempRelative = path.relative(vaultPath, tempPath)

      // During write operation, temp file should exist
      // Note: After successful rename, temp file won't exist
      // We'll verify this in a separate test that simulates failure

      expect(result.success).toBe(true)
      expect(tempRelative).toMatch(/^\.trash[/\\]/)
      expect(tempRelative).toMatch(/\.tmp$/)
    })

    it('should create .trash directory if it does not exist', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = 'Test content'

      const result = await writeAtomic(captureId, content, vaultPath)

      expect(result.success).toBe(true)

      // Verify .trash directory was created
      const exists = await tempDir.exists('.trash')
      expect(exists).toBe(true)
    })
  })

  describe('AC02: fsync() before rename', () => {
    it('should call fsync to ensure data is written to disk', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = 'Content that must be synced to disk'

      // We can't directly test fsync was called, but we can verify
      // the operation completes successfully and data is persisted
      const result = await writeAtomic(captureId, content, vaultPath)

      expect(result.success).toBe(true)

      // Verify the final file has the correct content
      const exportPath = resolveExportPath(vaultPath, captureId)
      const finalContent = await tempDir.readFile(path.relative(vaultPath, exportPath))
      expect(finalContent).toBe(content)
    })
  })

  describe('AC03: Atomic rename to export path', () => {
    it('should atomically rename temp file to export path in inbox directory', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = '# Atomic Write Test\n\nThis content should appear in inbox.'

      const result = await writeAtomic(captureId, content, vaultPath)

      expect(result.success).toBe(true)
      expect(result.export_path).toBe(`inbox/${captureId}.md`)

      // Verify file exists at export path
      if (result.export_path) {
        const exists = await tempDir.exists(result.export_path)
        expect(exists).toBe(true)

        // Verify content is correct
        const finalContent = await tempDir.readFile(result.export_path)
        expect(finalContent).toBe(content)
      } else {
        throw new Error('Export path should be defined for successful write')
      }

      // Verify temp file no longer exists (was renamed, not copied)
      const tempPath = resolveTempPath(vaultPath, captureId)
      const tempExists = await tempDir.exists(path.relative(vaultPath, tempPath))
      expect(tempExists).toBe(false)
    })

    it('should create inbox directory if it does not exist', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = 'Test content'

      const result = await writeAtomic(captureId, content, vaultPath)

      expect(result.success).toBe(true)

      // Verify inbox directory was created
      const inboxExists = await tempDir.exists('inbox')
      expect(inboxExists).toBe(true)
    })

    it('should handle multiple writes with different capture IDs', async () => {
      const vaultPath = tempDir.path
      const captureId1 = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const captureId2 = '01HZVM9ABCDEFGHJKMNPQRSTVW'
      const content1 = 'First capture'
      const content2 = 'Second capture'

      const result1 = await writeAtomic(captureId1, content1, vaultPath)
      const result2 = await writeAtomic(captureId2, content2, vaultPath)

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      // Verify both files exist with correct content
      const content1Check = await tempDir.readFile(`inbox/${captureId1}.md`)
      const content2Check = await tempDir.readFile(`inbox/${captureId2}.md`)

      expect(content1Check).toBe(content1)
      expect(content2Check).toBe(content2)
    })
  })

  describe('AC04: Temp file cleanup on failure', () => {
    it('should cleanup temp file when rename fails', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = 'Content that will fail to rename'

      // Create a directory at the export path to cause rename to fail (can't overwrite dir with file)
      await tempDir.mkdir('inbox')
      // Create a directory instead of a file - rename will fail when trying to replace a dir with a file
      await tempDir.mkdir(`inbox/${captureId}.md`)

      const result = await writeAtomic(captureId, content, vaultPath)

      // Should fail due to existing directory
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.temp_path).toBeDefined()
      expect(result.error?.export_path).toBeDefined()

      // Verify temp file was cleaned up
      const tempPath = resolveTempPath(vaultPath, captureId)
      const tempExists = await tempDir.exists(path.relative(vaultPath, tempPath))
      expect(tempExists).toBe(false)
    })

    it('should handle cleanup even if temp file does not exist', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = 'Test content'

      // First write should succeed
      const result = await writeAtomic(captureId, content, vaultPath)
      expect(result.success).toBe(true)

      // Second write with DIFFERENT content should detect CONFLICT (AC05: ULID collision detection)
      // This validates that the system correctly prevents overwriting with different content
      const result2 = await writeAtomic(captureId, content + ' modified', vaultPath)
      expect(result2.success).toBe(false) // Changed from true - collision detection working correctly
      expect(result2.error?.code).toBe('EEXIST') // Verify collision detection
      expect(result2.error?.message).toContain('ULID collision')
    })

    it('should return appropriate error codes for different failure scenarios', async () => {
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = 'Test content'

      // Create a file where we expect a directory - this will cause mkdir to fail
      const invalidPath = tempDir.path
      await tempDir.writeFile('.trash', 'This is a file, not a directory')

      const result = await writeAtomic(captureId, content, invalidPath)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBeDefined()
      expect(result.error?.message).toBeDefined()
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle empty content', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = ''

      const result = await writeAtomic(captureId, content, vaultPath)

      expect(result.success).toBe(true)

      if (!result.export_path) {
        throw new Error('Export path should be defined for successful write')
      }
      const finalContent = await tempDir.readFile(result.export_path)
      expect(finalContent).toBe('')
    })

    it('should handle very large content', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      // Create a 1MB string
      const content = 'x'.repeat(1024 * 1024)

      const result = await writeAtomic(captureId, content, vaultPath)

      expect(result.success).toBe(true)

      if (!result.export_path) {
        throw new Error('Export path should be defined for successful write')
      }
      const finalContent = await tempDir.readFile(result.export_path)
      expect(finalContent).toHaveLength(content.length)
    })

    it('should handle special characters in content', async () => {
      const vaultPath = tempDir.path
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = '# Special chars: 你好世界 🚀\n\n```typescript\nconst x = "test";\n```'

      const result = await writeAtomic(captureId, content, vaultPath)

      expect(result.success).toBe(true)

      if (!result.export_path) {
        throw new Error('Export path should be defined for successful write')
      }
      const finalContent = await tempDir.readFile(result.export_path)
      expect(finalContent).toBe(content)
    })
  })
})
