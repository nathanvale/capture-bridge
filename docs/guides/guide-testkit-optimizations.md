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

This guide documents the implementation of @orchestr8/testkit@2.2.0 optimizations across the capture-bridge monorepo to prevent flaky tests, zombie processes, and resource leaks.

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
- [x] **Zero-config setup** - auto-executing cleanup via `@orchestr8/testkit/setup/auto`
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

**Setup**: Zero-config resource cleanup via `@orchestr8/testkit/setup/auto`

**File**: `vitest.projects.ts` (centralized configuration)

```typescript
import { createBaseVitestConfig } from "@orchestr8/testkit/config"
import { resolve } from "node:path"

export const getVitestProjects = () => {
  const foundation = createBaseVitestConfig({
    test: {
      name: "foundation",
      root: resolve(__dirname, "packages/foundation"),
      environment: "node",

      // Bootstrap sequence (order matters!)
      setupFiles: [
        "@orchestr8/testkit/register", // 1. TestKit bootstrap
        "@orchestr8/testkit/setup/auto", // 2. Zero-config resource cleanup
      ],

      // Use threads pool for MSW compatibility
      pool: "threads",
      poolOptions: {
        threads: {
          singleThread: false,
          isolate: true,
        },
      },

      // Timeout configuration
      testTimeout: 10000, // 10s per test
      hookTimeout: 5000, // 5s for beforeEach/afterEach hooks
      teardownTimeout: 20000, // 20s for final cleanup

      // Global teardown for process cleanup
      globalTeardown: globalTeardownPath,

      // Prevent zombie processes
      globals: true,
      mockReset: true,
      clearMocks: true,
      restoreMocks: false,
    },
  })

  return [foundation, capture, cli, storage]
}
```

**What `@orchestr8/testkit/setup/auto` does:**

- ✅ Automatic resource cleanup after each test
- ✅ Leak detection enabled by default
- ✅ Zombie process prevention
- ✅ Priority-based cleanup (databases → files → network → timers)
- ✅ Optional logging via `LOG_CLEANUP_STATS=1`

### Other Packages (capture, storage, cli)

**Foundation-only**: Only the foundation package uses `@orchestr8/testkit/setup/auto` (MSW compatibility)

All other packages use:

```typescript
setupFiles: [
  "@orchestr8/testkit/register", // TestKit bootstrap only
]
```

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
it("should work with auto-cleanup", async () => {
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
- Auto-executes resource cleanup (foundation package only)

**Order matters:**

1. `@orchestr8/testkit/register` - Bootstrap first
2. `@orchestr8/testkit/setup/auto` - Zero-config cleanup (foundation only)

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

### 5. Pool Strategy

**Threads Pool (Foundation):**

- Runs tests in worker threads (required for MSW compatibility)
- Isolated workers prevent cross-test contamination
- Better performance than forks for I/O-heavy tests

**Trade-offs:**

- ✅ MSW compatibility (MSW doesn't work with forks)
- ✅ Better performance for network/API tests
- ✅ Resource isolation via `isolate: true`

**Other Packages:**

- Use default pool strategy (threads)
- No special configuration needed

## Resource Categories

TestKit cleans resources in priority order:

| Priority | Category | Examples                            |
| -------- | -------- | ----------------------------------- |
| 0        | CRITICAL | Emergency cleanup                   |
| 0        | DATABASE | SQLite connections, pools           |
| 1        | FILE     | Temp directories, file handles      |
| 1        | NETWORK  | HTTP servers, WebSocket connections |
| 1        | PROCESS  | Spawned child processes             |
| 2        | EVENT    | Event listeners                     |
| 2        | TIMER    | setTimeout, setInterval             |

**Why this order?**

- Databases must close before temp files are deleted
- Network connections should close before processes terminate
- Event listeners and timers can be cleaned last

## Common Patterns

### Pattern 1: Database Tests

```typescript
import { useSqliteCleanup } from "@orchestr8/testkit/sqlite"

describe("User Service", () => {
  const useDatabase = useSqliteCleanup(async () => {
    const db = await createFileDatabase()
    db.exec("CREATE TABLE users (id INTEGER, name TEXT)")
    return db
  })

  it("should create user", async () => {
    const db = await useDatabase()
    db.exec('INSERT INTO users VALUES (1, "Alice")')
    // ✅ Database auto-cleaned after test
  })
})
```

### Pattern 2: File Operations

```typescript
import { useTempDirectory } from "@orchestr8/testkit/fs"

describe("File Processing", () => {
  const tempDir = useTempDirectory()

  it("should process files", async () => {
    await tempDir.writeFile("input.txt", "data")
    // Process file...
    // ✅ Temp directory auto-cleaned after test
  })
})
```

### Pattern 3: MSW Mocking

```typescript
import { setupMSW, http, HttpResponse } from "@orchestr8/testkit/msw"

describe("API Tests", () => {
  const msw = setupMSW([
    http.get("https://api.example.com/users", () => {
      return HttpResponse.json([{ id: 1, name: "Alice" }])
    }),
  ])

  it("should fetch users", async () => {
    const response = await fetch("https://api.example.com/users")
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

| Variable            | Effect                            | Default |
| ------------------- | --------------------------------- | ------- |
| `LOG_CLEANUP_STATS` | Verbose cleanup logging           | `0`     |
| `CI`                | Disables hanging-process reporter | `false` |
| `VITEST`            | Set by vitest automatically       | -       |

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
    environment: "node",
  },
})
```

**After (Zero-Config):**

```typescript
// vitest.projects.ts
import { createBaseVitestConfig } from "@orchestr8/testkit/config"

export const getVitestProjects = () => {
  const myPackage = createBaseVitestConfig({
    test: {
      name: "my-package",
      environment: "node",

      // Zero-config resource cleanup
      setupFiles: [
        "@orchestr8/testkit/register",
        "@orchestr8/testkit/setup/auto", // ← Auto-executing cleanup
      ],
    },
  })

  return [myPackage]
}
```

**After (Custom Config):**

```typescript
// vitest.projects.ts
import { createBaseVitestConfig } from "@orchestr8/testkit/config"
import { createTestSetup } from "@orchestr8/testkit/setup"

// Custom setup in a separate file
await createTestSetup({
  cleanupAfterEach: true,
  enableLeakDetection: true,
  logStats: true,
})

export const getVitestProjects = () => {
  const myPackage = createBaseVitestConfig({
    test: {
      name: "my-package",
      setupFiles: [
        "@orchestr8/testkit/register",
        "./my-custom-setup.ts", // ← Your custom setup
      ],
    },
  })

  return [myPackage]
}
```

### From TestKit 2.0.0 to 2.2.0

**Key Changes:**

- ✅ New `@orchestr8/testkit/setup/auto` entry point (zero-config)
- ✅ Separation of manual (`setup`) vs auto-executing (`setup/auto`) configuration
- ✅ No more `test-setup.ts` files needed for standard usage
- ✅ Custom configuration still supported via `createTestSetup()`

## Best Practices

### DO ✅

- Use `@orchestr8/testkit/setup/auto` for zero-config resource cleanup
- Add `@orchestr8/testkit/register` first in setupFiles
- Enable leak detection via `LOG_CLEANUP_STATS=1`
- Use threads pool for MSW compatibility
- Use TestKit's built-in hooks (`useSqliteCleanup`, `useTempDirectory`)
- Prefer centralized configuration in `vitest.projects.ts`

### DON'T ❌

- Manually clean up resources (let TestKit handle it)
- Create `test-setup.ts` files unless you need custom configuration
- Skip bootstrap sequence
- Ignore hanging-process warnings
- Mix pool strategies across packages
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

## ✅ Verification Complete (2025-10-12)

All optimizations have been verified and tested with TestKit 2.2.0:

### Configuration Verified ✅

| Package        | Config Location     | Setup Module                       | Pool Strategy | Timeouts | Global Teardown |
| -------------- | ------------------- | ---------------------------------- | ------------- | -------- | --------------- |
| **foundation** | vitest.projects.ts  | `@orchestr8/testkit/setup/auto` ✅ | threads       | ✅       | ✅              |
| **capture**    | vitest.projects.ts  | `@orchestr8/testkit/register` ✅   | default       | ✅       | ✅              |
| **cli**        | vitest.projects.ts  | `@orchestr8/testkit/register` ✅   | default       | ✅       | ✅              |
| **storage**    | vitest.projects.ts  | `@orchestr8/testkit/register` ✅   | default       | ✅       | ✅              |

### Features Tested ✅

- ✅ **Zero-Config Setup**: Foundation uses `@orchestr8/testkit/setup/auto` - no custom setup files needed
- ✅ **Automatic Resource Cleanup**: Verified with foundation tests - resources cleaned automatically
- ✅ **Leak Detection**: Available via `LOG_CLEANUP_STATS=1` environment variable
- ✅ **Process Exit**: No zombie processes - clean shutdown every time
- ✅ **Centralized Config**: All projects configured in single `vitest.projects.ts`

### Setup Module Pattern ✅

**Foundation (with auto-cleanup):**

```typescript
setupFiles: [
  '@orchestr8/testkit/register',     // Bootstrap
  '@orchestr8/testkit/setup/auto',   // Zero-config cleanup
]
```

**Other Packages (bootstrap only):**

```typescript
setupFiles: [
  '@orchestr8/testkit/register',     // Bootstrap only
]
```

### Pool Configuration ✅

**Foundation (MSW-compatible):**

```typescript
pool: 'threads',
poolOptions: {
  threads: {
    singleThread: false,    // Parallel execution
    isolate: true,          // Resource isolation
  }
}
```

### Timeout Configuration ✅

```typescript
testTimeout: 10000,       // 10 seconds per test
hookTimeout: 5000,        // 5 seconds for hooks
teardownTimeout: 20000,   // 20 seconds for cleanup
```

### Leak Detection Output Example

```
[Resource Manager] After test cleanup: {
  resourcesCleaned: 4,
  errors: 0,
  categories: ['database', 'file', 'process', 'timer', 'network', 'event', 'critical']
}
```

---

**Last Updated**: 2025-10-12
**TestKit Version**: 2.2.0
**Status**: ✅ Fully Migrated to Zero-Config Setup Module Pattern
