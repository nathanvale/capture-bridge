---
allowed-tools: Task, Bash, Read, Write, TodoWrite
description: Execute VTM tasks - unified interface for task orchestration
---

# Project Manager (PM) Command

**Purpose:** Unified interface for Virtual Task Manifest (VTM) operations

**Usage:**

- `/pm` - Show dashboard (progress overview + next task)
- `/pm next` - Show next eligible task details
- `/pm start` - Start next task (direct orchestration)
- `/pm status` - Show detailed progress breakdown
- `/pm blocked` - Show blocked tasks

**Shared Rules**:
- VTM Operations: `.claude/rules/vtm-operations.md`
- Context Loading: `.claude/rules/task-context-loading.md`

---

## Command Handler

When this command is invoked, execute the following based on the subcommand:

### /pm (Dashboard - Default)

**Follow**: `.claude/rules/vtm-operations.md` - "Query Next Eligible Task"

```bash
node .claude/scripts/vtm-status.mjs --dashboard
```

**Format the output as:**

```markdown
## 📊 VTM Dashboard

**Progress:** {completed}/{total} tasks ({percentage}%)

**Next Task:**
- **ID:** {task_id}
- **Title:** {title}
- **Risk:** {risk}

**Active Work:**
- In Progress: {in_progress}
- Blocked: {blocked}
- Eligible: {eligible}
```

### /pm next

**Follow**: `.claude/rules/vtm-operations.md` - "Query Next Eligible Task"

```bash
node .claude/scripts/vtm-status.mjs --next
```

**Format the output as:**

```markdown
## 🎯 Next Task

**ID:** {task_id}
**Title:** {title}
**Risk:** {risk} | **Size:** {size} | **Phase:** {phase} | **Slice:** {slice}

**Description:**
{description}

**Acceptance Criteria:**
{acceptance_criteria as numbered list}

**Dependencies:** {depends_on_tasks or "None"}

**Related Documentation:**
- Specs: {related_specs}
- ADRs: {related_adrs}
- Guides: {related_guides}

**Test Verification:**
{test_verification as bullet list}

---
**Ready to start?** Run `/pm start` to begin work on this task.
```

### /pm start

**Purpose:** Start the next eligible VTM task with direct orchestration.

