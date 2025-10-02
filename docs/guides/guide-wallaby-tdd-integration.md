---
title: Wallaby TDD Integration Guide
status: living
owner: Nathan
version: 1.0.0
date: 2025-09-29
doc_type: guide
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Wallaby TDD Integration Guide

## Purpose

This guide explains how to use the `wallaby-tdd-agent` in conjunction with existing testing infrastructure to execute disciplined test-driven development (TDD) cycles in the ADHD Brain project. It bridges the gap between test strategy (testing-strategist) and test execution (wallaby-tdd-agent) while maintaining ADHD-friendly workflows.

**Target Audience:** Developers implementing features using TDD with Wallaby's real-time feedback.

This guide supports the **MPPP scope** and demonstrates how Wallaby MCP tools accelerate the red-green-refactor cycle for voice and email capture features.

_Nerdy aside: Think of Wallaby as your TDD co-pilot with X-ray vision—it sees test failures before you even save the file, like a time-traveling debugger from the future of testing._

## When to Use This Guide

Use this guide when:

- Starting TDD implementation of a new feature
- Setting up Wallaby for the first time
- Coordinating between testing-strategist and wallaby-tdd-agent
- Debugging test failures with runtime value inspection
- Ensuring complete test coverage for P0/P1 risks
- Optimizing TDD cycle times for ADHD-friendly development

## Prerequisites

**Required Setup:**

- Wallaby.js extension installed (v1.0.437+)
- Valid Wallaby license or trial
- Project configured with wallaby.js config file
- Vitest as test runner (per project standards)

**Required Knowledge:**

- Basic TDD principles (red-green-refactor)
- Understanding of risk classifications (P0/P1/P2)
- Familiarity with TestKit patterns from [TestKit Usage Guide](./guide-testkit.md)

**Required Reading:**

- [TDD Applicability Guide](./guide-tdd-applicability.md)
- [TestKit Usage Guide](./guide-testkit.md)
- [Agent Workflow Guide](./guide-agent-workflow.md)

## Quick Reference

**Agent Coordination Flow:**

```
testing-strategist (strategy) → wallaby-tdd-agent (execution)
     ↓                              ↓
Risk classification           Red-green-refactor
Test layer assignment        Runtime value debugging
Mock vs real decision        Coverage verification
     ↓                              ↓
Test spec document           Working tested code
```

**Key Commands:**

```typescript
// Start TDD cycle
"Use wallaby-tdd-agent to implement [feature] with TDD"

// Debug failing test
"Use wallaby-tdd-agent to inspect runtime values in failing test"

// Check coverage
"Use wallaby-tdd-agent to verify coverage for [file]"

// Update snapshots
"Use wallaby-tdd-agent to update snapshots for [test]"
```

## Wallaby MCP Tools Reference

### Test Execution Tools

| Tool                                        | Purpose                   | When to Use            |
| ------------------------------------------- | ------------------------- | ---------------------- |
| `mcp__wallaby__wallaby_failingTests`        | Get all failing tests     | RED phase verification |
| `mcp__wallaby__wallaby_allTests`            | Get all project tests     | Overall status check   |
| `mcp__wallaby__wallaby_testById`            | Get specific test details | Focused debugging      |
| `mcp__wallaby__wallaby_failingTestsForFile` | File-specific failures    | Module TDD             |
| `mcp__wallaby__wallaby_allTestsForFile`     | All tests for file        | Coverage check         |

### Runtime Debugging Tools

| Tool                                        | Purpose                 | When to Use               |
| ------------------------------------------- | ----------------------- | ------------------------- |
| `mcp__wallaby__wallaby_runtimeValues`       | Inspect variable values | Debug unexpected failures |
| `mcp__wallaby__wallaby_runtimeValuesByTest` | Test-specific values    | Isolate test issues       |

### Coverage Tools

| Tool                                        | Purpose       | When to Use               |
| ------------------------------------------- | ------------- | ------------------------- |
| `mcp__wallaby__wallaby_coveredLinesForFile` | File coverage | Identify untested code    |
| `mcp__wallaby__wallaby_coveredLinesForTest` | Test coverage | Verify test effectiveness |

### Snapshot Tools

