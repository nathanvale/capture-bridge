# General-Purpose Agent TDD Template

**Purpose**: Workaround for code-implementer agent interruption issue
**Date**: 2025-10-10
**Issue**: code-implementer agent type gets "Interrupted by user" errors
**Solution**: Use general-purpose agents with embedded TDD workflow

---

## TDD Mode Delegation Template

Use this template when task-manager needs to delegate TDD work:

```typescript
Task({
  subagent_type: "general-purpose",  // ← Changed from code-implementer
  description: `TDD Mode: ${task_id} - ${ac.id}`,
  prompt: `**YOU ARE IMPLEMENTING AC${ac_number} IN TDD MODE**

**Task**: ${task_id}
**AC ID**: ${ac.id}
**Acceptance Criterion**: ${ac.text}
**Risk Level**: ${task.risk}

---

## YOUR TDD WORKFLOW (MANDATORY)

### Phase 0: Pre-Flight Checklist
- Read TestKit guide: \`.claude/rules/testkit-tdd-guide-condensed.md\`
- Use dynamic imports: \`await import('@orchestr8/testkit/...')\`
- Plan 5-step cleanup sequence

### Phase 1: RED - Write Failing Test
1. Create test file: \`${test_file_path}\`
2. Use TestKit patterns (createTempDirectory, Database(':memory:'), etc.)
3. Write test that EXPECTS the function to exist (it won't yet)
4. Verify test fails: \`cd ${package} && pnpm test ${test_pattern}\`

### Phase 2: GREEN - Make Test Pass
1. Create implementation file: \`${impl_file_path}\`
2. Write MINIMAL code to pass test
3. Verify test passes

### Phase 3: REFACTOR - Improve Code
1. Clean up implementation while keeping tests green
2. Verify tests still pass

### Phase 4: Additional Tests (Based on Risk)
**${task.risk} Risk** requires:
- High: 100% coverage + security tests + memory leak tests
- Medium: 80% coverage + security tests
- Low: 70% coverage

### Phase 5: Final Verification
- Run all tests: \`cd ${package} && pnpm test ${test_pattern}\`
- Report: X/X tests passing

---

## CONTEXT FROM SPECS

**Implementation Pseudocode** (VERBATIM from specs):
\`\`\`
${verbatim_code_blocks}
\`\`\`

**Test Structure** (from specs):
\`\`\`
${verbatim_test_cases}
\`\`\`

**Type Definitions**:
\`\`\`typescript
${verbatim_types}
\`\`\`

---

## TESTKIT PATTERNS

**Temp Directories**:
\`\`\`typescript
const { createTempDirectory } = await import('@orchestr8/testkit/fs')
const tempDir = await createTempDirectory()
tempDirs.push(tempDir)
\`\`\`

**In-Memory Database**:
\`\`\`typescript
import Database from 'better-sqlite3'
const db = new Database(':memory:')
databases.push(db)
\`\`\`

**5-Step Cleanup** (afterEach):
\`\`\`typescript
afterEach(async () => {
  // 1. Settle
  await new Promise(resolve => setTimeout(resolve, 100))

  // 2. Drain pools
  for (const pool of pools) await pool.drain()
  pools.length = 0

  // 3. Close databases
  for (const db of databases) db.close()
  databases.length = 0

  // 4. TestKit auto-cleanup (temp dirs)

  // 5. Force GC
  if (global.gc) global.gc()
})
\`\`\`

---

## TOOLS AVAILABLE

You have access to:
- Read, Write, Edit, Bash
- All file system operations

You do NOT have Wallaby MCP tools - use bash to run tests instead:
\`\`\`bash
cd ${package} && pnpm test ${test_pattern}
\`\`\`

---

## FINAL OUTPUT FORMAT (REQUIRED)

Return this EXACT format as your final message:

\`\`\`markdown
## ✅ TDD Cycle Complete: ${ac.id}

**Acceptance Criterion**: ${ac.text}

**Test Status**: ✅ All tests passing (X/X)

**Tests Written**:
1. [Test name 1]
2. [Test name 2]
...

**Files Created/Modified**:
- ${test_file_path} (X tests)
- ${impl_file_path} (implementation)

**Verification**:
- All tests green: ✅
- Coverage adequate for ${task.risk} risk: ✅

**Ready for Commit**: YES
**Suggested Commit Message**: \`feat(${task_id}): ${ac_summary} [${ac.id}]\`
\`\`\`

---

**Begin TDD cycle now. Follow RED → GREEN → REFACTOR strictly.**
`
})
```

---

## Setup Mode Delegation Template

```typescript
Task({
  subagent_type: "general-purpose",
  description: `Setup Mode: ${task_id} - ${ac.id}`,
  prompt: `**EXECUTE SETUP OPERATION**

**Task**: ${task_id}
**AC**: ${ac.text}

**Operation**: ${specific_command}

**Steps**:
1. Execute: ${command}
2. Verify: ${verification_command}
3. Report: Success/Failure

**Final Output**:
\`\`\`markdown
## ✅ Setup Complete: ${ac.id}

**Operation**: ${operation}
**Verification**: ✅

**Ready for Commit**: YES
\`\`\`
`
})
```

---

## Usage in task-manager.md

Update Phase 5 delegation calls from:
```typescript
subagent_type: "code-implementer"  // ❌ Gets interrupted
```

To:
```typescript
subagent_type: "general-purpose"   // ✅ Works!
```

Use the templates above for prompt content.

---

## Why This Works

1. **general-purpose agents**: Platform allows these without interruption
2. **code-implementer agents**: Platform blocks (unknown reason, possible bug)
3. **Same workflow**: Embedded TDD instructions achieve same result
4. **Same tools**: Both have Read/Write/Edit/Bash access
5. **Only difference**: No Wallaby MCP tools (use `pnpm test` instead)

---

## Trade-offs

**Pros**:
- ✅ Unblocks /pm start workflow
- ✅ Maintains TDD discipline
- ✅ Same context management benefits
- ✅ Works TODAY (no waiting for platform fix)

**Cons**:
- ❌ No Wallaby MCP real-time feedback (must run tests via bash)
- ❌ Longer prompts (embedding workflow adds ~500 tokens)
- ❌ Temporary workaround (should revert when platform fixed)

---

## Migration Path

When platform fixes code-implementer agent interruption:

1. Revert task-manager.md to use `code-implementer`
2. Keep simpler prompts (workflow already in agent spec)
3. Re-enable Wallaby MCP tools for real-time feedback

Track platform issue: TBD (file GitHub issue)
