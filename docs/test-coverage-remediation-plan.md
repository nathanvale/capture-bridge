# Test Coverage Remediation Plan

**Created:** 2025-10-04
**Status:** Active
**Estimated Duration:** 2 weeks
**Current Risk Level:** 🔴 CRITICAL → Target: 🟢 LOW

## Executive Summary

Code analysis revealed **critical test-implementation mismatches** and **insufficient behavioral coverage** across 8 test suites. This plan provides a structured approach to fix blocking issues, improve test quality from 45% to 80%+ coverage, and establish automated quality gates.

### Critical Findings

- ❌ **2 test files have breaking issues** preventing accurate validation
- ❌ **70+ functions untested** or only structurally validated
- ❌ **testkit-main-export.test.ts** tests wrong package entirely (0% coverage)
- ⚠️ **Average coverage: 45-50%** (target: 80%+)

---

## Phase 1: Critical Blockers (Days 1-2)

### Priority 1.1: Fix Test-Implementation Alignment

**File:** `packages/foundation/src/__tests__/testkit-main-export.test.ts`

**Problem:** Test imports from `@orchestr8/testkit` instead of `@capture-bridge/foundation`

**Solution Options:**

**Option A: Fix Imports (if foundation is a wrapper)**

```typescript
// Change ALL imports from:
import { ... } from '@orchestr8/testkit'
// To:
import { ... } from '@capture-bridge/foundation'
// Or use relative path:
import { ... } from '../index.js'
```

**Option B: Populate Exports (if foundation should re-export)**

```typescript
// File: packages/foundation/src/index.ts
export { delay, createMockFn, retry, withTimeout } from "@orchestr8/testkit"
export {
  createTempDirectory,
  createNamedTempDirectory,
} from "@orchestr8/testkit/fs"
export {
  createBaseVitestConfig,
  createVitestCoverage,
} from "@orchestr8/testkit/config/vitest"
```

**Acceptance Criteria:**

- [ ] Tests import from correct package
- [ ] All test assertions pass
- [ ] Coverage report shows >0% for foundation package

---

### Priority 1.2: Fix Breaking Test Expectations

**File:** `packages/foundation/src/__tests__/testkit-final-validation.test.ts`

**Changes Required:**

```typescript
// Line 75: Replace non-existent export
const subExports = [
  // BEFORE:
  // { path: '@orchestr8/testkit/utils', expectedExports: ['createTestFixture'] },

  // AFTER:
  {
    path: "@orchestr8/testkit/utils",
    expectedExports: ["delay", "retry", "withTimeout", "createMockFn"],
  },

  // Line 78: Fix nested export path
  // BEFORE:
  // { path: '@orchestr8/testkit/env', expectedExports: ['useFakeTimers', 'setSystemTime'] },

  // AFTER:
  {
    path: "@orchestr8/testkit/env",
    expectedExports: ["useFakeTimers", "timeHelpers"],
  },
]

// Line 112: Strengthen assertion
// BEFORE:
expect(workingExports).toBeGreaterThan(0)

// AFTER:
expect(workingExports).toBe(subExports.length) // All must work
const failures = results.filter((r) => r.includes("❌"))
expect(failures).toEqual([]) // No failures allowed
```

**Acceptance Criteria:**

- [ ] All expected exports exist in implementation
- [ ] Strong assertions require ALL exports to work
- [ ] No false positives from weak assertions

---

### Priority 1.3: Add Package Contract Validation

**New Test File:** `packages/foundation/src/__tests__/package-contract.test.ts`