| Tool                                           | Purpose               | When to Use               |
| ---------------------------------------------- | --------------------- | ------------------------- |
| `mcp__wallaby__wallaby_updateTestSnapshots`    | Update test snapshots | After intentional changes |
| `mcp__wallaby__wallaby_updateFileSnapshots`    | Update file snapshots | Bulk snapshot updates     |
| `mcp__wallaby__wallaby_updateProjectSnapshots` | Update all snapshots  | Major refactoring         |

## Step-by-Step TDD Workflow

### Step 1: Receive Test Strategy

**From testing-strategist:**

```markdown
## TDD Applicability Decision

- Risk class: P0 (Data integrity)
- Decision: TDD Required
- Scope:
  - Unit: Hash calculation, deduplication logic
  - Integration: Database persistence
- Mock strategy: Use TestKit SQLite memory DB
```

### Step 2: Start RED Phase

**Invoke wallaby-tdd-agent:**

```
"Use wallaby-tdd-agent to start TDD for deduplication feature"
```

**Write failing test:**

```typescript
// packages/staging-ledger/src/deduplication.spec.ts
import { describe, it, expect } from "vitest"
import { DeduplicationService } from "./deduplication"

describe("DeduplicationService", () => {
  it("should reject duplicate content within window", () => {
    const service = new DeduplicationService()
    const hash = "abc123"

    // First occurrence should not be duplicate
    expect(service.isDuplicate(hash)).toBe(false)

    // Immediate recheck should be duplicate
    expect(service.isDuplicate(hash)).toBe(true)
  })
})
```

**Verify RED status:**

```typescript
await mcp__wallaby__wallaby_failingTests()
// Returns: Test failing - "DeduplicationService is not defined"
```

### Step 3: Enter GREEN Phase

**Write minimal implementation:**

```typescript
// packages/staging-ledger/src/deduplication.ts
export class DeduplicationService {
  private seen = new Set<string>()

  isDuplicate(hash: string): boolean {
    if (this.seen.has(hash)) {
      return true
    }
    this.seen.add(hash)
    return false
  }
}
```

**Verify GREEN status:**

```typescript
await mcp__wallaby__wallaby_allTests()
// Returns: All tests passing!
```

### Step 4: Add Time Window Test (RED Again)

```typescript
it("should accept duplicate after window expires", async () => {
  const service = new DeduplicationService()
  const hash = "abc123"

  // First occurrence
  expect(service.isDuplicate(hash)).toBe(false)

  // Advance time past window
  await advanceTimersByTime(5 * 60 * 1000 + 1)

  // Should accept after window
  expect(service.isDuplicate(hash)).toBe(false)
})
```

### Step 5: Debug with Runtime Values

**When test fails unexpectedly:**

```typescript
await mcp__wallaby__wallaby_runtimeValues({
  file: "deduplication.ts",
  line: 8,
  lineContent: "const age = now - lastSeen",
  expression: "age",
})
// Returns: Runtime value: -300001 (negative time!)
```

### Step 6: REFACTOR Phase

**After all tests green:**

```typescript
export class DeduplicationService {
  private static readonly WINDOW_MS = 5 * 60 * 1000
  private seenHashes = new Map<string, number>()

  isDuplicate(contentHash: string): boolean {
    const currentTime = Date.now()
    const lastSeenTime = this.seenHashes.get(contentHash)

    if (lastSeenTime) {
      const age = currentTime - lastSeenTime
      if (age < DeduplicationService.WINDOW_MS) {
        return true
      }
    }

    this.seenHashes.set(contentHash, currentTime)
    return false
  }
}
```

**Continuous verification during refactor:**

```typescript
// After each change
await mcp__wallaby__wallaby_allTestsForFile({
  file: "deduplication.ts",
})
// Ensure still green
```

### Step 7: Coverage Verification

```typescript
await mcp__wallaby__wallaby_coveredLinesForFile({
  file: "deduplication.ts",
})
// Returns: 95% coverage, lines 18-20 not covered (error handling)
```

**Add test for uncovered branch:**

```typescript
it("should handle null hash gracefully", () => {
  const service = new DeduplicationService()
  expect(() => service.isDuplicate(null)).not.toThrow()
  expect(service.isDuplicate(null)).toBe(false)
})
```

