# TypeScript & ESLint Patterns

**Purpose:** Detailed patterns for writing lint-compliant code on the first attempt

**Last Updated:** 2025-10-08

---

## Quick Pattern Index

- [Array Access Safety](#array-access-safety)
- [Error Variable Naming](#error-variable-naming)
- [ESM Import Path Extensions](#esm-import-path-extensions)
- [Non-Null Assertions](#non-null-assertions)
- [Unknown Type Handling](#unknown-type-handling)
- [ESLint Disable Directives](#eslint-disable-directive-hygiene)
- [Type-Safe Comparisons](#type-safe-comparisons)
- [Array Mutation Safety](#array-mutation-safety)
- [Empty Catch Blocks](#empty-catch-blocks)
- [Better-SQLite3 Types](#better-sqlite3-type-imports)
- [Custom Resource Cleanup](#custom-resource-cleanup-critical)

---

## Array Access Safety

When accessing array elements in tests or production code:

**❌ NEVER do this:**

```typescript
const results = db.prepare("SELECT ...").all() as SomeType[]
expect(results[0].property).toBe(value) // TS2532: Object is possibly 'undefined'
```

**✅ ALWAYS do this:**

```typescript
// Pattern 1: Assert length first (preferred in tests)
const results = db.prepare("SELECT ...").all() as SomeType[]
expect(results).toHaveLength(1)
const result = results[0] // Now TypeScript knows it exists
expect(result.property).toBe(value)

// Pattern 2: Optional chaining (for production code)
const firstResult = results[0]?.property ?? defaultValue

// Pattern 3: Non-null assertion ONLY after length verification
expect(results).toHaveLength(1)
expect(results[0]!.property).toBe(value) // Safe - we verified length
```

**Applies to:** All test files, especially SQLite query results

---

## Error Variable Naming

When catching errors for suppression (e.g., cleanup operations):

**❌ WRONG - Triggers ESLint errors:**

```typescript
try {
  database.close()
} catch (error) {
  // ERROR: unused variable
  // Ignore errors
}
```

**✅ CORRECT - Use underscore prefix:**

```typescript
try {
  database.close()
} catch (_error) {
  // Underscore indicates intentional suppression
  // Ignore errors (safe in cleanup contexts)
}
```

**Rationale:**
- `sonarjs/no-ignored-exceptions` requires handling OR explicit opt-out
- `@typescript-eslint/no-unused-vars` allows underscore-prefixed variables
- Pattern follows TestKit TDD guide (see cleanup sequences)

---

## ESM Import Path Extensions

With `"moduleResolution": "node16"` or `"nodenext"`:

**❌ WRONG - Missing .js extension:**

```typescript
import { createSchema } from "../schema/schema" // TS2835 error
```

**✅ CORRECT - Include .js extension:**

```typescript
import { createSchema } from "../schema/schema.js"
```

**Important:**
- Use `.js` extension even when importing from `.ts` files
- TypeScript compiles `.ts` → `.js`, so import paths must reference output
- Applies to ALL relative imports in the monorepo
- Absolute imports (e.g., `@capture-bridge/storage`) don't need extensions

---

## Non-Null Assertions (!)

**Default Stance:** AVOID non-null assertions (`!`)

**ESLint Rule:** `@typescript-eslint/no-non-null-assertion` (warning → treat as error)

**Exceptions** (use ONLY when):

1. **After explicit null/length check:**
   ```typescript
   expect(array).toHaveLength(1)
   expect(array[0]!.property).toBe(value) // OK - verified length
   ```

2. **In test assertions where failure is acceptable:**
   ```typescript
   const config = getConfig()! // Test will fail if null - that's the point
   ```

**Preferred Alternatives:**
- Optional chaining: `obj?.prop`
- Nullish coalescing: `value ?? default`
- Type guards: `if (value) { /* use value safely */ }`
- Early returns: `if (!value) return`

---

## Unknown Type Handling (TS18046)

When working with Promise.all() or async operations that return `unknown`:

**❌ WRONG - Direct property access:**

```typescript
const results = await Promise.all(tasks)
results.forEach((r) => {
  expect(r.valid).toBe(true) // TS18046: 'r' is of type 'unknown'
})
```

**✅ CORRECT - Add type assertion or guard:**

```typescript
// Pattern 1: Type assertion with interface
interface TestResult {
  path: string
  valid: boolean
  result?: string
}

const results = (await Promise.all(tasks)) as TestResult[]
results.forEach((r) => {
  expect(r.valid).toBe(true) // ✅ Type is known
})

// Pattern 2: Type guard
const results = await Promise.all(tasks)
for (const result of results) {
  if (typeof result === "object" && result !== null && "valid" in result) {
    expect(result.valid).toBe(true)
  }
}
```

---

## ESLint Disable Directive Hygiene

**Rule:** Keep ESLint disables minimal and targeted

**❌ WRONG - Blanket disables at file top:**

```typescript
/* eslint-disable unicorn/consistent-function-scoping, sonarjs/no-ignored-exceptions,
   @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function,
   sonarjs/no-hardcoded-passwords, sonarjs/file-permissions */
```

**✅ CORRECT - Inline disables where needed:**

```typescript
// Only disable specific rules at specific locations
try {
  database.close()
} catch {
  // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
}
```

**Cleanup Process:**
1. Remove file-level disables
2. Run ESLint to see actual violations
3. Add targeted inline disables with justification comments
4. Regular audit: `pnpm lint` shows unused directive warnings

---

## Type-Safe Comparisons

**Rule:** Don't compare incompatible types with strict equality

**❌ WRONG - Comparing different types:**

```typescript
const stringValue = "123"
const numberValue = 123
if (stringValue !== numberValue) {
  // Always true, different types!
  // This always executes
}
```

**✅ CORRECT - Use type coercion or type guards:**

```typescript
// Pattern 1: Explicit type conversion
if (Number(stringValue) !== numberValue) {
  // Compare same types
}

// Pattern 2: Type guard (preferred)
if (typeof value === "string" && value !== expectedString) {
  // Type-safe comparison
}
```

---

## Array Mutation Safety

**Rule:** Prefer non-mutating array methods in modern TypeScript

**❌ WRONG - Mutating sort in chain:**

```typescript
const sorted = numbers.sort() // Mutates original array!
expect(sorted.join(",")).toBe("1,2,3")
```

**✅ CORRECT - Use toSorted() (ES2023+):**

```typescript
// Pattern 1: Non-mutating toSorted (preferred)
const sorted = numbers.toSorted()
expect(sorted.join(",")).toBe("1,2,3")

// Pattern 2: Separate statement (fallback)
const copy = [...numbers]
copy.sort()
expect(copy.join(",")).toBe("1,2,3")
```

---

## Empty Catch Blocks

When intentionally ignoring errors in cleanup code:

**❌ WRONG - Empty catch triggers ESLint error:**

```typescript
try {
  database.close()
} catch {
  // ERROR: sonarjs/no-ignored-exceptions
}
```

**❌ ALSO WRONG - Named but unused variable:**

```typescript
try {
  database.close()
} catch (error) {
  // ERROR: @typescript-eslint/no-unused-vars
  // Ignore errors
}
```

**✅ CORRECT - Empty catch with inline disable:**

```typescript
try {
  database.close()
  // eslint-disable-next-line sonarjs/no-ignored-exceptions -- Safe in cleanup
} catch {
  // Intentionally ignore errors during cleanup
}
```

**✅ ALSO CORRECT - Use underscore prefix:**

```typescript
try {
  database.close()
} catch (_error) {
  // Underscore indicates intentional suppression
}
```

**Rationale:**
- `sonarjs/no-ignored-exceptions` flags empty catch blocks by default
- Use inline disable with justification OR underscore-prefixed variable
- Always document WHY you're ignoring the error (cleanup, non-critical, etc.)

---

## Better-SQLite3 Type Imports

When importing types from better-sqlite3:

**❌ WRONG - Named import from module:**

```typescript
import type { Database } from "better-sqlite3" // TS2305: Module has no exported member 'Database'
```

**✅ CORRECT - Import default type:**

```typescript
import type Database from "better-sqlite3"

// Then use as type
const db: Database = new Database(":memory:")
```

**✅ ALSO CORRECT - Dynamic import pattern (TestKit):**

```typescript
// No type import needed at top
const Database = (await import("better-sqlite3")).default
const db = new Database(":memory:")
```

**Rationale:**
- better-sqlite3 exports a default class, not named exports
- The imported default type `Database` is used directly as the type annotation
- Dynamic imports avoid the issue entirely (preferred in tests)

---

## Custom Resource Cleanup (CRITICAL)

**Problem:** Custom resources that register global state (event listeners, timers, file watchers) can cause tests to hang indefinitely if not properly cleaned up.

**Required Pattern:**

```typescript
class MetricsClient {
  private flushTimer: NodeJS.Timeout | undefined
  private shutdownHandler: (() => void) | undefined

  constructor(config: MetricsConfig) {
    // ✅ Store handler reference for cleanup
    this.shutdownHandler = () => { /* ... */ }
    process.on('SIGTERM', this.shutdownHandler)

    // ✅ Store timer reference for cleanup
    this.flushTimer = setInterval(() => { /* ... */ }, 1000)
  }

  // ✅ MUST be async and remove ALL listeners/timers
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    }
    if (this.shutdownHandler) {
      process.removeListener('SIGTERM', this.shutdownHandler)
      this.shutdownHandler = undefined
    }
    await this.flush()  // Await async operations
  }
}

// ✅ Track in array and cleanup in afterEach
describe('Tests', () => {
  const clients: Array<{ shutdown: () => Promise<void> }> = []

  afterEach(async () => {
    for (const client of clients) {
      try {
        await client.shutdown()
      } catch {
        // Intentionally ignore errors during cleanup
      }
    }
    clients.length = 0
  })

  it('should work', async () => {
    const client = new MetricsClient(config)
    clients.push(client)  // ✅ Track for cleanup
  })
})
```

**Checklist** (before implementing any custom resource class):
- [ ] `shutdown()` returns `Promise<void>`
- [ ] All `process.on()` paired with `process.removeListener()`
- [ ] All `setInterval()` paired with `clearInterval()`
- [ ] All `fs.watch()` paired with `watcher.close()`
- [ ] Resource tracked in array for cleanup
- [ ] `shutdown()` called in `afterEach` for ALL test files
- [ ] Cleanup uses try-catch to prevent cascade failures

**Symptoms of violation:**
- ⚠️ Vitest never exits (requires Ctrl+C)
- ⚠️ "Tests completed but process not exiting" warning
- ⚠️ Tests pass but CI hangs indefinitely

**See:** `CLAUDE.md` → Custom Resource Cleanup Patterns section

---

## Summary: Most Common Violations

**Top 5 errors to prevent:**

1. **Array access without length check** → TS2532
2. **Unused error variable in catch** → ESLint no-unused-vars
3. **Missing .js extension on imports** → TS2835
4. **Non-null assertion without check** → Type safety warning
5. **Empty catch block** → sonarjs/no-ignored-exceptions

**Quick fix:**
- Arrays: `expect(arr).toHaveLength(1)` first
- Errors: `catch (_error)` or inline disable
- Imports: Add `.js` extension
- Assertions: Avoid `!` or check first
- Catch: Use `_error` or justify with comment

---

**Last Updated:** 2025-10-08
**Maintained By:** Nathan Vale & AI Agents