```typescript
import { describe, it, expect } from "vitest"

describe("Package Contract Validation", () => {
  it("should export all functions expected by tests", async () => {
    const pkg = await import("@capture-bridge/foundation")
    const actualExports = Object.keys(pkg)

    const expectedExports = [
      "delay",
      "createMockFn",
      "retry",
      "withTimeout",
      "createTempDirectory",
      "createNamedTempDirectory",
      "createBaseVitestConfig",
      "createVitestCoverage",
      "foundationVersion",
    ]

    const missing = expectedExports.filter(
      (exp) => !actualExports.includes(exp)
    )
    const extra = actualExports.filter((exp) => !expectedExports.includes(exp))

    expect(missing, `Missing exports: ${missing.join(", ")}`).toEqual([])
    expect(extra, `Unexpected exports: ${extra.join(", ")}`).toEqual([])
  })

  it("should match package.json exports configuration", async () => {
    const packageJson = await import("../package.json")
    const pkg = await import("@capture-bridge/foundation")

    // Verify main export exists
    expect(packageJson.exports["."]).toBeDefined()
    expect(Object.keys(pkg).length).toBeGreaterThan(0)
  })
})
```

**Acceptance Criteria:**

- [ ] Test fails if exports don't match expectations
- [ ] Prevents future test-implementation drift
- [ ] Runs in CI/CD pipeline

---

## Phase 2: Behavioral Test Coverage (Days 3-5)

### Priority 2.1: CLI Utilities Behavioral Tests

**Target:** 30% → 80% coverage
**File:** `packages/foundation/src/__tests__/testkit-cli-utilities-behavioral.test.ts`

**Tests to Add (minimum 15):**

1. **Process Registration & Retrieval**

```typescript
it("should register and retrieve mocked process", () => {
  const mocker = createProcessMocker()
  mocker.register("npm install", {
    stdout: "added 50 packages",
    exitCode: 0,
  })

  const processes = mocker.getSpawnedProcesses()
  expect(processes).toContainEqual(
    expect.objectContaining({
      command: "npm install",
      stdout: "added 50 packages",
    })
  )
})
```

2. **Process Failure Scenarios**
3. **Concurrent Process Tracking**
4. **Process Output Streaming**
5. **Exit Code Validation**
6. **SpawnMockBuilder Chaining**
7. **QuickMocks Error Handling**
8. **CommonCommands Git Operations**
9. **CommonCommands NPM Operations**
10. **CommonCommands Docker Operations**
11. **Mock Cleanup/Reset**
12. **Custom Command Registration**
13. **Long-Running Process Simulation**
14. **Interactive Command Mocking**
15. **Process Timeout Handling**

**Acceptance Criteria:**

- [ ] All 15 behavioral tests passing
- [ ] Coverage of CLI utilities >80%
- [ ] Tests verify actual behavior, not just structure

---

### Priority 2.2: Core Utilities Edge Cases

**Target:** 75% → 95% coverage
**File:** Update `packages/foundation/src/__tests__/testkit-core-utilities.test.ts`

**Edge Cases to Add (minimum 10):**

1. **delay() Edge Cases**

```typescript
describe("delay - Edge Cases", () => {
  it("should reject negative delays", async () => {
    await expect(delay(-100)).rejects.toThrow("Delay must be non-negative")
  })

  it("should reject NaN delays", async () => {
    await expect(delay(NaN)).rejects.toThrow("Delay must be a valid number")
  })

  it("should handle zero delay immediately", async () => {
    const start = Date.now()
    await delay(0)
    expect(Date.now() - start).toBeLessThan(10)
  })

  it("should handle very large delays", async () => {
    const promise = delay(1000000)
    expect(promise).toBeInstanceOf(Promise)
  })
})
```

2. **withTimeout() Resource Cleanup**

```typescript
it("should cleanup resources after timeout", async () => {
  let resourceReleased = false

  const operation = async () => {
    try {
      await delay(1000)
    } finally {
      resourceReleased = true
    }
  }

  await expect(withTimeout(operation(), 100)).rejects.toThrow()
  await delay(50) // Wait for cleanup
  expect(resourceReleased).toBe(true) // No memory leak
})
```

3. **retry() Exponential Backoff Validation**
4. **retry() with Max Attempts Edge Cases**
5. **createMockFn() with Custom Implementation**
6. **Environment Detection Edge Cases**
7. **Timeout Configuration Validation**
8. **Temp Directory Cleanup Failures**
9. **File System Permission Errors**
10. **Concurrent Temp Directory Creation**

