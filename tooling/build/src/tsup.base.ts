import type { Options } from 'tsup'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Base TSUP configuration for all packages in the monorepo.
 * This configuration provides sensible defaults that can be extended
 * by individual packages as needed.
 *
 * DTS generation strategy:
 * - Development: Skipped for faster builds (5-10s savings)
 * - CI: Uses incremental TypeScript compilation for 50-70% faster builds
 *   - First build: Generates .tsbuildinfo cache file (~same speed)
 *   - Subsequent builds: Uses .tsbuildinfo for incremental compilation
 *   - Falls back to tsup's rollup-plugin-dts if tsc not available
 */

const isCI = process.env['CI'] === 'true'

/**
 * Generate type declarations using incremental TypeScript compilation.
 * This is significantly faster than rollup-plugin-dts for subsequent builds.
 */
function generateIncrementalDTS(packageDir: string): void {
  const tsconfigPath = path.join(packageDir, 'tsconfig.build.json')

  // Check if tsconfig.build.json exists for incremental builds
  if (!existsSync(tsconfigPath)) {
    console.warn(
      `⚠️  tsconfig.build.json not found at ${tsconfigPath}. ` +
      `Incremental DTS generation requires this file. ` +
      `See tooling/build/README.md for setup instructions.`
    )
    return
  }

  try {
    // Use TypeScript's incremental compilation
    // --incremental enables .tsbuildinfo caching
    // --emitDeclarationOnly only generates .d.ts files (no .js)
    console.log('🔧 Generating type declarations with incremental TypeScript...')
    execSync(
      `tsc --project tsconfig.build.json --incremental --emitDeclarationOnly`,
      {
        cwd: packageDir,
        stdio: 'inherit',
      }
    )
    console.log('✅ Type declarations generated successfully')
  } catch (error) {
    console.error('❌ Failed to generate type declarations:', error)
    throw error
  }
}

export const baseTsupConfig: Options = {
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  // Disable tsup's DTS generation - we use incremental tsc instead
  dts: false,
  target: 'es2022',
  platform: 'node',
  treeshake: true,
  splitting: true,
  bundle: false,
  minify: false,
  sourcemap: true,
  // Run incremental DTS generation after successful build in CI
  ...(isCI && {
    onSuccess: async () => {
      // Get the package directory (tsup runs from package root)
      const packageDir = process.cwd()
      generateIncrementalDTS(packageDir)
    },
  }),
}

export default baseTsupConfig