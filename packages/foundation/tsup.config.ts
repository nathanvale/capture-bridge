import { defineConfig } from 'tsup'

// DTS generation enabled via tsup's built-in TypeScript declaration bundling
// Uses a non-composite tsconfig to avoid project reference issues
// Generates ./dist/index.d.ts and ./dist/hash/index.d.ts as specified in package.json exports
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    dts: {
      compilerOptions: {
        composite: false,
      },
    },
    bundle: false,
    clean: true,
    sourcemap: true,
    target: 'es2022',
  },
  {
    entry: {
      'hash/index': 'src/hash/index.ts',
    },
    format: ['esm'],
    dts: {
      compilerOptions: {
        composite: false,
      },
    },
    bundle: true, // Bundle hash module with dependencies
    clean: false,
    sourcemap: true,
    target: 'es2022',
  },
])