**Acceptance Criteria:**

- [ ] All edge cases covered
- [ ] Memory leak tests passing
- [ ] Error paths validated

---

### Priority 2.3: MSW Missing Functions

**Target:** Add 10 untested functions
**File:** Update `packages/foundation/src/__tests__/testkit-msw-features.test.ts`

**Functions to Test:**

1. **restoreMSWHandlers()**

```typescript
it("should restore handlers to initial state", async () => {
  // Add runtime handler
  addMSWHandlers(
    http.get("*/api/temp", () => HttpResponse.json({ temp: true }))
  )

  // Verify it works
  let response = await fetch("http://localhost/api/temp")
  expect(response.status).toBe(200)

  // Restore to initial handlers
  restoreMSWHandlers()

  // Runtime handler should be gone
  response = await fetch("http://localhost/api/temp")
  expect(response.status).toBe(404)
})
```

2. **disposeMSWServer()**
3. **updateMSWConfig()**
4. **getMSWServer()**
5. **getMSWConfig()**
6. **setupMSWGlobal()**
7. **setupMSWManual()**
8. **createTestScopedMSW()**
9. **quickSetupMSW()**
10. **setupMSWForEnvironment()**

**Plus Edge Cases:**

- Config validation errors
- Pagination with invalid params
- Auth with malformed headers
- CRUD 404 scenarios

**Acceptance Criteria:**

- [ ] All 10 functions tested
- [ ] Edge cases covered
- [ ] Missing constants added (NO_CONTENT, FORBIDDEN, etc.)

---

### Priority 2.4: SQLite Functions

**Target:** 35% → 80% coverage

**Critical Functions to Test:**

1. **applyMigrations()** - Currently uses manual SQL instead of utility
2. **resetDatabase()** - Core cleanup function untested
3. **seedWithFiles()** - File-based seeding untested
4. **probeEnvironment()** - Capability detection untested
5. **createFileDBWithPool()** - Connection pooling untested
6. **SQLiteConnectionPool** - 437 lines of implementation (if exists)

**Investigation Required:**

```typescript
// First, verify if SQLiteConnectionPool exists
describe("SQLite Connection Pool Investigation", () => {
  it("should verify pool implementation exists", () => {
    const { SQLiteConnectionPool } = require("@orchestr8/testkit/sqlite")
    expect(SQLiteConnectionPool).toBeDefined()
  })
})
```

**Acceptance Criteria:**

- [ ] All 5+ critical functions tested
- [ ] Pool implementation verified and tested if exists
- [ ] Migration system uses actual applyMigrations()
- [ ] Database reset uses actual resetDatabase()

---

## Phase 3: Quality & Automation (Days 6-8)

### Priority 3.1: Security Validation Tests

**New File:** `packages/foundation/src/__tests__/security-validation.test.ts`

```typescript
describe("Security Validation", () => {
  describe("SQL Injection Prevention", () => {
    it("should reject unsafe SQL in database paths", async () => {
      const maliciousPath = "test.db'; DROP TABLE users; --"
      await expect(createFileDatabase(maliciousPath)).rejects.toThrow()
    })

    it("should sanitize batch operations", async () => {
      const unsafeBatch = ["SELECT * FROM users WHERE id = '1' OR '1'='1'"]
      await expect(seedWithBatch(db, unsafeBatch)).rejects.toThrow()
    })
  })

  describe("Path Traversal Prevention", () => {
    it("should reject path traversal attempts", () => {
      expect(() => validatePath("/base", "../../etc/passwd")).toThrow()
    })

    it("should reject absolute path injection", () => {
      expect(() => validatePath("/base", "/etc/passwd")).toThrow()
    })
  })

  describe("Resource Exhaustion Prevention", () => {
    it("should limit maximum connections", async () => {
      const attempts = Array.from({ length: 1000 }, () => createMemoryUrl())
      await expect(Promise.all(attempts)).rejects.toThrow("limit exceeded")
    })
  })
})
```