## Integration with TestKit

### Using TestKit Patterns with Wallaby

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { createMemoryUrl, applyTestPragmas } from "@template/testkit/sqlite"
import { useFakeTimers } from "@template/testkit/env"
import Database from "better-sqlite3"

describe("DeduplicationService with DB", () => {
  let db: Database.Database

  beforeEach(() => {
    // TestKit setup
    useFakeTimers()
    db = new Database(createMemoryUrl())
    applyTestPragmas(db)
  })

  it("should persist deduplication state", () => {
    const service = new DeduplicationService(db)
    const hash = "abc123"

    // TDD cycle with Wallaby feedback
    expect(service.isDuplicate(hash)).toBe(false)

    // Check runtime state
    // Wallaby shows inline: "hash added to DB"

    expect(service.isDuplicate(hash)).toBe(true)
  })
})
```

## ADHD-Friendly Patterns

### Pattern 1: Micro-Cycles (5-Minute Loops)

```markdown
## Current TDD Cycle

⏱️ Started: 10:15 AM
🔴 RED: Write test for hash validation (2 min)
🟢 GREEN: Implement validation (2 min)
🔵 REFACTOR: Extract constants (1 min)
✅ Complete: 10:20 AM

Next: Test for timestamp handling...
```

### Pattern 2: Visual Progress Tracking

```typescript
describe("Voice Capture Features", () => {
  // ✅ Completed
  describe("metadata extraction", () => {
    it("✅ extracts duration", () => {})
    it("✅ extracts format", () => {})
    it("✅ extracts creation date", () => {})
  })

  // 🚧 In Progress
  describe("deduplication", () => {
    it("✅ rejects duplicates", () => {})
    it("🔴 handles time window", () => {}) // Current focus
    it("⏸️ cleans old entries", () => {}) // Next
  })
})
```

### Pattern 3: Instant Feedback Focus

```typescript
// Wallaby shows inline indicators:
function calculateHash(content: string): string {
  const normalized = content.trim() // ✅ covered, passing
  if (!normalized) {
    // ⚠️ partially covered
    return "" // ❌ not covered
  }
  return crypto
    .createHash("sha256") // ✅ covered
    .update(normalized) // ✅ covered
    .digest("hex") // ✅ covered
}
```

## Common Scenarios

### Scenario 1: Complex State Debugging

```typescript
// Test is failing, need to understand why
it("should handle concurrent captures", async () => {
  const results = await Promise.all([
    captureVoice("file1.m4a"),
    captureVoice("file2.m4a"),
  ])
  expect(results).toHaveLength(2)
})

// Use Wallaby to inspect
await mcp__wallaby__wallaby_runtimeValuesByTest({
  testId: "test-123",
  file: "capture.ts",
  line: 45,
  expression: "this.activeCaptures",
})
// Shows: Map { 'file1.m4a' => 'processing' }
// Missing file2! Race condition found
```

### Scenario 2: Integration Test Coverage

```typescript
// Check integration test effectiveness
await mcp__wallaby__wallaby_coveredLinesForTest({
  testId: "integration-gmail-sync",
})
// Returns: Covers gmail-adapter.ts (85%), retry-logic.ts (92%)
// Missing: Error handling paths in gmail-adapter.ts lines 67-74
```

### Scenario 3: Snapshot Testing

```typescript
// After intentional API response format change
await mcp__wallaby__wallaby_updateTestSnapshots({
  testId: "api-response-transform",
})
// Snapshots updated for new format
```

## Coordination with Other Agents

### Testing-Strategist → Wallaby-TDD-Agent

**Handoff format:**

```markdown
## TDD Task Assignment

Feature: Email Capture Polling
Risk Level: P0
Test Strategy:

- Unit: Polling interval logic, backoff calculation
- Integration: Gmail API with MSW mocks
- Contract: OAuth token refresh
  TestKit Patterns: Use MSW handlers, fake timers

→ wallaby-tdd-agent implements with TDD discipline
```

### Risk-YAGNI-Enforcer → Wallaby-TDD-Agent

**Scope verification:**

```markdown
## YAGNI Verification

In Scope for TDD:

