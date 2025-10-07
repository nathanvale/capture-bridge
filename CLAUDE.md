# Capture Bridge - AI Agent Instructions

Welcome to the Capture Bridge monorepo! This file contains essential context and rules for AI agents working on this project.

---

## Project Overview

**Capture Bridge** is Nathan's ADHD Digital Second Brain - a system for capturing thoughts, tasks, and information seamlessly across multiple channels (email, voice, SMS, etc.) and organizing them intelligently.

---

## Testing with @orchestr8/testkit

### TDD Guidelines

When writing tests for this project, **always follow test-driven development** practices using @orchestr8/testkit v2.0.0.

**📚 Complete TDD Guide**: @.claude/rules/testkit-tdd-guide.md

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
- **Master PRD**: @docs/master/prd-master.md - Overall product vision
- **Test Guide**: @packages/foundation/src/**tests**/README.md

---

## Development Workflow

### Running Tests

```bash
# Foundation package (TestKit tests)
cd packages/foundation
pnpm test              # Run all 319 tests
pnpm test:coverage     # With coverage report
```

### Code Quality

- **Coverage Thresholds**: 80/80/75/80 (lines/functions/branches/statements)
- **Test Execution**: 7.80s average (optimized from 18.73s)
- **Security**: 21 comprehensive security tests
- **Performance**: 14 benchmark tests

---

## Special Instructions for Agents

### Test Implementation Agent

When implementing tests:

1. Import TestKit TDD guide: @.claude/rules/testkit-tdd-guide.md
2. Follow Red-Green-Refactor cycle
3. Use appropriate TestKit sub-exports
4. Implement 4-step cleanup in afterEach
5. Add security tests for any input handling
6. Check memory leaks for loop operations

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

- **Testing Config**: @.claude/testing-config.md
- **TypeScript Patterns**: @.claude/rules/typescript-patterns.md
- **TestKit TDD Guide**: @.claude/rules/testkit-tdd-guide.md
- **Agent Coordination**: @.claude/rules/agent-coordination.md
- **All Rules**: @.claude/rules/
- **All Agents**: @.claude/agents/

---

**Last Updated**: 2025-10-08 - Refactored code quality patterns into separate guide for better maintainability
**Maintained By**: Nathan Vale & AI Agents
