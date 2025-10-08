import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import type { VoicePollerConfig, DatabaseClient, DeduplicationService } from './types.js'

describe('VoicePoller', () => {
  const pollers: Array<{ shutdown: () => Promise<void> }> = []

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
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
      sequential: true,
    }

    // Act
    const poller = new VoicePoller(mockDb, mockDedup, config)
    pollers.push(poller)
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
    const { VoicePoller } = await import('./voice-poller.js')
    const mockDb = {} as DatabaseClient
    const mockDedup = {} as DeduplicationService
    const config: VoicePollerConfig = {
      folderPath: '/test/voice/memos',
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
})
