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

---

## Command Handler

When this command is invoked, execute the following workflow:

### Phase 1: Validate Task & Load Context

#### Step 1A: Get Task Information

```bash
# Get task details from VTM
node .claude/scripts/vtm-status.mjs --task <task-id>
```

**Validation:**
- Task must exist in VTM
- Task status must be "completed" in task-state.json
- Task must have PR merged or at least created

**If validation fails:**
```markdown
❌ Cannot review task: <reason>

**Task ID:** <task-id>
**Current Status:** <status>

**Action Required:**
- For in-progress tasks: Complete with `/pm start`
- For blocked tasks: Run `/pm blocked`
```

#### Step 1B: Load All Context Files

Read EVERY file in task's context (same as `/pm start`):

```typescript
const contextFiles = [
  ...task.related_specs,
  ...task.related_adrs,
  ...task.related_guides,
  '.claude/rules/testkit-tdd-guide-condensed.md',
  '.claude/rules/prd-master-condensed.md',
  '.claude/rules/typescript-patterns-condensed.md'
]

for (const filePath of contextFiles) {
  Read({ file_path: filePath })
}
```

#### Step 1C: Identify Changed Files

```bash
# Get PR number from task-state.json
pr_number=$(jq -r ".tasks[\"${task_id}\"].pr_number" docs/backlog/task-state.json)

# Get changed files from PR
gh pr view ${pr_number} --json files --jq '.files[].path'
```

**For each changed file:**
1. Read the current file content
2. Get git diff to see what changed:
   ```bash
   git diff main...feat/${task_id} -- ${file_path}
   ```

### Phase 2: Invoke Code Reviewer Agent

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

**Specifications (VERBATIM):**
${extracted_spec_content}

**Architecture Decisions (ADRs):**
${extracted_adr_content}

**Implementation Guidelines:**
${extracted_guide_content}

**Changed Files:**
${changed_files.map(f => `- ${f.path}`).join('\n')}

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

Perform a comprehensive review across **ALL risk dimensions** (P0, P1, P2, P3):

### P0 - Critical Production Risks (BLOCKING)
**You MUST identify and flag:**
- **Security vulnerabilities** (SQL injection, XSS, CSRF, secrets exposure)
- **Data loss risks** (missing transactions, unsafe deletions, race conditions)
- **Crash/corruption risks** (unhandled errors, null pointer exceptions)
- **Breaking changes** (API contract violations, schema migrations without backfill)
- **Resource leaks** (unclosed connections, file handles, memory leaks)

**For EACH P0 issue found:**
- Exact location (file:line)
- Severity explanation
- Attack vector or failure scenario
- Remediation required

### P1 - High-Impact Quality Issues (STRONGLY RECOMMENDED)
**You SHOULD identify:**
- **Test coverage gaps** (critical paths untested, edge cases missing)
- **Error handling gaps** (catch without logging, silent failures)
- **Performance issues** (N+1 queries, missing indexes, blocking I/O)
- **Type safety violations** (any casts, non-null assertions without guards)
- **Architectural violations** (breaking MPPP constraints, violating ADRs)

**For EACH P1 issue:**
- Location
- Impact description
- Suggested fix

### P2 - Code Quality & Maintainability (RECOMMENDED)
**You SHOULD highlight:**
- **Code smells** (long functions, deep nesting, high complexity)
- **Duplication** (copy-paste code, missed abstraction opportunities)
- **Naming issues** (unclear variable names, misleading function names)
- **Missing documentation** (complex logic without comments)
- **Technical debt** (TODOs, temporary hacks, missing refactoring)

**For EACH P2 issue:**
- Location
- Refactoring suggestion
- Benefit explanation

### P3 - Style & Best Practices (OPTIONAL)
**You MAY note:**
- **Style inconsistencies** (formatting, import order)
- **Best practice opportunities** (modern patterns, language features)
- **Optimization opportunities** (minor performance gains)

---

## REVIEW OUTPUT FORMAT

Structure your review as a comprehensive report:

