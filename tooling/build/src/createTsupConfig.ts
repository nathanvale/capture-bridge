import { defineConfig, type Options } from 'tsup'
import { baseTsupConfig } from './tsup.base'

/**
 * Creates a TSUP configuration by merging the base configuration
 * with package-specific overrides.
 */
export function createTsupConfig(
  entry: string | string[],
  overrides: Partial<Options> = {}
): Options {
  return {
    ...baseTsupConfig,
    entry: Array.isArray(entry) ? entry : [entry],
    ...overrides,
  }
}

/**
 * Creates a TSUP configuration with defineConfig wrapper for type safety.
 * This is the recommended way to create configurations in packages.
 */
export function createDefinedTsupConfig(
  entry: string | string[],
  overrides: Partial<Options> = {}
) {
  return defineConfig(createTsupConfig(entry, overrides))
}

export default createTsupConfig