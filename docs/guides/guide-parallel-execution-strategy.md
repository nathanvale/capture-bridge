# Guide: Parallel Task Execution Strategy

**Version:** 1.0.0
**Last Updated:** 2025-09-30
**Status:** Living Document

## Purpose

This guide explains when and how to use parallel task execution for VTM-based implementation, including conflict detection, time estimation, and troubleshooting.

## When to Use Parallel Execution

### Good Candidates ✅

1. **Different Packages**
   - Task A: packages/foundation/...
   - Task B: packages/storage/...
   - No shared dependencies → PARALLEL

2. **Different Technical Layers**
   - Task A: Database schema
   - Task B: CLI commands
   - No interaction → PARALLEL

3. **Independent Utilities**
   - Task A: Content hashing
   - Task B: File writing
   - Different concerns → PARALLEL

4. **Low-Medium Risk**
   - Both tasks Low or Medium risk
   - Failures contained → PARALLEL

### Bad Candidates ❌

1. **Shared Files**
   - Both modify turbo.json
   - Git conflict risk → SERIAL

2. **Sequential Logic**
   - Task B uses output of Task A
   - Dependency chain → SERIAL

3. **High Risk**
   - Security, data loss, or corruption risk
   - Needs careful TDD → SERIAL

4. **Shared State**
   - Both access same database table
   - Race condition risk → SERIAL

## How VTM Metadata Works

### Task Fields for Parallel Execution

```json
{
  "task_id": "CONTENT_HASH--T01",
  "parallel": true, // Can run concurrently?
  "conflicts_with": [], // Tasks that conflict with this
  "file_scope": [
    // Files this task modifies
    "packages/foundation/src/hash/",
    "packages/foundation/tests/hash/"
  ],
  "parallelism_group": "foundation-setup" // Optional grouping
}
```

### How conflicts_with is Populated

Task-decomposition-architect analyzes:

1. **File scope overlap**

   ```typescript
   if (task1.file_scope overlaps task2.file_scope) {
     task1.conflicts_with.push(task2.task_id);
     task2.conflicts_with.push(task1.task_id); // Symmetric
   }
   ```

2. **Shared configuration**
   - Both modify package.json → conflict
   - Both modify turbo.json → conflict

3. **Same database table**
   - AC mentions "captures table" in both → conflict

4. **Explicit AC ordering**
   - AC says "after X is implemented" → dependency, not conflict

## Time Estimation

### Calculating Potential Savings

**Formula:**

```
Serial Time = sum(all task durations)
Parallel Time = max(group1) + max(group2) + ... + max(groupN)
Savings = (Serial - Parallel) / Serial * 100%
```

**Example: Slice 1.1**

```
Tasks:
- MONOREPO_STRUCTURE--T01: 15 mins (parallel-safe)
- CONTENT_HASH--T01: 12 mins (parallel-safe)
- ATOMIC_WRITER--T01: 18 mins (parallel-safe)
- SQLITE_SCHEMA--T01: 32 mins (High risk, serial)
- TESTKIT_INTEGRATION--T01: 10 mins (parallel-safe)
- METRICS_INFRA--T01: 15 mins (parallel-safe)

Groups:
- Group 1 (parallel): max(15, 12, 18) = 18 mins
- Group 2 (serial): 32 mins
- Group 3 (parallel): max(10, 15) = 15 mins

Serial time: 15+12+18+32+10+15 = 102 mins
Parallel time: 18+32+15 = 65 mins
Savings: 37 mins (36%)
```

### Realistic Expectations

**Best case:** 60-70% time reduction

- Many small, independent tasks
- Perfect parallelization
- No blockers

**Typical case:** 30-40% time reduction

- Mix of serial and parallel tasks
- Some overhead for coordination
- Occasional blocker

**Worst case:** 10-20% time reduction

- Mostly High-risk tasks (serialized)
- Many conflicts
- Coordination overhead

## Conflict Resolution Patterns

### Pattern 1: Serialize Conflicting Pair

```json
// Task A and B both modify turbo.json
{
  "task_id": "TASK_A",
  "conflicts_with": ["TASK_B"]
}
{
  "task_id": "TASK_B",
  "conflicts_with": ["TASK_A"]
}

// Coordinator groups: [TASK_A] → [TASK_B] (serial)
```

### Pattern 2: Separate by Package

