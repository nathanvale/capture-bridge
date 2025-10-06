# Guide: Agent Workflow for ADHD Brain Implementation

**Version**: 1.0.0
**Last Updated**: 2025-09-28
**Status**: Living Document

## Overview

This guide explains how to use the ADHD Brain agent system to go from planning documents to working code. The system uses a coordinated set of agents that maintain strict separation between planning and execution.

## Key Files

| File                                      | Purpose                             | Modified By                                    |
| ----------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| `docs/master/prd-master.md`               | Master product requirements         | capture-bridge-planner + roadmap-orchestrator  |
| `docs/master/roadmap.md`                  | Capability breakdown by phase/slice | roadmap-orchestrator                           |
| `docs/features/*/prd-*.md`                | Feature-specific requirements       | capture-bridge-planner + roadmap-orchestrator  |
| `docs/features/*/spec-*.md`               | Technical specifications            | capture-bridge-planner + spec-librarian        |
| `docs/backlog/virtual-task-manifest.json` | Decomposed task list (68 tasks)     | task-decomposition-architect                   |
| `docs/backlog/task-state.json`            | Execution progress tracking         | task-implementer + implementation-orchestrator |
| `docs/adr/*.md`                           | Architectural decisions             | adr-curator                                    |
| `docs/guides/*.md`                        | Implementation patterns             | capture-bridge-planner + spec-librarian        |

## The Agent Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│ PLANNING PHASE (Research → Documents → Capabilities → Tasks)   │
└─────────────────────────────────────────────────────────────────┘

1. capture-bridge-planner: Research and create PRDs/specs with full context
   ↓
2. adr-curator: Capture architectural decisions as ADRs
   ↓
3. roadmap-orchestrator: Sync PRDs → roadmap, detect drift
   ↓
4. spec-librarian: Validate specs, guides, fix documentation issues
   ↓
5. task-decomposition-architect: Decompose capabilities → VTM tasks
   ↓

┌─────────────────────────────────────────────────────────────────┐
│ IMPLEMENTATION PHASE (Tasks → Code)                             │
└─────────────────────────────────────────────────────────────────┘

6a. implementation-orchestrator: Auto-pilot (sequential execution)
    OR
6b. task-implementer: Manual (pick specific tasks)
```

---

## Phase 1: Planning & Roadmap Creation

### Step 1: Research & Create Planning Documents

**When to use:** Starting any new feature, evaluating technical decisions, or updating existing plans

**PRIMARY AGENT:**

```
Use capture-bridge-planner to research and create [PRD/spec/evaluation] for [feature]
```

**What it does:**

- Loads full project context (reads all PRDs, specs, ADRs, guides)
- Researches current best practices using web search + MCP tools (if available)
- **NEW**: Spawns parallel research agents for comprehensive coverage
  - Agent 1: Official documentation research
  - Agent 2: Community wisdom (Reddit, Stack Overflow)
  - Agent 3: Production gotchas (GitHub issues, blog posts)
- Combines official docs + community experiences + anecdotal evidence
- Creates evidence-based planning documents with citations
- Enforces YAGNI principles and MPPP scope
- Documents security, performance, and migration considerations

**Example invocations:**

```
# Creating new specs with research
Use capture-bridge-planner to research Gmail API limits and create polling spec
Use capture-bridge-planner to evaluate TDD approach for backup/restore feature
Use capture-bridge-planner to research APFS handling and update voice capture spec

# Reviewing existing specs with research
Use capture-bridge-planner to review staging ledger spec against current best practices
Use capture-bridge-planner to research updates to Gmail API since our spec was written
Use capture-bridge-planner to identify outdated patterns in our capture specs

