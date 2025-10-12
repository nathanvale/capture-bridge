# Capture Bridge - AI Agent Instructions

Welcome to the Capture Bridge monorepo! This file contains essential context and rules for AI agents working on this project.

---

## Project Overview

**Capture Bridge** is Nathan's ADHD Digital Second Brain - a system for capturing thoughts, tasks, and information seamlessly across multiple channels (email, voice, SMS, etc.) and organizing them intelligently.

---

## Testing with @orchestr8/testkit

### TDD Guidelines

When writing tests for this project, **always follow test-driven development** practices using @orchestr8/testkit v2.0.0.

**📚 Complete TDD Guide**: @.claude/rules/testkit-tdd-guide-condensed.md
**📖 Full TDD Guide**: `.claude/rules/testkit-tdd-guide.md` (read on-demand for detailed examples)

### Quick Rules

1. **Test First**: Write failing tests before implementation
2. **Cleanup**: Follow 5-step cleanup sequence (custom resources → pools → databases → filesystem → GC)
3. **Custom Resources**: Any class with event listeners/timers MUST have async `shutdown()` method
4. **Resource Tracking**: Track ALL resources (pools, databases, clients) in arrays for cleanup
5. **Imports**: Use specific sub-exports (`@orchestr8/testkit/sqlite`, `/msw`, `/cli`)
6. **Security**: Always test SQL injection, path traversal, command injection
7. **Memory**: Check for leaks with `global.gc()` in cleanup

---

## Architecture Patterns

### Monorepo Structure

```
capture-bridge/
├── packages/
│   ├── foundation/      # TestKit wrapper & test suite (319 tests)
│   └── [other packages] # Feature packages
├── docs/                # Architecture Decision Records (ADRs)
└── .claude/             # AI agent configuration
```

### Key Documents

- **ADRs**: @docs/adr/ - Architectural decisions
- **PRDs**: @docs/features/ - Product requirements
- **Master PRD (Quick Ref)**: @.claude/rules/prd-master-condensed.md - Essential product context
- **Master PRD (Full)**: `docs/master/prd-master.md` (read on-demand for complete schemas)
- **Test Guide**: @packages/foundation/src/**tests**/README.md

---

## Development Workflow

### Starting Work

**IMPORTANT**: Before starting any implementation work, use the task orchestration system:

```bash
# Start the next task from the Virtual Task Manifest
/pm start
```

This command:
- Queries the next available VTM task
- Creates a feature branch
- Sets up task context
- Delegates to the appropriate implementation agent
- Handles test validation and PR creation

**DO NOT** start coding without using `/pm start` - this ensures proper task tracking, branching strategy, and test-driven development workflow.

### Development Mode (Local Work)

**Dev mode runs parallel build + test watching** for instant feedback:

```bash
# In any package
cd packages/foundation
pnpm dev               # Runs tsup --watch AND vitest watch in parallel

# Or from root (all packages)
pnpm dev               # Runs dev mode in all packages via Turbo
```

**What dev mode does:**
- **[build]** Watches source files → rebuilds to `dist/` on changes
- **[test]** Watches test files → re-runs tests on changes
- **Parallel execution** Both run simultaneously with colored, labeled output
- **Single terminal** No context switching between build and test windows

**When to use dev mode:**
- ✅ Active TDD development (writing code + tests)
- ✅ Package has dependents (other packages import from your dist/)
- ✅ Refactoring with instant test feedback
- ❌ Just running tests once (use `pnpm test`)
- ❌ Just building once (use `pnpm build`)

### Running Tests

```bash
# Foundation package (TestKit tests)
cd packages/foundation
pnpm test              # Run all 319 tests
pnpm test:watch        # Watch mode (tests only)
pnpm test:coverage     # With coverage report
pnpm test:ui           # Visual test UI
pnpm test:integration  # Integration tests only
```

### Building Packages

```bash
# Development build (fast, no DTS)
pnpm build             # Skips type declaration generation

# CI/Production build (complete, with DTS)
CI=true pnpm build     # Generates .d.ts files for publishing
```

**Why two modes?**
- **Dev**: No DTS = 5-10s faster builds, types not needed locally
- **CI**: Full DTS = Required for publishing to npm

