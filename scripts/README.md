# Capture Bridge Scripts

Utility scripts for the capture-bridge monorepo.

## create-package.sh

Creates a new workspace package with optimized TestKit 2.0 configuration.

### Usage

```bash
./scripts/create-package.sh <package-name>
```

### Example

```bash
./scripts/create-package.sh notifications

# Output:
# ✅ Package created: @capture-bridge/notifications
# Location: packages/notifications/
```

### What Gets Created

```
packages/<package-name>/
├── src/
│   ├── index.ts                     # Main module entry
│   └── __tests__/
│       └── example.test.ts          # Example tests with TestKit patterns
├── package.json                     # Package manifest with TestKit deps
├── vitest.config.ts                 # Optimized test configuration
├── test-setup.ts                    # Resource cleanup setup
├── tsconfig.json                    # TypeScript configuration
├── tsup.config.ts                   # Build configuration
└── README.md                        # Package documentation
```

### Features Included

#### TestKit 2.0 Optimizations ✅

- **Automatic Resource Cleanup**: `setupResourceCleanup()` configured
- **Fork Pool**: 4 workers (local), 2 workers (CI)
- **Memory Limit**: 1GB per worker (`--max-old-space-size=1024`)
- **Timeouts**: 10s test, 5s hooks, 20s teardown
- **Leak Detection**: Enabled with `enableLeakDetection: true`
- **Hanging-Process Reporter**: Enabled in development

#### Scripts Included

```json
{
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --bail 1",
    "test:coverage": "vitest run --coverage",
    "test:integration": "TEST_MODE=integration vitest run"
  }
}
```

#### Example Test Patterns

The generated `example.test.ts` demonstrates:

1. **Basic Test**: Simple unit test example
2. **Database Pattern**: Using `useSqliteCleanup` hook
3. **File System Pattern**: Using `useTempDirectory` hook
4. **MSW Pattern**: Using `setupMSW` for API mocking

### After Creation

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Run Tests**
   ```bash
   pnpm --filter @capture-bridge/<package-name> test
   ```

3. **Run with Leak Detection**
   ```bash
   LOG_CLEANUP_STATS=1 pnpm --filter @capture-bridge/<package-name> test
   ```

4. **Build Package**
   ```bash
   pnpm --filter @capture-bridge/<package-name> build
   ```

### Validation Rules

- ✅ Package name must be kebab-case (lowercase with hyphens)
- ✅ Package cannot already exist
- ✅ Valid examples: `notifications`, `email-service`, `task-manager`
- ❌ Invalid examples: `Notifications`, `email_service`, `taskManager`

### Error Handling

**Package Already Exists**
```
Error: Package already exists at packages/notifications
```

**Invalid Name Format**
```
Error: Package name must be kebab-case (lowercase with hyphens)
Examples: notifications, email-service, task-manager
```

### Related Commands

- `/create-package <name>` - Claude Code slash command (runs this script)
- `pnpm test` - Run tests
- `pnpm build` - Build packages
- `pnpm typecheck` - Type check all packages

### Testing the Script

Test package creation:
```bash
# Create test package
./scripts/create-package.sh test-demo

# Install and test
pnpm install
pnpm --filter @capture-bridge/test-demo test

# Clean up
rm -rf packages/test-demo
pnpm install
```

### Configuration Reference

#### vitest.config.ts Structure

```typescript
export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/<package-name>',
      environment: 'node',

      // Bootstrap sequence
      setupFiles: [
        '@orchestr8/testkit/register',  // 1. TestKit bootstrap
        './test-setup.ts',               // 2. Resource cleanup
      ],

      // Anti-zombie configuration
      reporters: process.env.CI
        ? ['default']
        : ['default', 'hanging-process'],

      // Timeout settings
      testTimeout: 10000,
      hookTimeout: 5000,
      teardownTimeout: 20000,

      // Fork pool with memory limits
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
          maxForks: process.env.CI ? 2 : 4,
          minForks: 1,
          execArgv: ['--max-old-space-size=1024'],
        },
      },
    },
  })
)
```

#### test-setup.ts Structure

```typescript
import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,    // Clean after each test
  cleanupAfterAll: true,     // Clean after suite
  enableLeakDetection: true, // Warn about leaks
  logStats: process.env.LOG_CLEANUP_STATS === '1', // Optional stats
})
```

## Troubleshooting

### Script Won't Execute

```bash
chmod +x scripts/create-package.sh
```

### pnpm install Fails

Ensure you're in the monorepo root and have pnpm installed:
```bash
npm install -g pnpm@latest
```

### Tests Fail After Creation

1. Run `pnpm install` first
2. Check TestKit version: `pnpm list @orchestr8/testkit`
3. Expected version: `^2.0.0`

## See Also

- [TestKit Optimization Guide](../docs/guides/guide-testkit-optimizations.md)
- [TestKit Usage Guide](../docs/guides/guide-testkit-usage.md)
- [Create Package Command](./.claude/commands/create-package.md)
