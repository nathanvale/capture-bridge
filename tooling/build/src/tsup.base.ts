import type { Options } from 'tsup'

/**
 * Base TSUP configuration for all packages in the monorepo.
 * This configuration provides sensible defaults that can be extended
 * by individual packages as needed.
 */
export const baseTsupConfig: Options = {
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  dts: true,
  target: 'es2022',
  platform: 'node',
  treeshake: true,
  splitting: true,
  bundle: false,
  minify: false,
  sourcemap: true,
}

export default baseTsupConfig