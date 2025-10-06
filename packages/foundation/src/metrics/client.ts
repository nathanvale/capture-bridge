/**
 * Metrics Client
 * Main client for emitting metrics with buffering and automatic flushing
 */

import { NDJSONWriter } from './writer.js'

import type {
  MetricEvent,
  MetricsConfig,
  MetricTags,
  MetricType,
  TimeRange,
  AggregateResult,
  AggregationType,
  MetricsClient as IMetricsClient,
} from './types.js'

// Shutdown handler defined at module level to satisfy unicorn/consistent-function-scoping

const createShutdownHandler = (client: MetricsClient) => {
  return () => {
    void client.flush()
    if (client['flushTimer']) {
      clearInterval(client['flushTimer'])
    }
  }
}

export class MetricsClient implements IMetricsClient {
  private readonly config: MetricsConfig
  private readonly writer: NDJSONWriter
  private readonly buffer: MetricEvent[] = []
  private flushTimer: NodeJS.Timeout | undefined = undefined
  private enabled: boolean
  private initialized = false

  constructor(config: Partial<MetricsConfig> & { metricsDir: string }) {
    this.config = {
      enabled: config.enabled ?? process.env['CAPTURE_METRICS'] === '1',
      metricsDir: config.metricsDir,
      rotation: config.rotation ?? 'daily',
      retentionDays: config.retentionDays ?? 30,
      bufferSize: config.bufferSize ?? 100,
      flushIntervalMs: config.flushIntervalMs ?? 5000,
    }

    this.enabled = this.config.enabled ?? false
    this.writer = new NDJSONWriter(this.config)

    if (this.enabled) {
      this.startFlushTimer()
      this.setupShutdownHook()
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.enabled) {
      await this.writer.initialize()
      this.initialized = true
    }
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = setInterval(() => {
      void this.flush()
    }, this.config.flushIntervalMs)

    // Don't keep the process alive just for metrics
    if (this.flushTimer.unref) {
      this.flushTimer.unref()
    }
  }

  private setupShutdownHook(): void {
    const shutdownHandler = createShutdownHandler(this)

    process.on('SIGTERM', shutdownHandler)
    process.on('SIGINT', shutdownHandler)
    process.on('beforeExit', shutdownHandler)
  }

  emit(metric: MetricEvent): void {
    if (!this.enabled) return

    // Add timestamp if not present
    if (!metric.timestamp) {
      metric.timestamp = new Date().toISOString()
    }

    // Validate metric
    if (!this.isValidMetric(metric)) {
      throw new Error(`Invalid metric: ${JSON.stringify(metric)}`)
    }

    this.buffer.push(metric)

    // Check if buffer is full
    if (this.buffer.length >= (this.config.bufferSize ?? 100)) {
      void this.flush()
    }
  }

  counter(name: string, tags?: MetricTags): void {
    const event: MetricEvent = {
      timestamp: new Date().toISOString(),
      metric: name,
      value: 1,
      type: 'counter',
    }
    if (tags !== undefined) {
      event.tags = tags
    }
    this.emit(event)
  }

  gauge(name: string, value: number, tags?: MetricTags): void {
    const event: MetricEvent = {
      timestamp: new Date().toISOString(),
      metric: name,
      value,
      type: 'gauge',
    }
    if (tags !== undefined) {
      event.tags = tags
    }
    this.emit(event)
  }

  duration(name: string, durationMs: number, tags?: MetricTags): void {
    const event: MetricEvent = {
      timestamp: new Date().toISOString(),
      metric: name,
      value: durationMs,
      type: 'duration',
    }
    if (tags !== undefined) {
      event.tags = tags
    }
    this.emit(event)
  }

  histogram(name: string, value: number, tags?: MetricTags): void {
    const event: MetricEvent = {
      timestamp: new Date().toISOString(),
      metric: name,
      value,
      type: 'histogram',
    }
    if (tags !== undefined) {
      event.tags = tags
    }
    this.emit(event)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async flush(): Promise<void> {
    if (!this.enabled || this.buffer.length === 0) return

    // Atomically take all pending events
    const events = this.buffer.splice(0, this.buffer.length)

    try {
      await this.ensureInitialized()
      await this.writer.write(events)
    } catch (error) {
      // Restore events on failure
      if (events.length > 0) {
        this.buffer.unshift(...events)
      }
      console.error('Failed to write metrics:', error)
    }
  }

  private isValidMetric(metric: MetricEvent): boolean {
    // Check required fields
    if (!metric.metric || typeof metric.metric !== 'string') return false
    if (typeof metric.value !== 'number') return false
    if (!metric.type || !this.isValidMetricType(metric.type)) return false

    // Check tags if present
    if (metric.tags && typeof metric.tags !== 'object') return false

    return true
  }

  private isValidMetricType(type: string): type is MetricType {
    return ['counter', 'gauge', 'duration', 'histogram'].includes(type)
  }

  // Query methods (simplified for now)
  query(_pattern: string, _timeRange?: TimeRange): Promise<MetricEvent[]> {
    // This would be implemented with file reading and pattern matching
    // For now, return empty array
    return Promise.resolve([])
  }

  aggregate(
    pattern: string,
    aggregation: AggregationType,
    _timeRange?: TimeRange
  ): Promise<AggregateResult> {
    // This would be implemented with query + aggregation logic
    // For now, return dummy result
    return Promise.resolve({
      metric: pattern,
      aggregation,
      value: 0,
      count: 0,
      timeRange: _timeRange ?? {
        start: new Date(),
        end: new Date(),
      },
    })
  }

  latest(_name: string, _tags?: MetricTags): Promise<MetricEvent | undefined> {
    // This would be implemented with file reading
    // For now, return undefined
    return Promise.resolve(undefined)
  }
}