# Parallel research for complex topics
Use capture-bridge-planner to research SQLite performance (official + community + production)
Use capture-bridge-planner to find Gmail API gotchas across Stack Overflow and GitHub issues
```

**Output includes:**

- Clear acceptance criteria with risk levels (Low/Medium/High)
- TDD applicability decision with justification
- YAGNI deferrals explicitly documented
- Security and privacy analysis
- Migration and rollback procedures
- Cited sources with URLs

### Step 2: Document Architectural Decisions

**When to use:** When making significant architectural or technical decisions

**Command:**

```
Use adr-curator to document [specific decision]
```

**What it does:**

- Creates new ADR files with proper numbering (0022, 0023, etc.)
- Links ADRs to relevant PRDs and specs
- Updates ADR index at `docs/adr/_index.md`
- Identifies undocumented decisions in recent changes
- Ensures decision traceability

**Example invocations:**

```
Use adr-curator to document the APFS handling strategy
Use adr-curator to review recent specs for undocumented decisions
```

### Step 3: Synchronize Roadmap

**When to use:** After updating PRDs, ADRs, or specs

**Command:**

```
Use roadmap-orchestrator to sync all documentation and update the roadmap
```

**What it does:**

- Reads all PRDs, specs, ADRs, guides
- Extracts acceptance criteria
- Organizes into capabilities by phase/slice
- Updates `docs/master/roadmap.md`
- Detects drift between documents
- Reports readiness for task decomposition

**Expected output:**

- Updated `docs/master/roadmap.md` with all capabilities
- Drift report (should be 0% if clean)
- Status: `READY_FOR_DECOMPOSITION` or `BLOCKED` with GAPs

**Example invocation:**

```
Create a new roadmap from scratch using roadmap-orchestrator
```

### Step 4: Fix Documentation Issues

**When to use:** If roadmap-orchestrator reports issues

**Command:**

```
Use spec-librarian to fix [specific issue from report]
```

**What it does:**

- Validates spec structure and completeness
- Fixes cross-references between docs
- Expands stub guides
- Ensures all high-risk capabilities have guide coverage

**Example issues it fixes:**

- Missing guide content
- Broken links between specs
- Incomplete capability documentation

### Step 5: Generate Task Manifest

**When to use:** After roadmap is clean and validated

**Command:**

```
Use task-decomposition-architect to generate VTM from the roadmap
```

**What it does:**

- Reads `docs/master/roadmap.md`
- Breaks down each capability into 2-5 atomic tasks
- Numbers acceptance criteria (e.g., `MONOREPO_STRUCTURE-AC01`)
- Propagates risk levels, specs, ADRs, guides to tasks
- Validates dependencies (no cycles)
- Generates `docs/backlog/virtual-task-manifest.json`

**Expected output:**

- `docs/backlog/virtual-task-manifest.json` (68 tasks)
- 100% AC coverage validation
- Zero circular dependencies
- All tasks have related_specs/adrs/guides

**What you get:**

```json
{
  "tasks": [
    {
      "task_id": "MONOREPO_STRUCTURE--T01",
      "acceptance_criteria": [
        { "id": "MONOREPO_STRUCTURE-AC01", "text": "..." },
        { "id": "MONOREPO_STRUCTURE-AC02", "text": "..." }
      ],
      "related_specs": ["docs/cross-cutting/spec-foundation-monorepo-tech.md"],
      "related_adrs": ["ADR-0019: Monorepo Tooling Stack"],
      "related_guides": ["docs/guides/guide-monorepo-mppp.md"]
    }
  ]
}
```

---

## Phase 2: Implementation

You have two options for implementing tasks:

### Option A: Auto-Pilot (Recommended for Sequential Work)

**Use:** `implementation-orchestrator`

**Command:**

```
Launch implementation-orchestrator to start Phase 1 Slice 1.1
```

**What it does:**

1. Reads VTM and task-state.json
2. Finds next eligible task (dependencies satisfied, pending status)
3. Reads ALL context (specs/ADRs/guides) for that task
4. Validates context completeness (blocks if missing)
5. Delegates to task-implementer sub-agent
6. Tracks progress in task-state.json
7. Generates progress pulse after each task
8. Moves to next task automatically

**Workflow:**

```
Orchestrator picks: MONOREPO_STRUCTURE--T01
  ↓
Reads: spec-foundation-monorepo-tech.md, ADR-0019, guide-monorepo-mppp.md
  ↓
Validates: All context present, dependencies satisfied
  ↓
Delegates to task-implementer
  ↓
Task-implementer: Implements with TDD, updates task-state.json
  ↓
Orchestrator: Task completed, picks next eligible task
  ↓
