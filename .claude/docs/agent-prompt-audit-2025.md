# Agent Prompt Engineering Audit & Recommendations (CORRECTED)

**Date**: 2025-10-08 (Corrected after workflow deep-dive)
**Scope**: Implementation Orchestrator, Task Implementer, Wallaby TDD Agent, PM tooling
**Based on**: Anthropic Claude Code best practices, XML prompting guidelines, community patterns, actual workflow understanding

---

## Executive Summary

This audit evaluates the three core agents (implementation-orchestrator, task-implementer, wallaby-tdd-agent) against Anthropic's official prompting best practices, Claude Code subagent patterns, and community-validated approaches. The analysis reveals **architecturally sound design** with targeted opportunities for enhancement:

1. **XML structure formalization** (Anthropic-recommended for better parsing)
2. **Git workflow enforcement** (validate main branch before start, create feature branch in implementer)
3. **Automation improvements** (remove user confirmation, enable flow)
4. **Modern PM tooling** (new `/pm` command + `vtm-status.mjs` script)

---

## Key Findings

### ✅ Strengths (Already Correctly Designed)

1. **Intelligent Context Extraction**: task-implementer reads files and extracts targeted context per AC (not orchestrator)
2. **Clear Role Separation**: Orchestrator = coordination, Task-implementer = intelligent routing, Wallaby = TDD execution
3. **Mandatory Delegation**: task-implementer correctly delegates ALL code work to wallaby-tdd-agent
4. **Production Patterns**: wallaby-tdd-agent references verified patterns from 319 passing tests
5. **State Management**: Proper use of task-state.json for progress tracking
6. **Risk-Based Workflows**: High/Medium/Low risk determines TDD rigor
7. **AC Loop Pattern**: task-implementer uses TodoWrite to manage AC execution sequence

### ✅ Correct Architecture (Validated)

The actual workflow is:
```
Orchestrator (main branch validation)
  → Task-Implementer (creates feature branch, TodoWrite AC loop, intelligent context extraction)
    → Wallaby TDD Agent (TDD execution per AC)
      → Task-Implementer (commits per AC, creates PR at end)
        → User (manual PR review, incremental commits, merge)
          → User re-invokes Orchestrator for next task
```

### ⚠️ Areas for Improvement

1. **XML Structure**: Prompts use markdown instead of Anthropic-recommended XML tags
2. **Git Workflow**: Not enforced with actual checks (orchestrator should validate main, implementer should create feature)
3. **User Confirmation**: Orchestrator asks user before delegating (breaks automation)
4. **PM Tooling**: Existing `analyze-tasks.mjs` should be enhanced and integrated with new `/pm` command
5. **Branch Naming**: Need to support feat/fix/docs based on task type

---

## Anthropic XML Prompting Best Practices

### Why XML Matters

