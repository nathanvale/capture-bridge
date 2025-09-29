/* eslint-disable */
/**
 * Memory Cache
 *
 * LRU cache for fingerprints and metadata
 */

export interface CacheOptions {
  maxSize: number
}

export interface CacheStats {
  hitRate: number
  size: number
  hits: number
  misses: number
}

export interface MemoryCache {
  get(key: string): any
  set(key: string, value: any): void
  clear(): void
  getStats(): CacheStats
}

export function createMemoryCache(options: CacheOptions): MemoryCache {
  const cache = new Map()
  let hits = 0
  let misses = 0

  return {
    get(key: string): any {
      if (cache.has(key)) {
        hits++
        return cache.get(key)
      }
      misses++
      return undefined
    },

    set(key: string, value: any): void {
      if (cache.size >= options.maxSize) {
        const firstKey = cache.keys().next().value
        cache.delete(firstKey)
      }
      cache.set(key, value)
    },

    clear(): void {
      cache.clear()
      hits = 0
      misses = 0
    },

    getStats(): CacheStats {
      const total = hits + misses
      return {
        hitRate: total > 0 ? hits / total : 0,
        size: cache.size,
        hits,
        misses,
      }
    },
  }
}