**Architecture Note:** This slash command executes in the main conversation and has access to the Task tool. It orchestrates the full workflow and directly delegates to code-implementer for each AC. This pattern avoids the platform limitation (GitHub #4182) where sub-agents cannot use the Task tool.

**Workflow:**

#### Phase 0: Query VTM & Validate Git State

**Follow**: `.claude/rules/vtm-operations.md` - "Query Next Eligible Task" and "Validation Patterns"

```bash
# Get next task
node .claude/scripts/vtm-status.mjs --next
```

If error (exit code 1), **follow error handling from `.claude/rules/vtm-operations.md`**

**Git validation:**

```bash
# Check current branch
current_branch=$(git branch --show-current)

if [[ "$current_branch" != "main" ]]; then
  echo "❌ BLOCKED: Not on main branch (currently on: $current_branch)"
  echo "Return to main: git checkout main"
  exit 1
fi

# Check working directory
if [[ -n $(git status --porcelain) ]]; then
  echo "❌ BLOCKED: Uncommitted changes detected"
  git status
  exit 1
fi
```

#### Phase 1: Read All Context Files

**Follow**: `.claude/rules/task-context-loading.md` - "Complete Context Loading Pattern"

Read EVERY file in task's context:
- Task-specific: `related_specs`, `related_adrs`, `related_guides`
- Project-wide: testkit, prd, typescript patterns

Store content for delegation to code-implementer.

#### Phase 2: Create Feature Branch

```bash
git checkout -b feat/${task_id}
```

#### Phase 3: Initialize Task State

Update `docs/backlog/task-state.json`:

```json
{
  "tasks": {
    "${task_id}": {
      "status": "in-progress",
      "started_at": "${ISO8601}",
      "acs_completed": [],
      "acs_remaining": ["AC01", "AC02", ...]
    }
  }
}
```

Commit:

```bash
git add docs/backlog/task-state.json
git commit -m "chore(${task_id}): initialize task state"
```

#### Phase 4: Classify ACs & Create TodoWrite

**Classification Rules:**

1. Task risk = High? → TDD Mode (mandatory)
2. AC mentions test/verify/validate? → TDD Mode
3. AC describes code logic? → TDD Mode
4. AC mentions install/configure? → Setup Mode
5. AC mentions document/README? → Documentation Mode
6. Uncertain? → TDD Mode (default to safety)

**Create TodoWrite:**

```typescript
TodoWrite({
  todos: task.acceptance_criteria.map(ac => ({
    content: ac.text,
    status: 'pending',
    activeForm: `Implementing ${ac.id}`
  }))
})
```

#### Phase 5: Execute Each AC

**For EACH AC in sequence:**

1. Mark AC as `in_progress` in TodoWrite

2. **Directly invoke code-implementer** using Task tool:

```typescript
Task({
  subagent_type: "code-implementer",
  description: `${ac.mode} Mode: ${task_id} - ${ac.id}`,
  prompt: `**EXECUTION MODE: ${ac.mode}**

Execute ${ac.mode} cycle for ${task_id} - ${ac.id}:

**Acceptance Criterion**: ${ac.text}
**Risk Level**: ${task.risk}

**Context from Specs** (VERBATIM - from loaded files):
${extracted_spec_content}

**Decision Context from ADRs**:
${extracted_adr_content}

**Implementation Patterns from Guides**:
${extracted_guide_content}

**Type Definitions**:
${extracted_type_definitions}

**Git State**: On branch feat/${task_id}

Proceed with ${ac.mode} cycle.`
})
```

3. Wait for code-implementer completion report

4. **MANDATORY: Verify Test Success Before Proceeding**

   **Invoke test-runner agent** to execute tests and analyze results:

   ```typescript
   Task({
     subagent_type: "test-runner",
     description: "Verify AC${ac.number} tests",
     prompt: `Run tests for ${affected_package} and analyze results for AC${ac.number}.

**Context**: Just completed implementation of ${ac.id}: ${ac.text}

**Package**: packages/${affected_package}

**Expected**: All tests passing, coverage ≥80% (High risk task)

**Instructions**:

1. Execute test suite using optimized test runner
2. Capture comprehensive logs
3. Analyze for failures, errors, or coverage gaps
4. Report surface-level summary with actionable insights

If failures detected, provide exact error details for code-implementer to fix.`
   })

   ```

   **Wait for test-runner completion report**

   **Success Criteria** (from test-runner report):
   - ✅ All tests passing (X/X shown in report)
   - ✅ No test failures or errors
   - ✅ Coverage thresholds met (if High risk: ≥80%)
   - ✅ TypeScript compilation successful

   **BLOCKING CHECKPOINT - If test-runner reports ANY failures**:
   - ❌ STOP - Do NOT mark AC as completed
   - ❌ Do NOT proceed to next AC
   - ❌ Do NOT commit code
   - 🔧 Extract failure details from test-runner report
   - 🔧 Re-invoke code-implementer with: `**TEST FAILURES DETECTED - Fix required before proceeding**\n\n${test_runner_failure_summary}`
   - 🔧 Continue Red-Green-Refactor cycle until test-runner reports all green
   - ⚠️  NEVER proceed to next AC without green test-runner report

5. If success (ONLY after test verification passes):
   ```bash
   git add ${changed_files}
   git commit -m "${commit_type}(${task_id}): ${ac_summary} [${ac.id}]

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

6. Update task-state.json (add to `acs_completed`)

7. Mark AC as `completed` in TodoWrite

8. Move to next AC

#### Phase 6: Complete Task & Create PR

After all ACs done:

1. Validate completion:
   - All ACs in `acs_completed`
   - `acs_remaining` is empty
   - No uncommitted changes

2. Update task-state.json:

   ```json
   {
     "status": "completed",
     "completed_at": "${ISO8601}"
   }
   ```

3. Commit final state:

   ```bash
   git add docs/backlog/task-state.json
   git commit -m "chore(${task_id}): mark task completed"
   ```

4. Push and create PR:

   ```bash
   git push -u origin feat/${task_id}

   gh pr create \
     --title "feat(${task_id}): ${task.title}" \
     --body "$(cat <<'EOF'
   ## Summary
   Completed ${ac_count} acceptance criteria for ${task_id}

   ${for_each_ac}
   - ✅ ${ac.id}: ${ac.text}
   ${end_for}

   ## Test Verification
   ${test_files_list}

   ## Related Documentation
   - Specs: ${related_specs}
   - ADRs: ${related_adrs}

   🤖 Generated with Claude Code
   EOF
   )"
   ```

#### Phase 7: Report Completion

Query VTM progress:

```bash
node .claude/scripts/vtm-status.mjs --dashboard
```

**Output:**

```markdown
## ✅ Task ${task_id} - COMPLETED

