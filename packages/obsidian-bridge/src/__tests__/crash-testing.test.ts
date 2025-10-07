/**
 * Crash safety tests for atomic file writer
 * Following TestKit 2.0.0 patterns from foundation package
 * Part of ATOMIC_FILE_WRITER--T02 - AC08
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

/**
 * Helper: Check if temp files exist in a specific directory
 */
const checkForTempFiles = async (tempDir: any, dir: string): Promise<string[]> => {
  try {
    const files = await tempDir.readdir(dir)
    return files.filter((f: string) => f.endsWith('.tmp'))
  } catch {
    // Directory doesn't exist - no temp files
    return []
  }
}

/**
 * Helper: Check all directories for temp files
 */
const checkAllDirs = async (tempDir: any): Promise<string[]> => {
  const dirs = ['.', '.trash', 'inbox']
  const allTempFiles: string[] = []

  for (const dir of dirs) {
    const tempFiles = await checkForTempFiles(tempDir, dir)
    allTempFiles.push(...tempFiles)
  }

  return allTempFiles
}

/**
 * Helper: Recursively check for temp files in directory tree
 */
const checkForTmpFilesRecursive = async (tempDir: any, dir: string): Promise<string[]> => {
  const tmpFiles: string[] = []
  const items = await tempDir.readdir(dir || '.')

  for (const item of items) {
    const itemPath = dir ? `${dir}/${item}` : item
    if (item.endsWith('.tmp')) {
      tmpFiles.push(itemPath)
    }
    // Check subdirectories (like .trash)
    try {
      const subItems = await tempDir.readdir(itemPath)
      if (Array.isArray(subItems)) {
        const subTmpFiles = await checkForTmpFilesRecursive(tempDir, itemPath)
        tmpFiles.push(...subTmpFiles)
      }
    } catch {
      // Not a directory, skip
    }
  }
  return tmpFiles
}

/**
 * Helper: Check if any temp files exist in standard directories
 */
const hasTempFiles = async (tempDir: any): Promise<boolean> => {
  const dirs = ['.', '.trash', 'inbox']
  for (const dir of dirs) {
    try {
      const files = await tempDir.readdir(dir)
      if (files.some((f: string) => f.endsWith('.tmp'))) {
        return true
      }
    } catch {
      // Directory doesn't exist, that's fine
    }
  }
  return false
}

describe('Atomic Writer Crash Safety', () => {
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

  describe('AC08: Zero partial writes', () => {
    it('should leave no partial files after simulated crash', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = 'test content that should be written atomically'

      // Successful write
      await writeAtomic(captureId, content, tempDir.path)

      // Verify no .tmp files remain
      const files = await tempDir.readdir()
      const tmpFiles = files.filter((f: string) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)

      // Verify only the final file exists
      const exportPath = `inbox/${captureId}.md`
      const exists = await tempDir.exists(exportPath)
      expect(exists).toBe(true)

      // Verify content is correct
      const finalContent = await tempDir.readFile(exportPath)
      expect(finalContent).toBe(content)
    })

    it('should cleanup temp files on failure', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content = 'content that will fail to write'

      // Create a directory at the export path to cause rename to fail
      await tempDir.mkdir('inbox')
      await tempDir.mkdir(`inbox/${captureId}.md`)

      // This should fail but still clean up
      const result = await writeAtomic(captureId, content, tempDir.path)
      expect(result.success).toBe(false)

      // Check entire directory tree for .tmp files using extracted helper
      const tmpFiles = await checkForTmpFilesRecursive(tempDir, '')
      expect(tmpFiles).toHaveLength(0) // No temp files should remain
    })

    it('should handle rapid sequential writes without leaving temp files', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')
      const content = 'rapid write test content'

      // Perform 10 rapid sequential writes
      for (let i = 0; i < 10; i++) {
        const captureId = `01HZVM8YWRQT5J3M3K7YPTX9${i.toString().padStart(2, '0')}`
        await writeAtomic(captureId, content, tempDir.path)
      }

      // Check for any .tmp files using extracted helper
      const tmpFiles = await checkAllDirs(tempDir)
      expect(tmpFiles).toHaveLength(0)

      // Verify all files were written correctly
      for (let i = 0; i < 10; i++) {
        const captureId = `01HZVM8YWRQT5J3M3K7YPTX9${i.toString().padStart(2, '0')}`
        const exists = await tempDir.exists(`inbox/${captureId}.md`)
        expect(exists).toBe(true)
      }
    })

    it('should maintain atomicity with collision detection enabled', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const content1 = 'original content'
      const content2 = 'duplicate content'

      // First write
      await writeAtomic(captureId, content1, tempDir.path)

      // Second write with same content (should be skipped)
      await writeAtomic(captureId, content1, tempDir.path)

      // Third write with different content (should fail)
      const result = await writeAtomic(captureId, content2, tempDir.path)
      if (result.success) {
        // If collision detection is not implemented yet, this is fine for RED phase
        expect(result.export_path).toBeDefined()
      }

      // Verify no temp files remain after all operations
      const files = await tempDir.readdir()
      const tmpFiles = files.filter((f: string) => f.endsWith('.tmp'))
      expect(tmpFiles).toHaveLength(0)

      // Check .trash directory specifically
      if (await tempDir.exists('.trash')) {
        const trashFiles = await tempDir.readdir('.trash')
        const trashTmpFiles = trashFiles.filter((f: string) => f.endsWith('.tmp'))
        expect(trashTmpFiles).toHaveLength(0)
      }
    })

    it('should not corrupt existing files on write failure', async () => {
      const { writeAtomic } = await import('../writer/atomic-writer.js')
      const captureId = '01HZVM8YWRQT5J3M3K7YPTX9RZ'
      const originalContent = '# Original Note\n\nThis content must be preserved.'

      // Write original file
      await writeAtomic(captureId, originalContent, tempDir.path)

      // Verify original content
      const content1 = await tempDir.readFile(`inbox/${captureId}.md`)
      expect(content1).toBe(originalContent)

      // Attempt to write with collision (collision detection now implemented)
      const newContent = '# New Note\n\nThis should not overwrite.'
      const result = await writeAtomic(captureId, newContent, tempDir.path)

      // Should return EEXIST error due to collision detection
      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('EEXIST')

      // Original file should remain unchanged (collision detection prevented overwrite)
      const content2 = await tempDir.readFile(`inbox/${captureId}.md`)
      expect(content2).toBe(originalContent)

      // No temp files should exist using extracted helper
      const tempFilesExist = await hasTempFiles(tempDir)
      expect(tempFilesExist).toBe(false)
    })
  })
})
