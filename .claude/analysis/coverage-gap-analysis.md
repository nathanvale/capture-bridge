# Coverage Gap Analysis - CI Failure

**Date**: 2025-10-07
**Issue**: Tests pass (329/329) but coverage fails thresholds
**Wallaby Reports**: 400 tests (discrepancy with Vitest's 329)

---

## Problem Summary

The CI pipeline is failing on coverage thresholds:

```
✅ Tests: 329/329 passing
❌ Coverage:
   Lines:      70.07% (need 80%) ❌
   Functions:  74.07% (need 80%) ❌
   Branches:   68.51% (need 75%) ❌
```

## Root Cause: Untested Methods

### 1. **Client.ts - Stub Query Methods (Lines 199-228)**

These methods are marked "simplified for now" and return dummy data:

```typescript
// ❌ NOT TESTED - 0% coverage
query(_pattern: string, _timeRange?: TimeRange): Promise<MetricEvent[]> {
  return Promise.resolve([])  // Stub implementation
}

aggregate(pattern: string, aggregation: AggregationType, _timeRange?: TimeRange): Promise<AggregateResult> {
  return Promise.resolve({
    metric: pattern,
    aggregation,
    value: 0,
    count: 0,
    timeRange: _timeRange ?? { start: new Date(), end: new Date() },
  })  // Stub implementation
}

latest(_name: string, _tags?: MetricTags): Promise<MetricEvent | undefined> {
  return Promise.resolve(undefined)  // Stub implementation
}
```

**Impact**: 3 functions, ~30 lines uncovered

### 2. **Writer.ts - Utility Methods (Lines 90-119)**

These methods exist but aren't tested:

```typescript
// ❌ NOT TESTED
rotate(): void {
  this.updateCurrentFile()
}

// ❌ NOT TESTED - File retention cleanup
async cleanup(retentionDays: number): Promise<void> {
  const files = await readdir(this.metricsDir)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retentionDays)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  if (!cutoffStr) return

  for (const file of files) {
    if (file.endsWith('.ndjson')) {
      const dateStr = file.replace('.ndjson', '')
      if (dateStr < cutoffStr) {
        const filePath = join(this.metricsDir, file)
        await unlink(filePath)
      }
    }
  }
}

// ❌ NOT TESTED
async getCurrentFileSize(): Promise<number> {
  if (!this.currentFile || !existsSync(this.currentFile)) {
    return 0
  }
  const stats = await stat(this.currentFile)
  return stats.size
}
```

**Impact**: 3 methods, ~30 lines uncovered

---

## Why Tests Were Insufficient

### Acceptance Criteria Coverage (AC01-AC08)

The tests cover the 8 acceptance criteria:
- ✅ AC01: NDJSON Writer
- ✅ AC02: Daily Log Rotation
- ✅ AC03: Opt-in Activation
- ✅ AC04: Core Metrics
- ✅ AC05: Monotonic Clock
- ✅ AC06: ISO 8601 Timestamps
- ✅ AC07: Schema Version
- ✅ AC08: No External Network Calls

**But they don't test:**
- ❌ Stub query methods (query, aggregate, latest)
- ❌ rotate() method (rotation is tested indirectly via time change)
- ❌ cleanup() method (retention policy untested)
- ❌ getCurrentFileSize() method (size monitoring untested)

### Test Strategy Gap

**TDD Approach Used**: Test what's in the acceptance criteria
**Coverage Requirement**: Test all code paths (includes utilities and stubs)

**The mismatch**: ACs don't require query/cleanup methods, so they weren't tested, but coverage includes them.

---

## Wallaby 400 vs Vitest 329 Discrepancy

**Vitest Reports**: 329 tests
**Wallaby Reports**: 400 tests (user claim)

**Possible Explanations**:

1. **Test Counting Difference**:
   - Wallaby might count nested tests differently
   - Wallaby might include hooks (beforeEach/afterEach) as "tests"
   - Wallaby might count parametrized tests differently

2. **Foundation Package Scope**:
   - Foundation package contains TestKit verification tests (319 tests)
   - Plus metrics tests (11 tests)
   - Total: 330 tests (close to 329)

3. **Other Test Files**:
   - Check if Wallaby is counting tests from other packages
   - Check if Wallaby includes test files that Vitest excludes

**Action**: Need to verify Wallaby configuration and test discovery

---

## Solutions to Fix Coverage

### Option 1: Add Tests for Uncovered Code (Recommended)

**Add to metrics-client.test.ts**:

```typescript
describe('Metrics Client - Query Methods (Stubs)', () => {
  // ... setup ...

  it('should return empty array from query() stub', async () => {
    const result = await client.query('test.*')
    expect(result).toEqual([])
  })

  it('should return dummy result from aggregate() stub', async () => {
    const result = await client.aggregate('test.*', 'sum')
    expect(result).toMatchObject({
      metric: 'test.*',
      aggregation: 'sum',
      value: 0,
      count: 0
    })
  })

  it('should return undefined from latest() stub', async () => {
    const result = await client.latest('test.metric')
    expect(result).toBeUndefined()
  })
})

describe('Metrics Writer - Utility Methods', () => {
  // ... setup ...

  it('should rotate to new file when rotate() called', async () => {
    vi.setSystemTime(new Date('2025-01-15T23:59:59Z'))
    const writer = new NDJSONWriter(config)
    await writer.write([{ metric: 'test', value: 1, type: 'counter', timestamp: new Date().toISOString() }])

    vi.setSystemTime(new Date('2025-01-16T00:00:01Z'))
    writer.rotate()

    await writer.write([{ metric: 'test2', value: 2, type: 'counter', timestamp: new Date().toISOString() }])

    // Verify two different files created
  })

  it('should cleanup old files when cleanup() called', async () => {
    // Create old files
    // Call cleanup(30)
    // Verify old files deleted, recent files kept
  })

  it('should return current file size from getCurrentFileSize()', async () => {
    const writer = new NDJSONWriter(config)
    const initialSize = await writer.getCurrentFileSize()
    expect(initialSize).toBe(0)

    await writer.write([{ metric: 'test', value: 1, type: 'counter', timestamp: new Date().toISOString() }])

    const afterWriteSize = await writer.getCurrentFileSize()
    expect(afterWriteSize).toBeGreaterThan(0)
  })
})
```

**Estimated**: +6 tests, coverage → 85%+

### Option 2: Exclude Stub Methods from Coverage (Not Recommended)

Update `vitest.config.ts`:

```typescript
coverage: {
  exclude: [
    // ... existing excludes ...
    '**/src/metrics/client.ts', // Exclude query methods
  ]
}
```

**Problem**: Hides real code that should be tested eventually

### Option 3: Lower Coverage Thresholds (Temporary)

Update `vitest.config.ts`:

```typescript
coverage: {
  thresholds: {
    lines: 70,      // Was 80
    functions: 74,  // Was 80
    branches: 68,   // Was 75
    statements: 70, // Was 80
  }
}
```

**Problem**: Lowers quality bar

---

## Recommended Action Plan

### Immediate (Fix CI)

1. **Add tests for stub methods** (query, aggregate, latest)
   - Simple tests that verify stub behavior
   - Estimated time: 15 minutes
   - Coverage gain: ~15%

2. **Add tests for utility methods** (rotate, cleanup, getCurrentFileSize)
   - Tests that verify utility behavior
   - Estimated time: 30 minutes
   - Coverage gain: ~10%

**Total time**: 45 minutes
**Expected coverage**: 85%+ (meets all thresholds)

### Follow-Up (Improve Quality)

3. **Implement actual query methods** (future task)
   - Replace stubs with real NDJSON reading
   - Pattern matching and time range filtering
   - Comprehensive tests

4. **Test retention cleanup** (future task)
   - Edge cases: file permission errors, partial deletions
   - Verify cleanup doesn't delete current day
   - Test date boundary conditions

### Investigation (Test Count Discrepancy)

5. **Verify Wallaby vs Vitest count**
   - Check Wallaby configuration
   - Compare test discovery patterns
   - Document why counts differ (if they actually do)

---

## Files to Modify

1. **Test File**: `src/__tests__/metrics-client.test.ts`
   - Add: "Query Methods (Stubs)" describe block
   - Add: "Writer Utility Methods" describe block
   - Estimated: +6 test cases

2. **No changes to implementation needed** - just test coverage

---

## Success Criteria

- ✅ All 329+ tests passing
- ✅ Lines coverage ≥ 80%
- ✅ Functions coverage ≥ 80%
- ✅ Branches coverage ≥ 75%
- ✅ CI pipeline green
- ✅ Wallaby count discrepancy explained (or resolved)

---

**Status**: Analysis Complete
**Next Step**: Add 6 test cases to cover uncovered methods
**Estimated Time**: 45 minutes
**Priority**: High (blocking CI)
