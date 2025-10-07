import { createReadStream } from 'node:fs'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { computeSHA256 } from './sha256-hash.js'

const FOUR_MB = 4 * 1024 * 1024

/**
 * Compute SHA-256 fingerprint of first 4MB of audio data
 * @param input - Buffer, Stream, or file path to audio file
 * @returns SHA-256 hash of first 4MB (or entire file if smaller)
 */
export const computeAudioFingerprint = async (
  input: Buffer | Readable | string
): Promise<string> => {
  // Validate input
  if (input == undefined) {
    throw new Error('Invalid input: input cannot be null or undefined')
  }

  // Handle Buffer input
  if (Buffer.isBuffer(input)) {
    const slicedBuffer = input.length > FOUR_MB ? input.subarray(0, FOUR_MB) : input
    return computeSHA256(slicedBuffer)
  }

  // Handle Stream input
  if (input instanceof Readable) {
    return computeStreamFingerprint(input)
  }

  // Handle file path input
  if (typeof input === 'string') {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Input validated by caller
    const stream = createReadStream(input, { start: 0, end: FOUR_MB - 1 })
    try {
      return await computeStreamFingerprint(stream)
    } catch (error) {
      // Re-throw file system errors with original code
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw error
      }
      throw new Error(`Failed to read audio file: ${(error as Error).message}`)
    }
  }

  throw new Error('Invalid input: must be Buffer, Readable stream, or file path')
}

/**
 * Helper to compute fingerprint from a stream
 */
const computeStreamFingerprint = async (stream: Readable): Promise<string> => {
  const chunks: Buffer[] = []
  let totalBytes = 0

  // Create a transform stream that limits to 4MB
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (totalBytes >= FOUR_MB) {
        // Already have 4MB, ignore rest
        callback()
        return
      }

      const remaining = FOUR_MB - totalBytes
      if (chunk.length <= remaining) {
        // Can use entire chunk
        this.push(chunk)
        totalBytes += chunk.length
        callback()
      } else {
        // Need to truncate chunk
        const truncated = chunk.subarray(0, remaining)
        this.push(truncated)
        totalBytes += truncated.length
        // Signal end of stream since we have 4MB
        this.end()
        callback()
      }
    },
  })

  // Collect chunks
  const collector = new Transform({
    transform: (chunk: Buffer, _encoding, callback) => {
      chunks.push(chunk)
      callback()
    },
  })

  // Process stream through pipeline
  try {
    await pipeline(stream, limiter, collector)
  } catch (error) {
    // Ignore premature close errors (expected when we hit 4MB limit)
    if ((error as NodeJS.ErrnoException).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      throw error
    }
  }

  // Combine chunks and compute hash
  const buffer = Buffer.concat(chunks)
  return computeSHA256(buffer)
}