- Basic polling (15-minute interval)
- Simple exponential backoff
- Token refresh

Out of Scope (Skip TDD):

- Advanced scheduling
- Multi-account support
- Push notifications

→ wallaby-tdd-agent focuses only on in-scope items
```

## Troubleshooting

### Problem: Wallaby not detecting tests

**Solution:**

1. Check wallaby.js configuration
2. Verify test file pattern matches
3. Ensure Vitest is properly configured
4. Check for syntax errors preventing parse

### Problem: Runtime values not available

**Solution:**

1. Ensure Wallaby is running (check status bar)
2. Verify line number is correct
3. Check that code is actually executed in test
4. Try broader expression (variable name vs property)

### Problem: Coverage seems incorrect

**Solution:**

1. Clear Wallaby cache (Restart Wallaby)
2. Check for multiple test runs affecting results
3. Verify all test files are included
4. Look for initialization code running outside tests

### Problem: Tests pass in Wallaby but fail in CI

**Solution:**

1. Check for timing dependencies
2. Verify TestKit fake timers are used
3. Look for environment-specific code
4. Ensure deterministic test data

## Performance Optimization

### Fast TDD Cycles

1. **Use Smart Start**: Only run tests for current file
2. **Leverage Exclusive Tests**: Use `it.only` during development
3. **Minimize Setup**: Use TestKit's quick setup helpers
4. **Memory DBs**: Always use in-memory SQLite for unit tests

### Wallaby Configuration

```javascript
// wallaby.js
module.exports = function () {
  return {
    files: ["packages/*/src/**/*.ts", "!packages/*/src/**/*.spec.ts"],
    tests: ["packages/*/src/**/*.spec.ts"],
    env: {
      type: "node",
    },
    testFramework: "vitest",
    // Performance optimizations
    workers: {
      initial: 1,
      regular: 1,
      recycle: true,
    },
    runMode: "onsave", // or 'automatic' for continuous
  }
}
```

## Best Practices

### DO:

✅ Write one test at a time
✅ Keep cycles under 10 minutes
✅ Use runtime values for debugging
✅ Check coverage after each feature
✅ Refactor only when green
✅ Commit after each complete cycle

### DON'T:

❌ Write multiple tests before implementing
❌ Skip the red phase
❌ Ignore Wallaby's inline warnings
❌ Test implementation details
❌ Leave commented test code
❌ Commit with failing tests

## Related Documentation

### Foundation

- [Master PRD v2.3.0-MPPP](../master/prd-master.md)
- [Roadmap v2.0.0-MPPP](../master/roadmap.md)

### Testing Infrastructure

- [TDD Applicability Guide](./guide-tdd-applicability.md)
- [TestKit Usage Guide](./guide-testkit.md)
- [Test Strategy Guide](./guide-test-strategy.md)
- [Agent Workflow Guide](./guide-agent-workflow.md)

### Agent Specifications

- [Testing Strategist Agent](./.claude/agents/testing-strategist.md)
- [Wallaby TDD Agent](./.claude/agents/wallaby-tdd-agent.md)
- [Risk YAGNI Enforcer](./.claude/agents/risk-yagni-enforcer.md)

### External Resources

- [Wallaby.js Documentation](https://wallabyjs.com/docs/)
- [Wallaby MCP Server Guide](https://wallabyjs.com/docs/features/mcp/)
- [Vitest Documentation](https://vitest.dev/)

## Maintenance Notes

### When to Update This Guide

**Review Triggers:**

- New Wallaby MCP tools added
- Changes to TDD workflow
- Updates to TestKit patterns
- New integration patterns discovered
- Performance optimizations identified

**Change Process:**

1. Test new patterns thoroughly
2. Update guide with examples
3. Verify with wallaby-tdd-agent
4. Update agent specification if needed

### Version History

- v1.0.0 (2025-09-29): Initial guide with Wallaby MCP integration

### Known Limitations

- Wallaby requires license after trial period
- Some advanced features require Pro version
- MCP server requires specific extension versions
- Performance varies with project size

---

_Remember: Wallaby turns TDD from a discipline into a dialogue—you write a test, it instantly responds with feedback, you adjust, and the conversation continues until your feature emerges fully tested and refactored._
