// Export placeholder for foundation package
export const foundationVersion = '0.1.0'

/**
 * Get the foundation package version
 * @returns The version string
 */
export const getFoundationVersion = (): string => {
  return foundationVersion
}

// Export metrics infrastructure (bundled)
export { MetricsClient } from './metrics/index.js'
export type { MetricEvent, MetricsConfig, MetricTags, MetricType } from './metrics/index.js'

// Hash utilities (CONTENT_HASH_IMPLEMENTATION--T01) - exported via bundled hash/index
export {
  normalizeText,
  computeSHA256,
  computeAudioFingerprint,
  computeEmailHash,
} from './hash/index.js'