Repeat
```

**Progress tracking:**

```json
// docs/backlog/task-state.json (auto-updated)
{
  "tasks": {
    "MONOREPO_STRUCTURE--T01": {
      "status": "completed",
      "started_at": "2025-09-28T09:00:00Z",
      "completed_at": "2025-09-28T10:30:00Z",
      "acs_completed": ["MONOREPO_STRUCTURE-AC01", "MONOREPO_STRUCTURE-AC02"]
    },
    "SQLITE_SCHEMA--T01": {
      "status": "in-progress",
      "started_at": "2025-09-28T10:35:00Z",
      "acs_completed": ["SQLITE_SCHEMA-AC01"],
      "acs_remaining": ["SQLITE_SCHEMA-AC02", "SQLITE_SCHEMA-AC03"]
    }
  }
}
```

**When to use:**

- Starting a new phase/slice
- Want automatic sequencing by dependencies
- Trust the system to work through tasks
- Want progress reports every N tasks

**Guardrails:**

- WIP limit: Max 3 tasks in-progress (blocks if exceeded)
- Dependency enforcement: Won't start task until deps completed
- Context validation: Blocks if specs/ADRs/guides missing
- High-risk TDD: Enforces test-first for P0 tasks

---

### Option B: Manual Task-by-Task (For Granular Control)

**Use:** `task-implementer`

**Command:**

```
Implement task MONOREPO_STRUCTURE--T01 using task-implementer
```

**What it does:**

1. Reads task from VTM
2. Reads ALL context (specs/ADRs/guides) - MANDATORY
3. Checks dependencies are satisfied
4. Refuses to start if context missing or deps incomplete
5. Implements with TDD approach
6. Updates task-state.json as ACs are satisfied
7. Reports completion when all ACs done

**Step-by-step workflow:**

**1. Agent reads context:**

```
Reading task: MONOREPO_STRUCTURE--T01
Reading specs:
  - docs/cross-cutting/spec-foundation-monorepo-tech.md ✓
Reading ADRs:
  - ADR-0019: Monorepo Tooling Stack ✓
Reading guides:
  - docs/guides/guide-monorepo-mppp.md ✓
Reading acceptance criteria:
  - MONOREPO_STRUCTURE-AC01: 4 packages defined ✓
  - MONOREPO_STRUCTURE-AC02: Turbo pipeline configured ✓
  - MONOREPO_STRUCTURE-AC03: Shared config files ✓

Dependencies: (none)
Status: Ready to implement
```

**2. Agent plans tests (TDD):**

```
Test plan for MONOREPO_STRUCTURE-AC01:
  - packages/foundation/tests/monorepo-structure.spec.ts
  - Assert 4 packages exist in pnpm-workspace.yaml
  - Verify package.json files present

Test plan for MONOREPO_STRUCTURE-AC02:
  - Verify turbo.json exists
  - Assert build/test/lint tasks configured
```

**3. Agent implements incrementally:**

```
Creating failing test for AC01... ✓
Implementing pnpm-workspace.yaml... ✓
Test AC01 passing ✓
Updating task-state.json: acs_completed += MONOREPO_STRUCTURE-AC01

Creating failing test for AC02... ✓
Implementing turbo.json... ✓
Test AC02 passing ✓
Updating task-state.json: acs_completed += MONOREPO_STRUCTURE-AC02

All ACs satisfied ✓
Full test suite passing ✓
Marking task completed in task-state.json ✓
```

**4. Task completion:**

```json
// task-state.json updated
{
  "tasks": {
    "MONOREPO_STRUCTURE--T01": {
      "status": "completed",
      "started_at": "2025-09-28T09:00:00Z",
      "completed_at": "2025-09-28T10:30:00Z",
      "acs_completed": [
        "MONOREPO_STRUCTURE-AC01",
        "MONOREPO_STRUCTURE-AC02",
        "MONOREPO_STRUCTURE-AC03"
      ],
      "notes": "All tests passing, monorepo structure validated"
    }
  }
}
```

**When to use:**

- Want to pick specific tasks out of order
- Need to review/understand before implementing
- Debugging or rework scenarios
- Learning the codebase incrementally

**Blocking conditions:**

- ❌ Missing specs/ADRs/guides → Refuses to start
- ❌ Dependencies not completed → Refuses to start
- ❌ Context not fully read → Refuses to implement
- ❌ High-risk without test spec → Blocks

---

### Option C: Parallel Batch Execution (For Independent Tasks)

**Use:** `task-batch-coordinator`

**When to use:**

- Multiple tasks in same slice marked `parallel: true`
- Tasks are truly independent (different files, packages, or layers)
- Want to reduce total implementation time
- Have capacity to monitor multiple work streams

**Command:**

```
Execute parallel tasks for Slice 1.1 using task-batch-coordinator
```

**What it does:**

1. Reads VTM and identifies tasks in batch
2. Validates parallel safety (checks `parallel`, `conflicts_with`, `file_scope`)
3. Detects conflicts and groups tasks (parallel vs serial)
4. Spawns task-implementer sub-agents for each task in parallel groups
5. Coordinates execution, consolidates results
6. Updates task-state.json with all task completions
7. Reports overall progress and next steps

**Example workflow:**

```
You request: "Execute parallel tasks for Slice 1.1"

