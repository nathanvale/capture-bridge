# Capture Bridge

Zero-friction capture layer with durable staging ledger for Obsidian.

## Architecture

This monorepo follows modern TypeScript patterns with centralized tooling and configuration management.

### Packages

- `@capture-bridge/foundation` - Core utilities and shared functionality
- `@capture-bridge/storage` - Data persistence and storage abstractions
- `@capture-bridge/capture` - Data capture and input processing
- `@capture-bridge/cli` - Command-line interface tools

### Tooling

- `@capture-bridge/build-config` - Centralized build configuration using TSUP
- `tooling/tsconfig` - Shared TypeScript configurations

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+

### Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint and format
pnpm lint
pnpm format
```

### Build System

This project uses a **centralized build configuration** approach inspired by @orchestr8 patterns:

- **Base Configuration**: Shared TSUP config in `tooling/build/`
- **Package Overrides**: Packages can customize configuration as needed
- **Consistent Outputs**: All packages generate ESM with TypeScript declarations
- **Optimized Builds**: Tree-shaking, source maps, and modern targets

#### Adding a New Package

1. Create package directory in `packages/`
2. Add `tsup.config.ts`:
   ```typescript
   import { createDefinedTsupConfig } from '@capture-bridge/build-config'

   export default createDefinedTsupConfig('src/index.ts')
   ```
3. Add `@capture-bridge/build-config` as devDependency
4. Follow standard package.json structure

#### Build Configuration Features

- **85% Config Reduction**: Eliminates repetitive TSUP configurations
- **Type Safety**: Full TypeScript support with proper intellisense
- **Flexibility**: Override any setting on a per-package basis
- **Modern Defaults**: ES2022 target, ESM format, optimized for Node.js

See [`tooling/build/README.md`](./tooling/build/README.md) for detailed build configuration documentation.

## Project Structure

```
├── packages/           # Main packages
│   ├── capture/       # Data capture utilities
│   ├── cli/           # CLI tools
│   ├── foundation/    # Core utilities
│   └── storage/       # Storage abstractions
├── tooling/           # Shared tooling
│   ├── build/         # Build configuration
│   └── tsconfig/      # TypeScript configs
├── docs/              # Documentation
└── scripts/           # Build and development scripts
```

## Contributing

1. Follow the existing code style and patterns
2. Use the centralized build configuration
3. Add tests for new functionality
4. Update documentation as needed

## License

Private - All rights reserved
