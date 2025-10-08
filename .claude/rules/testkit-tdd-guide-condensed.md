# TestKit TDD Quick Reference

**Purpose**: Essential patterns for AI agents - condensed from 11k to 3k tokens
**Full Version**: `.claude/rules/testkit-tdd-guide.md` (read when implementing complex patterns)
**TestKit Version**: @orchestr8/testkit v2.0.0
**Last Updated**: 2025-10-08

---

## 🚨 Critical Principles (Must Know)

### 1. Dynamic Imports (Always)
```typescript
// ✅ Inside tests only
const { createTempDirectory } = await import('@orchestr8/testkit/fs')
const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')
```

### 2. Wallaby TDD Agent Required
When implementing ANY TDD task, use `wallaby-tdd-agent` for real-time feedback.

### 3. Five-Step Cleanup (Order Critical)
```typescript
afterEach(async () => {
  // 0. Custom resources FIRST (event listeners, timers)
  for (const client of clients) await client.shutdown()

  // 1. Settle 100ms (prevent race conditions)
  await new Promise(resolve => setTimeout(resolve, 100))

  // 2. Drain pools
  for (const pool of pools) await pool.drain()

  // 3. Close databases
  for (const db of databases) db.close()

  // 4. TestKit auto-cleanup (temp directories)

  // 5. Force GC last
  if (global.gc) global.gc()
})
```

### 4. Custom Resource Checklist
Before implementing ANY class with global state:
- [ ] `shutdown()` returns `Promise<void>`
- [ ] All `process.on()` paired with `process.removeListener()`
- [ ] All `setInterval()` paired with `clearInterval()`
- [ ] Resource tracked in array for cleanup
- [ ] `shutdown()` called in `afterEach` for ALL test files

**Violation symptoms**: Vitest never exits, requires Ctrl+C

---

## Pattern Quick Reference

### Temp Directories
```typescript
const { createTempDirectory } = await import('@orchestr8/testkit/fs')
const tempDir = await createTempDirectory()
const testDir = tempDir.path
// Auto-cleanup, no manual rmSync needed
```
**Full API**: [testkit-tdd-guide.md:159-188]

### SQLite Pool
```typescript
const { SQLiteConnectionPool } = await import('@orchestr8/testkit/sqlite')
const pool = new SQLiteConnectionPool(dbPath, options)
pools.push(pool) // Track for cleanup
```
**Full pattern**: [testkit-tdd-guide.md:576-622]

### In-Memory Database
```typescript
const { createMemoryUrl } = await import('@orchestr8/testkit/sqlite')
const Database = (await import('better-sqlite3')).default
const db = new Database(createMemoryUrl())
databases.push(db)
```
**Full pattern**: [testkit-tdd-guide.md:624-649]

### MSW HTTP Mocking
```typescript
// Module-level setup (before describe blocks)
import { setupMSW } from '@orchestr8/testkit/msw'
import { http, HttpResponse } from 'msw'

setupMSW([
  http.get('*/api/users', () => HttpResponse.json([...]))
])
```
**Full pattern**: [testkit-tdd-guide.md:675-732]

### Security Testing
```typescript
// Always parameterize queries
const stmt = db.prepare('SELECT * FROM users WHERE name = ?')
const result = stmt.get(userInput) // Safe from injection
```
**Full patterns**: [testkit-tdd-guide.md:783-887]

### Memory Leak Detection
```typescript
if (global.gc) global.gc()
const before = process.memoryUsage().heapUsed
// ... 100 iterations ...
if (global.gc) global.gc()
await delay(100)
const after = process.memoryUsage().heapUsed
expect(after - before).toBeLessThan(5 * 1024 * 1024) // 5MB threshold
```
**Full pattern**: [testkit-tdd-guide.md:889-934]

---

## Common Mistakes (Quick Fixes)

| ❌ Wrong | ✅ Correct |
|---------|-----------|
| Static imports | Dynamic: `await import('@orchestr8/testkit/fs')` |
| Manual `rmSync()` in afterEach | TestKit auto-cleanup |
| Sync `shutdown(): void` | Async `async shutdown(): Promise<void>` |
| Event listeners without cleanup | `process.removeListener()` in shutdown |
| `catch (error) { }` | `catch (_error) { }` |
| Parallel cleanup | Sequential `for` loops |
| Pool then database close | Database then pool drain |
| GC first | GC last in cleanup |

---

## Test Templates Index

**SQLite Test Template**: [testkit-tdd-guide.md:988-1051]
- beforeEach: createTempDirectory pattern
- afterEach: 5-step cleanup
- Helper function: createPool with tracking

**MSW Test Template**: [testkit-tdd-guide.md:1053-1074]
- Module-level setupMSW
- No beforeEach/afterEach needed
- Handlers persist across tests

**Complete patterns with full code examples in main guide**

---

## When to Read Full Guide

**Trigger conditions for reading full `testkit-tdd-guide.md`:**

1. **Custom Resources** (lines 319-571)
   - Implementing class with event listeners, timers, or file watchers
   - Tests hanging after completion
   - Need MetricsClient anti-pattern vs correct pattern

2. **Advanced Temp Directory** (lines 193-234)
   - Named directories: `createNamedTempDirectory()`
   - Batch creation: `createMultipleTempDirectories()`
   - Scoped cleanup: `withTempDirectoryScope()`

3. **Complex SQLite** (lines 574-671)
   - Connection pool configuration
   - Migrations and seeding
   - Transaction patterns

4. **CLI Process Mocking** (lines 736-780)
   - Dynamic process registration
   - Builder pattern: `.stderr().exitCode().mock()`

5. **Security Patterns** (lines 783-887)
   - SQL injection prevention
   - Path traversal prevention
   - Command injection prevention

6. **Global Test Setup** (lines 937-985)
   - test-setup.ts configuration
   - vitest.config.ts integration
   - Resource cleanup automation

7. **Production Best Practices** (lines 1077-1116)
   - Complete DO/DON'T lists
   - Legacy pattern migration
   - Vitest configuration

---

## Available Sub-Exports

```typescript
'@orchestr8/testkit'         // Core + fs utilities (re-exports)
'@orchestr8/testkit/fs'      // createTempDirectory, file utilities
'@orchestr8/testkit/sqlite'  // Pools, migrations, seeding
'@orchestr8/testkit/msw'     // HTTP mocking integration
'@orchestr8/testkit/cli'     // Process mocking
'@orchestr8/testkit/config'  // setupResourceCleanup
'@orchestr8/testkit/utils'   // cleanupAllResources
```

---

## Production Checklist

**Before committing tests:**
- [ ] All imports are dynamic (inside describe/it)
- [ ] Resources tracked in arrays (`pools: any[] = []`)
- [ ] 5-step cleanup in correct order
- [ ] Custom resources have async shutdown()
- [ ] Event listeners paired with removeListener()
- [ ] No manual rmSync() for temp directories
- [ ] Security tests for input handling
- [ ] Memory leak test for loops (if applicable)

---

**Token Count**: ~3,000 tokens
**Compression Ratio**: 73% reduction from full guide
**Full Guide**: `.claude/rules/testkit-tdd-guide.md` (11.3k tokens, 1305 lines)