Coordinator analyzes:
  Slice 1.1 has 6 tasks
  → Group 1 (parallel): 3 tasks (foundation-setup)
  → Group 2 (serial): 1 task (High risk)
  → Group 3 (parallel): 2 tasks (utilities)

Coordinator executes:
  Group 1: Spawns 3 task-implementer agents in parallel
    ├─ MONOREPO_STRUCTURE--T01 completes in 15 mins ✅
    ├─ CONTENT_HASH--T01 completes in 12 mins ✅
    └─ ATOMIC_WRITER--T01 completes in 18 mins ✅

  Group 2: Spawns 1 task-implementer (High risk, serialized)
    └─ SQLITE_SCHEMA--T01 completes in 32 mins ✅

  Group 3: Spawns 2 task-implementer agents in parallel
    ├─ TESTKIT_INTEGRATION--T01 completes in 10 mins ✅
    └─ METRICS_INFRA--T01 blocked after 8 mins ⚠️

Total time: 68 minutes (vs ~115 mins if serial)
Time savings: 47 minutes (41% reduction)
```

**Progress tracking:**

- Real-time updates as each task completes
- Consolidated task-state.json updates after each group
- Final summary with:
  - Tasks completed / total
  - ACs satisfied
  - Test results (combined across tasks)
  - Time savings vs serial execution
  - Any blockers requiring attention
  - Next eligible tasks

**When to use parallel vs sequential:**

| Scenario                                           | Recommended Mode                                |
| -------------------------------------------------- | ----------------------------------------------- |
| Starting new slice with multiple independent tasks | **Parallel** (task-batch-coordinator)           |
| High-risk tasks requiring careful TDD              | **Sequential** (task-implementer one at a time) |
| Tasks with file conflicts or shared state          | **Sequential** (orchestrator handles ordering)  |
| Learning new codebase area                         | **Sequential** (better for understanding)       |
| Time-sensitive delivery                            | **Parallel** (maximize throughput)              |
| Single task or tightly coupled chain               | **Sequential** (task-implementer)               |

**Safety features:**

- Max 3 concurrent tasks (ADHD-friendly limit)
- Automatic conflict detection prevents file collisions
- High-risk tasks never parallelized
- Clean git state required before starting
- WIP limit enforced (refuses if ≥3 tasks already in-progress)
- TestKit isolation ensures no test interference

**Failure handling:**

- If any task blocks, others continue
- Partial completion is valid state
- Clear remediation steps for blockers
- Can resume batch execution after fixing issues

---

## Monitoring Progress

### View Current State

**Check VTM:**

```bash
cat docs/backlog/virtual-task-manifest.json | jq '.metadata'
```

Output:

```json
{
  "total_capabilities": 27,
  "total_tasks": 68,
  "total_acceptance_criteria": 229
}
```

**Check Progress:**

```bash
cat docs/backlog/task-state.json | jq '.tasks | length'
```

**Check Completed:**

```bash
cat docs/backlog/task-state.json | jq '[.tasks[] | select(.status=="completed")] | length'
```

### View Parallel Execution Groups

**Check parallelization potential:**

```bash
cat docs/backlog/virtual-task-manifest.json | jq '[.tasks[] | select(.parallel==true)] | length'
# Shows count of parallel-safe tasks

cat docs/backlog/virtual-task-manifest.json | jq '.tasks[] | select(.parallel==true) | .parallelism_group' | sort | uniq -c
# Shows parallel groups with task counts
```

**Expected output:**

```
  3 foundation-setup
  2 storage-foundation
  4 capture-polling
  2 utilities
```

### Progress Pulse (from orchestrator)

```
Implementation Pulse (2025-09-28T10:30:00Z)
- Phase: Phase 1
- Slice: Slice 1.1
- Tasks: pending 62 | in-progress 1 | blocked 0 | completed 5
- Progress: 7.4% (5/68 tasks)
- High Risk: 3 completed, 32 remaining
- Latest Completed: MONOREPO_STRUCTURE--T01 (5m ago)
- In Progress: SQLITE_SCHEMA--T01 (3/5 ACs done)
- Next Eligible: ATOMIC_FILE_WRITER--T01, CONTENT_HASH_IMPLEMENTATION--T01
- Blockers: none
```

---

## Common Scenarios

### Scenario 1: Starting Fresh Implementation

```bash
# 1. Validate roadmap is ready
"Use roadmap-orchestrator to assess documentation readiness"