### Code Quality

- **Coverage Thresholds**: 80/80/75/80 (lines/functions/branches/statements)
- **Test Execution**: 7.80s average (optimized from 18.73s)
- **Security**: 21 comprehensive security tests
- **Performance**: 14 benchmark tests
- **Test Parallelization**: 6 workers in dev, 2 in CI (Wallaby: 4 initial, 2 regular)

---

## Special Instructions for Agents

### Test Implementation Agent

When implementing tests:

1. Import TestKit TDD guide: @.claude/rules/testkit-tdd-guide-condensed.md
2. Follow Red-Green-Refactor cycle
3. Use appropriate TestKit sub-exports
4. Implement 5-step cleanup in afterEach
5. Add security tests for any input handling
6. Check memory leaks for loop operations
7. Read full guide (`.claude/rules/testkit-tdd-guide.md`) on-demand for complete templates

### Code Review Agent

When reviewing code:

1. Verify tests exist and pass
2. Check cleanup sequence order
3. Validate parameterized SQL queries
4. Ensure no file handle leaks
5. Confirm coverage thresholds met

### Documentation Agent

When documenting features:

1. Update relevant ADRs
2. Link to related PRDs
3. Include test examples
4. Document security considerations

---

## Project-Specific Rules

### Path Standards

- **Absolute paths**: Always use absolute paths in code
- **Temp directories**: Use TestKit's `createTempDirectory()` with cleanup
- **Database paths**: Use `:memory:` for tests, absolute paths for file DBs

### Git Workflow

- **Branch naming**: `feat/`, `fix/`, `docs/`, `refactor/`
- **Commits**: Conventional commits with Co-Authored-By: Claude
- **PRs**: Include test evidence and coverage reports

### Agent Coordination

See @.claude/rules/agent-coordination.md for multi-agent workflows

### VTM Task Orchestration

**Primary Orchestrator**: `task-manager` agent (v4.0.0+)

**Invocation**: Use `/pm start` command to start next VTM task

**Complete Workflow**:
1. **Phase 0**: VTM query + git validation (main branch, clean)
2. **Phase 1**: Context loading (specs, ADRs, guides)
3. **Phase 2-3**: Feature branch creation + task state initialization
4. **Phase 4-5**: AC classification + delegation to code-implementer
5. **Phase 6**: Test validation + PR creation
6. **Phase 7**: Completion reporting + VTM progress

**Agent Delegation Chain**:
```
/pm start → task-manager → code-implementer
             (orchestrate)  (implement)
```

**⚠️ Platform Limitation - Nested Agent Delegation**:

Claude Code has a known platform limitation (GitHub issue #4182): **sub-agents cannot spawn their own sub-agents**. When an agent is invoked via the Task tool, it loses access to the Task tool at runtime, even if its configuration declares it.

**Impact**: Multi-tier agent architectures (orchestrator → manager → worker) don't work.

**Solution**: Flatten to single-tier delegation:
- ✅ task-manager delegates to code-implementer (works)
- ❌ orchestrator delegates to task-manager delegates to code-implementer (broken)

**Architecture Evolution**:
```
# v3.x (broken):
implementation-orchestrator → task-manager → code-implementer
     (VTM query)                (route)        (implement)

# v4.0+ (working):
task-manager → code-implementer
(VTM query + route)  (implement)
```

**Historical Note**: `implementation-orchestrator.md` archived on 2025-10-08. Functionality merged into task-manager v4.0.0.

**⚠️ Platform Issue - code-implementer Agent Interruption (2025-10-10)**:

**Issue**: `code-implementer` agent type gets `[Request interrupted by user]` errors when spawned via Task tool, blocking the `/pm start` workflow.

**Workaround**: task-manager now uses `general-purpose` agent type with embedded TDD workflow instead of `code-implementer`. This preserves all TDD discipline and Wallaby MCP tool access while avoiding the interruption bug.

**What Changed**:
- task-manager.md lines 223-500: Changed from `code-implementer` to `general-purpose` with full embedded TDD instructions
- Embedded workflow includes: RED-GREEN-REFACTOR phases, Wallaby MCP tool usage, TestKit patterns, security/memory tests
- Token cost: +1,200 tokens per delegation (necessary trade-off to unblock workflow)

**What's Preserved**:
- ✅ Wallaby MCP tools for real-time test feedback (validated working)
- ✅ Complete TDD discipline (RED → GREEN → REFACTOR)
- ✅ TestKit patterns and 5-step cleanup
- ✅ Risk-based coverage requirements
- ✅ Security and memory leak testing

**Reference Docs**:
- `.claude/reference/task-manager-general-purpose-patch.md` - Detailed patch documentation
- `.claude/reference/general-purpose-tdd-template.md` - Template for TDD delegations

**Revert Path**: When platform fixes code-implementer interruption, change task-manager.md line 223 back to `code-implementer` and restore short delegation prompt.

---

## Code Quality & Type Safety

**Common ESLint/TypeScript Errors to Prevent:**

```typescript
// ❌ TS2532: Object is possibly 'undefined'
const result = results[0].property

// ✅ Assert length first
expect(results).toHaveLength(1)
const result = results[0].property

// ❌ @typescript-eslint/no-unused-vars
catch (error) { /* ignore */ }

// ✅ Underscore prefix
catch (_error) { /* ignore */ }

// ❌ TS2835: Relative import missing .js
import { x } from "../utils/helper"

// ✅ Include extension
import { x } from "../utils/helper.js"

// ❌ @typescript-eslint/no-non-null-assertion
expect(results[0]!.property).toBe(value)

// ✅ After length check OR avoid entirely
expect(results).toHaveLength(1)
expect(results[0].property).toBe(value)
```

**Quick fixes:** `.claude/rules/typescript-patterns-condensed.md`
**Full patterns with detailed examples:** `.claude/rules/typescript-patterns.md`

**Auto-fixed by hooks:** Formatting, linting
**Manual attention needed:** Type safety, array access, resource cleanup

---

### Code Quality Checklist

Before committing, verify:

- [ ] **Custom resources** have async `shutdown()` and are tracked for cleanup
- [ ] **No non-null assertions** unless after explicit null check
- [ ] **All relative imports** include `.js` extension
- [ ] **Array access** uses length assertion first OR optional chaining
- [ ] **Catch blocks** use underscore prefix OR inline disable with justification
- [ ] **Unknown types** have type assertions or guards
- [ ] **better-sqlite3 types** use default import type or dynamic imports
- [ ] **File formatted** with Prettier (`pnpm format`)
- [ ] **No TypeScript errors** (`pnpm typecheck`)
- [ ] **No ESLint errors** (`pnpm lint`)

---

## Additional Resources

### Quick Reference (In Memory)
- **Context Map**: @.claude/context-map.md - Navigation guide for condensed vs full docs
- **Testing Config**: @.claude/testing-config.md
- **TypeScript Quick Fixes**: @.claude/rules/typescript-patterns-condensed.md
- **TestKit TDD Quick Ref**: @.claude/rules/testkit-tdd-guide-condensed.md
- **Master PRD Quick Ref**: @.claude/rules/prd-master-condensed.md
- **Agent Coordination**: @.claude/rules/agent-coordination.md

### Full Documentation (Read On-Demand Only)
- **TypeScript Patterns (Full)**: `.claude/rules/typescript-patterns.md`
- **TestKit TDD Guide (Full)**: `.claude/rules/testkit-tdd-guide.md`
- **Master PRD (Full)**: `docs/master/prd-master.md`
- **All Rules**: `.claude/rules/`
- **All Agents**: `.claude/agents/`

---

**Last Updated**: 2025-10-08 - Memory optimization: Condensed documentation (26k → 8.9k tokens, 66% reduction)
**Maintained By**: Nathan Vale & AI Agents

---

## Memory Optimization

This project uses a **two-tier documentation system** for AI agent efficiency:

1. **Condensed versions** (~8.9k tokens total) - Always in memory via CLAUDE.md
2. **Full versions** (~26k tokens total) - Read on-demand when implementing complex patterns

See **@.claude/context-map.md** for navigation guide on when to use condensed vs full docs.
