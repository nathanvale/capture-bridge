# Task Manager Patch: General-Purpose Agent Workaround

**Date**: 2025-10-10
**Issue**: code-implementer agents get "Interrupted by user" errors
**Solution**: Use general-purpose agents with embedded TDD workflow
**Applies to**: task-manager.md Phase 5 (TDD Mode delegation)

---

## Changes Required

### 1. Line 223: Change agent type

**Before**:
```typescript
Task({
  subagent_type: "code-implementer",
```

**After**:
```typescript
Task({
  subagent_type: "general-purpose",  // WORKAROUND: code-implementer gets interrupted
```

### 2. Lines 250-262: Replace delegation prompt entirely

**Before** (lines 250-262):
```typescript
**Instructions**:
1. RED: Write failing tests (use test pseudocode from specs if provided)
2. GREEN: Implement using pseudocode from specs as blueprint (adapt to TypeScript, don't copy blindly)
3. REFACTOR: Clean up while preserving spec logic
4. Use Wallaby MCP tools for real-time feedback
5. Report test results with coverage

**Git State**: On branch feat/${task_id}

**Critical**: Specs provide exact implementation - adapt to production TypeScript, don't reinvent.

Proceed with TDD cycle.`
})
```

**After** (COMPLETE replacement with embedded TDD workflow):
```typescript
**Working Directory**: packages/${package_name}

---

## YOUR TDD WORKFLOW (STRICT RED-GREEN-REFACTOR)

### Phase 0: Pre-Flight Checklist (MANDATORY)

