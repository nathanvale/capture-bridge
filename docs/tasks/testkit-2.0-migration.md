# TestKit 2.0 Migration Guide

**Created:** 2025-09-30
**Priority:** HIGH
**Status:** IN PROGRESS

## Overview

TestKit 2.0 introduces significant improvements including modular imports, security validation, resource management, and concurrency control. This document tracks the migration from TestKit 1.x patterns to 2.0.

## 🔄 Breaking Changes

### 1. Modular Import Paths

**Old (1.x):**
```typescript
import { setupMSW, createFileDatabase, useFakeTimers } from '@orchestr8/testkit'
```

**New (2.0):**
```typescript
// Core utilities - no changes
import { delay, retry, createTempDirectory } from '@orchestr8/testkit'

// Modular sub-exports for advanced features
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'
import { createFileDatabase, createSQLitePool } from '@orchestr8/testkit/sqlite'
import { useFakeTime, controlRandomness } from '@orchestr8/testkit/env'
import { createTempDirectoryWithResourceManager } from '@orchestr8/testkit/fs'
```

### 2. setupTestEnv() Return Value

**Old:**
```typescript
const restore = setupTestEnv({ NODE_ENV: 'test' })
restore() // ❌ Called function directly
```

**New:**
```typescript
const envRestore = setupTestEnv({ NODE_ENV: 'test' })
envRestore.restore() // ✅ Call restore() method on object
```

### 3. createFileDatabase() Return Value

**Old:**
```typescript
const db = await createFileDatabase('test.db')
db.close()
```

**New:**
```typescript
const { db, cleanup } = await createFileDatabase('test.db')
// Use db...
await cleanup() // ✅ Use cleanup function
```

### 4. MSW v2 Migration (http.* not rest.*)

**Old:**
```typescript
import { rest } from 'msw'

rest.get('/api/users', (req, res, ctx) => {
  return res(ctx.json([]))
})
```

**New:**
```typescript
import { http, HttpResponse } from '@orchestr8/testkit/msw'

http.get('/api/users', () => {
  return HttpResponse.json([])
})
```

### 5. Vitest Configuration

**Old:**
```typescript
import { createVitestBaseConfig, createCIOptimizedConfig } from '@orchestr8/testkit'

export default createVitestBaseConfig({ /* ... */ })
```

**New:**
```typescript
import { createVitestConfig } from '@orchestr8/testkit/config'
import { defineConfig } from 'vitest/config'

export default defineConfig(
  createVitestConfig({
    test: {
      globals: true,
      environment: 'node'
    }
  })
)
```

### 6. createMockFn() Enhanced Interface

**Old:**
```typescript
const mockFn = createMockFn()
// Basic function, no spy features
```

**New:**
```typescript
const mockFn = createMockFn((x: number) => x * 2)
expect(mockFn(5)).toBe(10)
expect(mockFn.calls).toHaveLength(1) // ✅ Vitest-compatible interface
```

### 7. Environment Detection Properties

**Old:**
```typescript
const env = getTestEnvironment()
if (env.isTest) { // Property doesn't exist
```

**New:**
```typescript
const env = getTestEnvironment()
// Available: runner, isCI, isWallaby, nodeVersion
if (env.runner === 'vitest') { // ✅ Use runner property
if (env.isCI) { // ✅ CI detection
```

## ✨ New Features in 2.0

### Security Validation

```typescript
import {
  validateCommand,
  sanitizeCommand,
  validatePath,
  sanitizeSqlIdentifier,
  escapeShellArg
} from '@orchestr8/testkit'

// Validate shell commands
validateCommand('echo hello') // ✅ Safe
validateCommand('rm -rf /') // ❌ Throws SecurityValidationError

// Sanitize commands
const safe = sanitizeCommand('echo "hello; rm -rf /"')

// Validate paths (prevent traversal)
const safePath = validatePath('/tmp/test', 'file.txt') // ✅
validatePath('/tmp/test', '../../../etc/passwd') // ❌ Throws

// Sanitize SQL identifiers
const tableName = sanitizeSqlIdentifier('user_table') // ✅
```

### Resource Management

```typescript
import {
  registerResource,
  cleanupAllResources,
  getResourceStats,
  detectResourceLeaks,
  ResourceCategory,
  ResourcePriority
} from '@orchestr8/testkit'

// Register resources for automatic cleanup
registerResource('db-connection', () => db.close(), {
  category: ResourceCategory.DATABASE,
  priority: ResourcePriority.CRITICAL,
  description: 'Main database connection'
})

// Get stats
const stats = getResourceStats()
console.log(`Active resources: ${stats.active}`)

// Detect leaks
const leaks = detectResourceLeaks()
if (leaks.length > 0) {
  console.warn('Leaks detected:', leaks)
}

// Clean up all
await cleanupAllResources({ timeout: 10000 })
```

### Concurrency Control

```typescript
import {
  limitConcurrency,
  limitedPromiseAll,
  ConcurrencyManager,
  databaseOperationsManager
} from '@orchestr8/testkit'

// Limit concurrent operations
const tasks = Array.from({ length: 10 }, (_, i) =>
  limitConcurrency(() => processItem(i), 3)
)
await Promise.all(tasks) // Only 3 running at once

// Batch processing
const results = await limitedPromiseAll(promises, { maxConcurrent: 5 })

// Use predefined managers
await databaseOperationsManager.execute(() => db.query('SELECT * FROM users'))
```

