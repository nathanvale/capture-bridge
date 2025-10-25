---
allowed-tools: Task, Bash, Read, Write, Glob, Grep
description: Review completed VTM task with P0123 analysis and save report
argument-hint: [task-id]
---

# Review Task Command

**Purpose:** Comprehensive P0123 review of completed VTM tasks with automated report generation

**Usage:**

- `/review-task <task-id>` - Review specific completed task
- `/review-task latest` - Review most recently completed task

**Shared Rules**:
- VTM Operations: `.claude/rules/vtm-operations.md`
- Context Loading: `.claude/rules/task-context-loading.md`
- Review Framework: `.claude/rules/code-review-framework.md`

---

## Command Handler

When this command is invoked, execute the following workflow:

### Phase 1: Validate Task & Load Context

#### Step 1A: Get Task Information

**Follow**: `.claude/rules/vtm-operations.md` - "Query Specific Task"

```bash
# Get task details from VTM
node .claude/scripts/vtm-status.mjs --task <task-id>
```

**Follow**: `.claude/rules/vtm-operations.md` - "Get Task Status"

```bash
# Validate task is completed
status=$(jq -r ".tasks[\"${task_id}\"].status" docs/backlog/task-state.json)
pr_number=$(jq -r ".tasks[\"${task_id}\"].pr_number // empty" docs/backlog/task-state.json)
```

**Validation**:
- Task must exist in VTM
- Task status must be "completed"
- PR number must be present

**If validation fails**, use error handling from `.claude/rules/vtm-operations.md`

#### Step 1B: Load All Context Files

**Follow**: `.claude/rules/task-context-loading.md` - "Complete Context Loading Pattern"

Read ALL context files for the task:
- Task-specific specs, ADRs, guides
- Project-wide rules (testkit, prd, typescript patterns)

Store content for delegation to code-reviewer agent.

#### Step 1C: Identify Changed Files

```bash
# Get changed files from PR
gh pr view ${pr_number} --json files --jq '.files[] | {path: .path, additions: .additions, deletions: .deletions}'
```

**For each changed file:**

1. Read current content:
   ```bash
   Read({ file_path: ${file.path} })
   ```

2. Get git diff:
   ```bash
   git diff main...feat/${task_id} -- ${file.path}
   ```

### Phase 2: Invoke Code Reviewer Agent

**Follow**: `.claude/rules/code-review-framework.md` - "P0123 Risk Dimensions" and "Review Report Structure"

Delegate to code-reviewer agent with full context:

```typescript
Task({
  subagent_type: "code-reviewer",
  description: `P0123 Review: ${task_id}`,
  prompt: `**COMPREHENSIVE CODE REVIEW - ${task_id}**

**Task Context:**
- **ID:** ${task_id}
- **Title:** ${task.title}
- **Risk Level:** ${task.risk}
- **Phase/Slice:** ${task.phase}/${task.slice}
- **PR:** #${pr_number}

**Acceptance Criteria Completed:**
${task.acceptance_criteria.map((ac, i) => `${i+1}. ${ac.text}`).join('\n')}

**Context (VERBATIM from loaded files):**

<specs>
${extracted_spec_content}
</specs>

<adrs>
${extracted_adr_content}
</adrs>

<guides>
${extracted_guide_content}
</guides>

**Changed Files:**
${changed_files.map(f => `- ${f.path} (+${f.additions}/-${f.deletions})`).join('\n')}

**File Contents & Diffs:**
${for_each_changed_file}
---
**File:** ${file.path}

**Diff:**
\`\`\`diff
${git_diff_output}
\`\`\`

**Full Current Content:**
\`\`\`${file.language}
${file.content}
\`\`\`
---
${end_for}

---

## YOUR MISSION: P0123 CODE REVIEW

**Follow the complete framework at**: \`.claude/rules/code-review-framework.md\`

**Key Requirements**:
1. Apply P0123 risk analysis (P0=blocking, P1=high-impact, P2=quality, P3=style)
2. Use standardized issue templates from framework
3. Generate report using structure from framework
4. Include specification compliance check
5. Provide assessment (PASS / PASS_WITH_RECOMMENDATIONS / BLOCKING_ISSUES)

**Output your review using the exact report structure from \`code-review-framework.md\`**
`
})
```

### Phase 3: Save Review Report

After code-reviewer completes:

```bash
# Create reports directory
mkdir -p docs/reports/${task_id}

