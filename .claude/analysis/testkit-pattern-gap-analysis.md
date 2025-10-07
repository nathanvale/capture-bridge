# TestKit Pattern Gap Analysis

**Issue**: Wallaby TDD Agent used Node's `tmpdir()` instead of TestKit's `createTempDirectory()`

**Date**: 2025-10-07
**Severity**: High - Causes test isolation issues and violates TestKit best practices

---

## The Problem

When implementing METRICS_INFRASTRUCTURE--T01, the wallaby-tdd-agent created test code using:

```typescript
// ❌ WRONG - What the agent generated
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

beforeEach(() => {
  testDir = join(tmpdir(), `metrics-test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  metricsDir = join(testDir, '.metrics')
})
```

Instead of the correct TestKit pattern:

```typescript
// ✅ CORRECT - What it should have generated
beforeEach(async () => {
  const { createTempDirectory } = await import('@orchestr8/testkit')
  const tempDir = await createTempDirectory()
  testDir = tempDir.path
  metricsDir = join(testDir, '.metrics')
})
```

---

## Root Cause Analysis

### 1. **Wallaby TDD Agent Instructions Have Wrong Templates**

**Location**: `.claude/agents/wallaby-tdd-agent.md`

**Lines 241-261**: SQLite Testing Pattern template
```typescript
beforeEach(() => {
  testDir = join(tmpdir(), `test-${Date.now()}`)  // ❌ WRONG!
  mkdirSync(testDir, { recursive: true })
})
```

**Lines 417-478**: SQLite Test Template (repeated wrong pattern)
```typescript
beforeEach(() => {
  testDir = join(tmpdir(), `test-${Date.now()}`)  // ❌ WRONG!
  mkdirSync(testDir, { recursive: true })
})
```

### 2. **TestKit TDD Guide Also Has Wrong Pattern**

**Location**: `.claude/rules/testkit-tdd-guide.md`

The guide claims to be "production-verified against 319 passing tests" but shows:

```typescript
beforeEach(() => {
  // Create temp directory
  testDir = join(tmpdir(), `test-${Date.now()}`)  // ❌ WRONG!
  mkdirSync(testDir, { recursive: true })
})
```

**Missing**: The guide has ZERO mentions of `createTempDirectory()` - grep confirms this!

### 3. **Production Tests Also Use Old Pattern**

**Location**: `packages/foundation/src/__tests__/testkit-sqlite-pool.test.ts`

Even the "verified production tests" use the old pattern:
```typescript
beforeEach(() => {
  testDir = join(tmpdir(), `testkit-pool-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  dbPath = join(testDir, 'test.db')
})
```

### 4. **Why This Is a Problem**

The TestKit `createTempDirectory()` utility provides:
- **Automatic cleanup** via TestKit's resource tracking
- **Proper isolation** between test runs
- **Cross-platform safety** (handles path differences)
- **Integration with TestKit's global cleanup hooks**

Manual `tmpdir()` + `mkdirSync()`:
- Requires manual cleanup in `afterEach`
- Risks temp directory pollution if cleanup fails
- No integration with TestKit's resource management
- More code, more chances for errors

---

## Why The Agent Chose Wrong

**Decision Path**:
1. Agent receives task: "Implement METRICS_INFRASTRUCTURE--T01"
2. Agent reads instruction: "ALWAYS read production-verified TDD patterns"
3. Agent sees embedded templates in wallaby-tdd-agent.md (lines 241-261, 417-478)
4. Templates show `tmpdir()` pattern as "production-verified"
5. Agent uses this pattern (correctly following its instructions!)
6. Tests work (tmpdir() isn't broken, just not best practice)
7. Issue discovered later during manual review

**The agent was following instructions perfectly - the instructions were wrong!**

---

## Information Architecture Flaw

```
┌─────────────────────────────────────┐
│  wallaby-tdd-agent.md               │
│  ❌ Has embedded wrong templates    │
│  ❌ Points to TDD guide but shows   │
│     conflicting inline examples     │
└──────────────┬──────────────────────┘
               │ references
               ↓
┌─────────────────────────────────────┐
│  testkit-tdd-guide.md               │
│  ❌ Claims "production-verified"    │
│  ❌ Shows tmpdir() pattern          │
│  ❌ Never mentions createTempDir()  │
└──────────────┬──────────────────────┘
               │ references
               ↓
┌─────────────────────────────────────┐
│  packages/foundation/src/__tests__/ │
│  ❌ Production tests use tmpdir()   │
│  ⚠️  Pattern was never updated to   │
│     use TestKit utilities!          │
└─────────────────────────────────────┘
```

**The whole documentation chain is outdated!**

---

## Recommended Fixes

### Priority 1: Update Wallaby TDD Agent Instructions

**File**: `.claude/agents/wallaby-tdd-agent.md`

**Change lines 241-261 and 417-478 to**:
```typescript
beforeEach(async () => {
  const { createTempDirectory } = await import('@orchestr8/testkit')
  const tempDir = await createTempDirectory()
  testDir = tempDir.path
  metricsDir = join(testDir, '.metrics')
})

afterEach(async () => {
  // Automatic cleanup via TestKit - no manual rmSync needed!
  // Just close resources in the 4-step sequence
  await new Promise(resolve => setTimeout(resolve, 100))

  for (const pool of pools) {
    try { await pool.drain() } catch {}
  }
  pools = []

  for (const db of databases) {
    try {
      if (db.open && !db.readonly) db.close()
    } catch {}
  }
  databases.length = 0

  // TestKit handles temp directory cleanup automatically
  if (global.gc) global.gc()
})
```

### Priority 2: Update TestKit TDD Guide

**File**: `.claude/rules/testkit-tdd-guide.md`

1. Add new section after "Import Patterns":
   ```markdown
   ### ✅ PRODUCTION PATTERN: TestKit Temp Directories

   **From**: Updated 2025-10-07 - TestKit 2.0.0 best practice

   ```typescript
   describe('My Tests', () => {
     let testDir: string

     beforeEach(async () => {
       const { createTempDirectory } = await import('@orchestr8/testkit')
       const tempDir = await createTempDirectory()
       testDir = tempDir.path
     })

     // No manual cleanup needed - TestKit handles it!
   })
   ```

2. Update all template examples to use `createTempDirectory()`
3. Add warning box:
   ```markdown
   ⚠️ **DEPRECATED PATTERN**: Do NOT use Node's tmpdir() + mkdirSync()

   ❌ Old way (pre-TestKit 2.0):
   ```typescript
   const testDir = join(tmpdir(), `test-${Date.now()}`)
   mkdirSync(testDir, { recursive: true })
   ```

   ✅ New way (TestKit 2.0+):
   ```typescript
   const { createTempDirectory } = await import('@orchestr8/testkit')
   const tempDir = await createTempDirectory()
   const testDir = tempDir.path
   ```
   ```

### Priority 3: Update Foundation Tests

**Files**: All `packages/foundation/src/__tests__/*.test.ts`

Migrate all 14 test files to use `createTempDirectory()` pattern.

**Scope**: ~40 `beforeEach` blocks need updating

### Priority 4: Add Pre-Flight Validation

**File**: `.claude/agents/wallaby-tdd-agent.md`

Add to Pre-Flight Checklist (line 230):
```markdown
□ Am I using TestKit's createTempDirectory() instead of tmpdir()?
  - ✅ CORRECT: const { createTempDirectory } = await import('@orchestr8/testkit')
  - ❌ WRONG: const testDir = join(tmpdir(), `test-${Date.now()}`)
```

---

## Lessons Learned

### 1. **Documentation Must Match Reality**
- Don't claim "production-verified" unless patterns are actually used in production
- Regular audits of documentation vs actual code

### 2. **Single Source of Truth**
- The TDD guide should be the ONLY place with patterns
- Agent instructions should REFERENCE, not DUPLICATE
- Duplication leads to drift

### 3. **TestKit Utilities First**
- If TestKit provides a utility, use it
- Don't fall back to Node.js primitives
- Update docs when new utilities are added

### 4. **Agent Instructions Are Code**
- Treat agent prompts with same rigor as source code
- Version control, review, test them
- Bad instructions = bad output, always

---

## Testing The Fix

After updating all documentation:

1. **Delete the bad test file**:
   ```bash
   rm packages/foundation/src/__tests__/metrics-client.test.ts
   ```

2. **Re-run wallaby-tdd-agent** with same task:
   ```
   Task: METRICS_INFRASTRUCTURE--T01
   AC: Write metrics to NDJSON with daily rotation
   ```

3. **Verify it generates**:
   ```typescript
   beforeEach(async () => {
     const { createTempDirectory } = await import('@orchestr8/testkit')
     const tempDir = await createTempDirectory()
     testDir = tempDir.path
   })
   ```

4. **Success criteria**:
   - No `tmpdir()` imports
   - No `mkdirSync()` calls
   - Uses `createTempDirectory()`
   - Tests pass with proper isolation

---

## Impact Assessment

**Current State**:
- ❌ Wallaby TDD agent generates suboptimal test code
- ❌ All future TDD tasks will have this issue
- ❌ Manual review catches it (as happened this time)
- ⚠️ Technical debt accumulates

**After Fix**:
- ✅ Wallaby TDD agent generates correct TestKit patterns
- ✅ All future tests use best practices by default
- ✅ No manual intervention needed
- ✅ Documentation matches reality

---

## Immediate Action Items

1. [ ] Update `.claude/agents/wallaby-tdd-agent.md` templates (2 locations)
2. [ ] Update `.claude/rules/testkit-tdd-guide.md` (add createTempDirectory section)
3. [ ] Add deprecation warnings for tmpdir() pattern
4. [ ] Create migration task for foundation tests (40 beforeEach blocks)
5. [ ] Test wallaby-tdd-agent with updated instructions
6. [ ] Document this in ADR if pattern is critical

---

**Status**: Analysis Complete
**Next Step**: Update wallaby-tdd-agent.md and testkit-tdd-guide.md
**Owner**: Prompt Engineer / Documentation Team
**Priority**: High (affects all future TDD work)
