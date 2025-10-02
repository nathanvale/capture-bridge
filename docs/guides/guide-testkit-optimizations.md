---
title: TestKit Optimization Implementation
status: living
owner: Nathan
version: 1.0.0
date: 2025-10-03
doc_type: guide
---

# TestKit Optimization Implementation

## Overview

This guide documents the implementation of @orchestr8/testkit@2.0.0 optimizations across the capture-bridge monorepo to prevent flaky tests, zombie processes, and resource leaks.

**Reference**: `/Users/nathanvale/code/@orchestr8/packages/testkit/OPTIMIZED_USAGE_GUIDE.md`

## Implementation Checklist

### ✅ Applied Optimizations

#### 1. Resource Management
- [x] **Automatic cleanup enabled** via `setupResourceCleanup()`
- [x] **Leak detection active** - catches forgotten resources
- [x] **Zombie process prevention** - process listeners auto-cleaned
- [x] **Priority-based cleanup** - databases before files
- [x] **Per-package test setup** - isolated cleanup configuration

#### 2. Lifecycle & Bootstrap
- [x] **TestKit register** - loaded first in setupFiles
- [x] **Custom setup files** - per-package configuration
- [x] **Bootstrap sequence** - correct order enforced

#### 3. Performance
- [x] **Pool strategy** - `forks` for better isolation
- [x] **Hanging process detection** - enabled locally via reporter
- [x] **CI optimization** - simpler reporters in CI

#### 4. Cleanup Patterns
- [x] **Pattern 1: Automatic** - used globally via setupResourceCleanup
- [x] **afterEach cleanup** - resources cleaned between tests
- [x] **afterAll cleanup** - final cleanup after suite

## Package-Level Configuration

### Foundation Package

**File**: `packages/foundation/test-setup.ts`
```typescript
import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: process.env.LOG_CLEANUP_STATS === '1',
})
```

**File**: `packages/foundation/vitest.config.ts`
```typescript
import { createBaseVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/foundation',
      environment: 'node',

      // Bootstrap sequence (order matters!)
      setupFiles: [
        '@orchestr8/testkit/register',  // 1. Bootstrap
        './test-setup.ts',               // 2. Cleanup config
      ],

      // Prevent zombie processes
      reporters: process.env.CI ? ['default'] : ['default', 'hanging-process'],
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
        },
      },
    },
  })
)
```

### Other Packages (capture, storage, cli)

Same pattern applied to:
- `packages/capture/test-setup.ts` + `vitest.config.ts`
- `packages/storage/test-setup.ts` + `vitest.config.ts`
- `packages/cli/test-setup.ts` + `vitest.config.ts`

## Key Features Enabled

### 1. Automatic Resource Cleanup

**What it does:**
- Tracks all resources (databases, files, network connections)
- Automatically cleans up after each test
- Prevents resource leaks across tests

**Benefits:**
- ✅ No manual cleanup needed in most tests
- ✅ Tests are isolated from each other
- ✅ No database/file leaks

**Example:**
```typescript
it('should work with auto-cleanup', async () => {
  const db = await createFileDatabase()
  const temp = await createTempDirectory()

  // Use resources freely
  // ✅ Automatically cleaned after test
})
```

### 2. Leak Detection

**What it does:**
- Detects resources that weren't cleaned up
- Warns about potential memory leaks
- Identifies zombie processes

**Benefits:**
- ✅ Early warning of resource problems
- ✅ Catches forgotten cleanup code
- ✅ Prevents test suite slowdown

**Enable verbose logging:**
```bash
LOG_CLEANUP_STATS=1 pnpm test
```

### 3. Bootstrap Sequence

**What it does:**
- Loads TestKit bootstrap before any test code
- Sets up process mocking for CLI tests
- Configures memory limits and timeouts
- Registers process listener cleanup

**Order matters:**
1. `@orchestr8/testkit/register` - Bootstrap first
2. `./test-setup.ts` - Then our custom setup

### 4. Hanging Process Reporter

**What it does:**
- Detects what prevents test process from exiting
- Identifies zombie timers, listeners, connections
- Shows exactly what's hanging

**Usage:**
```bash
# Enabled automatically in local development
pnpm test

# Disabled in CI (cleaner output)
CI=1 pnpm test
```

### 5. Fork Pool Strategy

**What it does:**
- Runs tests in separate processes (not threads)
- Better isolation between tests
- Prevents memory leaks between tests

**Trade-offs:**
- ✅ Better isolation (recommended for DB/file tests)
- ✅ Prevents test pollution
- ⚡ Slightly slower than threads (but more reliable)

## Resource Categories

TestKit cleans resources in priority order:

| Priority | Category | Examples |
|----------|----------|----------|
| 0 | CRITICAL | Emergency cleanup |
| 0 | DATABASE | SQLite connections, pools |
| 1 | FILE | Temp directories, file handles |
| 1 | NETWORK | HTTP servers, WebSocket connections |
| 1 | PROCESS | Spawned child processes |
| 2 | EVENT | Event listeners |
| 2 | TIMER | setTimeout, setInterval |

**Why this order?**
- Databases must close before temp files are deleted
- Network connections should close before processes terminate
- Event listeners and timers can be cleaned last

## Common Patterns

### Pattern 1: Database Tests