# 2. Generate task manifest
"Use task-decomposition-architect to generate VTM"

# 3. Start auto-pilot
"Launch implementation-orchestrator to start Phase 1 Slice 1.1"

# Orchestrator will work through tasks sequentially
```

### Scenario 2: Implementing Specific Task

```bash
# 1. Check dependencies
cat docs/backlog/virtual-task-manifest.json | jq '.tasks[] | select(.task_id=="SQLITE_SCHEMA--T01") | .depends_on_tasks'

# 2. Verify deps completed
cat docs/backlog/task-state.json | jq '.tasks["MONOREPO_STRUCTURE--T01"].status'

# 3. Implement task
"Implement task SQLITE_SCHEMA--T01 using task-implementer"
```

### Scenario 3: Resuming After Interruption

```bash
# 1. Check what's in progress
cat docs/backlog/task-state.json | jq '.tasks[] | select(.status=="in-progress")'

# 2a. Continue with orchestrator (picks up where left off)
"Resume implementation-orchestrator"

# OR

# 2b. Continue specific task manually
"Continue implementing task SQLITE_SCHEMA--T01"
```

### Scenario 4: Handling Blocked Tasks

```bash
# Agent reports: BLOCKED::MISSING-CONTEXT::SQLITE_SCHEMA--T01
# Missing: docs/features/staging-ledger/spec-staging-tech.md

# 1. Fix the issue
vim docs/features/staging-ledger/spec-staging-tech.md

# 2. Update task state
jq '.tasks["SQLITE_SCHEMA--T01"].status = "pending"' task-state.json > tmp && mv tmp task-state.json

# 3. Retry
"Implement task SQLITE_SCHEMA--T01"
```

### Scenario 5: Adding New Requirements Mid-Stream

```bash
# 1. Update PRD with new ACs
vim docs/features/capture/prd-capture.md

# 2. Regenerate roadmap
"Use roadmap-orchestrator to update roadmap with new requirements"

# 3. Regenerate VTM
"Use task-decomposition-architect to regenerate VTM"
# ⚠️ This creates new manifest_hash - existing task-state.json becomes stale

# 4. Decide: continue old tasks or start fresh
# Option A: Finish current phase with old VTM, then regenerate
# Option B: Archive old state, start fresh with new VTM
```

---

## Agent Decision Tree

```
Need to research/plan/review ANY feature or technical decision?
  → Use capture-bridge-planner (PRIMARY - always start here!)

Need to sync docs/roadmap?
  → Use roadmap-orchestrator

Need to fix doc issues?
  → Use spec-librarian

Need to break capabilities into tasks?
  → Use task-decomposition-architect

Want auto-pilot implementation?
  → Single-threaded: Use implementation-orchestrator
  → Parallel batch: Use implementation-orchestrator in parallel mode (delegates to task-batch-coordinator)

Want to implement specific independent tasks in parallel?
  → Use task-batch-coordinator with task ID list

Want to implement specific task manually?
  → Use task-implementer

Need to document architectural decision?
  → Use adr-curator

Need test strategy for new component?
  → Use testing-strategist

Need resilience patterns for features/APIs?
  → Use resilience-strategist

Quarterly scope/YAGNI review?
  → Use risk-yagni-enforcer
```

---

## Best Practices

### DO:

✅ **Always sync roadmap before decomposition**

```
roadmap-orchestrator → task-decomposition-architect
```

✅ **Let agents read ALL context** (they will refuse without it)

✅ **Use task-state.json as source of truth** for progress

✅ **Commit after each completed task**

```bash
git add .
git commit -m "feat: complete MONOREPO_STRUCTURE--T01

Satisfies:
- MONOREPO_STRUCTURE-AC01: 4 packages defined
- MONOREPO_STRUCTURE-AC02: Turbo pipeline configured
- MONOREPO_STRUCTURE-AC03: Shared config files"
```

✅ **Review progress pulse regularly** when using orchestrator

✅ **Keep PRDs/specs updated** before regenerating VTM

### DON'T:

❌ **Don't manually edit VTM** - regenerate via task-decomposition-architect

❌ **Don't manually edit task-state.json** - let agents manage it

❌ **Don't skip reading specs/ADRs** - agents enforce this

❌ **Don't implement out of dependency order** (orchestrator prevents this)

❌ **Don't mark tasks complete without all ACs satisfied**

❌ **Don't regenerate VTM mid-phase** unless absolutely necessary (causes state drift)

---

## Troubleshooting

### "Agent refuses to start: missing context"

**Problem:** Related spec/ADR/guide file missing

**Solution:**

```bash
# 1. Check which files are missing
cat docs/backlog/virtual-task-manifest.json | jq '.tasks[] | select(.task_id=="TASK_ID") | {specs: .related_specs, adrs: .related_adrs, guides: .related_guides}'

