/**
 * Hash utilities for content deduplication and fingerprinting
 * Part of CONTENT_HASH_IMPLEMENTATION--T01
 *
 * @module hash
 */

// AC01: Text Normalization
export { normalizeText } from './text-normalization.js'

// AC02: SHA-256 Hash Computation
export { computeSHA256 } from './sha256-hash.js'

// AC03: Audio Fingerprint
export { computeAudioFingerprint } from './audio-fingerprint.js'

// AC04: Email Body Hash
export { computeEmailHash } from './email.js'
