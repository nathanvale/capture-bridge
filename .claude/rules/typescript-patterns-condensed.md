# TypeScript & ESLint Quick Fixes

**Purpose**: Fast reference for lint-compliant code - condensed from 3.3k to 1.5k tokens
**Full Version**: `.claude/rules/typescript-patterns.md` (read for detailed examples)
**Last Updated**: 2025-10-08

---

## Top 5 Quick Fixes (Most Common Violations)

### 1. Array Access Safety
```typescript
// ❌ WRONG
expect(results[0].property).toBe(value) // TS2532: possibly undefined

// ✅ CORRECT
expect(results).toHaveLength(1)
expect(results[0]!.property).toBe(value) // Safe after length check
```
**Full pattern**: [typescript-patterns.md:25-54]

### 2. Error Variable Naming
```typescript
// ❌ WRONG
catch (error) { } // Unused variable error

// ✅ CORRECT
catch (_error) { } // Underscore = intentional suppression
```
**Full pattern**: [typescript-patterns.md:57-87]

### 3. ESM Import Path Extensions
```typescript
// ❌ WRONG
import { createSchema } from "../schema/schema" // TS2835

// ✅ CORRECT
import { createSchema } from "../schema/schema.js"
```
**Important**: Use `.js` even when importing from `.ts` files
**Full pattern**: [typescript-patterns.md:90-111]

### 4. Non-Null Assertions
```typescript
// ❌ WRONG
const value = getValue()!.property // Dangerous

// ✅ CORRECT
const value = getValue()?.property ?? defaultValue // Optional chaining
```
**Full pattern**: [typescript-patterns.md:114-138]

### 5. Empty Catch Blocks
```typescript
// ❌ WRONG
catch { } // sonarjs/no-ignored-exceptions

// ✅ CORRECT
catch (_error) { } // Underscore prefix
// OR
catch {
  // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
}
```
**Full pattern**: [typescript-patterns.md:268-318]

---

## Critical Patterns

### Better-SQLite3 Type Imports
```typescript
// ❌ WRONG
import type { Database } from "better-sqlite3" // TS2305

// ✅ CORRECT
import type Database from "better-sqlite3" // Default import
```
**Rationale**: better-sqlite3 exports default class, not named exports
**Full pattern**: [typescript-patterns.md:321-352]

### Unknown Type Handling
```typescript
// ❌ WRONG
const results = await Promise.all(tasks)
results.forEach(r => r.valid) // TS18046: 'r' is unknown

// ✅ CORRECT
interface TestResult { valid: boolean }
const results = (await Promise.all(tasks)) as TestResult[]
results.forEach(r => r.valid) // Type is known
```
**Full pattern**: [typescript-patterns.md:141-177]

### Custom Resource Cleanup (CRITICAL)
```typescript
class MetricsClient {
  private flushTimer: NodeJS.Timeout | undefined
  private shutdownHandler: (() => void) | undefined

  constructor(config: MetricsConfig) {
    this.shutdownHandler = () => { /* ... */ }
    process.on('SIGTERM', this.shutdownHandler)
    this.flushTimer = setInterval(() => { /* ... */ }, 1000)
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer)
    if (this.shutdownHandler) {
      process.removeListener('SIGTERM', this.shutdownHandler)
    }
  }
}

// Track in tests
const clients: Array<{ shutdown: () => Promise<void> }> = []
afterEach(async () => {
  for (const client of clients) await client.shutdown()
  clients.length = 0
})
```
**Violation symptoms**: Vitest never exits, requires Ctrl+C
**Full pattern**: [typescript-patterns.md:355-426]

### Type-Safe Comparisons
```typescript
// ❌ WRONG
if (stringValue !== numberValue) { } // Always true, different types

// ✅ CORRECT
if (Number(stringValue) !== numberValue) { } // Same types
```
**Full pattern**: [typescript-patterns.md:211-239]

### Array Mutation Safety
```typescript
// ❌ WRONG
const sorted = numbers.sort() // Mutates original!

// ✅ CORRECT
const sorted = numbers.toSorted() // ES2023+ non-mutating
```
**Full pattern**: [typescript-patterns.md:242-265]