### Enhanced Environment Control

```typescript
import {
  useFakeTime,
  controlRandomness,
  quickRandom,
  quickCrypto
} from '@orchestr8/testkit/env'

// Control time
const timeController = useFakeTime(new Date('2023-01-01'))
timeController.advance(1000 * 60 * 60) // Advance 1 hour
timeController.restore()

// Control randomness
const randomController = controlRandomness(12345)
expect(Math.random()).toBe(0.123456789) // Deterministic
randomController.restore()

// Quick random helpers
const restore = quickRandom.sequence([0.1, 0.5, 0.9])
expect(Math.random()).toBe(0.1)
restore()

// Quick crypto helpers
const cryptoRestore = quickCrypto.uuid([
  '550e8400-e29b-41d4-a716-446655440000'
])
expect(crypto.randomUUID()).toBe('550e8400-e29b-41d4-a716-446655440000')
cryptoRestore()
```

### SQLite Connection Pooling

```typescript
import {
  createSQLitePool,
  createMemoryUrl,
  withSQLiteTransaction,
  migrateDatabase,
  applyRecommendedPragmas
} from '@orchestr8/testkit/sqlite'

// Create connection pool
const pool = createSQLitePool({
  databaseUrl: createMemoryUrl('raw'),
  maxConnections: 5,
  idleTimeoutMs: 30000
})

await pool.withConnection(async (db) => {
  const result = await db.prepare('SELECT 1 as test').get()
  expect(result.test).toBe(1)
})

// Transactions with adapters
import { betterSqliteAdapter } from '@orchestr8/testkit/sqlite/adapters'

await withSQLiteTransaction(db, betterSqliteAdapter, async (tx) => {
  tx.run('INSERT INTO users (name) VALUES (?)', 'Alice')
})

// Migrations
await migrateDatabase(db, './migrations')

// Recommended pragmas
await applyRecommendedPragmas(db, {
  journalMode: 'WAL',
  foreignKeys: true,
  busyTimeoutMs: 5000
})
```

### Resource Manager Integration

```typescript
import { createTempDirectoryWithResourceManager } from '@orchestr8/testkit/fs'

const tempDir = await createTempDirectoryWithResourceManager({
  prefix: 'test-',
  cleanup: true
})

// Automatically registered for cleanup with resource manager
```

## 📋 Migration Checklist

### Phase 1: Import Updates
- [ ] Update all `@orchestr8/testkit` imports to use modular paths
- [ ] Change MSW imports to use `http.*` instead of `rest.*`
- [ ] Update vitest config imports to use `/config` sub-export
- [ ] Add `/env`, `/fs`, `/sqlite` sub-exports where needed

### Phase 2: API Updates
- [ ] Fix `setupTestEnv()` to use `.restore()` method
- [ ] Update `createFileDatabase()` to destructure `{ db, cleanup }`
- [ ] Replace `createMockFn()` with vitest-compatible interface
- [ ] Update environment detection to use `runner` property

### Phase 3: Configuration Updates
- [ ] Replace multiple config functions with single `createVitestConfig()`
- [ ] Add `defineConfig()` wrapper from vitest/config
- [ ] Update test environment to use happy-dom if needed

### Phase 4: New Features (Optional)
- [ ] Add security validation for shell commands and paths
- [ ] Implement resource management for critical resources
- [ ] Use concurrency control for batch operations
- [ ] Add fake timers for time-dependent tests
- [ ] Use SQLite connection pooling for database tests

### Phase 5: Testing
- [ ] Run all tests to verify migration
- [ ] Check for deprecation warnings
- [ ] Validate resource cleanup
- [ ] Test MSW mock server with new API

## 📝 File-by-File Migration

### 1. docs/guides/guide-testkit-usage.md
- Update all import statements
- Fix `setupTestEnv()` examples
- Update `createFileDatabase()` examples
- Add new v2.0 features section
- Update MSW examples to use `http.*`

### 2. docs/guides/guide-testkit-standardization.md
- Update all code examples
- Fix return value handling
- Update MSW patterns

### 3. docs/guides/guide-testkit-migration.md
- Replace with this new 2.0 migration guide
- Add comprehensive before/after examples

### 4. packages/foundation/vitest.config.ts
- Update to use `createVitestConfig()` from `/config`
- Add `defineConfig()` wrapper

### 5. All test files (testkit-*.test.ts)
- Update imports
- Fix API usage
- Test new features

## 🎯 Acceptance Criteria

- [ ] All imports use correct modular paths
- [ ] All API usage matches 2.0 patterns
- [ ] All tests pass without errors
- [ ] No deprecation warnings
- [ ] New features documented
- [ ] Migration guide complete

## 📅 Timeline

**Immediate (Day 1):**
- Update import statements across all files
- Fix breaking API changes

**Short-term (Day 2-3):**
- Update all documentation
- Add new feature examples
- Test all changes

**Follow-up (Week 2):**
- Adopt new features (security, resource management, concurrency)
- Optimize with connection pooling
- Add advanced environment control

## 📌 Notes

- TestKit 2.0 is backward compatible for core utilities
- Sub-exports are the main breaking change
- New features are opt-in
- Security features should be adopted immediately for shell/path operations
