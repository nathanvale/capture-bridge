# Task Context Loading - Standard Pattern

**Purpose**: Standardized pattern for loading all context files for a VTM task

**Used By**: `/pm start`, `/review-task`, VS Code review prompts

---

## Complete Context Loading Pattern

After querying VTM task (see `vtm-operations.md`), load ALL context files:

```typescript
// Extract file paths from task JSON
const contextFiles = [
  // Task-specific documentation
  ...task.related_specs,      // Feature specs
  ...task.related_adrs,       // Architecture decisions
  ...task.related_guides,     // Implementation guides

  // Project-wide rules (always include)
  '.claude/rules/testkit-tdd-guide-condensed.md',
  '.claude/rules/prd-master-condensed.md',
  '.claude/rules/typescript-patterns-condensed.md'
]

// Read each file
for (const filePath of contextFiles) {
  await Read({ file_path: filePath })
  // Store content for use in delegation or analysis
}
```

---

## Context Categories

### 1. Task-Specific Specs (`related_specs`)
**Purpose**: Feature requirements, acceptance criteria details, schemas

**Example paths**:
- `docs/features/capture/prd-capture.md`
- `docs/features/capture/spec-capture-tech.md`
- `docs/cross-cutting/spec-foundation-monorepo-tech.md`

**What to extract**:
- Detailed acceptance criteria explanations
- Type definitions and schemas
- API contracts
- Performance requirements
- Security requirements

### 2. Architecture Decisions (`related_adrs`)
**Purpose**: Design rationale, constraints, trade-offs

**Example paths**:
- `docs/adr/0001-voice-file-sovereignty.md`
- `docs/adr/0008-sequential-processing-mppp.md`
- `docs/adr/0011-inbox-only-export-pattern.md`

**What to extract**:
- Decision context
- Constraints to respect
- Alternatives rejected
- Consequences to implement

### 3. Implementation Guides (`related_guides`)
**Purpose**: How-to patterns, examples, best practices

**Example paths**:
- `docs/guides/guide-cli-doctor-implementation.md`
- `docs/guides/guide-testkit-optimizations.md`
- `docs/guides/guide-coverage-monorepo.md`

**What to extract**:
- Implementation patterns
- Error handling strategies
- Test patterns
- Common pitfalls

### 4. Project-Wide Rules (Always Loaded)
**Purpose**: Universal constraints and patterns

**Files**:
- `testkit-tdd-guide-condensed.md` - TDD workflow, cleanup patterns
- `prd-master-condensed.md` - Product vision, MPPP scope
- `typescript-patterns-condensed.md` - Type safety, common fixes

---

## Usage Patterns

### Pattern 1: In Slash Commands (Orchestrator)

```markdown
### Phase 1: Load All Context

**Step 1A: Query VTM** (see `vtm-operations.md`)

```bash
task_json=$(node .claude/scripts/vtm-status.mjs --next)
```

**Step 1B: Read All Context Files**

Use the Read tool for EVERY file:

```typescript
const task = JSON.parse(task_json)

// Read task-specific context
for (const spec of task.related_specs) {
  Read({ file_path: spec })
}

for (const adr of task.related_adrs) {
  Read({ file_path: adr })
}

for (const guide of task.related_guides) {
  Read({ file_path: guide })
}

// Read project-wide rules
Read({ file_path: '.claude/rules/testkit-tdd-guide-condensed.md' })
Read({ file_path: '.claude/rules/prd-master-condensed.md' })
Read({ file_path: '.claude/rules/typescript-patterns-condensed.md' })
```

**Step 1C: Store for Delegation**

Keep file contents in memory to include in agent delegation prompts.
```

### Pattern 2: In VS Code Prompts (No Agent)

```markdown
## Context Loading Instructions

You will use the Read tool to load all context files for this task.

**Step 1: Load Task-Specific Context**

Read each file from the task's context lists:

- **Specs**: ${task.related_specs.join(', ')}
- **ADRs**: ${task.related_adrs.join(', ')}
- **Guides**: ${task.related_guides.join(', ')}

**Step 2: Load Project Rules**

Read the following project-wide rules:
- `.claude/rules/testkit-tdd-guide-condensed.md`
- `.claude/rules/prd-master-condensed.md`
- `.claude/rules/typescript-patterns-condensed.md`

**Step 3: Understand Context**

After reading all files, you will have:
- Complete acceptance criteria understanding
- Architecture constraints to respect
- Implementation patterns to follow
- Test requirements
```

### Pattern 3: For Agent Delegation

```markdown
When delegating to sub-agent, include VERBATIM content:

```typescript
Task({
  subagent_type: "code-implementer",
  prompt: `
**Context from Specs** (VERBATIM):
${extractedSpecContent}

**Decision Context from ADRs**:
${extractedADRContent}

**Implementation Patterns from Guides**:
${extractedGuideContent}

**Type Definitions**:
${extractedTypeDefinitions}
  `
})
```
```

---

## Content Extraction Patterns

### Extract from Specs

**Look for**:
- Acceptance criteria details
- Schema definitions (JSON, TypeScript interfaces)
- API endpoints and contracts
- Performance targets (p95 latency, etc.)
- Security requirements

**Example extraction**:
```markdown
From spec-cli-tech.md, extract:

**CLI Commands Schema**:
\`\`\`typescript
interface CaptureVoiceOptions {
  transcribe?: boolean
  tags?: string[]
  priority?: 'low' | 'normal' | 'high'
}
\`\`\`

**Performance Requirements**:
- Cold start < 150ms (p95)
- Command registration < 10ms
```

### Extract from ADRs

**Look for**:
- Decision rationale
- Constraints
- Rejected alternatives
- Implementation consequences

**Example extraction**:
```markdown
From ADR-0008 (Sequential Processing):

**Constraint**: No concurrency in MPPP scope
**Rationale**: Avoid race conditions, simplify error handling
**Implementation**: Process one capture at a time, queue others
```

### Extract from Guides

**Look for**:
- Step-by-step patterns
- Code examples
- Common pitfalls
- Test patterns

**Example extraction**:
```markdown
From guide-testkit-optimizations.md:

**Cleanup Pattern**:
\`\`\`typescript
afterEach(async () => {
  for (const client of clients) await client.shutdown()
  await new Promise(resolve => setTimeout(resolve, 100))
  for (const pool of pools) await pool.drain()
  for (const db of databases) db.close()
  if (global.gc) global.gc()
})
\`\`\`
```

---

## Validation Checklist

Before proceeding with task execution:

- [ ] All `related_specs` files read successfully
- [ ] All `related_adrs` files read successfully
- [ ] All `related_guides` files read successfully
- [ ] All 3 project-wide rules read successfully
- [ ] Context content stored for delegation (if using agents)
- [ ] File read errors reported and handled

---

## Error Handling

### Missing Context File

```markdown
⚠️  Context file not found: ${file_path}

**Task:** ${task_id}
**Missing File:** ${file_path}

**Options**:
1. Skip and continue (if non-critical)
2. Report to user and request fix
3. Abort task (if critical spec/ADR)
```

### File Read Error

```markdown
❌ Error reading context file: ${file_path}

**Error:** ${error.message}

**Action**: Report error and stop execution
```

---

**Last Updated**: 2025-10-25
**Maintained By**: VTM Architecture Team