# Save full markdown report
cat > docs/reports/${task_id}/code-review-report.md <<'EOF'
${review_output_from_agent}
EOF

# Generate summary JSON
cat > docs/reports/${task_id}/review-summary.json <<EOF
{
  "task_id": "${task_id}",
  "reviewed_at": "${ISO8601}",
  "pr_number": ${pr_number},
  "assessment": "${assessment}",
  "issues": {
    "p0": ${p0_count},
    "p1": ${p1_count},
    "p2": ${p2_count},
    "p3": ${p3_count}
  },
  "files_reviewed": ${files_count},
  "lines_changed": {
    "additions": ${additions},
    "deletions": ${deletions}
  }
}
EOF

# Commit report
git add docs/reports/${task_id}/
git commit -m "docs(${task_id}): add comprehensive code review report

P0123 Review Results:
- P0 (Critical): ${p0_count}
- P1 (High): ${p1_count}
- P2 (Quality): ${p2_count}
- P3 (Style): ${p3_count}

Assessment: ${assessment}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Phase 4: Report to User

```markdown
## ✅ Code Review Complete: ${task_id}

**Task:** ${task.title}
**PR:** #${pr_number}
**Files Reviewed:** ${files_count}
**Lines Changed:** +${additions}/-${deletions}

---

## Review Summary

**Assessment:** ${assessment_emoji} **${assessment}**

**Issues Identified:**
- 🚨 **P0 (Critical):** ${p0_count}
- ⚠️  **P1 (High):** ${p1_count}
- 💡 **P2 (Quality):** ${p2_count}
- 📝 **P3 (Style):** ${p3_count}

${if p0_count > 0}
### 🚨 BLOCKING ISSUES FOUND

**Action Required:** Fix ${p0_count} critical issue(s) before merge

**Top P0 Issues:**
${top_3_p0_issues}

**Full Details:** docs/reports/${task_id}/code-review-report.md
${else if p1_count > 0}
### ✅ Safe to Merge (Recommendations Present)

**${p1_count} high-impact recommendations** for consideration

**Next Steps:**
1. Review recommendations in report
2. Address critical P1 issues (or defer with justification)
3. Merge when ready
${else}
### ✅ Excellent Work!

No critical or high-impact issues found.

**Minor improvements suggested:** ${p2_count + p3_count}
${end_if}

---

## Report Artifacts

📄 **Full Review:** docs/reports/${task_id}/code-review-report.md
📊 **Summary JSON:** docs/reports/${task_id}/review-summary.json

**View Full Report:**
\`\`\`bash
cat docs/reports/${task_id}/code-review-report.md
\`\`\`

**Comment on PR:**
\`\`\`bash
gh pr comment ${pr_number} --body-file docs/reports/${task_id}/code-review-report.md
\`\`\`

---

**Next Task:** Run \`/pm next\` to see next eligible task
```

---

## Error Handling

Use error patterns from `.claude/rules/vtm-operations.md`:

- Task not found
- Invalid task state
- PR not found

---

## Examples

**Review specific task:**
```
User: /review-task CLI_FOUNDATION--T01
Assistant: [Loads context → Reads changed files → Invokes code-reviewer → Saves report → Shows summary]
```

**Review latest completed task:**
```
User: /review-task latest
Assistant: [Finds most recent completion → Executes full review workflow]
```

**Post review to PR:**
```bash
# After review completes
gh pr comment 57 --body-file docs/reports/CLI_FOUNDATION--T01/code-review-report.md
```

---

**Last Updated**: 2025-10-25
**Dependencies**: vtm-operations.md, task-context-loading.md, code-review-framework.md