# 2. Create missing files or update VTM to remove stale references
```

### "Dependency not satisfied"

**Problem:** Task depends on another task that's not completed

**Solution:**

```bash
# 1. Check dependency
cat docs/backlog/virtual-task-manifest.json | jq '.tasks[] | select(.task_id=="TASK_ID") | .depends_on_tasks'

# 2. Complete dependency first OR override (rare)
```

### "Manifest hash mismatch"

**Problem:** VTM regenerated, task-state.json references old version

**Solution:**

```bash
# Option A: Archive old state, start fresh
mv docs/backlog/task-state.json docs/backlog/task-state-2025-09-28-backup.json

# Option B: Update manifest_hash in state file (manual reconciliation needed)
jq '.manifest_hash = "NEW_HASH"' task-state.json > tmp && mv tmp task-state.json
```

### "WIP overload warning"

**Problem:** >3 tasks in-progress simultaneously

**Solution:**

```bash
# Review in-progress tasks
cat docs/backlog/task-state.json | jq '.tasks[] | select(.status=="in-progress")'

# Complete or abandon stale work before starting new tasks
```

---

## Summary: Quick Command Reference

| Goal                        | Command                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Research & plan ANY feature | `Use capture-bridge-planner to research and create [spec/PRD]`                                   |
| Review existing specs       | `Use capture-bridge-planner to review [spec] against best practices`                             |
| Document decisions          | `Use adr-curator to document [decision]`                                                         |
| Sync docs → roadmap         | `Use roadmap-orchestrator to sync and validate`                                                  |
| Fix doc issues              | `Use spec-librarian to fix [issue]`                                                              |
| Generate tasks              | `Use task-decomposition-architect to generate VTM`                                               |
| Auto-pilot implementation   | `Launch implementation-orchestrator`                                                             |
| Implement specific task     | `Implement task TASK_ID using task-implementer`                                                  |
| Check progress              | `cat docs/backlog/task-state.json \| jq '.tasks \| map(select(.status=="completed")) \| length'` |
| Resume work                 | `Resume implementation-orchestrator` or `Continue task TASK_ID`                                  |

---

## Quarterly Reviews

### Resilience Pattern Review

**When to use:** When adding external APIs, critical operations, or error-prone features

**Command:**

```
Use resilience-strategist to review [feature] resilience patterns
```

**What it does:**

- Validates P0/P1 risks have proper resilience coverage
- Reviews retry, circuit breaker, and timeout configurations
- Ensures error classification covers all failure modes
- Validates ADHD-friendly error messages and timeouts
- Checks compliance with resilience usage guide

**Expected output:**

- Resilience coverage audit report
- Specific pattern recommendations (circuit breakers, backoff strategies)
- Error classification rules for domain
- Integration code examples

**Example invocation:**

```
Use resilience-strategist to design Gmail API retry patterns
Use resilience-strategist to audit voice capture error handling
```

### Risk & YAGNI Audit

**When to use:** Every quarter or when scope creep is suspected

**Command:**

```
Use risk-yagni-enforcer to audit current specs and PRDs
```

**What it does:**

- Reviews all specs for proper risk classification (High/Medium/Low)
- Identifies YAGNI violations and premature features
- Ensures scope alignment with roadmap phases
- Flags hidden complexity and underestimated risks
- Verifies all specs have "Out-of-scope (YAGNI)" sections

**Expected output:**

- Risk classification audit report
- List of features to defer to future phases
- Recommendations for scope reduction
- Hidden risks that need addressing

**Example invocation:**

```
Use risk-yagni-enforcer to review Phase 2 specs for scope creep
```

---

## Next Steps

After reading this guide:

1. 🔬 Research & plan features: `capture-bridge-planner` (PRIMARY - start here!)
2. ✅ Validate your roadmap: `roadmap-orchestrator assessment`
3. ✅ Generate VTM: `task-decomposition-architect`
4. ✅ Start implementing: Choose orchestrator (auto) or task-implementer (manual)
5. 📊 Monitor progress via task-state.json
6. 🎯 Complete Phase 1 Slice 1.1 (6 tasks)

**Ready to build!** 🚀
