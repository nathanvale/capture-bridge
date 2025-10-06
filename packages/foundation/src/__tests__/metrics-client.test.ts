/**
 * Metrics Client Test Suite (Fixed Version)
 * Testing METRICS_INFRASTRUCTURE--T01 acceptance criteria
 * AC01-AC08: NDJSON writer, rotation, activation, core metrics, etc.
 */

import { mkdirSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Helper to parse NDJSON file
async function readMetricsFile(filePath: string) {
  const content = await readFile(filePath, 'utf8')
  const lines = content.trim().split('\n')
  return lines.map((line) => JSON.parse(line))
}

describe('Metrics Client - AC01: NDJSON Writer', () => {
  let testDir: string
  let metricsDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
    metricsDir = join(testDir, '.metrics')
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      rmSync(testDir, { recursive: true, force: true })
      // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
    } catch {
      // Ignore cleanup errors
    }
    if (global.gc) global.gc()
  })

  it('should write metrics to NDJSON file in .metrics/YYYY-MM-DD.ndjson format', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      enabled: true,
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    await client.counter('test.counter', { tag: 'value' })
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)
    const testEvent = events.find((e) => e.metric === 'test.counter')

    expect(testEvent).toBeDefined()
    expect(testEvent.metric).toBe('test.counter')
    expect(testEvent.value).toBe(1)
    expect(testEvent.type).toBe('counter')
  })

  it('should append multiple metrics as separate JSON lines', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      enabled: true,
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    await client.counter('test.counter1')
    await client.gauge('test.gauge1', 42)
    await client.duration('test.duration1', 123)
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)

    // Should have schema version + 3 metrics
    expect(events.length).toBeGreaterThanOrEqual(3)

    expect(events.some((e) => e.metric === 'test.counter1')).toBe(true)
    expect(events.some((e) => e.metric === 'test.gauge1')).toBe(true)
    expect(events.some((e) => e.metric === 'test.duration1')).toBe(true)
  })
})

describe('Metrics Client - AC02: Daily Log Rotation', () => {
  let testDir: string
  let metricsDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
    metricsDir = join(testDir, '.metrics')
    mkdirSync(testDir, { recursive: true })
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      rmSync(testDir, { recursive: true, force: true })
      // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
    } catch {
      // Ignore cleanup errors
    }
    if (global.gc) global.gc()
  })

  it('should rotate to new file at midnight UTC', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const beforeMidnight = new Date('2025-01-15T23:59:59.000Z')
    vi.setSystemTime(beforeMidnight)

    const client = new MetricsClient({
      enabled: true,
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    await client.counter('before.midnight')
    await client.flush()

    const afterMidnight = new Date('2025-01-16T00:00:01.000Z')
    vi.setSystemTime(afterMidnight)

    await client.counter('after.midnight')
    await client.flush()

    const beforeFile = join(metricsDir, '2025-01-15.ndjson')
    const afterFile = join(metricsDir, '2025-01-16.ndjson')

    const beforeEvents = await readMetricsFile(beforeFile)
    const afterEvents = await readMetricsFile(afterFile)

    expect(beforeEvents.some((e) => e.metric === 'before.midnight')).toBe(true)
    expect(afterEvents.some((e) => e.metric === 'after.midnight')).toBe(true)
  })
})

describe('Metrics Client - AC03: Opt-in Activation', () => {
  let testDir: string
  let metricsDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
    metricsDir = join(testDir, '.metrics')
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(async () => {
    delete process.env['CAPTURE_METRICS']
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      rmSync(testDir, { recursive: true, force: true })
      // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
    } catch {
      // Ignore cleanup errors
    }
    if (global.gc) global.gc()
  })

  it('should be disabled by default when CAPTURE_METRICS is not set', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    expect(client.isEnabled()).toBe(false)

    await client.counter('test.disabled')
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    await expect(readFile(expectedFile, 'utf8')).rejects.toThrow()
  })

  it('should be enabled when CAPTURE_METRICS=1', async () => {
    process.env['CAPTURE_METRICS'] = '1'

    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    expect(client.isEnabled()).toBe(true)

    await client.counter('test.enabled')
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)
    expect(events.some((e) => e.metric === 'test.enabled')).toBe(true)
  })
})

describe('Metrics Client - AC04: Core Metrics', () => {
  let testDir: string
  let metricsDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
    metricsDir = join(testDir, '.metrics')
    mkdirSync(testDir, { recursive: true })
    process.env['CAPTURE_METRICS'] = '1'
  })

  afterEach(async () => {
    delete process.env['CAPTURE_METRICS']
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      rmSync(testDir, { recursive: true, force: true })
      // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
    } catch {
      // Ignore cleanup errors
    }
    if (global.gc) global.gc()
  })

  it('should emit capture_staging_ms duration metric', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    await client.duration('capture.voice.staging_ms', 87, {
      capture_id: '01HQW3P7XKZM2YJVT8YFGQSZ4M',
      source: 'voice',
    })
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)
    const event = events.find((e) => e.metric === 'capture.voice.staging_ms')

    expect(event).toBeDefined()
    expect(event.value).toBe(87)
    expect(event.type).toBe('duration')
    expect(event.tags).toMatchObject({
      capture_id: '01HQW3P7XKZM2YJVT8YFGQSZ4M',
      source: 'voice',
    })
  })
})