```typescript
import { useSqliteCleanup } from '@orchestr8/testkit/sqlite'

describe('User Service', () => {
  const useDatabase = useSqliteCleanup(async () => {
    const db = await createFileDatabase()
    db.exec('CREATE TABLE users (id INTEGER, name TEXT)')
    return db
  })

  it('should create user', async () => {
    const db = await useDatabase()
    db.exec('INSERT INTO users VALUES (1, "Alice")')
    // ✅ Database auto-cleaned after test
  })
})
```

### Pattern 2: File Operations

```typescript
import { useTempDirectory } from '@orchestr8/testkit/fs'

describe('File Processing', () => {
  const tempDir = useTempDirectory()

  it('should process files', async () => {
    await tempDir.writeFile('input.txt', 'data')
    // Process file...
    // ✅ Temp directory auto-cleaned after test
  })
})
```

### Pattern 3: MSW Mocking

```typescript
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

describe('API Tests', () => {
  const msw = setupMSW([
    http.get('https://api.example.com/users', () => {
      return HttpResponse.json([{ id: 1, name: 'Alice' }])
    })
  ])

  it('should fetch users', async () => {
    const response = await fetch('https://api.example.com/users')
    // ✅ MSW server auto-cleaned after test
  })
})
```

## Troubleshooting

### Tests Hanging on Exit

**Symptom**: Tests pass but process doesn't exit
```
close timed out after 20000ms
```

**Solution**: Check hanging-process reporter output (enabled automatically)

**Common causes:**
- Unclosed database connections
- Active timers (setInterval)
- Open network connections
- Process listeners not cleaned up

### Resource Leaks

**Symptom**: Memory usage grows across tests

**Solution**: Enable leak detection logging
```bash
LOG_CLEANUP_STATS=1 pnpm test
```

**Look for:**
- Resources not being cleaned
- Increasing resource counts
- Warnings about old resources

### Cleanup Errors

**Symptom**: Errors during cleanup phase
```
[Resource Manager] Cleanup errors in afterEach:
```

**Solution**: Check if resources have proper cleanup methods

**Common fixes:**
- Ensure databases implement `.close()`
- Verify file handles are valid
- Check network connections support `.destroy()`

## Environment Variables

| Variable | Effect | Default |
|----------|--------|---------|
| `LOG_CLEANUP_STATS` | Verbose cleanup logging | `0` |
| `CI` | Disables hanging-process reporter | `false` |
| `VITEST` | Set by vitest automatically | - |

## Verification

### Check Resource Cleanup Works

```bash
# Run tests with leak detection
LOG_CLEANUP_STATS=1 pnpm test

# Should see:
# ✅ TestKit resource cleanup configured
#    - Auto-cleanup after each test
#    - Leak detection enabled
#    - Zombie process prevention active
```

### Check for Zombie Processes

```bash
# Run tests locally (hanging-process reporter enabled)
pnpm test

# If hanging, you'll see exactly what's preventing exit
```

### Verify CI Configuration

```bash
# CI mode (simpler reporters)
CI=1 pnpm test

# Should complete without hanging-process output
```

## Migration Notes

### From No TestKit Setup

**Before:**
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

**After:**
```typescript
// vitest.config.ts
import { createBaseVitestConfig } from '@orchestr8/testkit/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      environment: 'node',
      setupFiles: ['@orchestr8/testkit/register', './test-setup.ts'],
      reporters: process.env.CI ? ['default'] : ['default', 'hanging-process'],
      pool: 'forks',
    },
  })
)

// test-setup.ts
import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
})
```

### From TestKit 1.0.9 to 2.0.0

**Key Changes:**
- ✅ Config bug fixed (was causing "Vitest failed to access its internal state")
- ✅ Use `createBaseVitestConfig` instead of `createVitestConfig`
- ✅ Always wrap with `defineConfig` from `vitest/config`
- ✅ Add setupFiles for proper bootstrap sequence

## Best Practices

### DO ✅

- Use `setupResourceCleanup()` in test setup files
- Add `@orchestr8/testkit/register` to setupFiles
- Enable leak detection in development
- Use fork pool for database tests
- Clean resources in priority order
- Use TestKit's built-in hooks (`useSqliteCleanup`, `useTempDirectory`)

### DON'T ❌

- Manually clean up resources (let TestKit handle it)
- Mix pool strategies across packages
- Skip bootstrap sequence
- Ignore hanging-process warnings
- Use threads for database tests
- Forget to close connections in custom resources

## Related Documentation

- **OPTIMIZED_USAGE_GUIDE.md**: Original TestKit optimization guide
- **CONSUMER_SETUP.md**: Basic TestKit setup
- **guide-testkit.md**: Complete API reference
- **guide-tdd-testing-patterns.md**: Testing pattern catalog

## Maintenance

### When to Update

- TestKit version changes
- New resource types added
- Performance issues discovered
- Cleanup errors appear

### Verification Steps

1. Run tests with leak detection: `LOG_CLEANUP_STATS=1 pnpm test`
2. Check for zombie processes: `pnpm test` (watch for hanging)
3. Verify CI works: `CI=1 pnpm test`
4. Monitor memory usage over time

---

**Last Updated**: 2025-10-03
**TestKit Version**: 2.0.0
**Status**: ✅ Fully Implemented Across All Packages
