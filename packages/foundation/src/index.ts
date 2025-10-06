// Export placeholder for foundation package
export const foundationVersion = '0.1.0'

/**
 * Get the foundation package version
 * @returns The version string
 */
export const getFoundationVersion = (): string => {
  return foundationVersion
}

// Export metrics infrastructure
export { MetricsClient } from './metrics/index.js'
export type { MetricEvent, MetricsConfig, MetricTags, MetricType } from './metrics/index.js'
