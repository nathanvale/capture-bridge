import { defineConfig } from 'tsup'

// Multi-entry configuration to ensure all subdirectory exports are built
// Similar to foundation package pattern for hash/ and metrics/
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
      'schema/index': 'src/schema/index.ts',
    },
    format: ['esm'],
    dts: {
      compilerOptions: {
        composite: false,
      },
    },
    bundle: true, // Bundle schema module with dependencies
    clean: false,
    sourcemap: true,
    target: 'es2022',
  },
  {
    entry: {
      'staging-ledger/staging-ledger': 'src/staging-ledger/staging-ledger.ts',
    },
    format: ['esm'],
    dts: {
      compilerOptions: {
        composite: false,
      },
    },
    bundle: true, // Bundle staging-ledger module with dependencies
    clean: false,
    sourcemap: true,
    target: 'es2022',
  },
])