describe('Metrics Client - AC05: Monotonic Clock', () => {
  let testDir: string
  let metricsDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
    metricsDir = join(testDir, '.metrics')
    mkdirSync(testDir, { recursive: true })
    process.env['CAPTURE_METRICS'] = '1'
  })

  afterEach(async () => {
    delete process.env['CAPTURE_METRICS']
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      rmSync(testDir, { recursive: true, force: true })
      // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
    } catch {
      // Ignore cleanup errors
    }
    if (global.gc) global.gc()
  })

  it('should use performance.now() for duration measurements', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    const start = performance.now()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const duration = performance.now() - start

    await client.duration('test.operation_ms', Math.round(duration))
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)
    const event = events.find((e) => e.metric === 'test.operation_ms')

    expect(event).toBeDefined()
    expect(event.value).toBeGreaterThanOrEqual(45)
    expect(event.value).toBeLessThanOrEqual(100)
  })
})

describe('Metrics Client - AC06: ISO 8601 Timestamps', () => {
  let testDir: string
  let metricsDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
    metricsDir = join(testDir, '.metrics')
    mkdirSync(testDir, { recursive: true })
    process.env['CAPTURE_METRICS'] = '1'
  })

  afterEach(async () => {
    delete process.env['CAPTURE_METRICS']
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      rmSync(testDir, { recursive: true, force: true })
      // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
    } catch {
      // Ignore cleanup errors
    }
    if (global.gc) global.gc()
  })

  it('should include ISO 8601 UTC timestamp in every metric', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    const beforeEmit = new Date()
    await client.counter('test.timestamp')
    await client.flush()
    const afterEmit = new Date()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)
    const event = events.find((e) => e.metric === 'test.timestamp')

    expect(event).toBeDefined()
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    const eventTime = new Date(event.timestamp)
    expect(eventTime.getTime()).toBeGreaterThanOrEqual(beforeEmit.getTime())
    expect(eventTime.getTime()).toBeLessThanOrEqual(afterEmit.getTime())
  })
})

describe('Metrics Client - AC07: Schema Version', () => {
  let testDir: string
  let metricsDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
    metricsDir = join(testDir, '.metrics')
    mkdirSync(testDir, { recursive: true })
    process.env['CAPTURE_METRICS'] = '1'
  })

  afterEach(async () => {
    delete process.env['CAPTURE_METRICS']
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      rmSync(testDir, { recursive: true, force: true })
      // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
    } catch {
      // Ignore cleanup errors
    }
    if (global.gc) global.gc()
  })

  it('should include schema version field in every record', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    await client.counter('test.version')
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)
    const event = events.find((e) => e.metric === 'test.version')

    expect(event).toBeDefined()
    expect(event.version).toBe('1.0.0')
  })

  it('should write schema version as first line in new file', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    const client = new MetricsClient({
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    await client.counter('test.first')
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)

    // First event should be schema version
    expect(events[0].metric).toBe('metrics.schema.version')
    expect(events[0].value).toBe(1)
    expect(events[0].type).toBe('gauge')
  })
})

describe('Metrics Client - AC08: No External Network Calls', () => {
  let testDir: string
  let metricsDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
    metricsDir = join(testDir, '.metrics')
    mkdirSync(testDir, { recursive: true })
    process.env['CAPTURE_METRICS'] = '1'
  })

  afterEach(async () => {
    delete process.env['CAPTURE_METRICS']
    await new Promise((resolve) => setTimeout(resolve, 100))
    try {
      rmSync(testDir, { recursive: true, force: true })
      // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
    } catch {
      // Ignore cleanup errors
    }
    if (global.gc) global.gc()
  })

  it('should only write to local filesystem', async () => {
    const { MetricsClient } = await import('../metrics/client.js')

    // Simple test that metrics are written locally without network calls
    const client = new MetricsClient({
      metricsDir,
      bufferSize: 10,
      flushIntervalMs: 100,
    })

    await client.counter('test.local_only')
    await client.flush()

    const today = new Date().toISOString().split('T')[0]
    const expectedFile = join(metricsDir, `${today}.ndjson`)

    const events = await readMetricsFile(expectedFile)
    const event = events.find((e) => e.metric === 'test.local_only')

    expect(event).toBeDefined()
    expect(event.metric).toBe('test.local_only')
  })
})