**Acceptance Criteria:**

- [ ] SQL injection tests pass
- [ ] Path traversal tests pass
- [ ] Resource limits enforced

---

### Priority 3.2: Performance Regression Tests

**New File:** `packages/foundation/src/__tests__/performance-benchmarks.test.ts`

```typescript
describe("Performance Benchmarks", () => {
  it("should handle 1000 concurrent mocks efficiently", async () => {
    const mocker = createProcessMocker()
    const start = Date.now()

    for (let i = 0; i < 1000; i++) {
      mocker.register(`cmd-${i}`, { stdout: "output" })
    }

    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(100) // Should be very fast
  })

  it("should not leak memory with repeated delays", async () => {
    const initialMemory = process.memoryUsage().heapUsed

    for (let i = 0; i < 1000; i++) {
      await delay(1)
    }

    const finalMemory = process.memoryUsage().heapUsed
    const growth = finalMemory - initialMemory

    expect(growth).toBeLessThan(1024 * 1024) // < 1MB growth
  })

  it("should pool objects efficiently", async () => {
    const pool = new ObjectPool({ factory: () => ({}) })

    const obj1 = await pool.acquire()
    pool.release(obj1)
    const obj2 = await pool.acquire()

    expect(obj2).toBe(obj1) // Same instance reused
  })
})
```

**Acceptance Criteria:**

- [ ] Benchmarks pass with acceptable thresholds
- [ ] Memory leak tests pass
- [ ] Pool reuse verified

---

### Priority 3.3: CI/CD Quality Gates

**File:** `.github/workflows/test-quality-gate.yml`

```yaml
name: Test Quality Gate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test-quality:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm test -- --coverage

      - name: Enforce coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "❌ Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi
          echo "✅ Coverage $COVERAGE% meets threshold"

      - name: Check behavioral test ratio
        run: |
          BEHAVIORAL=$(grep -r "should.*when\|should.*given" packages/*/src/__tests__ | wc -l)
          STRUCTURAL=$(grep -r "should.*exist\|toHaveProperty" packages/*/src/__tests__ | wc -l)
          TOTAL=$((BEHAVIORAL + STRUCTURAL))

          if [ $TOTAL -eq 0 ]; then
            echo "⚠️ No tests found"
            exit 1
          fi

          RATIO=$(echo "scale=2; $BEHAVIORAL / $TOTAL" | bc)

          if (( $(echo "$RATIO < 0.7" | bc -l) )); then
            echo "❌ Behavioral test ratio $RATIO is below 0.7 threshold"
            echo "Found $BEHAVIORAL behavioral tests vs $STRUCTURAL structural tests"
            exit 1
          fi

          echo "✅ Behavioral test ratio $RATIO meets threshold"

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

**Acceptance Criteria:**

- [ ] Coverage gate enforces 80% minimum
- [ ] Behavioral test ratio enforces 70% minimum
- [ ] Pipeline fails on quality violations

---

### Priority 3.4: ESLint Test Rules

**File:** `.eslintrc.json` (update)

```json
{
  "extends": ["plugin:vitest/recommended"],
  "plugins": ["vitest"],
  "rules": {
    "vitest/expect-expect": "error",
    "vitest/no-disabled-tests": "warn",
    "vitest/no-focused-tests": "error",
    "vitest/no-identical-title": "error",
    "vitest/prefer-to-be": "warn",
    "vitest/prefer-to-have-length": "warn",
    "vitest/valid-expect": "error",
    "vitest/consistent-test-it": ["error", { "fn": "it" }]
  },
  "overrides": [
    {
      "files": ["**/__tests__/**"],
      "rules": {
        "no-console": "error"
      }
    }
  ]
}
```

**Acceptance Criteria:**

- [ ] ESLint rules enforced in tests
- [ ] Console.log blocked in test files
- [ ] Vitest best practices required

---

### Priority 3.5: TypeScript Strict Mode

**File:** `tsconfig.json` (update)

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  }
}
```