Before writing ANY code:
- [ ] Read TestKit guide: \`.claude/rules/testkit-tdd-guide-condensed.md\`
- [ ] Use dynamic imports: \`await import('@orchestr8/testkit/...')\`
- [ ] Plan 5-step cleanup sequence
- [ ] Understand ${task.risk} risk level coverage requirements

### Phase 1: RED - Write Failing Test

**1A. Create test file**: \`${test_file_path}\`

Use TestKit patterns:
\`\`\`typescript
import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'

describe('${feature_name} [${ac.id}]', () => {
  const tempDirs: Array<{ path: string; cleanup: () => Promise<void> }> = []
  const databases: any[] = []

  afterEach(async () => {
    // 5-STEP CLEANUP (CRITICAL ORDER)
    // 1. Settle
    await new Promise(resolve => setTimeout(resolve, 100))

    // 2. Drain pools (if applicable)

    // 3. Close databases
    for (const db of databases) {
      try { if (db.open) db.close() } catch { }
    }
    databases.length = 0

    // 4. Cleanup temp dirs
    for (const dir of tempDirs) {
      try { await dir.cleanup() } catch { }
    }
    tempDirs.length = 0

    // 5. Force GC
    if (global.gc) global.gc()
  })

  it('should ${ac_requirement} [${ac.id}]', async () => {
    // Setup
    const { createTempDirectory } = await import('@orchestr8/testkit/fs')
    const tempDir = await createTempDirectory()
    tempDirs.push(tempDir)

    // Test imports the function that doesn't exist yet
    const { ${function_name} } = await import('../${module_path}.js')

    // Assertions
    expect(${function_name}(input)).toBe(expected)
  })
})
\`\`\`

**1B. Verify RED state using Wallaby**:
\`\`\`typescript
// Check failing tests
mcp__wallaby__wallaby_failingTests()
// Should show your new test failing

// Or check specific file
mcp__wallaby__wallaby_failingTestsForFile({
  file: "${test_file_path}"
})
\`\`\`

**Expected**: Test FAILS with "Cannot find module" or similar

**Alternative** (if Wallaby not responsive):
\`\`\`bash
cd packages/${package_name}
pnpm test ${test_pattern}
\`\`\`

### Phase 2: GREEN - Make Test Pass

**2A. Create implementation file**: \`${impl_file_path}\`

Use pseudocode from specs as blueprint:
\`\`\`typescript
${verbatim_implementation_guide}
\`\`\`

**2B. Verify GREEN state**:
\`\`\`bash
cd packages/${package_name}
pnpm test ${test_pattern}
\`\`\`

**Expected**: Test PASSES

### Phase 3: REFACTOR - Improve Code

- Extract constants
- Improve naming
- Add type safety
- Remove duplication

**3A. Re-run tests after each refactor**:
\`\`\`bash
pnpm test ${test_pattern}
\`\`\`

**Expected**: Tests STILL PASS

### Phase 4: Additional Tests (Risk-Based)

**${task.risk} Risk Level** requires:

${
  task.risk === 'High'
    ? '- **100% coverage**: Lines, Functions, Branches\n- **Security tests**: SQL injection, path traversal, command injection\n- **Memory leak test**: For loops/iterations\n- **Edge cases**: Empty input, null, undefined, boundary values'
    : task.risk === 'Medium'
    ? '- **80% coverage**: Lines, Functions\n- **Security tests**: Input validation\n- **Common edge cases**: null/undefined handling'
    : '- **70% coverage**: Core paths\n- **Happy path + 1 edge case**'
}

Add tests until coverage requirements met.

### Phase 5: Security & Performance

**Security Test Template** (if AC handles user input):
\`\`\`typescript
it('should prevent SQL injection [${ac.id}]', async () => {
  const maliciousInput = "'; DROP TABLE users; --"

  // ✅ CORRECT: Parameterized query
  const stmt = db.prepare('SELECT * FROM table WHERE field = ?')
  const result = stmt.get(maliciousInput)

  expect(result).toBeUndefined() // Safe!
})
\`\`\`

**Memory Leak Test Template** (if AC has loops):
\`\`\`typescript
it('should not leak memory during repeated operations [${ac.id}]', async () => {
  if (global.gc) global.gc()
  const before = process.memoryUsage().heapUsed

  for (let i = 0; i < 1000; i++) {
    ${function_name}(input)
  }

  if (global.gc) global.gc()
  await new Promise(resolve => setTimeout(resolve, 100))
  const after = process.memoryUsage().heapUsed

  expect(after - before).toBeLessThan(5 * 1024 * 1024) // < 5MB
})
\`\`\`

### Phase 6: Final Verification

**6A. Run ALL tests**:
\`\`\`bash
cd packages/${package_name}
pnpm test ${test_pattern}
\`\`\`

**6B. Check coverage** (if coverage tool configured):
\`\`\`bash
pnpm test:coverage ${test_pattern}
\`\`\`

**6C. Verify no regressions**:
\`\`\`bash
pnpm test  # Run entire test suite
\`\`\`

---

## IMPORTANT NOTES

**You HAVE access to Wallaby MCP tools** - USE THEM for real-time feedback:
- ✅ USE \`mcp__wallaby__wallaby_failingTests\` - Verify RED state
- ✅ USE \`mcp__wallaby__wallaby_allTestsForFile\` - Verify GREEN state for specific file
- ✅ USE \`mcp__wallaby__wallaby_coveredLinesForFile\` - Check coverage
- ✅ USE \`mcp__wallaby__wallaby_runtimeValues\` - Debug failing tests
- ⚠️ AVOID \`mcp__wallaby__wallaby_allTests\` - Returns too much data (use file-specific version)

**TestKit Patterns (ALWAYS use dynamic imports)**:
- Temp dirs: \`const { createTempDirectory } = await import('@orchestr8/testkit/fs')\`
- In-memory DB: \`import Database from 'better-sqlite3'; const db = new Database(':memory:')\`
- MSW HTTP: \`import { setupMSW } from '@orchestr8/testkit/msw'\` (module-level)

**Critical Rules**:
- Always use parameterized SQL queries (NOT string concatenation)
- Always use 5-step cleanup sequence in EXACT order
- Always track resources in arrays for cleanup
- Always use dynamic imports for TestKit utilities

---

## FINAL OUTPUT FORMAT (REQUIRED)

Return this EXACT structure as your final message:

\`\`\`markdown
## ✅ TDD Cycle Complete: ${ac.id}

**Acceptance Criterion**: ${ac.text}

**Test Status**: ✅ All tests passing (X/X tests)

**Tests Written**:
1. [Test name 1] - Happy path
2. [Test name 2] - Edge case 1
3. [Test name 3] - Security validation
4. [Test name 4] - Memory leak check (if applicable)

**Files Created/Modified**:
- \`${test_file_path}\` (X tests, RED → GREEN → REFACTOR complete)
- \`${impl_file_path}\` (implementation using spec pseudocode)

**Verification**:
- All tests green: ✅
- Coverage adequate for ${task.risk} risk: ✅
- Security tests included: ✅ (if applicable)
- Memory leak tests passed: ✅ (if applicable)
- No regressions: ✅

**TestKit Utilities Used**:
- createTempDirectory() (temp directory management)
- Database(':memory:') (in-memory SQLite)
- [other utilities]

**Cleanup**: ✅ 5-step sequence implemented

**Ready for Commit**: YES
**Suggested Commit Message**: \`feat(${task_id}): ${ac_summary} [${ac.id}]\`
\`\`\`

---

**Git State**: On branch feat/${task_id}

**Critical**: Follow TDD cycle strictly: RED → GREEN → REFACTOR. Do NOT write implementation before tests.

Proceed with TDD cycle now.`
})
```

---

## Complete Updated Delegation Block

Here's the complete replacement for task-manager.md lines 222-262:

```typescript
Task({
  subagent_type: "general-purpose",  // WORKAROUND: code-implementer gets interrupted
  description: `TDD Mode: ${task_id} - ${ac.id}`,
  prompt: `**YOU ARE IMPLEMENTING ${ac.id} IN TDD MODE**

**Task**: ${task_id}
**AC ID**: ${ac.id}
**Acceptance Criterion**: ${ac.text}
**Risk Level**: ${task.risk}

**Implementation Pseudocode from Specs** (VERBATIM - use as blueprint):
${verbatim_code_blocks}

**Test Pseudocode from Specs** (VERBATIM - follow structure):
${verbatim_test_cases}

**Type Definitions**:
${verbatim_type_definitions}

**Algorithm Details**:
${verbatim_algorithms_with_comments}

**Decision Context from ADRs**:
${decision_rationale_and_alternatives}

**Error Handling from Guides**:
${error_patterns_and_retry_logic}

**Working Directory**: packages/${package_name}

---

## YOUR TDD WORKFLOW (STRICT RED-GREEN-REFACTOR)

[... INSERT COMPLETE WORKFLOW FROM ABOVE ...]

**Git State**: On branch feat/${task_id}

**Critical**: Follow TDD cycle strictly: RED → GREEN → REFACTOR. Do NOT write implementation before tests.

Proceed with TDD cycle now.`
})
```

---

## Testing the Patch

After applying, test with:

1. **Single AC**: Verify general-purpose agent receives complete instructions
2. **Check output**: Agent should return structured completion report
3. **Verify tests pass**: Agent should run `pnpm test` not Wallaby tools
4. **Check commits**: task-manager should commit with proper message

---

## Reverting When Platform Fixed

When code-implementer agents work again:

1. Change line 223: `"general-purpose"` → `"code-implementer"`
2. Restore lines 250-262 to original short prompt
3. Re-enable Wallaby MCP tools instruction
4. Remove "WORKAROUND" comments

Track issue: [File GitHub issue about code-implementer interruption]

---

## Impact Analysis

**Token increase**: ~1,200 tokens per TDD Mode delegation
- Before: ~400 tokens (short prompt)
- After: ~1,600 tokens (embedded workflow)
- Trade-off: Necessary to unblock /pm start workflow

**Functionality preserved**:
- ✅ Same TDD discipline (RED-GREEN-REFACTOR)
- ✅ Same TestKit patterns
- ✅ Same security/coverage requirements
- ✅ Same completion report format

**Differences**:
- ❌ No Wallaby MCP real-time feedback (use pnpm test instead)
- ✅ More explicit instructions (helpful for clarity)
- ✅ Works with general-purpose agents (unblocked!)
