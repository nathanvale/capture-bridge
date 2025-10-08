# Project Manager (PM) Command

**Purpose:** Unified interface for Virtual Task Manifest (VTM) operations

**Usage:**
- `/pm` - Show dashboard (progress overview + next task)
- `/pm next` - Show next eligible task details
- `/pm start` - Start next task (auto-invoke orchestrator)
- `/pm status` - Show detailed progress breakdown
- `/pm blocked` - Show blocked tasks

---

## Command Handler

When this command is invoked, execute the following based on the subcommand:

### /pm (Dashboard - Default)

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

**Purpose:** Start the next eligible VTM task using the unified task-manager orchestrator.

**Important:** task-manager now handles EVERYTHING - VTM query, git validation, context loading, AC execution, and PR creation. No need for separate orchestrator.

1. Invoke task-manager directly using Task tool:

```typescript
Task({
  subagent_type: "task-manager",
  description: "Execute next VTM task",
  prompt: `Execute the next eligible task from the Virtual Task Manifest.

**Your Responsibilities (Complete Workflow)**:
1. Phase 0: Query VTM for next task + validate git state (main branch, clean)
2. Phase 1: Read all context files (specs, ADRs, guides)
3. Phase 2-3: Create feature branch + initialize task state
4. Phase 4-5: Classify ACs + delegate each to code-implementer
5. Phase 6: Validate completion + create PR
6. Phase 7: Report completion with VTM progress

**No user input needed** - you query VTM directly with:
\`\`\`bash
node .claude/scripts/vtm-status.mjs --next
\`\`\`

If no eligible tasks, report what's blocking and stop.

Proceed automatically with full lifecycle.`
})
```

2. The task-manager will handle everything and return a completion report showing:
   - Task completion status
   - PR URL
   - VTM progress (X/Y tasks)
   - Next eligible task

3. If task-manager reports no eligible tasks, it will show blocked task details.

### /pm status

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

If vtm-status.mjs returns an error (exit code 1):

```markdown
❌ VTM Status Error

{error message from JSON}

**Paths checked:**
- VTM: {vtm_path}
- State: {state_path}

**Troubleshooting:**
1. Verify files exist at the paths above
2. Check JSON syntax is valid
3. Ensure task-state.json has proper schema
```

---

## Implementation Notes

**Script Location:** `.claude/scripts/vtm-status.mjs`

**Data Sources:**
- Virtual Task Manifest: `docs/backlog/virtual-task-manifest.json`
- Task State: `docs/backlog/task-state.json`

**Output Format:** All vtm-status.mjs commands return JSON to stdout

**Percentage Calculation:** `(completed / total * 100).toFixed(1)`

**Risk Priority:** High > Medium > Low (for next task selection)

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
Assistant: [Invokes task-manager to orchestrate task lifecycle]
```

**Check what's blocking progress:**
```
User: /pm blocked
Assistant: [Lists all tasks waiting on dependencies or explicitly blocked]
```