**Acceptance Criteria:**

- [ ] Strict mode enabled
- [ ] All type errors fixed
- [ ] No implicit any types

---

## Success Metrics

### Coverage Targets

| Metric                | Current | Target |
| --------------------- | ------- | ------ |
| Line Coverage         | 45-50%  | 80%+   |
| Branch Coverage       | Unknown | 75%+   |
| Function Coverage     | Unknown | 85%+   |
| Behavioral Test Ratio | ~20%    | 70%+   |

### Quality Indicators

- ✅ All tests pass consistently
- ✅ No false positives from structural-only tests
- ✅ CI/CD enforces quality gates
- ✅ Zero critical security vulnerabilities
- ✅ Performance benchmarks within thresholds

---

## Risk Mitigation

### High-Risk Areas

1. **SQLiteConnectionPool** - 437 lines untested (if exists)
   - Mitigation: Investigate existence immediately, add comprehensive tests if found

2. **Migration System** - Critical database operations
   - Mitigation: Use actual applyMigrations() in tests, add rollback scenarios

3. **Resource Cleanup** - Memory leak potential
   - Mitigation: Add cleanup verification, monitor memory growth

### Rollback Plan

If issues arise during implementation:

1. Revert to previous test state via git
2. Fix blocking issue in isolation
3. Re-apply changes incrementally
4. Verify each step with test run

---

## Timeline & Resources

### Week 1: Critical Path

- **Day 1-2:** Fix blocking issues (2 developer-days)
- **Day 3-5:** Add behavioral coverage (3 developer-days)
- **Total:** 5 developer-days

### Week 2: Quality & Automation

- **Day 6-7:** Security & performance tests (2 developer-days)
- **Day 8:** CI/CD setup (1 developer-day)
- **Total:** 3 developer-days

### Overall: 8 developer-days (2 weeks with 1 developer)

---

## Maintenance Plan

### Ongoing Practices

1. **Code Review Checklist**
   - Every PR must include behavioral tests for new code
   - No structural-only tests accepted
   - Coverage delta must be positive or justified

2. **Weekly Quality Review**
   - Review coverage trends
   - Address flaky tests
   - Update benchmarks

3. **Quarterly Deep Dive**
   - Comprehensive test suite audit
   - Performance profiling
   - Security vulnerability scan

---

## Appendix: Anti-Patterns to Avoid

### ❌ Don't Do This

```typescript
// Structural-only test (validates nothing)
it("should have method", () => {
  expect(obj).toHaveProperty("method")
})

// Weak assertion
it("should work", () => {
  expect(result).toBeTruthy()
})

// Console logging instead of assertions
it("should process", () => {
  process()
  console.log("✅ Processed")
})
```

### ✅ Do This Instead

```typescript
// Behavioral test (validates behavior)
it("should calculate sum correctly", () => {
  expect(calculator.add(2, 3)).toBe(5)
})

// Strong assertion
it("should return user with correct email", () => {
  expect(result).toEqual({
    id: expect.any(String),
    email: "test@example.com",
    name: "Test User",
  })
})

// Proper assertions
it("should process data correctly", () => {
  const result = processor.process(input)
  expect(result).toHaveLength(3)
  expect(result[0]).toMatchObject({ status: "processed" })
})
```

---

## Document Control

- **Version:** 1.0
- **Last Updated:** 2025-10-04
- **Next Review:** 2025-10-18
- **Owner:** Development Team
- **Stakeholders:** QA Team, DevOps Team

## Related Documents

- [Test Coverage Analysis Report](./test-coverage-analysis-2025-10-04.md)
- [CI/CD Pipeline Configuration](../.github/workflows/test-quality-gate.yml)
- [Testing Best Practices Guide](./testing-best-practices.md)