\`\`\`markdown
# Code Review Report: ${task_id}

## Executive Summary
- **Task:** ${task.title}
- **Risk Level:** ${task.risk}
- **PR:** #${pr_number}
- **Files Changed:** ${changed_files.length}
- **Lines Added/Removed:** +${additions}/-${deletions}

**Overall Assessment:** [PASS / PASS WITH RECOMMENDATIONS / BLOCKING ISSUES FOUND]

**Critical Findings:** ${p0_count} P0, ${p1_count} P1, ${p2_count} P2, ${p3_count} P3

---

## P0 - Critical Issues (${p0_count})

${if p0_count === 0}
✅ **No critical issues found**
${else}
${for_each_p0_issue}
### 🚨 P0-${issue_number}: ${issue_title}

**Location:** \`${file}:${line}\`
**Severity:** BLOCKING
**Category:** ${category}

**Issue:**
${detailed_description}

**Attack Vector / Failure Scenario:**
${scenario_description}

**Code:**
\`\`\`${language}
${problematic_code}
\`\`\`

**Required Fix:**
${remediation_steps}

**Suggested Code:**
\`\`\`${language}
${fixed_code}
\`\`\`
${end_for}
${end_if}

---

## P1 - High-Impact Quality Issues (${p1_count})

${similar_format_as_p0}

---

## P2 - Code Quality & Maintainability (${p2_count})

${similar_format_as_p0}

---

## P3 - Style & Best Practices (${p3_count})

${similar_format_as_p0}

---

## Positive Observations

${highlight_good_patterns}
- ✅ Excellent test coverage for ${feature}
- ✅ Proper error handling in ${module}
- ✅ Clean separation of concerns in ${component}
- ✅ Well-documented complex logic in ${function}

---

## Specification Compliance

**Acceptance Criteria Validation:**
${for_each_ac}
- [✅/❌] **${ac.id}:** ${ac.text}
  - Implementation: ${implementation_notes}
  - Test Coverage: ${test_coverage_notes}
${end_for}

**ADR Compliance:**
${for_each_adr}
- **${adr.id}:** ${adr.title}
  - Compliance: [✅ Followed / ⚠️ Partial / ❌ Violated]
  - Notes: ${compliance_notes}
${end_for}

---

## Test Quality Assessment

**Coverage Metrics:**
- Lines: ${line_coverage}%
- Branches: ${branch_coverage}%
- Functions: ${function_coverage}%

**Test Observations:**
- Test count: ${test_count}
- Test types: ${unit_count} unit, ${integration_count} integration
- Quality: ${test_quality_notes}

**Gaps Identified:**
${test_gaps_list}

---

## Recommendations

### Immediate (Pre-Merge)
${if p0_count > 0}
🚨 **BLOCK MERGE** - ${p0_count} critical issues must be fixed
${else}
✅ Safe to merge after addressing recommendations
${end_if}

### Short-Term (Next Sprint)
${p1_recommendations}

### Long-Term (Backlog)
${p2_p3_recommendations}

---

## Review Metadata

**Reviewer:** code-reviewer agent
**Review Date:** ${ISO8601}
**Review Duration:** ${duration}
**Automated Tools Used:** TypeScript compiler, ESLint, Vitest coverage
**Manual Analysis:** P0123 risk framework

\`\`\`
`
})
```

### Phase 3: Save Review Report

After code-reviewer completes:

```bash
# Create reports directory if needed
mkdir -p docs/reports/${task_id}

# Save report
echo "${review_output}" > docs/reports/${task_id}/code-review-report.md

# Generate summary JSON for tracking
cat > docs/reports/${task_id}/review-summary.json <<EOF
{
  "task_id": "${task_id}",
  "reviewed_at": "${ISO8601}",
  "pr_number": ${pr_number},
  "assessment": "${PASS|PASS_WITH_RECOMMENDATIONS|BLOCKING}",
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
${for_each_p0_issue, max 3}
1. **${issue.title}** (${issue.file}:${issue.line})
   - ${issue.summary}
${end_for}

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

### Task Not Found
```markdown
❌ Task not found: ${task_id}

Run: /pm status
```

### Task Not Completed
```markdown
❌ Cannot review in-progress task: ${task_id}

**Current Status:** ${status}

Complete task first: /pm start
```

### PR Not Found
```markdown
❌ No PR found for task: ${task_id}

**Possible Reasons:**
- Task completed locally but not pushed
- PR number not recorded in task-state.json

**Action Required:**
1. Check task-state.json for pr_number
2. Verify PR exists: gh pr list
```

### Changed Files Not Accessible
```markdown
⚠️  Some files could not be read

**Skipped Files:** ${skipped_files}

Review will continue with accessible files.
```

---

## Implementation Notes

**Script Dependencies:**
- `.claude/scripts/vtm-status.mjs` - Task data
- `docs/backlog/task-state.json` - Task status
- `gh` CLI - PR information

**Agent Requirements:**
- `code-reviewer` - Must be available
- Full access to Read, Bash, Write tools

**Report Storage:**
- Location: `docs/reports/{task-id}/`
- Files: `code-review-report.md`, `review-summary.json`
- Version controlled (committed to repo)

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
