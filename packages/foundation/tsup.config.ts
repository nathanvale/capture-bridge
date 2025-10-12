import { defineConfig, type Options } from 'tsup'
import { baseTsupConfig } from '@capture-bridge/build-config/tsup.base'

// Uses incremental TypeScript compilation for DTS generation in CI
// See tsconfig.build.json for incremental build configuration
// DTS generation is ~50-70% faster on subsequent builds using .tsbuildinfo cache

export default defineConfig([
  {
    ...(baseTsupConfig as Options),
    entry: {
      index: 'src/index.ts',
    },
    bundle: false,
  } as Options,
  {
    ...(baseTsupConfig as Options),
    entry: {
      'hash/index': 'src/hash/index.ts',
    },
    bundle: true, // Bundle hash module with dependencies
    clean: false,
  } as Options,
  {
    ...(baseTsupConfig as Options),
    entry: {
      'metrics/index': 'src/metrics/index.ts',
    },
    bundle: true, // Bundle metrics module with dependencies
    clean: false,
  } as Options,
])
