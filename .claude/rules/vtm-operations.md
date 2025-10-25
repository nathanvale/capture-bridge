# VTM Operations - Virtual Task Manifest Query Patterns

**Purpose**: Standardized patterns for querying and validating VTM tasks

**Used By**: `/pm`, `/review-task`, VS Code review prompts

---

## Query Next Eligible Task

```bash
node .claude/scripts/vtm-status.mjs --next
```

**Returns JSON**:
```json
{
  "task_id": "TASK_NAME--T01",
  "title": "Human-readable title",
  "risk": "High|Medium|Low",
  "phase": "phase-name",
  "slice": "slice-name",
  "size": "Small|Medium|Large",
  "acceptance_criteria": [
    {"id": "AC01", "text": "Criterion text"}
  ],
  "related_specs": ["docs/path/to/spec.md"],
  "related_adrs": ["docs/adr/NNNN-title.md"],
  "related_guides": ["docs/guides/guide-name.md"],
  "depends_on_tasks": [],
  "test_verification": "Test requirements"
}
```

**Exit Codes**:
- `0` - Task found
- `1` - No eligible tasks (check blocked)

---

## Query Specific Task

```bash
node .claude/scripts/vtm-status.mjs --task <task-id>
```

**Same JSON structure as --next**

---

## Get Task Status

From `docs/backlog/task-state.json`:

```bash
jq -r ".tasks[\"${task_id}\"]" docs/backlog/task-state.json
```

**Returns**:
```json
{
  "status": "pending|in-progress|completed|blocked",
  "started_at": "ISO8601",
  "completed_at": "ISO8601",
  "pr_number": 123,
  "acs_completed": ["AC01", "AC02"],
  "acs_remaining": []
}
```

**Status Validation**:
- `pending` - Not started, eligible for `/pm start`
- `in-progress` - Currently being worked on
- `completed` - All ACs done, eligible for `/review-task`
- `blocked` - Waiting on dependencies

---

## Get Blocked Tasks

```bash
node .claude/scripts/vtm-status.mjs --blocked
```

**Returns list of**:
```json
{
  "task_id": "TASK--TXX",
  "title": "...",
  "blocked_reason": "Waiting on dependencies",
  "missing_dependencies": ["OTHER_TASK--T01"]
}
```

---

## Validation Patterns

### Check Task Exists
```bash
if ! node .claude/scripts/vtm-status.mjs --task "${task_id}" 2>/dev/null; then
  echo "❌ Task not found: ${task_id}"
  exit 1
fi
```

### Check Task Completed
```bash
status=$(jq -r ".tasks[\"${task_id}\"].status" docs/backlog/task-state.json)
if [[ "$status" != "completed" ]]; then
  echo "❌ Task not completed (status: $status)"
  exit 1
fi
```

### Get PR Number
```bash
pr_number=$(jq -r ".tasks[\"${task_id}\"].pr_number // empty" docs/backlog/task-state.json)
if [[ -z "$pr_number" ]]; then
  echo "⚠️  No PR found for task"
fi
```

---

## Common Error Handling

### No Eligible Tasks
```markdown
❌ No eligible tasks available.

**Blocked tasks**: Run `/pm blocked` for details
```

### Task Not Found
```markdown
❌ Task not found: ${task_id}

**Available tasks**: Run `/pm status`
```

### Invalid Task State
```markdown
❌ Task in invalid state for this operation

**Task:** ${task_id}
**Current Status:** ${status}
**Required Status:** ${required_status}
```

---

## Usage Examples

### In Slash Commands
```markdown
When this command is invoked:

1. Query VTM:
   ```bash
   task_json=$(node .claude/scripts/vtm-status.mjs --next)
   ```

2. Extract fields:
   ```bash
   task_id=$(echo "$task_json" | jq -r '.task_id')
   risk=$(echo "$task_json" | jq -r '.risk')
   ```

3. Use in workflow
```

### In Prompts
```markdown
**Step 1: Get Task Data**

Use the Bash tool to query VTM:
```bash
node .claude/scripts/vtm-status.mjs --task ${task_id}
```

Store the JSON response for use in subsequent steps.
```

---

**Last Updated**: 2025-10-25
**Maintained By**: VTM Architecture Team