```json
// Task A: foundation, Task B: storage, Task C: capture
{
  "task_id": "TASK_A",
  "file_scope": ["packages/foundation/**"],
  "conflicts_with": []
}
{
  "task_id": "TASK_B",
  "file_scope": ["packages/storage/**"],
  "conflicts_with": []
}
{
  "task_id": "TASK_C",
  "file_scope": ["packages/capture/**"],
  "conflicts_with": []
}

// Coordinator groups: [TASK_A, TASK_B, TASK_C] (parallel)
```

### Pattern 3: Mixed Groups

```json
// 5 tasks: A, B serial with each other, C parallel with both, D parallel with all
{
  "execution_groups": [
    {
      "type": "parallel",
      "tasks": ["A", "C", "D"]
    },
    {
      "type": "serial",
      "tasks": ["B"] // Runs after A despite being in conflict
    }
  ]
}
```

## Troubleshooting

### "Conflict detection false positive"

**Symptom:** Tasks marked conflicting but actually safe

**Solution:**

```bash
# Check file_scope
cat docs/backlog/virtual-task-manifest.json | jq '.tasks[] | select(.task_id=="TASK_A" or .task_id=="TASK_B") | {task_id, file_scope, conflicts_with}'

# If file_scope too broad, manually narrow in VTM
# Then regenerate (or edit VTM directly for hotfix)
```

### "Parallel tasks causing test failures"

**Symptom:** Tests pass individually, fail in parallel

**Root cause:** Test isolation issue (TestKit not fully isolating)

**Solution:**

1. Check TestKit version (ensure latest)
2. Review test setup - shared global state?
3. Add to conflicts_with as workaround
4. File issue with TestKit maintainers

### "Coordinator reports WIP overload"

**Symptom:** "WIP overload: 3 tasks in-progress (max 3)"

**Solution:**

```bash
# Check current WIP
cat docs/backlog/task-state.json | jq '.tasks | to_entries | map(select(.value.status=="in-progress")) | length'

# Abandon stale tasks or complete them first
# Mark abandoned tasks as 'pending' to reset:
jq '.tasks["TASK_ID"].status = "pending"' task-state.json > tmp && mv tmp task-state.json
```

### "Time savings lower than expected"

**Reasons:**

1. **Coordination overhead** - Small tasks (~5 mins) don't benefit from parallelization
2. **Uneven task sizes** - One 30-min task dominates group with 3x 10-min tasks
3. **Sequential bottlenecks** - Too many High-risk tasks (serialized)
4. **Blockers** - One task blocks, wastes parallel capacity

**Optimization:**

- Group similar-sized tasks
- Split large tasks into smaller chunks
- Reduce High-risk tasks through better risk analysis
- Have backup tasks ready if primary blocks

## Best Practices

1. **Start Conservative**
   - First batch: 2-3 tasks, same package
   - Validate no issues before scaling up

2. **Monitor First Run**
   - Watch for test conflicts
   - Check git state stays clean
   - Verify coordination overhead acceptable

3. **Learn from Data**
   - Track actual time vs estimated
   - Note which task combinations work well
   - Update file_scope if conflicts occur

4. **Commit Frequently**
   - Each task completion = 1 commit
   - Makes rollback easy if something breaks
   - Clear blame assignment

5. **Have Fallback Plan**
   - If parallel execution blocks, can always fall back to sequential
   - Partial completion is valid - resume later

## Measuring Success

**Metrics to track:**

- Time savings: actual parallel time vs estimated serial time
- Conflict rate: number of false positive conflicts / total task pairs
- Blocker rate: tasks blocked / total tasks executed
- Test pass rate: parallel vs sequential execution

**Success criteria:**

- 30%+ time savings on multi-task slices
- <5% conflict false positives
- <10% blocker rate (unrelated to parallelization)
- 100% test pass rate (no parallel-induced failures)

## Common Parallelization Scenarios

### Scenario 1: Foundation Setup

**Tasks:**

- MONOREPO_STRUCTURE--T01: Set up pnpm workspaces
- CONTENT_HASH--T01: Implement hashing utility
- ATOMIC_WRITER--T01: Implement file writer

**Analysis:**

- Different packages? No, all in foundation
- Different file scopes? Yes (workspaces vs hash vs writer)
- Shared configs? MONOREPO_STRUCTURE touches root configs
- Risk levels? All Medium