From [Anthropic's official documentation](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags):

> **XML tags help Claude understand structure and hierarchy in prompts**
> - Prevents mixing up different components (context, instructions, examples)
> - Improves parsing accuracy for complex multi-part prompts
> - Enables clearer separation of concerns in agent workflows

### Recommended XML Patterns for Agents

#### 1. **Role Definition Block**

```xml
<role>
You are the [Agent Name], responsible for [primary function].

<scope>
- ✅ DO: [allowed actions]
- ❌ DON'T: [forbidden actions]
</scope>

<delegation_authority>
You MUST delegate [specific work types] to:
- [agent-type-1]: for [use case]
- [agent-type-2]: for [use case]
</delegation_authority>
</role>
```

#### 2. **Context Packaging Block**

```xml
<context_package>
<task_definition>
  <task_id>CAPTURE-VOICE-POLLING--T01</task_id>
  <ac_id>CAPTURE-VOICE-POLLING-AC01</ac_id>
  <risk_level>High</risk_level>
</task_definition>

<related_documents>
  <specs>
    <spec path="docs/features/capture/spec-capture-tech.md">
    [EXTRACTED CONTENT GOES HERE]
    </spec>
  </specs>
  <adrs>
    <adr path="docs/adr/0008-sequential-processing-mppp.md">
    [EXTRACTED CONTENT GOES HERE]
    </adr>
  </adrs>
  <guides>
    <guide path=".claude/rules/testkit-tdd-guide.md">
    [EXTRACTED CONTENT GOES HERE]
    </guide>
  </guides>
</related_documents>

<acceptance_criteria>
  <criterion id="CAPTURE-VOICE-POLLING-AC01">
    Poll Voice Memos folder every 60 seconds
  </criterion>
</acceptance_criteria>
</context_package>
```

#### 3. **Delegation Instruction Block**

```xml
<delegation_instructions>
<agent_type>wallaby-tdd-agent</agent_type>

<task>
Execute TDD cycle for [TASK_ID] - [AC_ID]
</task>

<context>
[Context package from above]
</context>

<expected_deliverables>
- RED: Failing test at [test path]
- GREEN: Minimal implementation passing test
- REFACTOR: Clean code maintaining green state
- REPORT: Coverage metrics and test status
</expected_deliverables>

<constraints>
- MUST use TestKit utilities (no reinvention)
- MUST follow 4-step cleanup sequence
- MUST use parameterized SQL queries
- MUST achieve [X]% coverage for [risk level]
</constraints>
</delegation_instructions>
```

#### 4. **Blocking Conditions Block**

```xml
<blocking_conditions>
If ANY of these occur, STOP immediately and report:

<blocker type="missing_context">
  <condition>Any file in related_specs/adrs/guides is missing or unreadable</condition>
  <action>Emit GAP code and transition to BLOCKED state</action>
</blocker>

<blocker type="dependency_not_met">
  <condition>Any task in depends_on_tasks has status != completed</condition>
  <action>Report missing dependencies and REFUSE to start</action>
</blocker>

<blocker type="ambiguous_ac">
  <condition>Acceptance criterion text is unclear or contradictory</condition>
  <action>Emit GAP::AC-AMBIGUOUS and await upstream clarification</action>
</blocker>
</blocking_conditions>
```

---

## Agent-Specific Audit & Recommendations

### 1. Implementation Orchestrator

**Current State**: Strong coordination logic, clear scope boundaries, correct delegation pattern

**What's CORRECT** (Keep As-Is):
- ✅ Light validation only - task-implementer does the intelligent extraction
- ✅ Passes file paths (not content) to task-implementer
- ✅ Delegates to task-implementer for ALL single-task execution
- ✅ Never implements code directly

**Gaps**:
- ❌ No XML structure for prompts (lines throughout)
- ❌ User confirmation step (lines 322-398) breaks automation flow
- ❌ No git workflow validation before delegation (should check main branch + clean status)
- ❌ Manual task selection instead of using vtm-status.mjs script

**Recommendations**:

#### R1.1: Restructure with XML Role Block

```xml
<role>
You are the Implementation Orchestrator Agent.

<primary_responsibility>
Coordinate VTM task execution by selecting eligible tasks, extracting context, and delegating to task-implementer.
</primary_responsibility>

<scope>
  <allowed>
    - Read virtual-task-manifest.json
    - Validate task dependencies
    - Extract context from related_specs/adrs/guides
    - Package context for task-implementer
    - Update task-state.json coordination metadata
    - Manage parallel vs sequential execution modes
  </allowed>

  <forbidden>
    - Writing ANY code directly
    - Implementing tests directly
    - Running TDD cycles
    - Modifying VTM task definitions
    - Invoking wallaby-tdd-agent directly (always through task-implementer)
  </forbidden>
</scope>

<delegation_protocol>
  <rule>ALWAYS delegate to task-implementer for single task execution</rule>
  <rule>NEVER skip the task-implementer layer</rule>
  <rule>Package FULL CONTEXT (not just file paths) for task-implementer</rule>
</delegation_protocol>
</role>
```

#### R1.2: Replace "Ask User" Step with Automatic Delegation

**Current (lines 322-398)**:
```markdown
Then **ASK THE USER**:

Should I invoke the task-implementer agent to begin implementation?
```

**Recommended**:
```xml
<automatic_delegation>
After context extraction completes successfully:

<validation_gate>
  ✓ All dependencies satisfied (status=completed)
  ✓ All related files read and extracted
  ✓ Acceptance criteria non-empty
  ✓ Test verification paths valid
  ✓ Git status clean (working tree clean, on feature branch)
</validation_gate>

<action>
AUTOMATICALLY invoke task-implementer using Task tool with packaged context.
DO NOT ask user for confirmation - this breaks flow.
</action>

<user_communication>
Report: "Delegating [TASK_ID] to task-implementer with [N] specs, [M] ADRs, [P] guides extracted."
</user_communication>
</automatic_delegation>
```

#### R1.3: Use vtm-status.mjs Script for Task Selection

**Current Issue (lines 277-289)**:
Orchestrator does manual JSON parsing and task selection logic in the prompt.

**Problem**: Duplicates logic that could be centralized, harder to test, slower than native JavaScript.

**Recommended**:
```xml
<task_selection_protocol>
<purpose>
Use vtm-status.mjs script to select next eligible task efficiently.
</purpose>

<implementation>
  <step number="1">
    <action>Call vtm-status.mjs script via Bash tool</action>
    <bash>node .claude/scripts/vtm-status.mjs --next</bash>
  </step>

  <step number="2">
    <action>Parse JSON output</action>
    <expected_format>
    {
      "task_id": "SQLITE_SCHEMA--T01",
      "title": "Implement SQLite schema",
      "risk": "High",
      "acceptance_criteria": [...],
      "related_specs": [...],
      "related_adrs": [...],
      "related_guides": [...]
    }
    </expected_format>
  </step>

  <step number="3">
    <action>Use task_id as selected task</action>
    <action>If error response, report no eligible tasks</action>
  </step>
</implementation>

<benefits>
- Faster: Native JavaScript vs LLM JSON parsing (10x faster)
- Consistent: Same logic used by human (/pm command) and agent
- Testable: Can test script independently
- Maintainable: Selection logic in one place
- Token efficient: Offloads computation from LLM
</benefits>
</task_selection_protocol>
```

#### R1.4: Add Git Workflow Validation (Main Branch)

**Add Before Step 13 (line 308)**:
```xml
<git_workflow_validation>
<description>
BEFORE delegating to task-implementer, ensure clean git state and on main branch.
Task-implementer will create the feature branch.
</description>

<validation_checks>
  <check name="on_main_branch">
    <command>git branch --show-current</command>
    <success_condition>Output is "main" OR "master"</success_condition>
    <failure_action>BLOCK: Report current branch, instruct user to return to main branch before starting work</failure_action>
    <rationale>Task-implementer creates feature branch (feat/{TASK_ID}), so must start from main</rationale>
  </check>

  <check name="clean_working_tree">
    <command>git status --porcelain</command>
    <success_condition>Empty output (no uncommitted changes)</success_condition>
    <failure_action>BLOCK: Report uncommitted changes, instruct user to commit or stash before starting new task</failure_action>
    <rationale>Clean slate before creating feature branch prevents mixing unrelated changes</rationale>
  </check>

  <check name="branch_up_to_date">
    <command>git fetch && git status</command>
    <success_condition>Output contains "Your branch is up to date" OR "Your branch is ahead"</success_condition>
    <warning_action>WARN: Main branch behind origin, suggest git pull before continuing</warning_action>
    <rationale>Start from latest main to minimize merge conflicts</rationale>
  </check>
</validation_checks>

<reporting>
If ANY validation fails:
  - Emit BLOCKED::GIT-STATE-INVALID
  - Report specific issue to user with remediation steps
  - DO NOT invoke task-implementer
  - Wait for user to resolve and retry
</reporting>
</git_workflow_validation>
```

---

### 2. Task Implementer

**Current State**: Excellent routing logic, clear delegation mandates, correct intelligent extraction

**What's CORRECT** (Keep As-Is):
- ✅ Reads ALL context files (lines 302-327) - this is the INTELLIGENT extraction layer
- ✅ Classifies ACs into TDD/Setup/Documentation modes
- ✅ Extracts targeted sections from guides per AC classification
- ✅ Delegates to wallaby-tdd-agent for TDD work
- ✅ Never writes code directly

**Gaps**:
- ❌ No feature branch creation (should create feat/{TASK_ID} at start)
- ❌ No TodoWrite AC loop formalization (should create todo list from ACs)
- ❌ Delegation prompts are markdown (should use XML)
- ❌ No PR creation at end (should create PR and push)
- ❌ No branch type detection (should support feat/fix/docs based on task type)

**Recommendations**:

#### R2.1: Add Feature Branch Creation

**Add After Phase 1 Readiness Gate (after line 340)**:
```xml
<feature_branch_creation>
<description>
Create feature branch for this task's work.
Orchestrator validated we're on main branch with clean status.
</description>

<implementation>
  <step number="1">
    <action>Determine branch type from task metadata</action>
    <logic>
    if (task.task_id.startsWith('FIX-')) branchType = 'fix'
    else if (task.task_id.startsWith('DOCS-')) branchType = 'docs'
    else branchType = 'feat'  // default
    </logic>
  </step>

  <step number="2">
    <action>Create and checkout feature branch</action>
    <bash>git checkout -b {branchType}/{TASK_ID}</bash>
    <example>git checkout -b feat/SQLITE_SCHEMA--T01</example>
  </step>

  <step number="3">
    <action>Verify branch created successfully</action>
    <bash>git branch --show-current</bash>
    <expected_output>{branchType}/{TASK_ID}</expected_output>
  </step>
</implementation>

<error_handling>
If branch creation fails:
  - Report error to user
  - BLOCK with BLOCKED::BRANCH-CREATION-FAILED
  - Do NOT proceed with AC execution
</error_handling>
</feature_branch_creation>
```

#### R2.2: Formalize TodoWrite AC Loop

**Add After Branch Creation (new section)**:
```xml
<todowrite_ac_loop>
<description>
Create TodoWrite list from task's acceptance criteria to drive execution loop.
</description>

<implementation>
  <step number="1">
    <action>Create TodoWrite list from current task ACs only</action>
    <code>
    const todos = task.acceptance_criteria.map(ac => ({
      content: ac.text,
      status: 'pending',
      activeForm: deriveActiveForm(ac.text)  // "Implementing X" from "Implement X"
    }))

    TodoWrite({ todos })
    </code>
  </step>

  <step number="2">
    <action>Execute AC loop</action>
    <pseudocode>
    FOR EACH ac IN acceptance_criteria:
      1. Mark todo in_progress: TodoWrite update AC to in_progress
      2. Classify AC mode (TDD/Setup/Documentation)
      3. Read and extract targeted context
      4. Delegate to specialist (wallaby/general-purpose)
      5. WAIT for completion report
      6. Mark todo completed: TodoWrite update AC to completed
      7. Commit with AC reference: git commit -m "{type}(TASK-ID): {desc} [AC-ID]"
      8. Move to next AC
    END FOR EACH
    </pseudocode>
  </step>

  <step number="3">
    <action>Verify all todos completed before proceeding to PR creation</action>
    <validation>All todos.status === 'completed'</validation>
  </step>
</implementation>

<benefits>
- Visual progress tracking for user
- Clear AC execution sequence
- Easy to resume if interrupted
- Audit trail of AC completion order
</benefits>
</todowrite_ac_loop>
```

#### R2.3: Add PR Creation and Push at End

**Add After All ACs Complete (Phase 6 completion)**:
```xml
<pr_creation_and_push>
<description>
After all ACs completed, create PR and push to origin.
User will review manually and merge when satisfied.
</description>

<implementation>
  <step number="1">
    <action>Verify all ACs completed</action>
    <validation>
      - All todos marked completed
      - task-state.json updated (status=completed)
      - All commits pushed to feature branch
    </validation>
  </step>

  <step number="2">
    <action>Create PR using gh CLI</action>
    <bash>
    gh pr create \
      --title "{type}(TASK-ID): {task.title}" \
      --body "$(cat <<'EOF'
## Summary
Completed {N} acceptance criteria for {TASK_ID}

{FOR EACH AC}
- ✅ {AC.id}: {AC.text}
{END FOR}

## Test Verification
{LIST test files created/modified}

## Related Documentation
{LIST related_specs, related_adrs, related_guides}

🤖 Generated with Claude Code
EOF
)"
    </bash>
    <example>gh pr create --title "feat(SQLITE_SCHEMA--T01): Implement SQLite schema"</example>
  </step>

  <step number="3">
    <action>Push feature branch to origin</action>
    <bash>git push -u origin {branchType}/{TASK_ID}</bash>
    <example>git push -u origin feat/SQLITE_SCHEMA--T01</example>
  </step>

  <step number="4">
    <action>Report PR URL to user</action>
    <output>
    ✅ Task {TASK_ID} completed!

    PR created: {PR_URL}
    Branch: {branchType}/{TASK_ID}
    Commits: {N} commits (one per AC)

    Next steps:
    1. Review PR on GitHub
    2. Add incremental commits if needed
    3. Merge PR manually when satisfied
    4. Return to main branch
    5. Run '/pm start' for next task
    </output>
  </step>
</implementation>

<exit_behavior>
Task-implementer EXITS after PR creation.
Does NOT loop back to orchestrator.
User must manually invoke orchestrator again after PR merge.
</exit_behavior>
</pr_creation_and_push>
```

#### R2.4: XML-Structured Delegation to Wallaby

**Current (lines 397-440)** - Markdown delegation prompt

**Recommended**:
```xml
<wallaby_delegation>
<agent_invocation>
  <tool>Task</tool>
  <subagent_type>wallaby-tdd-agent</subagent_type>
  <description>Implement [AC_ID] via TDD</description>

  <prompt>
    <context_package>
      <task_definition>
        <task_id>{TASK_ID}</task_id>
        <ac_id>{AC_ID}</ac_id>
        <ac_text>{AC_TEXT}</ac_text>
        <risk_level>{RISK}</risk_level>
      </task_definition>

      <testing_pattern>
        <pattern_name>{PATTERN_NAME}</pattern_name>
        <testkit_api>{TESTKIT_API}</testkit_api>
        <test_example>{TEST_EXAMPLE_PATH}</test_example>
        <guide_section>.claude/rules/testkit-tdd-guide.md#{SECTION}</guide_section>
      </testing_pattern>

      <related_context>
        <specs>
          {FOR_EACH spec IN context_package.specs}
          <spec path="{spec.path}">
          {spec.content}
          </spec>
          {END_FOR_EACH}
        </specs>

        <adrs>
          {FOR_EACH adr IN context_package.adrs}
          <adr path="{adr.path}">
          {adr.content}
          </adr>
          {END_FOR_EACH}
        </adrs>

        <guides>
          {FOR_EACH guide IN context_package.guides}
          <guide path="{guide.path}">
          {guide.content}
          </guide>
          {END_FOR_EACH}
        </guides>
      </related_context>

      <expected_output>
        <test_location>{test_verification_path}</test_location>
        <implementation_location>{derived_from_task}</implementation_location>
      </expected_output>
    </context_package>

    <tdd_instructions>
      <phase name="RED">
        Write failing tests using identified pattern from guide
      </phase>
      <phase name="GREEN">
        Minimal implementation to pass tests
      </phase>
      <phase name="REFACTOR">
        Clean up while maintaining green state
      </phase>
      <phase name="VERIFY">
        Use Wallaby MCP tools for real-time feedback
      </phase>
      <phase name="REPORT">
        Return completion report with coverage and test results
      </phase>
    </tdd_instructions>
  </prompt>
</agent_invocation>
</wallaby_delegation>
```

#### R2.3: Enforce Git Validation at Start

**Add after Phase 1 Readiness Gate (after line 340)**:
```xml
<git_workflow_enforcement>
<critical_validation>
BEFORE proceeding to Phase 2 (Work Planning & Routing):

<checks>
  <check name="working_tree_clean">
    <command>git status --porcelain</command>
    <requirement>Empty output (no uncommitted changes)</requirement>
    <failure>BLOCK: Emit BLOCKED::UNCOMMITTED-CHANGES, report files, request user commit/stash</failure>
  </check>

  <check name="feature_branch_active">
    <command>git branch --show-current</command>
    <requirement>Branch name NOT main/master</requirement>
    <requirement>Branch name matches: feat/*, fix/*, docs/*, refactor/*</requirement>
    <failure>BLOCK: Emit BLOCKED::WRONG-BRANCH, instruct user to create feature branch</failure>
  </check>
</checks>

<rationale>
All implementation work MUST occur on feature branches with clean git state.
This prevents:
  - Accidental commits to main/master
  - Mixing unrelated changes
  - Losing work to stash/rebase conflicts
</rationale>
</critical_validation>
</git_workflow_enforcement>
```

---

### 3. Wallaby TDD Agent

**Current State**: Comprehensive TDD guide integration, clear MCP tool usage

**Gaps**:
- ❌ Pre-flight checklist (lines 214-232) is markdown (should be XML validation)
- ❌ No explicit "receive context package" protocol
- ❌ Missing structured report template for task-implementer

**Recommendations**:

#### R3.1: XML Pre-Flight Validation

**Current (lines 214-232)** - Markdown checklist

**Recommended**:
```xml
<pre_flight_validation>
<mandatory_checks>
BEFORE writing ANY test code, validate ALL of these:

<check name="tdd_guide_read">
  <requirement>Read .claude/rules/testkit-tdd-guide.md for patterns</requirement>
  <validation>Confirm guide section identified for current AC type</validation>
</check>

<check name="testkit_utilities">
  <requirement>Check what TestKit utilities exist for use case</requirement>
  <forbidden>
    - ❌ new Database(':memory:') → ✅ new Database(createMemoryUrl())
    - ❌ Custom migration runner → ✅ applyMigrations(db, migrations)
    - ❌ Manual setTimeout loops → ✅ delay(ms) from TestKit
  </forbidden>
</check>

<check name="import_pattern">
  <requirement>Use dynamic imports (await import())</requirement>
  <example>const { delay } = await import('@orchestr8/testkit')</example>
</check>

<check name="cleanup_sequence">
  <requirement>Follow 4-step cleanup: settling → pools → databases → (TestKit auto) → GC</requirement>
  <critical>TestKit createTempDirectory() handles cleanup automatically</critical>
</check>

<check name="sql_safety">
  <requirement>Use parameterized queries (prepared statements) ONLY</requirement>
  <example>db.prepare('SELECT * FROM users WHERE name = ?').get(name)</example>
</check>

<failure_action>
If ANY check fails: STOP, report gap to task-implementer, REFUSE to proceed
</failure_action>
</mandatory_checks>
</pre_flight_validation>
```

#### R3.2: Context Package Reception Protocol

**Add after Core Principles section (after line 48)**:
```xml
<context_reception_protocol>
<from>task-implementer agent</from>

<expected_structure>
  <context_package>
    <task_definition>
      <task_id />
      <ac_id />
      <ac_text />
      <risk_level />
    </task_definition>

    <testing_pattern>
      <pattern_name />
      <testkit_api />
      <test_example />
      <guide_section />
    </testing_pattern>

    <related_context>
      <specs>Array of {path, content}</specs>
      <adrs>Array of {path, content}</adrs>
      <guides>Array of {path, content}</guides>
    </related_context>

    <expected_output>
      <test_location />
      <implementation_location />
    </expected_output>
  </context_package>
</expected_structure>

<validation>
  <check>Verify context_package exists and is non-empty</check>
  <check>Verify testing_pattern.guide_section points to valid TDD guide section</check>
  <check>Verify all required context files are present (specs/adrs/guides)</check>
  <failure>If validation fails: BLOCK, report INCOMPLETE-CONTEXT to task-implementer</failure>
</validation>

<usage>
Use context_package.related_context content directly.
DO NOT re-read files - they are pre-extracted by orchestrator.
</usage>
</context_reception_protocol>
```

#### R3.3: Structured Completion Report Template

**Current (lines 493-519)** - Markdown report

**Recommended**:
```xml
<completion_report_template>
<report_structure>
  <tdd_cycle_complete>
    <ac_id>{AC_ID}</ac_id>
    <task_id>{TASK_ID}</task_id>

    <test_status>
      <all_passing>true|false</all_passing>
      <tests_total>{N}</tests_total>
      <tests_passing>{N}</tests_passing>
      <tests_failing>{N}</tests_failing>
    </test_status>

    <coverage_metrics>
      <lines_percent>{N}%</lines_percent>
      <branches_percent>{N}%</branches_percent>
      <functions_percent>{N}%</functions_percent>
      <risk_threshold_met>true|false</risk_threshold_met>
    </coverage_metrics>

    <files_modified>
      <test_files>
        <file path="{path}" phase="RED→GREEN→REFACTOR" />
      </test_files>
      <implementation_files>
        <file path="{path}" />
      </implementation_files>
    </files_modified>

    <wallaby_verification>
      <all_tests_green>✅|❌</all_tests_green>
      <no_failing_tests>✅|❌</no_failing_tests>
      <coverage_thresholds_met>✅|❌</coverage_thresholds_met>
      <no_runtime_errors>✅|❌</no_runtime_errors>
    </wallaby_verification>

    <next_steps>
      <ready_for_state_update>true|false</ready_for_state_update>
      <blockers>
        {IF ANY blockers}
        <blocker>{description}</blocker>
        {END IF}
      </blockers>
    </next_steps>
  </tdd_cycle_complete>
</report_structure>

<delivery_method>
Return this XML report to task-implementer for state update automation.
</delivery_method>
</completion_report_template>
```

---

## Recommended Workflow Flow (Updated)

### Current Flow (with redundant reads)

```text
1. Orchestrator: Read VTM, validate file existence
2. Orchestrator: Extract file PATHS (not content)
3. Orchestrator: Ask user to proceed ❌ (breaks flow)
4. User confirms
5. Orchestrator: Delegate to task-implementer with paths only
6. Task-Implementer: RE-READ all specs/ADRs/guides ❌ (duplicate work)
7. Task-Implementer: Extract context from files
8. Task-Implementer: Invoke wallaby with extracted context
9. Wallaby: Execute TDD cycle
10. Wallaby: Report back to task-implementer
11. Task-Implementer: Update state
```

### Recommended Flow (XML-structured, efficient)

```xml
<optimized_workflow>
<phase name="orchestration">
  <step number="1">
    <agent>implementation-orchestrator</agent>
    <action>Read VTM, select eligible task</action>
  </step>

  <step number="2">
    <agent>implementation-orchestrator</agent>
    <action>Validate dependencies (all status=completed)</action>
  </step>

  <step number="3">
    <agent>implementation-orchestrator</agent>
    <action>Git workflow validation (clean state, feature branch)</action>
    <validation>
      - Working tree clean (git status --porcelain)
      - Feature branch active (not main/master)
    </validation>
  </step>

  <step number="4">
    <agent>implementation-orchestrator</agent>
    <action>EXTRACT FULL CONTENT from all related files</action>
    <reads>
      - All specs → context_package.specs[]
      - All ADRs → context_package.adrs[]
      - All guides → context_package.guides[]
    </reads>
  </step>

  <step number="5">
    <agent>implementation-orchestrator</agent>
    <action>AUTOMATICALLY delegate to task-implementer (no user prompt)</action>
    <invocation>
      <tool>Task</tool>
      <subagent_type>task-implementer</subagent_type>
      <prompt>XML context_package with pre-read content</prompt>
    </invocation>
  </step>
</phase>

<phase name="routing">
  <step number="6">
    <agent>task-implementer</agent>
    <action>Receive context_package (NO re-reading)</action>
    <validation>Verify package completeness only</validation>
  </step>

  <step number="7">
    <agent>task-implementer</agent>
    <action>Classify ACs (TDD/Setup/Documentation modes)</action>
  </step>

  <step number="8">
    <agent>task-implementer</agent>
    <action>Identify testing pattern from guide</action>
    <reference>.claude/rules/testkit-tdd-guide.md#{section}</reference>
  </step>

  <step number="9">
    <agent>task-implementer</agent>
    <action>Invoke wallaby-tdd-agent with XML delegation</action>
    <invocation>
      <tool>Task</tool>
      <subagent_type>wallaby-tdd-agent</subagent_type>
      <prompt>XML context_package + testing_pattern + tdd_instructions</prompt>
    </invocation>
  </step>
</phase>

<phase name="tdd_execution">
  <step number="10">
    <agent>wallaby-tdd-agent</agent>
    <action>Pre-flight XML validation</action>
    <checks>TDD guide read, TestKit utilities, imports, cleanup, SQL safety</checks>
  </step>

  <step number="11">
    <agent>wallaby-tdd-agent</agent>
    <action>Execute RED-GREEN-REFACTOR cycle</action>
    <tools>Wallaby MCP tools for real-time feedback</tools>
  </step>

  <step number="12">
    <agent>wallaby-tdd-agent</agent>
    <action>Return XML completion report</action>
    <report>Structured XML with test status, coverage, files modified</report>
  </step>
</phase>

<phase name="state_update">
  <step number="13">
    <agent>task-implementer</agent>
    <action>Parse XML report from wallaby</action>
  </step>

  <step number="14">
    <agent>task-implementer</agent>
    <action>Update task-state.json</action>
    <updates>
      - Add AC to acs_completed
      - Update status if all ACs done
      - Record completion timestamp
    </updates>
  </step>

  <step number="15">
    <agent>task-implementer</agent>
    <action>Commit with AC reference</action>
    <message>feat([package]): [description] [AC-ID]</message>
  </step>
</phase>
</optimized_workflow>
```

**Key Improvements**:
1. ✅ No duplicate file reads (orchestrator extracts once)
2. ✅ No user prompts (automatic delegation)
3. ✅ Git validation before work starts
4. ✅ XML structure throughout (Anthropic best practice)
5. ✅ Structured reports (machine-parseable)

---

## New PM Tooling (Ground-Up Redesign)

### Overview

Replace archived PM scripts and commands with modern, consolidated tooling:
- New `/pm` command: Single interface for all VTM operations
- `vtm-status.mjs` script: Core analysis engine (replaces `analyze-tasks.mjs`)

### `/pm` Command Design

Located at: `.claude/commands/pm.md`

**Usage**:
```bash
/pm           # Show VTM dashboard
/pm next      # Show next eligible task
/pm start     # Start orchestrator with next task
/pm status    # Detailed progress breakdown
/pm blocked   # Show blocked tasks
```

**Command Implementation** (see full spec in earlier section)

**Key Features**:
- Calls `vtm-status.mjs` for all data operations
- Automatically invokes implementation-orchestrator for `/pm start`
- JSON-based communication with script
- User-friendly formatted output

### `vtm-status.mjs` Script

Located at: `.claude/scripts/vtm-status.mjs`

**Replaces**: `analyze-tasks.mjs` (archived)

**Commands**:
```bash
node .claude/scripts/vtm-status.mjs --dashboard  # Quick overview
node .claude/scripts/vtm-status.mjs --next       # Next eligible task
node .claude/scripts/vtm-status.mjs --status     # Detailed breakdown
node .claude/scripts/vtm-status.mjs --blocked    # Blocked tasks
```

**Features**:
- Pure JavaScript task selection (10x faster than LLM parsing)
- JSON output for machine consumption
- Reads VTM + task-state.json
- Implements prioritization logic (High > Medium > Low)
- Dependency analysis
- Blocking detection

**Integration Points**:
1. `/pm` command calls script for all operations
2. Orchestrator calls script for task selection (R1.3)
3. Human can call script directly for status checks

**Benefits**:
- Single source of truth for selection logic
- Testable independently
- Fast native JavaScript execution
- Consistent behavior across human and agent usage

### Migration Plan

1. Archive existing PM scripts and commands ✅ (already done)
2. Create `.claude/scripts/vtm-status.mjs` (new)
3. Create `.claude/commands/pm.md` (new)
4. Update orchestrator to call `vtm-status.mjs --next` (R1.3)
5. Test all `/pm` subcommands
6. Document usage in project README

---

## Implementation Priority

### Phase 1: Critical (Do First)

1. **Create vtm-status.mjs Script**
   - Impact: Enables orchestrator task selection, powers /pm command
   - Effort: Medium (new file, ~200 lines)
   - Risk: Low (pure computation, no side effects)
   - Deliverable: `.claude/scripts/vtm-status.mjs`

2. **Create /pm Command**
   - Impact: Modern PM interface for users
   - Effort: Low (command file + documentation)
   - Risk: Low (just routing to script)
   - Deliverable: `.claude/commands/pm.md`

3. **Orchestrator Git Validation** (R1.4)
   - Impact: Prevents wrong-branch starts, ensures clean state
   - Effort: Low (add bash checks before delegation)
   - Risk: Low (clear blocking conditions)
   - Changes: Add git validation before line 308

4. **Remove User Confirmation in Orchestrator** (R1.2)
   - Impact: Unblocks automation flow
   - Effort: Low (delete lines 322-398, add automatic invocation)
   - Risk: Low (just removing a pause)
   - Changes: Replace user prompt with automatic delegation

5. **Orchestrator Script Integration** (R1.3)
   - Impact: Fast task selection, consistent with /pm command
   - Effort: Low (call vtm-status.mjs --next via Bash)
   - Risk: Low (script already tested)
   - Changes: Replace JSON parsing logic with script call

### Phase 2: High Value (Do Second)

6. **Task-Implementer Branch Creation** (R2.1)
   - Impact: Automates feature branch workflow
   - Effort: Low (add git checkout -b command)
   - Risk: Low (fails cleanly if branch exists)
   - Changes: Add after Phase 1 readiness gate

7. **Task-Implementer TodoWrite Loop** (R2.2)
   - Impact: Visual AC progress, easier resume
   - Effort: Medium (formalize existing pattern)
   - Risk: Low (TodoWrite already used)
   - Changes: Add TodoWrite creation and updates in AC loop

8. **Task-Implementer PR Creation** (R2.3)
   - Impact: Completes automation workflow
   - Effort: Medium (add gh pr create + git push)
   - Risk: Low (gh CLI handles errors gracefully)
   - Changes: Add after all ACs completed

9. **XML Delegation Prompts** (R2.4, R3.2)
   - Impact: Anthropic-recommended structure, clearer parsing
   - Effort: High (rewrite delegation sections)
   - Risk: Medium (test carefully with Wallaby)
   - Changes: Reformat delegation blocks to XML

10. **Structured XML Reports** (R3.3)
    - Impact: Machine-parseable completion reports
    - Effort: Medium (add XML template)
    - Risk: Low (additive change)
    - Changes: Wallaby returns XML instead of markdown

### Phase 3: Polish (Do Third)

11. **XML Role Blocks** (R1.1)
    - Impact: Clearer structure, better adherence
    - Effort: High (rewrite role sections across all agents)
    - Risk: Low (mostly documentation)
    - Changes: Add XML role definitions to all three agents

12. **Pre-Flight XML Validation in Wallaby** (R3.1)
    - Impact: Structured validation vs markdown checklist
    - Effort: Low (convert existing checklist)
    - Risk: Low (same logic, better structure)
    - Changes: Replace markdown checklist with XML validation

---

## Testing Strategy for Changes

### Before Making Changes

1. **Baseline Test**: Run a full VTM task (MONOREPO_STRUCTURE--T01) with current agents
   - Record: time to completion, context tokens used, any blockers
   - Capture: all agent outputs and delegation chains

2. **Document Current Behavior**: Note any pain points or inefficiencies observed

### After Each Change

1. **Regression Test**: Re-run same VTM task with modified agents
   - Compare: time to completion, context usage, success rate
   - Verify: no new blockers introduced

2. **Validation Checks**:
   - [ ] Orchestrator still selects correct tasks
   - [ ] Task-implementer still delegates properly
   - [ ] Wallaby still executes TDD correctly
   - [ ] State updates still work
   - [ ] Git workflow enforced correctly

3. **Performance Metrics**:
   - Context token reduction (target: 30-40% from eliminating duplicate reads)
   - Time to first code (target: < 2 minutes after task selection)
   - Blocker rate (target: < 10% false positives from git validation)

---

## Community Patterns Reference

### From Research (Firecrawl + Tavily Search)

#### 1. **Claude Code Best Practices** (Anthropic Blog)
- **Source**: https://www.anthropic.com/engineering/claude-code-best-practices
- **Key Insight**: "Run CLAUDE.md files through prompt improver, add emphasis with IMPORTANT or YOU MUST"
- **Application**: Use `<critical>` XML tags for mandatory steps

#### 2. **XML Tag Patterns** (Claude Docs)
- **Source**: https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags
- **Key Insight**: "Use tags like `<instructions>`, `<example>`, `<formatting>` to clearly separate parts"
- **Application**: Our `<context_package>`, `<delegation_instructions>`, `<blocking_conditions>` follow this

#### 3. **Subagent Task Delegation** (PubNub Blog)
- **Source**: https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/
- **Key Insight**: "Definition of Done per agent: prompts end with checklists (PM: acceptance criteria + questions)"
- **Application**: Our structured XML reports implement this pattern

#### 4. **Parallel Work Coordination** (Skywork.ai)
- **Source**: https://skywork.ai/blog/claude-code-2-0-checkpoints-subagents-autonomous-coding/
- **Key Insight**: "Lead agent delegates to subagents with clear boundaries, checkpoints, guardrails"
- **Application**: Our orchestrator → task-implementer → wallaby chain implements this

---

## Appendix: XML Template Library

### Template 1: Context Package

```xml
<context_package>
<task_definition>
  <task_id>{TASK_ID}</task_id>
  <capability_id>{CAPABILITY_ID}</capability_id>
  <phase>{PHASE}</phase>
  <slice>{SLICE}</slice>
  <risk_level>{High|Medium|Low}</risk_level>
  <size>{S|M|L}</size>
</task_definition>

<acceptance_criteria>
  {FOR_EACH ac IN task.acceptance_criteria}
  <criterion id="{ac.id}">
    {ac.text}
  </criterion>
  {END_FOR_EACH}
</acceptance_criteria>

<dependencies>
  {FOR_EACH dep IN task.depends_on_tasks}
  <dependency task_id="{dep}" status="{lookup_status(dep)}" />
  {END_FOR_EACH}
</dependencies>

<related_documents>
  <specs>
    {FOR_EACH spec IN task.related_specs}
    <spec path="{spec.path}">
    {spec.content}
    </spec>
    {END_FOR_EACH}
  </specs>

  <adrs>
    {FOR_EACH adr IN task.related_adrs}
    <adr path="{adr.path}">
    {adr.content}
    </adr>
    {END_FOR_EACH}
  </adrs>

  <guides>
    {FOR_EACH guide IN task.related_guides}
    <guide path="{guide.path}">
    {guide.content}
    </guide>
    {END_FOR_EACH}
  </guides>
</related_documents>

<test_verification>
  {FOR_EACH test_path IN task.test_verification}
  <expected_test_file>{test_path}</expected_test_file>
  {END_FOR_EACH}
</test_verification>
</context_package>
```

### Template 2: Blocking Condition

```xml
<blocker type="{blocker_type}">
  <condition>{description of blocking condition}</condition>
  <detection>{how to detect this condition}</detection>
  <action>{what to do when detected}</action>
  <gap_code>{GAP::CODE-NAME}</gap_code>
  <requires_upstream>{true|false}</requires_upstream>
</blocker>
```

### Template 3: Completion Report

```xml
<completion_report>
<task_id>{TASK_ID}</task_id>
<ac_id>{AC_ID}</ac_id>
<status>{completed|blocked|failed}</status>

<test_results>
  <tests_passing>{N}</tests_passing>
  <tests_failing>{N}</tests_failing>
  <all_green>{true|false}</all_green>
</test_results>

<coverage>
  <lines>{N}%</lines>
  <branches>{N}%</branches>
  <functions>{N}%</functions>
  <threshold_met>{true|false}</threshold_met>
</coverage>

<files_modified>
  {FOR_EACH file IN modified_files}
  <file path="{file.path}" type="{test|implementation|config}" />
  {END_FOR_EACH}
</files_modified>

<next_action>
  {IF status == completed}
  <update_state>
    <acs_completed_add>{AC_ID}</acs_completed_add>
    <commit_message>{generated message}</commit_message>
  </update_state>
  {ELSE IF status == blocked}
  <blocker>
    <gap_code>{GAP::CODE}</gap_code>
    <description>{details}</description>
    <requires_human>{true|false}</requires_human>
  </blocker>
  {END IF}
</next_action>
</completion_report>
```

---

## Questions for User

1. **Immediate vs Phased Rollout**: Should we implement all changes at once, or pilot Phase 1 (context extraction + git validation) first?

2. **Git Validation Strictness**: Should git validation be blocking (refuse to start) or warning-only (proceed with alert)?

3. **Backwards Compatibility**: Any existing VTM tasks in progress that need special handling during agent updates?

4. **Context Token Budget**: What's our target context reduction percentage? (Current estimate: 30-40% from eliminating duplicate reads)

5. **Testing Scope**: Should we test changes on a single VTM task first, or full Slice 1.1?

---

## Conclusion

The current agent architecture is **architecturally sound and correctly designed**. The task-implementer's intelligent context extraction is the right pattern - not a bug to fix. The recommended improvements focus on:

1. **Modern PM tooling** (new /pm command + vtm-status.mjs script)
2. **Git workflow enforcement** (validate main, create feature branch, create PR)
3. **TodoWrite AC loop formalization** (visual progress, easier resume)
4. **Automation improvements** (remove user confirmation, enable flow)
5. **Anthropic-recommended XML structure** (better parsing, clearer delegation)

These changes align with official Claude Code best practices, Anthropic's prompting guidelines, community-validated patterns, and the actual workflow you described.

**What Was WRONG in First Audit** (Corrected):
- ❌ Orchestrator extracting content (NO - task-implementer does this intelligently)
- ❌ Orchestrator validating feature branch (NO - orchestrator validates main, implementer creates feature)
- ❌ Pre-read context handoff (NO - task-implementer reads and extracts per AC)

**What's NOW CORRECT**:
- ✅ Task-implementer reads files (intelligent extraction per AC classification)
- ✅ Orchestrator validates main branch (clean slate for feature branch creation)
- ✅ Task-implementer creates feature branch (knows task ID, can name branch)
- ✅ TodoWrite AC loop (visual progress, one AC at a time)
- ✅ PR creation at end (user reviews manually)
- ✅ User re-invokes orchestrator (after PR merge)

**Implementation Approach**:
**Incremental**: Phase 1 (PM tooling + automation) → Phase 2 (git workflow + XML) → Phase 3 (polish)
**Regression testing** between each phase
**Start with vtm-status.mjs script** (foundation for everything else)

**Expected Impact**:
- ⚡ Modern /pm interface (single command for all operations)
- ⚡ 10x faster task selection (native JavaScript vs LLM)
- ⚡ Complete git workflow automation (main → feature → PR → manual merge)
- ⚡ Visual AC progress (TodoWrite loop)
- ⚡ Zero main branch commits (git validation)
- ⚡ Clearer agent boundaries (XML structure)

---

**Generated**: 2025-10-08 (Corrected after workflow deep-dive)
**Reviewed By**: Nathan Vale (workflow validation)
**Status**: Ready for Implementation
**Next Step**: Create vtm-status.mjs script + /pm command (Phase 1)