---

## Before-Commit Checklist

**Run this mental checklist before committing:**

- [ ] **Array access**: Length check before `array[0]`?
- [ ] **Catch blocks**: Using `_error` or inline disable?
- [ ] **Import paths**: All relative imports have `.js` extension?
- [ ] **Non-null assertions**: Avoided `!` unless after explicit check?
- [ ] **Custom resources**: async shutdown() + removeListener()?
- [ ] **SQLite types**: Using default import not named import?
- [ ] **Empty catch**: Justified with comment or underscore?
- [ ] **Comparisons**: No string !== number comparisons?
- [ ] **Array mutations**: Using `toSorted()` not `sort()`?
- [ ] **ESLint disables**: Inline with justification, not file-level?

---

## ESLint Disable Hygiene

```typescript
// ❌ WRONG - Blanket file-level disable
/* eslint-disable sonarjs/no-ignored-exceptions, @typescript-eslint/no-unused-vars */

// ✅ CORRECT - Targeted inline disable with justification
try {
  database.close()
} catch {
  // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
}
```
**Full pattern**: [typescript-patterns.md:180-208]

---

## Quick Reference Table

| Pattern | Wrong | Correct |
|---------|-------|---------|
| Array access | `arr[0].prop` | `expect(arr).toHaveLength(1)` first |
| Catch errors | `catch (error)` | `catch (_error)` |
| Imports | `from "../file"` | `from "../file.js"` |
| Non-null | `getValue()!` | `getValue()?.prop ?? default` |
| Empty catch | `catch { }` | `catch (_error) { }` |
| SQLite types | `import type { Database }` | `import type Database` |
| Unknown types | Direct access | Cast: `as MyType[]` |
| Comparisons | `string !== number` | `Number(string) !== number` |
| Array sort | `.sort()` | `.toSorted()` |
| ESLint disable | File-level | Inline with comment |

---

## Custom Resource Cleanup Checklist

**Before implementing any custom resource class:**

- [ ] `shutdown()` returns `Promise<void>`
- [ ] All `process.on()` paired with `process.removeListener()`
- [ ] All `setInterval()` paired with `clearInterval()`
- [ ] All `fs.watch()` paired with `watcher.close()`
- [ ] Network connections closed in `shutdown()`
- [ ] Resource tracked in array for cleanup
- [ ] `shutdown()` called in `afterEach` for ALL test files
- [ ] Cleanup uses try-catch to prevent cascade failures

**See**: `CLAUDE.md` → Custom Resource Cleanup Patterns section

---

## Common Error Codes → Solutions

| Error Code | Cause | Fix |
|------------|-------|-----|
| TS2532 | Object possibly undefined | Assert length or use optional chaining |
| TS2835 | Relative import missing .js | Add `.js` extension |
| TS2305 | Module has no exported member | Use default import for better-sqlite3 |
| TS18046 | Type is unknown | Add type assertion or guard |
| ESLint no-unused-vars | Unused catch variable | Prefix with underscore: `_error` |
| sonarjs/no-ignored-exceptions | Empty catch block | Use `_error` or inline disable |

---

## When to Read Full Patterns Doc

**Trigger conditions for reading full `typescript-patterns.md`:**

1. **Complex array access patterns** (lines 25-54)
   - Multiple patterns for different contexts
   - Test vs production code differences

2. **ESLint disable best practices** (lines 180-208)
   - Cleanup process for file-level disables
   - Audit procedure

3. **Custom resource detailed examples** (lines 355-426)
   - Full MetricsClient anti-pattern
   - Complete correct implementation
   - Integration with 4-step cleanup

4. **Type guard examples** (lines 141-177)
   - Full type guard pattern
   - Interface definitions

5. **All error codes** (lines 429-445)
   - Summary of common violations
   - Quick fix reference

---

**Token Count**: ~1,500 tokens
**Compression Ratio**: 55% reduction from full guide
**Full Guide**: `.claude/rules/typescript-patterns.md` (3.3k tokens, 450 lines)