**Decision:** CONTENT_HASH and ATOMIC_WRITER can be parallel, MONOREPO_STRUCTURE first

**Expected savings:** 20 mins → 15 mins (25%)

### Scenario 2: Storage Layer

**Tasks:**

- SQLITE_SCHEMA--T01: Create database schema
- SQLITE_SCHEMA--T02: Add indexes
- SQLITE_SCHEMA--T03: Write tests

**Analysis:**

- Same capability? Yes, sequential within capability
- File overlap? Yes, all modify schema files
- Risk levels? All High

**Decision:** Full serialization (T01 → T02 → T03)

**Expected savings:** 0% (intentional - High risk needs isolation)

### Scenario 3: Cross-Package Implementation

**Tasks:**

- VOICE_POLLING--T01: Implement voice polling (capture package)
- EMAIL_POLLING--T01: Implement email polling (capture package)
- WHISPER_TRANSCRIBE--T01: Implement transcription (capture package)

**Analysis:**

- Different packages? No, all capture
- Different file scopes? Yes (voice/ vs email/ vs whisper/)
- Shared deps? All depend on SQLITE_SCHEMA being complete
- Risk levels? Medium, Medium, High

**Decision:** VOICE_POLLING and EMAIL_POLLING can be parallel, WHISPER_TRANSCRIBE serialized (High risk)

**Expected savings:** 45 mins → 30 mins (33%)

## Debugging Parallel Execution Issues

### Issue: Git Merge Conflicts

**Detection:**

```bash
git status
# Shows merge conflicts after parallel batch
```

**Root cause analysis:**

1. Check which tasks modified conflicting files:

   ```bash
   cat docs/backlog/task-state.json | jq '.tasks | to_entries[] | select(.value.status=="completed") | {task: .key, files: .value.files_modified}'
   ```

2. Verify conflicts_with was accurate:
   ```bash
   cat docs/backlog/virtual-task-manifest.json | jq '.tasks[] | select(.task_id=="CONFLICT_TASK_A" or .task_id=="CONFLICT_TASK_B") | {task_id, file_scope, conflicts_with}'
   ```

**Resolution:**

1. Resolve git conflicts manually
2. Update VTM conflicts_with to prevent future occurrences
3. Regenerate VTM with corrected metadata

### Issue: Test Interference

**Detection:**

```bash
# Tests pass in isolation
pnpm test packages/foundation/tests/hash.spec.ts # ✅

# Tests fail in parallel
pnpm test # ❌ (when both hash and writer tests run)
```

**Root cause analysis:**

1. Shared test fixtures? Check if tests modify same files
2. Global state pollution? Look for singletons or module-level variables
3. Port conflicts? Check if tests start services on same port
4. Database conflicts? Verify TestKit isolation working

**Resolution:**

1. **Best:** Fix test isolation (proper TestKit usage)
2. **Workaround:** Add tests to conflicts_with in VTM
3. **Last resort:** Serialize entire package tests

### Issue: Blocker Cascade

**Detection:**

```text
Group 1: All tasks blocked waiting for missing ADR
Group 2: Can't start (depends on Group 1)
Group 3: Can't start (depends on Group 2)
```

**Root cause:** Missing prerequisite (spec, ADR, guide)

**Resolution:**

1. Create missing prerequisite immediately
2. Restart failed tasks:
   ```bash
   # Reset blocked tasks to pending
   jq '.tasks["TASK_ID"].status = "pending"' task-state.json > tmp && mv tmp task-state.json
   ```
3. Resume parallel execution

## Advanced Patterns

### Pattern: Wave-Based Execution

Execute tasks in "waves" where each wave depends on previous wave completion:

```text
Wave 1 (parallel): Foundation setup (3 tasks)
  ↓ (all must complete)
Wave 2 (parallel): Core logic (4 tasks)
  ↓ (all must complete)
Wave 3 (parallel): Integration (2 tasks)
```

**Implementation:**

```bash
# Wave 1
Execute parallel tasks: MONOREPO--T01, HASH--T01, WRITER--T01 using task-batch-coordinator

# Wait for wave 1 completion, then Wave 2
Execute parallel tasks: SCHEMA--T01, DEDUP--T01, METRICS--T01, TESTKIT--T01 using task-batch-coordinator

# Wait for wave 2 completion, then Wave 3
Execute parallel tasks: VOICE--T01, EMAIL--T01 using task-batch-coordinator
```

