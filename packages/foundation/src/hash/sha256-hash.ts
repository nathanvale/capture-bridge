import { createHash } from 'node:crypto'

/**
 * Compute SHA-256 hash of input data
 * @param data - String or Buffer to hash
 * @returns 64-character lowercase hex string
 */
export const computeSHA256 = (data: string | Buffer): string => {
  const hash = createHash('sha256')
  hash.update(data)
  return hash.digest('hex')
}
