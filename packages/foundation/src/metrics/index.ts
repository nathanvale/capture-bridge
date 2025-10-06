/**
 * Metrics Infrastructure
 * Main export file for the metrics module
 */

export { MetricsClient } from './client.js'
export { NDJSONWriter } from './writer.js'
export type {
  MetricEvent,
  MetricsConfig,
  MetricTags,
  MetricType,
  TimeRange,
  AggregateResult,
  AggregationType,
  MetricsQuery,
  RotationResult,
  CleanupResult,
  RetentionPolicy,
} from './types.js'
export { SCHEMA_VERSION } from './types.js'
