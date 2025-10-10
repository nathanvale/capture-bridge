import type { Options } from 'tsup'

/**
 * Base TSUP configuration for all packages in the monorepo.
 * This configuration provides sensible defaults that can be extended
 * by individual packages as needed.
 *
 * DTS generation is skipped in development for faster builds (5-10s savings),
 * and only generated in CI for publishing.
 */
export const baseTsupConfig: Options = {
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  dts: process.env['CI'] === 'true',
  target: 'es2022',
  platform: 'node',
  treeshake: true,
  splitting: true,
  bundle: false,
  minify: false,
  sourcemap: true,
}

export default baseTsupConfig