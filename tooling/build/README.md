# @adhd-brain/build-config

Centralized build configuration for all packages in the ADHD Brain monorepo.

## Overview

This package provides a shared TSUP configuration that reduces duplication and ensures consistency across all packages while allowing for package-specific customizations when needed.

## Features

- **Centralized Configuration**: Base TSUP configuration shared across all packages
- **Flexible Overrides**: Packages can customize configuration as needed
- **Type Safety**: Full TypeScript support with proper typing
- **Consistent Defaults**: Sensible defaults optimized for the monorepo
- **ADHD-Optimized**: Simple, clear API inspired by @orchestr8 patterns

## Base Configuration

The base configuration includes:

```typescript
{
  format: ['esm'],          // ESM-only output
  outDir: 'dist',           // Standard output directory
  clean: true,              // Clean before build
  dts: true,                // Generate TypeScript declarations
  target: 'es2022',         // Modern JavaScript target
  platform: 'node',        // Node.js platform
  treeshake: true,          // Enable tree-shaking
  splitting: true,          // Enable code splitting
  bundle: false,            // No bundling by default
  minify: false,            // No minification by default
  sourcemap: true,          // Generate source maps
}
```

## Usage

### Basic Usage

For most packages, simply use the default configuration:

```typescript
// tsup.config.ts
import { createDefinedTsupConfig } from '@adhd-brain/build-config'

export default createDefinedTsupConfig('src/index.ts')
```

### Multiple Entry Points

For packages with multiple entry points:

```typescript
// tsup.config.ts
import { createDefinedTsupConfig } from '@adhd-brain/build-config'

export default createDefinedTsupConfig([
  'src/index.ts',
  'src/cli.ts',
  'src/utils.ts'
])
```

### Package-Specific Overrides

For packages that need custom configuration:

```typescript
// tsup.config.ts
import { createDefinedTsupConfig } from '@adhd-brain/build-config'

export default createDefinedTsupConfig('src/index.ts', {
  minify: true,             // Enable minification for CLI tools
  platform: 'browser',     // Browser platform for web packages
  format: ['esm', 'cjs'],   // Multiple formats if needed
})
```

### Advanced Usage

For complex scenarios, you can import the base config directly:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'
import { baseTsupConfig } from '@adhd-brain/build-config'

export default defineConfig({
  ...baseTsupConfig,
  entry: ['src/index.ts'],
  // Complex custom configuration
  esbuildOptions: {
    // Custom esbuild options
  }
})
```

## API Reference

### `createDefinedTsupConfig(entry, overrides?)`

Creates a TSUP configuration with `defineConfig` wrapper for type safety.

**Parameters:**
- `entry`: `string | string[]` - Entry point(s) for the build
- `overrides`: `Partial<Options>` - Optional configuration overrides

**Returns:** TSUP configuration wrapped with `defineConfig`

### `createTsupConfig(entry, overrides?)`

Creates a TSUP configuration without the `defineConfig` wrapper.

**Parameters:**
- `entry`: `string | string[]` - Entry point(s) for the build
- `overrides`: `Partial<Options>` - Optional configuration overrides

**Returns:** Raw TSUP configuration object

### `baseTsupConfig`

The base configuration object that all packages extend from.

## Development

To make changes to the build configuration:

1. Edit the source files in `src/`
2. Build the package: `pnpm build`
3. Test with dependent packages: `pnpm run build` from the root

## Migration Guide

### From Individual Configs

Replace individual package configurations:

**Before:**
```typescript
// packages/*/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
})
```

**After:**
```typescript
// packages/*/tsup.config.ts
import { createDefinedTsupConfig } from '@adhd-brain/build-config'

export default createDefinedTsupConfig('src/index.ts')
```

## Benefits

- **85% Configuration Reduction**: Eliminates repetitive configuration
- **Consistency**: All packages use the same base settings
- **Maintainability**: Changes to build configuration happen in one place
- **Flexibility**: Packages can still customize as needed
- **Type Safety**: Full TypeScript support with proper intellisense