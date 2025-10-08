import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { VoicePoller } from './voice-poller.js'

import type { VoicePollerConfig, DatabaseClient, DeduplicationService } from './types.js'

// Mock the foundation module
vi.mock('@capture-bridge/foundation', () => ({
  computeAudioFingerprint: vi.fn(),
}))

describe('VoicePoller', () => {
  const pollers: Array<{ shutdown: () => Promise<void> }> = []
  const databases: Array<{ close: () => void }> = []

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.clearAllTimers()
    vi.useRealTimers()

    // Custom resource cleanup (VoicePoller has setInterval)
    for (const poller of pollers) {
      await poller.shutdown()
    }
    pollers.length = 0

    // Settle to prevent race conditions
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Close databases
    for (const db of databases) {
      try {
        db.close()
      } catch {
        // Intentionally empty - ignore errors during cleanup
      }
    }
    databases.length = 0

    // Force GC if available
    if (global.gc) global.gc()
  })

  it('should initialize with default poll interval of 30000ms [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      sequential: true,
      // No pollInterval specified - should default to 30000
    }

    // Act
    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)

    // Assert
    expect(poller).toBeDefined()
    // @ts-expect-error - accessing private property for testing
    expect(poller.config.pollInterval).toBe(30000)
  })

  it('should accept custom poll interval from config [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      pollInterval: 60000, // Custom 60 second interval
      sequential: true,
    }

    // Act
    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)

    // Assert
    // @ts-expect-error - accessing private property for testing
    expect(poller.config.pollInterval).toBe(60000)
  })

  it('should have pollOnce method that returns VoicePollResult [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {
      run: vi.fn(),
    } as unknown as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      sequential: true,
    }

    // Act
    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)

    // Mock scanVoiceMemos to return empty array to avoid ENOENT error
    // @ts-expect-error - accessing private method for testing
    vi.spyOn(poller, 'scanVoiceMemos').mockResolvedValue([])

    const result = await poller.pollOnce()

    // Assert
    expect(result).toMatchObject({
      filesFound: expect.any(Number),
      filesProcessed: expect.any(Number),
      duplicatesSkipped: expect.any(Number),
      errors: expect.any(Array),
      duration: expect.any(Number),
    })
  })

  it('should start continuous polling with startContinuous [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      pollInterval: 1000, // 1 second for testing
      sequential: true,
    }

    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)

    const pollOnceSpy = vi.spyOn(poller, 'pollOnce').mockResolvedValue({
      filesFound: 0,
      filesProcessed: 0,
      duplicatesSkipped: 0,
      errors: [],
      duration: 100,
    })

    // Act
    await poller.startContinuous()

    // Simulate timer advances
    await vi.advanceTimersByTimeAsync(3500) // 3.5 seconds

    // Assert
    expect(pollOnceSpy).toHaveBeenCalledTimes(4) // Initial + 3 interval calls (at 1s, 2s, 3s)
  })

  it('should be idempotent when calling startContinuous multiple times [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      pollInterval: 1000,
      sequential: true,
    }

    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)

    const pollOnceSpy = vi.spyOn(poller, 'pollOnce').mockResolvedValue({
      filesFound: 0,
      filesProcessed: 0,
      duplicatesSkipped: 0,
      errors: [],
      duration: 100,
    })

    // Act
    await poller.startContinuous()
    await poller.startContinuous() // Second call should be ignored
    await poller.startContinuous() // Third call should be ignored

    await vi.advanceTimersByTimeAsync(2500) // 2.5 seconds

    // Assert
    expect(pollOnceSpy).toHaveBeenCalledTimes(3) // Initial + 2 interval calls (at 1s, 2s)
  })

  it('should stop polling with stop method [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      pollInterval: 1000,
      sequential: true,
    }

    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)

    const pollOnceSpy = vi.spyOn(poller, 'pollOnce').mockResolvedValue({
      filesFound: 0,
      filesProcessed: 0,
      duplicatesSkipped: 0,
      errors: [],
      duration: 100,
    })

    // Act
    await poller.startContinuous()
    await vi.advanceTimersByTimeAsync(2500) // 2.5 seconds
    const callCountBeforeStop = pollOnceSpy.mock.calls.length

    await poller.stop()
    await vi.advanceTimersByTimeAsync(5000) // 5 more seconds

    // Assert
    expect(callCountBeforeStop).toBe(3) // Initial + 2 interval calls (at 1s, 2s)
    expect(pollOnceSpy).toHaveBeenCalledTimes(3) // No more calls after stop
  })

  it('should be idempotent when calling stop multiple times [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      sequential: true,
    }

    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)

    // Act & Assert - should not throw
    await expect(poller.stop()).resolves.toBeUndefined()
    await expect(poller.stop()).resolves.toBeUndefined()
    await expect(poller.stop()).resolves.toBeUndefined()
  })

  it('should handle errors in pollOnce without crashing interval [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      pollInterval: 1000,
      sequential: true,
    }

    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // Intentionally empty
    })
    let callCount = 0
    const pollOnceSpy = vi.spyOn(poller, 'pollOnce').mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        throw new Error('Poll failed!')
      }
      return Promise.resolve({
        filesFound: 0,
        filesProcessed: 0,
        duplicatesSkipped: 0,
        errors: [],
        duration: 100,
      })
    })

    // Act
    await poller.startContinuous()
    await vi.advanceTimersByTimeAsync(3500) // 3.5 seconds

    // Assert
    expect(pollOnceSpy).toHaveBeenCalledTimes(4) // Initial + 3 interval calls
    expect(consoleSpy).toHaveBeenCalledWith('Poll cycle failed:', expect.any(Error))

    // Cleanup
    consoleSpy.mockRestore()
  })

  it('should implement async shutdown method for resource cleanup [VOICE_POLLING_ICLOUD-AC01]', async () => {
    // Arrange
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()

    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {
      query: vi.fn().mockReturnValue(undefined),
      run: vi.fn(),
    } as unknown as DatabaseClient
    const mockDedup = {
      isDuplicate: vi.fn().mockResolvedValue(false),
      addFingerprint: vi.fn(),
    } as unknown as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: tempDir.path,
      pollInterval: 1000,
      sequential: true,
    }

    const poller = new VoicePoller(mockDb, mockDedup, config)

    // Act
    await poller.startContinuous()

    // Assert - shutdown should exist and stop the interval
    expect(poller.shutdown).toBeDefined()
    expect(typeof poller.shutdown).toBe('function')

    await expect(poller.shutdown()).resolves.toBeUndefined()

    // After shutdown, the interval should be cleared
    // @ts-expect-error - accessing private property for testing
    expect(poller.intervalId).toBeUndefined()
  })

  describe('File Detection [VOICE_POLLING_ICLOUD-AC02]', () => {
    it('should scan and filter only .m4a files from voice memos folder', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create test files
      await fs.writeFile(path.join(tempDir.path, 'Recording 1.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Recording 2.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Notes.txt'), 'text file')
      await fs.writeFile(path.join(tempDir.path, 'Image.png'), Buffer.alloc(50))
      await fs.writeFile(path.join(tempDir.path, 'Recording 3.mp3'), Buffer.alloc(75))

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act - This will fail because scanVoiceMemos doesn't exist yet
      // @ts-expect-error - accessing private method for testing
      const files = await poller.scanVoiceMemos()

      // Assert
      expect(files).toHaveLength(2)
      expect(files).toContain(path.join(tempDir.path, 'Recording 1.m4a'))
      expect(files).toContain(path.join(tempDir.path, 'Recording 2.m4a'))
      expect(files).not.toContain(path.join(tempDir.path, 'Notes.txt'))
      expect(files).not.toContain(path.join(tempDir.path, 'Recording 3.mp3'))
    })

    it('should return absolute paths for all scanned files', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      await fs.writeFile(path.join(tempDir.path, 'Voice 001.m4a'), Buffer.alloc(100))

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const files = await poller.scanVoiceMemos()

      // Assert
      expect(files).toHaveLength(1)
      const firstFile = files[0]
      expect(firstFile).toBeDefined()
      if (firstFile) {
        expect(path.isAbsolute(firstFile)).toBe(true)
        expect(firstFile).toBe(path.join(tempDir.path, 'Voice 001.m4a'))
      }
    })

    it('should sort scanned files alphabetically', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create files in non-alphabetical order
      await fs.writeFile(path.join(tempDir.path, 'Recording C.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Recording A.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Recording B.m4a'), Buffer.alloc(100))

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const files = await poller.scanVoiceMemos()

      // Assert
      expect(files).toEqual([
        path.join(tempDir.path, 'Recording A.m4a'),
        path.join(tempDir.path, 'Recording B.m4a'),
        path.join(tempDir.path, 'Recording C.m4a'),
      ])
    })

    it('should handle empty directory gracefully', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const files = await poller.scanVoiceMemos()

      // Assert
      expect(files).toEqual([])
    })

    it('should handle non-existent directory with error', async () => {
      // Arrange
      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/non/existent/path/to/voice/memos',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act & Assert
      // @ts-expect-error - accessing private method for testing
      await expect(poller.scanVoiceMemos()).rejects.toThrow('ENOENT')
    })
  })

  describe('Sync State Management [VOICE_POLLING_ICLOUD-AC02]', () => {
    it('should get last poll timestamp from sync_state table', async () => {
      // Arrange
      const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
      const Database = await import('better-sqlite3').then((m) => m.default)
      // Create unique database for this test to avoid shared cache issues
      const db = new Database(createMemoryUrl('raw', { autoGenerate: true }))
      databases.push(db)

      // Create sync_state table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      // Insert test data
      const testTimestamp = '2025-01-08T10:30:00Z'
      db.prepare('INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)').run(
        'voice_last_poll',
        testTimestamp,
        '2025-01-08T10:30:00Z'
      )

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql)
          return params ? stmt.get(...params) : stmt.get()
        }),
        run: vi.fn(),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const timestamp = await poller.getLastPollTimestamp()

      // Assert
      expect(timestamp).toBe(testTimestamp)
      expect(mockDbClient.query).toHaveBeenCalledWith('SELECT value FROM sync_state WHERE key = ?', ['voice_last_poll'])

      // Cleanup handled by afterEach
    })

    it('should return null when no cursor exists in sync_state', async () => {
      // Arrange
      const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
      const Database = await import('better-sqlite3').then((m) => m.default)
      // Create unique database for this test to avoid shared cache issues
      const db = new Database(createMemoryUrl('raw', { autoGenerate: true }))
      databases.push(db)

      // Create sync_state table (empty)
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql)
          return params ? stmt.get(...params) : stmt.get()
        }),
        run: vi.fn(),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const timestamp = await poller.getLastPollTimestamp()

      // Assert
      expect(timestamp).toBeUndefined()

      // Cleanup handled by afterEach
    })

    it('should update last poll timestamp in sync_state', async () => {
      // Arrange
      const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
      const Database = await import('better-sqlite3').then((m) => m.default)
      // Create unique database for this test to avoid shared cache issues
      const db = new Database(createMemoryUrl('raw', { autoGenerate: true }))
      databases.push(db)

      // Create sync_state table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)

      const mockDbClient: DatabaseClient = {
        query: vi.fn(),
        run: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql)
          return params ? stmt.run(...params) : stmt.run()
        }),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      const newTimestamp = '2025-01-08T11:00:00Z'

      // Act
      // @ts-expect-error - accessing private method for testing
      await poller.updateLastPollTimestamp(newTimestamp)

      // Assert
      expect(mockDbClient.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO sync_state'),
        expect.arrayContaining(['voice_last_poll', newTimestamp])
      )

      // Verify in actual database
      const result = db.prepare('SELECT value FROM sync_state WHERE key = ?').get('voice_last_poll')
      expect(result).toHaveProperty('value', newTimestamp)

      // Cleanup handled by afterEach
    })
  })

  describe('APFS Dataless Detection [VOICE_POLLING_ICLOUD-AC03]', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      vi.resetModules()
    })

    it('should call icloudctl check command to detect dataless files', async () => {
      // Arrange
      const childProcess = await import('node:child_process')
      vi.spyOn(childProcess, 'execFile').mockImplementation(((_cmd: string, _args: any, callback: any) => {
        callback(null, { stdout: 'Status: dataless', stderr: '' })
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      const testFile = '/test/path/Recording.m4a'

      // Act
      // @ts-expect-error - accessing private method for testing
      const isDataless = await poller.checkIfDataless(testFile)

      // Assert
      expect(isDataless).toBe(true)
    })

    it('should return true when icloudctl output includes "dataless"', async () => {
      // Arrange
      const childProcess = await import('node:child_process')
      vi.spyOn(childProcess, 'execFile').mockImplementation(((_cmd: string, _args: any, callback: any) => {
        callback(null, { stdout: 'File: Recording.m4a\nStatus: dataless\nSize: 0', stderr: '' })
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const isDataless = await poller.checkIfDataless('/test/file.m4a')

      // Assert
      expect(isDataless).toBe(true)
    })

    it('should return false when file is already downloaded', async () => {
      // Arrange
      const childProcess = await import('node:child_process')
      vi.spyOn(childProcess, 'execFile').mockImplementation(((_cmd: string, _args: any, callback: any) => {
        callback(null, { stdout: 'File: Recording.m4a\nStatus: downloaded\nSize: 1048576', stderr: '' })
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const isDataless = await poller.checkIfDataless('/test/file.m4a')

      // Assert
      expect(isDataless).toBe(false)
    })

    it('should call icloudctl download command to trigger download', async () => {
      // Arrange
      const childProcess = await import('node:child_process')
      const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((
        _cmd: string,
        _args: any,
        callback: any
      ) => {
        callback(null, { stdout: 'Download started', stderr: '' })
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      const testFile = '/test/path/Recording.m4a'

      // Act
      // @ts-expect-error - accessing private method for testing
      await poller.triggerDownload(testFile)

      // Assert - verify icloudctl download was called with correct args
      expect(execFileSpy).toHaveBeenCalledWith('icloudctl', ['download', testFile], expect.any(Function))
    })

    it('should check and download file if dataless in ensureFileDownloaded', async () => {
      // Arrange
      let checkCallCount = 0
      const childProcess = await import('node:child_process')
      const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((
        _cmd: string,
        args: string[],
        callback: any
      ) => {
        if (args[0] === 'check') {
          checkCallCount++
          // First check returns dataless, subsequent checks return downloaded
          const status = checkCallCount === 1 ? 'Status: dataless' : 'Status: downloaded'
          callback(null, { stdout: status, stderr: '' })
        } else if (args[0] === 'download') {
          callback(null, { stdout: 'Download started', stderr: '' })
        }
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      const testFile = '/test/path/Recording.m4a'

      // Act
      // @ts-expect-error - accessing private method for testing
      await poller.ensureFileDownloaded(testFile)

      // Assert
      // Should have called check once initially, download once, then check again during wait
      expect(execFileSpy).toHaveBeenCalledWith('icloudctl', ['check', testFile], expect.any(Function))
      expect(execFileSpy).toHaveBeenCalledWith('icloudctl', ['download', testFile], expect.any(Function))
    })

    it('should skip download if file is already available', async () => {
      // Arrange
      const childProcess = await import('node:child_process')
      const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((
        _cmd: string,
        args: string[],
        callback: any
      ) => {
        if (args[0] === 'check') {
          // File is downloaded and has no conflicts
          callback(null, { stdout: 'Status: downloaded\nhasUnresolvedConflicts: false', stderr: '' })
        }
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      const testFile = '/test/path/Recording.m4a'

      // Act
      // @ts-expect-error - accessing private method for testing
      await poller.ensureFileDownloaded(testFile)

      // Assert - two check calls (one for dataless, one for conflicts), no download
      expect(execFileSpy).toHaveBeenCalledTimes(2)
      expect(execFileSpy).toHaveBeenCalledWith('icloudctl', ['check', testFile], expect.any(Function))
      expect(execFileSpy).not.toHaveBeenCalledWith('icloudctl', ['download', testFile], expect.any(Function))
    })

    it('should wait for download completion with timeout', { timeout: 15000 }, async () => {
      // Use real timers for this test since it tests actual waiting behavior
      vi.useRealTimers()

      // Arrange
      let checkCallCount = 0
      const childProcess = await import('node:child_process')
      const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((
        _cmd: string,
        args: string[],
        callback: any
      ) => {
        if (args[0] === 'check') {
          checkCallCount++
          // First check: dataless, second check: still dataless, third: downloaded
          const status = checkCallCount <= 2 ? 'Status: dataless' : 'Status: downloaded'
          callback(null, { stdout: status, stderr: '' })
        } else if (args[0] === 'download') {
          callback(null, { stdout: 'Download started', stderr: '' })
        }
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      await poller.ensureFileDownloaded('/test/path/Recording.m4a')

      // Assert - multiple checks during wait
      const checkCalls = execFileSpy.mock.calls.filter((call: any[]) => call[1] && call[1][0] === 'check')
      expect(checkCalls.length).toBeGreaterThanOrEqual(2) // Initial + at least one during wait

      // Restore fake timers for other tests
      vi.useFakeTimers()
    })

    it('should handle error when icloudctl is not available', async () => {
      // Arrange
      const childProcess = await import('node:child_process')
      vi.spyOn(childProcess, 'execFile').mockImplementation(((_cmd: string, _args: any, callback: any) => {
        callback(new Error('icloudctl: command not found'), '', 'icloudctl: command not found')
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act & Assert
      // @ts-expect-error - accessing private method for testing
      await expect(poller.checkIfDataless('/test/file.m4a')).rejects.toThrow('icloudctl: command not found')
    })

    it('should safely pass file paths using execFile to prevent command injection', async () => {
      // Arrange
      const childProcess = await import('node:child_process')
      const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation(((
        _cmd: string,
        _args: any,
        callback: any
      ) => {
        callback(null, { stdout: 'Status: downloaded', stderr: '' })
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/path',
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // File path with potential command injection
      const maliciousPath = '/test/path/file"; rm -rf /'

      // Act
      // @ts-expect-error - accessing private method for testing
      await poller.checkIfDataless(maliciousPath)

      // Assert - execFile passes arguments safely without shell interpretation
      const args = execFileSpy.mock.calls[0]?.[1] as string[]
      expect(args).toBeDefined()
      expect(args[0]).toBe('check')
      // Path should be passed as-is without escaping needed (execFile handles it safely)
      expect(args[1]).toBe(maliciousPath)
    })
  })

  describe('iCloud Conflict Detection [VOICE_POLLING_ICLOUD-AC06]', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      vi.resetModules()
    })

    it('should skip files with iCloud conflicts and log error prominently', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create test files
      const normalFile = path.join(tempDir.path, 'Recording1.m4a')
      const conflictFile = path.join(tempDir.path, 'Recording2.m4a')
      await fs.writeFile(normalFile, Buffer.alloc(100))
      await fs.writeFile(conflictFile, Buffer.alloc(100))

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined), // No last poll timestamp
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      // Mock execFile to simulate iCloud status checks
      const childProcess = await import('node:child_process')
      vi.spyOn(childProcess, 'execFile').mockImplementation(((_cmd: string, args: string[], callback: any) => {
        const filePath = args[1]
        if (args[0] === 'check' && filePath === conflictFile) {
          // Simulate file with conflicts
          callback(null, {
            stdout: 'Status: downloaded\nhasUnresolvedConflicts: true',
            stderr: '',
          })
        } else if (args[0] === 'check') {
          // Normal file - already downloaded
          callback(null, {
            stdout: 'Status: downloaded\nhasUnresolvedConflicts: false',
            stderr: '',
          })
        }
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Mock fingerprinting and staging for normal file
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'computeFingerprint').mockResolvedValue('fingerprint123')
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'stageCapture').mockResolvedValue(undefined)

      // Act
      const result = await poller.pollOnce()

      // Assert
      expect(result.filesFound).toBe(2)
      expect(result.filesProcessed).toBe(1) // Only normalFile processed
      expect(result.duplicatesSkipped).toBe(0)
      expect(result.errors).toHaveLength(1)

      // Verify the error message is prominent
      const conflictError = result.errors[0]
      expect(conflictError).toBeDefined()
      if (conflictError) {
        expect(conflictError.filePath).toBe(conflictFile)
        expect(conflictError.error).toContain('iCloud conflict detected')
        expect(conflictError.error).toContain(conflictFile)
        expect(conflictError.error).toContain('skipping')
      }
    })

    it('should handle icloudctl failure gracefully when checking conflicts [VOICE_POLLING_ICLOUD-AC06]', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const file = path.join(tempDir.path, 'Recording.m4a')
      await fs.writeFile(file, Buffer.alloc(100))

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      // Mock execFile to fail on conflict check but succeed on dataless check
      let callCount = 0
      const childProcess = await import('node:child_process')
      vi.spyOn(childProcess, 'execFile').mockImplementation(((_cmd: string, _args: string[], callback: any) => {
        callCount++
        if (callCount === 1) {
          // First call - checkIfDataless succeeds
          callback(null, { stdout: 'Status: downloaded', stderr: '' })
        } else {
          // Second call - checkForConflicts fails
          callback(new Error('icloudctl not available'), null, 'icloudctl: command not found')
        }
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Mock fingerprinting and staging
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'computeFingerprint').mockResolvedValue('fingerprint123')
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'stageCapture').mockResolvedValue(undefined)

      // Act
      const result = await poller.pollOnce()

      // Assert - should process file normally when conflict check fails
      expect(result.filesFound).toBe(1)
      expect(result.filesProcessed).toBe(1) // File processed despite icloudctl failure
      expect(result.errors).toHaveLength(0) // No error because we assume no conflicts on failure
    })
  })

  describe('Poll Once Integration [VOICE_POLLING_ICLOUD-AC04/AC05]', () => {
    it('should scan voice memos folder when polling', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create test files
      await fs.writeFile(path.join(tempDir.path, 'Recording1.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Recording2.m4a'), Buffer.alloc(100))

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined), // No last poll timestamp
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Mock ensureFileDownloaded to avoid actual iCloud calls
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'ensureFileDownloaded').mockResolvedValue(undefined)

      // Act
      const result = await poller.pollOnce()

      // Assert
      expect(result.filesFound).toBe(2)
    })

    it('should ensure files are downloaded before processing', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const file1 = path.join(tempDir.path, 'Recording1.m4a')
      const file2 = path.join(tempDir.path, 'Recording2.m4a')
      await fs.writeFile(file1, Buffer.alloc(100))
      await fs.writeFile(file2, Buffer.alloc(100))

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      const ensureFileDownloadedSpy = vi.fn().mockResolvedValue(undefined)
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'ensureFileDownloaded').mockImplementation(ensureFileDownloadedSpy)

      // Act
      await poller.pollOnce()

      // Assert - should call ensureFileDownloaded for each file
      expect(ensureFileDownloadedSpy).toHaveBeenCalledTimes(2)
      expect(ensureFileDownloadedSpy).toHaveBeenCalledWith(file1)
      expect(ensureFileDownloadedSpy).toHaveBeenCalledWith(file2)
    })

    it('should process files sequentially not in parallel', { timeout: 10000 }, async () => {
      // Use real timers for this async test
      vi.useRealTimers()

      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create test files
      await fs.writeFile(path.join(tempDir.path, 'Recording1.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Recording2.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Recording3.m4a'), Buffer.alloc(100))

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      const downloadOrder: string[] = []
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'ensureFileDownloaded').mockImplementation(async (filePath: string) => {
        downloadOrder.push(path.basename(filePath))
        // Add delay to ensure sequential processing is detectable
        // eslint-disable-next-line sonarjs/no-nested-functions -- Test mock function
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Act
      const startTime = Date.now()
      await poller.pollOnce()
      const duration = Date.now() - startTime

      // Assert
      // Files should be processed in alphabetical order (due to sort)
      expect(downloadOrder).toEqual(['Recording1.m4a', 'Recording2.m4a', 'Recording3.m4a'])
      // Sequential processing should take at least 30ms (3 files * 10ms each)
      expect(duration).toBeGreaterThanOrEqual(30)

      // Restore fake timers for other tests
      vi.useFakeTimers()
    })

    it('should return correct VoicePollResult with counts and duration', async () => {
      // Use real timers for this async test
      vi.useRealTimers()

      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      await fs.writeFile(path.join(tempDir.path, 'Recording1.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Recording2.m4a'), Buffer.alloc(100))
      await fs.writeFile(path.join(tempDir.path, 'Recording3.m4a'), Buffer.alloc(100))

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi
          .fn()
          .mockResolvedValueOnce(false) // Recording1 - not duplicate
          .mockResolvedValueOnce(true) // Recording2 - duplicate
          .mockResolvedValueOnce(false), // Recording3 - not duplicate
        addFingerprint: vi.fn(),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'ensureFileDownloaded').mockImplementation(() => {
        // Add small delay to ensure duration > 0
        // eslint-disable-next-line sonarjs/no-nested-functions -- Test mock delay
        return new Promise((resolve) => setTimeout(resolve, 1))
      })
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'computeFingerprint').mockResolvedValue('fingerprint123')
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'stageCapture').mockResolvedValue(undefined)

      // Act
      const result = await poller.pollOnce()

      // Assert
      expect(result).toMatchObject({
        filesFound: 3,
        filesProcessed: 2, // 2 non-duplicates
        duplicatesSkipped: 1, // 1 duplicate
        errors: [],
        duration: expect.any(Number),
      })
      expect(result.duration).toBeGreaterThanOrEqual(1)

      // Restore fake timers for other tests
      vi.useFakeTimers()
    })

    it('should handle errors per file without stopping the loop', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const file1 = path.join(tempDir.path, 'Recording1.m4a')
      const file2 = path.join(tempDir.path, 'Recording2.m4a')
      const file3 = path.join(tempDir.path, 'Recording3.m4a')
      await fs.writeFile(file1, Buffer.alloc(100))
      await fs.writeFile(file2, Buffer.alloc(100))
      await fs.writeFile(file3, Buffer.alloc(100))

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Mock ensureFileDownloaded to fail for file2
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'ensureFileDownloaded').mockImplementation((filePath: string) => {
        if (filePath === file2) {
          return Promise.reject(new Error('iCloud download failed'))
        }
        return Promise.resolve()
      })

      // Mock other methods
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'computeFingerprint').mockResolvedValue('fingerprint123')
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'stageCapture').mockResolvedValue(undefined)

      // Act
      const result = await poller.pollOnce()

      // Assert
      expect(result.filesFound).toBe(3)
      expect(result.filesProcessed).toBe(2) // Only file1 and file3 processed
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual({
        filePath: file2,
        error: 'iCloud download failed',
      })
    })

    it('should update sync state after processing all files', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      await fs.writeFile(path.join(tempDir.path, 'Recording1.m4a'), Buffer.alloc(100))

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'ensureFileDownloaded').mockResolvedValue(undefined)
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'computeFingerprint').mockResolvedValue('fingerprint123')
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'stageCapture').mockResolvedValue(undefined)

      const updateTimestampSpy = vi.fn()
      // @ts-expect-error - accessing private method
      vi.spyOn(poller, 'updateLastPollTimestamp').mockImplementation(updateTimestampSpy)

      // Act
      await poller.pollOnce()

      // Assert
      expect(updateTimestampSpy).toHaveBeenCalledTimes(1)
      expect(updateTimestampSpy).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/))
    })

    it('should use exponential backoff when waiting for download', async () => {
      // This test verifies that waitForDownload uses exponential backoff
      // The actual backoff logic is already implemented in waitForDownload
      // We just need to verify it's called as part of ensureFileDownloaded

      // Use real timers for this test
      vi.useRealTimers()

      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()

      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService

      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      let checkCallCount = 0

      // Mock checkIfDataless to return true for first 3 calls, then false
      vi.spyOn(poller, 'checkIfDataless' as any).mockImplementation(() => {
        checkCallCount++
        // Return dataless (true) for first 3 checks, then downloaded (false)
        return Promise.resolve(checkCallCount <= 3)
      })

      // Mock triggerDownload to just resolve
      vi.spyOn(poller, 'triggerDownload' as any).mockResolvedValue(undefined)

      const startTime = Date.now()

      // Act
      // Call ensureFileDownloaded which will use the mocked methods
      await (poller as any).ensureFileDownloaded('/test/Recording.m4a')

      const totalTime = Date.now() - startTime

      // Assert
      // With exponential backoff: 1s + 2s + 4s = 7s minimum
      // But the implementation caps at 5s, so it's 1s + 2s + 4s (capped at 5s) = at least 3s
      expect(totalTime).toBeGreaterThanOrEqual(3000)
      expect(checkCallCount).toBeGreaterThanOrEqual(4) // Initial + 3 during wait

      // Restore fake timers
      vi.useFakeTimers()
    })
  })

  describe('New File Filtering [VOICE_POLLING_ICLOUD-AC02]', () => {
    it('should filter files with mtime greater than last poll timestamp', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create test files with different mtimes
      const oldFile = path.join(tempDir.path, 'old.m4a')
      const newFile1 = path.join(tempDir.path, 'new1.m4a')
      const newFile2 = path.join(tempDir.path, 'new2.m4a')

      await fs.writeFile(oldFile, Buffer.alloc(100))
      await fs.writeFile(newFile1, Buffer.alloc(100))
      await fs.writeFile(newFile2, Buffer.alloc(100))

      // Set specific mtimes
      const lastPollTime = new Date('2025-01-08T10:00:00Z')
      const oldTime = new Date('2025-01-08T09:00:00Z')
      const newTime1 = new Date('2025-01-08T10:30:00Z')
      const newTime2 = new Date('2025-01-08T11:00:00Z')

      await fs.utimes(oldFile, oldTime, oldTime)
      await fs.utimes(newFile1, newTime1, newTime1)
      await fs.utimes(newFile2, newTime2, newTime2)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const newFiles = await poller.filterNewFiles([oldFile, newFile1, newFile2], lastPollTime.toISOString())

      // Assert
      expect(newFiles).toHaveLength(2)
      expect(newFiles).toContain(newFile1)
      expect(newFiles).toContain(newFile2)
      expect(newFiles).not.toContain(oldFile)
    })

    it('should include all files when no cursor exists (first run)', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create test files
      const file1 = path.join(tempDir.path, 'file1.m4a')
      const file2 = path.join(tempDir.path, 'file2.m4a')
      const file3 = path.join(tempDir.path, 'file3.m4a')

      await fs.writeFile(file1, Buffer.alloc(100))
      await fs.writeFile(file2, Buffer.alloc(100))
      await fs.writeFile(file3, Buffer.alloc(100))

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act - null cursor means include all files
      // @ts-expect-error - accessing private method for testing
      const newFiles = await poller.filterNewFiles([file1, file2, file3], null)

      // Assert
      expect(newFiles).toHaveLength(3)
      expect(newFiles).toContain(file1)
      expect(newFiles).toContain(file2)
      expect(newFiles).toContain(file3)
    })

    it('should exclude files with mtime equal to last poll timestamp', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create test file
      const file = path.join(tempDir.path, 'exact-time.m4a')
      await fs.writeFile(file, Buffer.alloc(100))

      // Set mtime to exactly match last poll time
      const lastPollTime = new Date('2025-01-08T10:00:00.000Z')
      await fs.utimes(file, lastPollTime, lastPollTime)

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDb = {} as DatabaseClient
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Act
      // @ts-expect-error - accessing private method for testing
      const newFiles = await poller.filterNewFiles([file], lastPollTime.toISOString())

      // Assert - file with exact same mtime should be excluded
      expect(newFiles).toEqual([])
    })
  })

  describe('Channel Native ID Storage [VOICE_POLLING_ICLOUD-AC08]', () => {
    it('should store file path as channel_native_id in meta_json', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const crypto = await import('node:crypto')

      // Create test audio file
      const audioPath = path.join(tempDir.path, 'test-audio.m4a')
      const audioData = Buffer.from('fake audio data')
      await fs.writeFile(audioPath, audioData)

      // Calculate expected fingerprint
      const expectedFingerprint = crypto.createHash('sha256').update(audioData).digest('hex')

      // Set up the mock to return the expected fingerprint
      const foundation = await import('@capture-bridge/foundation')
      vi.mocked(foundation.computeAudioFingerprint).mockResolvedValue(expectedFingerprint)

      // Create real SQLite database with schema
      const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default
      const db = new Database(createMemoryUrl())
      databases.push(db)

      // Create captures table with proper schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL CHECK(source IN ('voice', 'email', 'text', 'web')),
          raw_content TEXT,
          content_hash TEXT,
          status TEXT NOT NULL CHECK(status IN (
            'staged', 'transcribed', 'failed_transcription',
            'exported', 'exported_duplicate', 'exported_placeholder'
          )) DEFAULT 'staged',
          meta_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_captures_channel_native_id
        ON captures((json_extract(meta_json, '$.channel')), (json_extract(meta_json, '$.channel_native_id')));
      `)

      const mockDbClient: DatabaseClient = {
        query: vi.fn(),
        run: vi.fn((sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql)
          stmt.run(...(params ?? []))
          return Promise.resolve()
        }),
      }

      const mockDedup = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      } as unknown as DeduplicationService

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Act
      await poller.pollOnce()

      // Assert - verify the database contains the correct meta_json structure
      const result = db
        .prepare(
          `
        SELECT meta_json FROM captures
        WHERE json_extract(meta_json, '$.channel') = 'voice'
      `
        )
        .get() as { meta_json: string }

      expect(result).toBeDefined()
      const metaJson = JSON.parse(result.meta_json)
      expect(metaJson.channel).toBe('voice')
      expect(metaJson.channel_native_id).toBe(audioPath) // Absolute path
      expect(metaJson.audio_fp).toBeDefined() // SHA-256 fingerprint
      expect(metaJson.audio_fp).toMatch(/^[a-f0-9]{64}$/) // Valid SHA-256 hex
    })

    it('should reject duplicate file paths (channel_native_id uniqueness)', async () => {
      // Arrange
      const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default
      const db = new Database(createMemoryUrl())
      databases.push(db)

      // Create schema (without unique constraint - we're testing duplicate handling)
      db.exec(`
        CREATE TABLE IF NOT EXISTS captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          status TEXT NOT NULL DEFAULT 'staged',
          meta_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_captures_channel_native_id
        ON captures((json_extract(meta_json, '$.channel')), (json_extract(meta_json, '$.channel_native_id')));
      `)

      const testPath = '/test/voice/recording.m4a'
      const fingerprint = 'abc123def456' // Dummy fingerprint

      // Insert first capture with this path
      const firstId = `test-id-${Date.now()}`
      const metaJson = JSON.stringify({
        channel: 'voice',
        channel_native_id: testPath,
        audio_fp: fingerprint,
      })

      db.prepare(
        `
        INSERT INTO captures (id, source, status, meta_json, raw_content)
        VALUES (?, 'voice', 'staged', ?, '')
      `
      ).run(firstId, metaJson)

      // Create mocked database client that uses the real database
      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql)
          const result = stmt.get(...(params ?? []))
          return Promise.resolve(result)
        }),
        run: vi.fn((sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql)
          stmt.run(...(params ?? []))
          return Promise.resolve()
        }),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test/voice',
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Act - try to stage the same file again (should skip due to duplicate)
      // @ts-expect-error - accessing private method for testing
      await poller.stageCapture(testPath, fingerprint)

      // Assert - should still have only one row for this file path
      const count = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM captures
        WHERE json_extract(meta_json, '$.channel_native_id') = ?
      `
        )
        .get(testPath) as { count: number }

      expect(count.count).toBe(1) // Only the original row, duplicate was skipped
    })

    it('should allow same filename in different directories', async () => {
      // Arrange
      const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
      const Database = (await import('better-sqlite3')).default
      const db = new Database(createMemoryUrl())
      databases.push(db)

      // Create schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS captures (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          raw_content TEXT,
          content_hash TEXT,
          status TEXT NOT NULL DEFAULT 'staged',
          meta_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)

      const mockDbClient: DatabaseClient = {
        query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql)
          const result = stmt.get(...(params ?? []))
          return Promise.resolve(result)
        }),
        run: vi.fn((sql: string, params?: unknown[]) => {
          const stmt = db.prepare(sql)
          stmt.run(...(params ?? []))
          return Promise.resolve()
        }),
      }

      const { VoicePoller } = await import('./voice-poller.js')
      const mockDedup = {} as DeduplicationService
      const config: VoicePollerConfig = {
        folderPath: '/test',
        sequential: true,
      }

      const poller = new VoicePoller(mockDbClient, mockDedup, config)
      pollers.push(poller)

      // Act - stage two files with same name but different paths
      const path1 = '/test/folder1/recording.m4a'
      const path2 = '/test/folder2/recording.m4a'
      const fingerprint1 = 'aaa111bbb222'
      const fingerprint2 = 'ccc333ddd444'

      // @ts-expect-error - accessing private method for testing
      await poller.stageCapture(path1, fingerprint1)
      // @ts-expect-error - accessing private method for testing
      await poller.stageCapture(path2, fingerprint2)

      // Assert - both files should be staged
      const results = db
        .prepare(
          `
        SELECT json_extract(meta_json, '$.channel_native_id') as path
        FROM captures
        WHERE json_extract(meta_json, '$.channel') = 'voice'
        ORDER BY path
      `
        )
        .all() as Array<{ path: string }>

      expect(results).toHaveLength(2)
      expect(results[0]?.path).toBe(path1)
      expect(results[1]?.path).toBe(path2)
    })
  })

  describe('Audio Fingerprinting [VOICE_POLLING_ICLOUD-AC07]', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      vi.resetModules()
    })

    it('should compute audio fingerprint before staging', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Create a test audio file with known content
      const audioFile = path.join(tempDir.path, 'test-recording.m4a')
      const audioContent = Buffer.alloc(100, 'test-audio-data')
      await fs.writeFile(audioFile, audioContent)

      const mockDb: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined), // No last poll timestamp
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      // Mock execFile to simulate file already downloaded
      const childProcess = await import('node:child_process')
      vi.spyOn(childProcess, 'execFile').mockImplementation(((_cmd: string, _args: string[], callback: any) => {
        callback(null, {
          stdout: 'Status: downloaded\nhasUnresolvedConflicts: false',
          stderr: '',
        })
        return {} as any
      }) as any)

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Spy on stageCapture to capture the fingerprint argument
      // @ts-expect-error - accessing private method for testing
      const stageSpy = vi.spyOn(poller, 'stageCapture').mockResolvedValue(undefined)

      // Act
      const result = await poller.pollOnce()

      // Assert
      expect(result.filesFound).toBe(1)
      expect(result.filesProcessed).toBe(1)
      expect(result.errors).toEqual([])

      // Verify stageCapture was called with a valid SHA-256 fingerprint
      expect(stageSpy).toHaveBeenCalledTimes(1)
      expect(stageSpy).toHaveBeenCalledWith(
        audioFile,
        expect.stringMatching(/^[a-f0-9]{64}$/) // SHA-256 is 64 hex characters
      )

      // Verify the fingerprint is consistent (deterministic)
      const { calls } = stageSpy.mock
      expect(calls).toHaveLength(1)
      // After length assertion, we know calls[0] exists
      const firstCall = calls[0] as unknown as [string, string]
      const capturedFingerprint = firstCall[1]
      expect(capturedFingerprint).toBeDefined()
      expect(capturedFingerprint).toHaveLength(64)
    })

    it('should handle fingerprint computation errors', async () => {
      // Arrange
      const { createTempDirectory } = await import('@orchestr8/testkit/fs')
      const tempDir = await createTempDirectory()
      const path = await import('node:path')

      // Create a path to a non-existent file
      const missingFile = path.join(tempDir.path, 'missing-audio.m4a')

      const mockDb: DatabaseClient = {
        query: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
      }

      const mockDedup: DeduplicationService = {
        isDuplicate: vi.fn().mockResolvedValue(false),
        addFingerprint: vi.fn(),
      }

      // Mock execFile to simulate file downloaded
      const childProcess = await import('node:child_process')
      vi.spyOn(childProcess, 'execFile').mockImplementation(((_cmd: string, _args: string[], callback: any) => {
        callback(null, {
          stdout: 'Status: downloaded\nhasUnresolvedConflicts: false',
          stderr: '',
        })
        return {} as any
      }) as any)

      // Mock readdir to return the missing file
      const fs = await import('node:fs/promises')
      vi.spyOn(fs, 'readdir').mockResolvedValue([{ name: 'missing-audio.m4a', isFile: () => true } as any])

      const { VoicePoller } = await import('./voice-poller.js')
      const config: VoicePollerConfig = {
        folderPath: tempDir.path,
        sequential: true,
      }

      const poller = new VoicePoller(mockDb, mockDedup, config)
      pollers.push(poller)

      // Spy on stageCapture - should NOT be called when fingerprinting fails
      // @ts-expect-error - accessing private method for testing
      const stageSpy = vi.spyOn(poller, 'stageCapture').mockResolvedValue(undefined)

      // Act
      const result = await poller.pollOnce()

      // Assert
      expect(result.filesFound).toBe(1)
      expect(result.filesProcessed).toBe(0) // File should not be processed
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatchObject({
        filePath: missingFile,
        error: expect.stringContaining('ENOENT'), // File not found error
      })

      // Verify stageCapture was NOT called
      expect(stageSpy).not.toHaveBeenCalled()
    })
  })
})