**Benefits:**

- Clear checkpoints between waves
- Can validate after each wave
- Easier to understand progress

### Pattern: Hybrid Execution

Mix parallel and sequential within same batch:

```yaml
Group 1 (parallel):
  - TASK_A (Medium risk, independent)
  - TASK_B (Low risk, independent)

Group 2 (serial):
  - TASK_C (High risk, needs isolation)

Group 3 (parallel):
  - TASK_D (depends on TASK_C)
  - TASK_E (depends on TASK_C)
```

**Use when:**

- Mix of risk levels in same slice
- Some tasks have clear dependency chains
- Want to parallelize where safe, serialize where needed

## Migration Strategy

### Phase 1: Metadata Generation

1. Update task-decomposition-architect ✅
2. Regenerate VTM with parallel metadata
3. Validate all tasks have metadata fields
4. Review conflicts_with for accuracy

### Phase 2: Small-Scale Testing

1. Pick 2-3 low-risk, independent tasks
2. Execute with task-batch-coordinator
3. Validate:
   - No git conflicts
   - All tests passing
   - Time savings realized
4. Document lessons learned

### Phase 3: Slice-Level Execution

1. Execute full slice with mixed groups
2. Monitor progress and blockers
3. Measure actual vs estimated time
4. Refine conflict detection based on data

### Phase 4: Production Workflow

1. Default to parallel for eligible slices
2. Maintain sequential option for High-risk
3. Continuously improve file_scope accuracy
4. Track metrics (time savings, blocker rate)

## Reference: VTM Parallel Metadata

### Complete Task Example

```json
{
  "task_id": "CONTENT_HASH--T01",
  "capability_id": "CONTENT_HASH_IMPLEMENTATION",
  "phase": "Phase 1",
  "slice": "Slice 1.1",
  "title": "Content Hash Implementation - Core Logic",
  "description": "Implement SHA-256 content hashing for deduplication",
  "acceptance_criteria": [
    {
      "id": "CONTENT_HASH-AC01",
      "text": "Hash function accepts string input and returns SHA-256 hash"
    },
    {
      "id": "CONTENT_HASH-AC02",
      "text": "Normalized text (trimmed, lowercase) before hashing"
    },
    {
      "id": "CONTENT_HASH-AC03",
      "text": "Tests pass with 100% coverage"
    }
  ],
  "risk": "Medium",
  "est": {
    "size": "M"
  },
  "depends_on_tasks": [],
  "related_specs": ["docs/cross-cutting/spec-foundation-hash-tech.md"],
  "related_adrs": [],
  "related_guides": ["docs/guides/guide-tdd-applicability.md"],
  "test_verification": ["packages/foundation/tests/hash.spec.ts"],
  "gap_codes": [],
  "provisional": false,

  // Parallel execution metadata
  "parallel": true,
  "conflicts_with": [],
  "file_scope": [
    "packages/foundation/src/hash/",
    "packages/foundation/tests/hash/"
  ],
  "parallelism_group": "foundation-setup"
}
```

### Metadata Field Reference

| Field               | Type           | Required | Description                            |
| ------------------- | -------------- | -------- | -------------------------------------- |
| `parallel`          | boolean        | Yes      | Can task run concurrently with others? |
| `conflicts_with`    | string[]       | Yes      | Task IDs that conflict (may be empty)  |
| `file_scope`        | string[]       | Yes      | Files/directories this task modifies   |
| `parallelism_group` | string \| null | No       | Optional grouping for related tasks    |

### Validation Rules

1. **Symmetry:** If A conflicts_with B, then B conflicts_with A
2. **High-Risk:** High-risk tasks MUST have `parallel: false`
3. **File Scope:** Parallel tasks SHOULD have non-empty file_scope
4. **Consistency:** Same-capability tasks typically conflict (serial within capability)

---

**Next Steps:**

1. Regenerate VTM with parallel metadata
2. Test with Slice 1.1 tasks
3. Measure actual time savings
4. Refine conflict detection based on results

**Related Guides:**

- [Agent Workflow Guide](guide-agent-workflow.md) - Usage instructions
- [TDD Applicability Guide](guide-tdd-applicability.md) - Risk assessment