**Title**: ${title}
**Risk**: ${risk}
**Duration**: ${duration}

**Acceptance Criteria**: ${ac_count} ✓

**Tests Added**: ${test_count}
**Coverage**: ${coverage}
**Branch**: feat/${task_id}
**PR**: ${pr_url}

**Status**: Ready for review

---

**VTM Progress**: ${completed}/${total} tasks (${percentage}%)
**Next Eligible Task**: ${next_task_id or "None - run /pm blocked"}

**Next Steps**:
1. Review PR: ${pr_url}
2. Merge when ready
3. Return to main: git checkout main
4. Run `/pm start` for next task
```

---

### /pm status

**Follow**: `.claude/rules/vtm-operations.md`

```bash
node .claude/scripts/vtm-status.mjs --status
```

**Format the output as:**

```markdown
## 📈 Detailed Status

### Progress by Phase
{for each phase in by_phase}
- **{phase}:** {completed}/{total} ({percentage}%)

### Progress by Slice
{for each slice in by_slice}
- **{slice}:** {completed}/{total} ({percentage}%)

### Remaining Work by Risk
- **High:** {High count}
- **Medium:** {Medium count}
- **Low:** {Low count}

### Recent Completions
{for each in recent_completed, max 5}
- {task_id} (completed {completed_at})

### Currently In Progress
{for each in in_progress_tasks}
- {task_id}
```

### /pm blocked

**Follow**: `.claude/rules/vtm-operations.md` - "Get Blocked Tasks"

```bash
node .claude/scripts/vtm-status.mjs --blocked
```

**Format the output as:**

```markdown
## 🚫 Blocked Tasks

{if no blocked tasks}
✅ No tasks are currently blocked!

{otherwise, for each blocked task}
### {task_id}: {title}
- **Risk:** {risk}
- **Status:** {status}
- **Reason:** {blocked_reason}
- **Missing Dependencies:** {missing_dependencies or "N/A"}

---
```

---

## Error Handling

**Use patterns from** `.claude/rules/vtm-operations.md`:

### Phase 0 Errors

**Git Not on Main:**

```markdown
❌ BLOCKED: Not on main branch (currently on: ${branch})

**Action Required**:
1. Complete/abandon current work
2. Return to main: git checkout main
3. Retry: /pm start
```

**Uncommitted Changes:**

```markdown
❌ BLOCKED: Uncommitted changes detected

${git status output}

**Action Required**:
Commit or stash changes, then retry /pm start
```

**No Eligible Tasks:**

```markdown
❌ No eligible tasks available.

**Blocking Details**: ${from vtm-status.mjs --blocked}

Run: /pm blocked
```

### AC Execution Errors

If code-implementer reports failure:

- Mark AC as failed in TodoWrite
- Update task-state.json status to 'blocked'
- Report blocker to user
- STOP execution (don't proceed to next AC)

### Git Operation Errors

Report exact error and stop execution.

---

## Implementation Notes

**Script Location:** `.claude/scripts/vtm-status.mjs`

**Data Sources:**

- Virtual Task Manifest: `docs/backlog/virtual-task-manifest.json`
- Task State: `docs/backlog/task-state.json`

**Key Pattern:** This slash command orchestrates directly and uses Task tool to spawn code-implementer for each AC. This avoids nested agent delegation (platform limitation GitHub #4182).

---

## Examples

**Quick status check:**

```
User: /pm
Assistant: [Shows dashboard with progress bar and next task]
```

**View next task details:**

```
User: /pm next
Assistant: [Shows full task breakdown with ACs and dependencies]
```

**Start working on next task:**

```
User: /pm start
Assistant: [Executes full workflow: git validation → context loading → AC execution → PR creation]
```

**Check what's blocking progress:**

```
User: /pm blocked
Assistant: [Lists all tasks waiting on dependencies]
```

---

**Last Updated**: 2025-10-25
**Dependencies**: vtm-operations.md, task-context-loading.md
