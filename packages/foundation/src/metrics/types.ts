/**
 * Metrics Type Definitions
 * Defines the core interfaces for the metrics infrastructure
 */

export type MetricTags = Record<string, string | number | boolean>

export type MetricType = 'counter' | 'gauge' | 'duration' | 'histogram'

export interface MetricEvent {
  timestamp: string // ISO 8601 UTC
  metric: string // domain.component.action.unit
  value: number
  tags?: MetricTags
  type: MetricType
  version?: string // Schema version
}

export interface MetricsConfig {
  enabled?: boolean
  metricsDir: string
  rotation?: 'daily' | 'hourly'
  retentionDays?: number
  bufferSize?: number
  flushIntervalMs?: number
}

export interface MetricsClient {
  emit: (metric: MetricEvent) => void
  counter: (name: string, tags?: MetricTags) => void
  gauge: (name: string, value: number, tags?: MetricTags) => void
  duration: (name: string, durationMs: number, tags?: MetricTags) => void
  histogram: (name: string, value: number, tags?: MetricTags) => void
  isEnabled: () => boolean
  flush: () => Promise<void>
}

export interface TimeRange {
  start: Date
  end: Date
}

export interface AggregateResult {
  metric: string
  aggregation: AggregationType
  value: number
  count: number
  timeRange: TimeRange
}

export type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'p50' | 'p95' | 'p99'

export interface MetricsQuery {
  query: (pattern: string, timeRange?: TimeRange) => Promise<MetricEvent[]>
  aggregate: (
    pattern: string,
    aggregation: AggregationType,
    timeRange?: TimeRange
  ) => Promise<AggregateResult>
  latest: (name: string, tags?: MetricTags) => Promise<MetricEvent | undefined>
}

export interface RotationResult {
  oldFile: string
  newFile: string
  rotatedAt: Date
  oldFileSize: number
}

export interface CleanupResult {
  deletedFiles: string[]
  freedBytes: number
  oldestRetainedFile: string
}

export interface RetentionPolicy {
  retentionDays: number
  cleanupSchedule: string
  cleanup: () => Promise<CleanupResult>
}

export const SCHEMA_VERSION = '1.0.0'
