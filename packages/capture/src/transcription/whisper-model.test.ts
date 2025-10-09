import { join } from 'node:path'

import { describe, it, expect, afterEach, beforeEach } from 'vitest'

describe('WhisperModel', () => {
  const models: Array<{ shutdown: () => Promise<void> }> = []
  let testDir: string
  let mockModelPath: string

  beforeEach(async () => {
    // Create temp directory and mock model file for testing
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const { writeFile, mkdir } = await import('node:fs/promises')

    const tempDir = await createTempDirectory()
    testDir = tempDir.path

    // Create models directory
    const modelsDir = join(testDir, 'models')
    await mkdir(modelsDir, { recursive: true })

    // Create a mock model file (1.5GB would be too large for tests, use 1.5MB)
    mockModelPath = join(modelsDir, 'whisper-medium.pt')
    const mockSize = 1.5 * 1024 * 1024 // 1.5MB for testing
    const mockData = Buffer.alloc(mockSize, 'test')
    await writeFile(mockModelPath, mockData)
  })

  afterEach(async () => {
    // 5-step cleanup sequence (CRITICAL ORDER)
    // 0. Custom resources FIRST
    for (const model of models) {
      await model.shutdown()
    }
    models.length = 0

    // 1. Settle (prevent race conditions)
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 2-3. No pools or databases in this test

    // 4. TestKit auto-cleanup (temp directories)

    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('should validate Whisper medium model exists at expected path [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')
    const { access, stat } = await import('node:fs/promises')

    const model = new WhisperModel({
      modelPath: mockModelPath,
    })
    models.push(model)

    // Model should not be loaded on construction (lazy loading)
    expect(model.isLoaded()).toBe(false)

    // Verify model file exists
    await expect(access(mockModelPath)).resolves.not.toThrow()

    // Verify model size (using our mock size)
    const stats = await stat(mockModelPath)
    expect(stats.size).toBeGreaterThanOrEqual(1.5 * 1024 * 1024 - 100) // Allow small variance
    expect(stats.size).toBeLessThanOrEqual(1.5 * 1024 * 1024 + 100)
  })

  it('should lazy load Whisper model on first ensureLoaded call [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')

    const model = new WhisperModel({
      modelPath: mockModelPath,
    })
    models.push(model)

    // Model should not be loaded initially
    expect(model.isLoaded()).toBe(false)

    // Load the model
    const loadedModel = await model.ensureLoaded()

    // Model should now be loaded
    expect(model.isLoaded()).toBe(true)
    expect(loadedModel).toBeDefined()
    expect(loadedModel.id).toBeDefined() // SHA-256 fingerprint
    expect(loadedModel.loadedAt).toBeInstanceOf(Date)
    expect(loadedModel.memoryUsageMb).toBeGreaterThan(0)
    expect(loadedModel.memoryUsageMb).toBeLessThanOrEqual(2000) // 2GB ceiling
    expect(loadedModel.device).toMatch(/^(cpu|metal|cuda)$/)
  })

  it('should return same model instance on subsequent ensureLoaded calls [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')

    const model = new WhisperModel({
      modelPath: mockModelPath,
    })
    models.push(model)

    const first = await model.ensureLoaded()
    const second = await model.ensureLoaded()

    // Should return the exact same instance (not reload)
    expect(second).toBe(first)
    expect(second.loadedAt).toBe(first.loadedAt) // Same timestamp
  })

  it('should handle concurrent ensureLoaded calls without duplicate loading [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')

    const model = new WhisperModel({
      modelPath: mockModelPath,
    })
    models.push(model)

    // Call ensureLoaded multiple times concurrently
    const [model1, model2, model3] = await Promise.all([
      model.ensureLoaded(),
      model.ensureLoaded(),
      model.ensureLoaded(),
    ])

    // All should return the same instance
    expect(model1).toBe(model2)
    expect(model2).toBe(model3)
    expect(model1.loadedAt).toBe(model2.loadedAt)
    expect(model2.loadedAt).toBe(model3.loadedAt)
  })

  it('should handle MODEL_LOAD_FAILURE when model file is missing [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')

    // Create model with invalid path
    const model = new WhisperModel({
      modelPath: '/nonexistent/path/to/model.pt',
    })
    models.push(model)

    // Should throw MODEL_LOAD_FAILURE error
    await expect(model.ensureLoaded()).rejects.toThrow('MODEL_LOAD_FAILURE')

    // Model should not be loaded
    expect(model.isLoaded()).toBe(false)
  })

  it('should respect timeout configuration for model loading [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')
    const { writeFile } = await import('node:fs/promises')

    // Create a very large mock file that will take time to read
    const largeModelPath = join(testDir, 'models', 'large-model.pt')
    const largeSize = 50 * 1024 * 1024 // 50MB - large enough to take some time
    const largeData = Buffer.alloc(largeSize, 'test')
    await writeFile(largeModelPath, largeData)

    // Create model with very short timeout
    const model = new WhisperModel({
      modelPath: largeModelPath,
      timeoutMs: 1, // 1ms timeout (should timeout before reading 50MB)
    })
    models.push(model)

    // Should timeout
    await expect(model.ensureLoaded()).rejects.toThrow('MODEL_LOAD_TIMEOUT')

    // Model should not be loaded
    expect(model.isLoaded()).toBe(false)
  })

  it('should properly clean up resources on shutdown [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')

    const model = new WhisperModel({
      modelPath: mockModelPath,
    })

    // Load the model
    await model.ensureLoaded()
    expect(model.isLoaded()).toBe(true)

    // Shutdown should unload the model
    await model.shutdown()
    expect(model.isLoaded()).toBe(false)

    // Should be able to reload after shutdown
    const reloaded = await model.ensureLoaded()
    expect(model.isLoaded()).toBe(true)
    expect(reloaded.loadedAt).toBeDefined() // Should have a new loadedAt time

    // Clean up for test
    await model.shutdown()
  })

  it('should record metrics when loading model [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')

    const metrics: Array<{ name: string; value: number }> = []
    const recordMetric = (name: string, value: number) => {
      metrics.push({ name, value })
    }

    const model = new WhisperModel({
      modelPath: mockModelPath,
      recordMetric,
    })
    models.push(model)

    await model.ensureLoaded()

    // Should have recorded load duration metric
    const loadMetric = metrics.find((m) => m.name === 'model_load_duration_ms')
    expect(loadMetric).toBeDefined()
    expect(loadMetric?.value).toBeGreaterThan(0)
    expect(loadMetric?.value).toBeLessThan(30000) // Less than 30s timeout
  })

  it('should not leak memory during repeated load/unload cycles [AC01]', async () => {
    const { WhisperModel } = await import('./whisper-model.js')

    if (global.gc) global.gc()
    const before = process.memoryUsage().heapUsed

    const model = new WhisperModel({
      modelPath: mockModelPath,
    })

    // Perform multiple load/unload cycles
    for (let i = 0; i < 3; i++) {
      await model.ensureLoaded()
      await model.shutdown()
    }

    if (global.gc) global.gc()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const after = process.memoryUsage().heapUsed

    // Memory growth should be minimal (< 50MB for metadata overhead)
    const growth = after - before
    expect(growth).toBeLessThan(50 * 1024 * 1024) // < 50MB
  })
})
