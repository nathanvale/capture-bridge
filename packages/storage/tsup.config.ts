import { defineConfig } from 'tsup'

// Multi-entry configuration to ensure all subdirectory exports are built
// Similar to foundation package pattern for hash/ and metrics/
// Skip DTS in development (5-10s faster builds), generate only in CI
const isDev = process.env['CI'] !== 'true'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    dts: isDev
      ? false
      : {
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
    dts: isDev
      ? false
      : {
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
    dts: isDev
      ? false
      : {
          compilerOptions: {
            composite: false,
          },
        },
    bundle: true, // Bundle staging-ledger module with dependencies
    clean: false,
    sourcemap: true,
    target: 'es2022',
  },
  {
    entry: {
      'backup/backup': 'src/backup/backup.ts',
      'backup/scheduler': 'src/backup/scheduler.ts',
      'backup/daily-promotion': 'src/backup/daily-promotion.ts',
    },
    format: ['esm'],
    dts: isDev
      ? false
      : {
          compilerOptions: {
            composite: false,
          },
        },
    bundle: true, // Bundle backup utilities to ensure standalone use
    clean: false,
    sourcemap: true,
    target: 'es2022',
  },
])
