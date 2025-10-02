---
title: Foundation Monorepo Architecture Specification
status: draft
owner: Nathan
version: 1.0.0
date: 2025-09-28
spec_type: arch
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
prd_reference: docs/cross-cutting/prd-foundation-monorepo.md
tech_reference: docs/cross-cutting/spec-foundation-monorepo-tech.md
---

# Foundation Monorepo — Architecture Specification

**Gold Standard:** `/Users/nathanvale/code/bun-changesets-template/`

**Purpose:** Define the architectural boundaries, dependency graph, and component model for the ADHD Brain monorepo foundation, ensuring zero circular dependencies and ADHD-optimized cognitive load reduction.

---

## 1) Placement in System

### 1.1 System Context

The Foundation Monorepo is the **ROOT dependency** for the entire ADHD Brain capture system. No feature development can begin until the monorepo foundation is complete and validated.

```text
┌─────────────────────────────────────────────────┐
│         ADHD Brain Capture System               │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │     Foundation Monorepo (This Spec)       │ │
│  │                                           │ │
│  │  - Package Structure                     │ │
│  │  - Build Pipeline (Turbo)                │ │
│  │  - Test Infrastructure (@orchestr8)      │ │
│  │  - Shared Configs (TS, ESLint, Prettier) │ │
│  └───────────┬───────────────────────────────┘ │
│              │                                  │
│              ▼                                  │
│  ┌───────────────────────────────────────────┐ │
│  │       Feature Packages                    │ │
│  │  - Capture (voice + email)                │ │
│  │  - Storage (SQLite operations)            │ │
│  │  - Obsidian Bridge (export)               │ │
│  │  - CLI (user interface)                   │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 1.2 Architectural Position

The monorepo foundation sits at the **infrastructure layer** of the system:

- **Above:** Operating system (macOS), file system (APFS), package manager (pnpm)
- **Below:** All feature packages and application code
- **Provides:** Build orchestration, test isolation, type safety, package boundaries
- **Consumes:** External tooling (@orchestr8/testkit, TypeScript, Vitest)

### 1.3 Key Constraints

**MPPP Boundaries:**

- Maximum 4 packages (foundation, core, storage, capture)
- No circular dependencies allowed
- Build time < 30s
- Test time < 30s
- Setup time < 5 minutes

**ADHD Optimization:**

- External @orchestr8/testkit (no custom test infrastructure)
- Gold standard patterns (minimal cognitive decisions)
- Clear dependency chain (no circular complexity)
- Fast feedback loops (watch mode < 1s reload)

---

## 2) Component Model

### 2.1 Package Dependency Graph

```text
┌────────────────────────────────────────────────┐
│         @capture-bridge/foundation                 │
│                                                │
│  Types, Errors, Constants                     │
│  - CaptureItem, CaptureSource                 │
│  - CaptureError, ValidationError              │
│  - CONSTANTS (timeouts, limits)               │
│                                                │
│  Dependencies: 0                               │
└────────────┬───────────────────────────────────┘
             │
      ┌──────┴──────┬──────────────────────┐
      │             │                      │
      ▼             ▼                      ▼
┌──────────┐  ┌──────────┐         ┌──────────┐
│   core   │  │ storage  │         │          │
│          │  │          │         │          │
│ Business │  │ Database │         │          │
│  Logic   │  │   Ops    │         │          │
│          │  │          │         │          │
│ Dedup    │  │ SQLite   │         │          │
│ Validate │  │ Repos    │         │          │
└────┬─────┘  └────┬─────┘         │          │
     │             │               │          │
     └──────┬──────┘               │          │
            │                      │          │
            ▼                      │          │
      ┌──────────┐                 │          │
      │ capture  │                 │          │
      │          │                 │          │
      │  Voice   │                 │          │
      │  Email   │                 │          │
      │ Obsidian │                 │          │
      └────┬─────┘                 │          │
           │                       │          │
           └───────────────────────┘          │
                                   ▼          │
                              ┌────────┐      │
                              │  cli   │      │
                              │        │      │
                              │ Commands      │
                              │  Doctor │      │
                              └────────┘      │
                                              │
Turbo Build Order (topological):
1. foundation (0 deps, builds first)
2. core, storage (parallel, depend on foundation)
3. capture (depends on: foundation, core, storage)
4. cli (depends on: all packages)
```

### 2.2 Package Boundaries

#### Foundation Package

**Exports:**

```typescript
// Types (read-only, immutable)
export interface CaptureItem {
  /* ... */
}
export interface CaptureSource {
  /* ... */
}

// Errors (throwable)
export class CaptureError extends Error {
  /* ... */
}
export class ValidationError extends Error {
  /* ... */
}

// Constants (frozen objects)
export const CONSTANTS = Object.freeze({
  MAX_PACKAGES: 4,
  DUPLICATE_WINDOW_MS: 5 * 60 * 1000,
  BUILD_TIMEOUT_MS: 30_000,
  TEST_TIMEOUT_MS: 30_000,
})
```

**Boundary Rules:**

- No runtime dependencies on other packages
- Cannot import from core, storage, or capture
- Pure TypeScript (no Node.js-specific code)
- No side effects on import

#### Core Package

**Exports:**

```typescript
// Business Logic (stateless services)
export class DeduplicationService {
  isDuplicate(capture: CaptureInput, existing: CaptureItem[]): boolean
  calculateContentHash(content: string): string
}

export class ValidationService {
  validate(capture: CaptureInput): ValidationResult
}
```

**Boundary Rules:**

- Depends on foundation only
- Cannot import from storage or capture
- Stateless services only (no database access)
- Pure business logic (no I/O operations)

#### Storage Package

**Exports:**

```typescript
// Database Operations (stateful repositories)
export class DatabaseClient {
  constructor(dbPath: string)
  close(): void
  beginTransaction(): Transaction
}

export class CaptureRepository {
  insert(capture: CaptureInput): Promise<string>
  findByHash(hash: string, windowMs: number): Promise<CaptureItem[]>
  markExported(id: string, exportedAt: Date): Promise<void>
}
```

**Boundary Rules:**

- Depends on foundation only
- Cannot import from core or capture
- No business logic (only CRUD operations)
- Synchronous initialization, async operations

#### Capture Package

**Exports:**

```typescript
// Orchestration (combines core + storage)
export class VoiceProcessor {
  constructor(
    private dedup: DeduplicationService,
    private repo: CaptureRepository
  )
  processVoiceFile(filePath: string): Promise<CaptureItem>
}

export class EmailProcessor { /* ... */ }
export class ObsidianExporter { /* ... */ }
```

**Boundary Rules:**

- Depends on foundation, core, and storage
- Cannot import from cli
- Coordinates business logic and storage
- Handles external I/O (file system, APIs)

### 2.3 Circular Dependency Prevention

**ESLint Plugin Configuration:**

```javascript
// eslint.config.mjs
{
  plugins: {
    turbo,
    'import': importPlugin
  },
  rules: {
    'import/no-cycle': ['error', { maxDepth: Infinity }],
    'turbo/no-undeclared-env-vars': 'off'
  }
}
```

**Turbo Build Order Enforcement:**

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"], // Wait for upstream packages
      "outputs": ["dist/**"]
    }
  }
}
```

**Doctor Command Validation:**

```typescript
// tools/scripts/doctor.ts
async function validateNoCycles() {
  const graph = await buildDependencyGraph()
  const cycles = detectCycles(graph)

  if (cycles.length > 0) {
    throw new Error(`Circular dependencies detected: ${cycles.join(", ")}`)
  }

  console.log("✓ Zero circular dependencies")
}
```

### 2.4 TestKit Integration

**External Test Infrastructure:**

```text
┌─────────────────────────────────────────────────┐
│   @orchestr8/testkit (external dependency)      │
│                                                 │
│  - createBaseVitestConfig()                    │
│  - In-memory SQLite helpers                    │
│  - MSW mock patterns                           │
│  - Test isolation utilities                    │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│         Vitest Root Configuration               │
│                                                 │
│  import { createBaseVitestConfig }              │
│    from '@orchestr8/testkit/vitest-config'     │
│                                                 │
│  Projects: foundation, core, storage, capture   │
└────────────┬────────────────────────────────────┘
             │
      ┌──────┴──────┬──────────────────────┐
      │             │                      │
      ▼             ▼                      ▼
┌──────────┐  ┌──────────┐         ┌──────────┐
│foundation│  │   core   │         │ storage  │
│  tests   │  │  tests   │         │  tests   │
│          │  │          │         │          │
│ In-memory│  │ In-memory│         │In-memory │
│ context  │  │ context  │         │  SQLite  │
└──────────┘  └──────────┘         └──────────┘
```

**Benefits:**

- No custom mock infrastructure maintenance
- Proven test isolation patterns
- Cognitive load reduction (external expertise)
- Parallel test execution with zero conflicts

---

## 3) Data Model

### 3.1 Package Metadata Schema

**package.json Structure (per package):**

```json
{
  "name": "@capture-bridge/<package>",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "dependencies": {
    // Only upstream packages allowed
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.7.3",
    "vitest": "^3.2.4"
  }
}
```

**Dependency Constraints:**

- `foundation`: No dependencies
- `core`: `@capture-bridge/foundation` only
- `storage`: `@capture-bridge/foundation` only
- `capture`: `@capture-bridge/foundation`, `@capture-bridge/core`, `@capture-bridge/storage`

### 3.2 Build Artifact Structure

```text
packages/@capture-bridge/<package>/
├── src/
│   └── index.ts           # Public API
├── dist/                  # Build outputs (generated)
│   ├── index.js           # ESM bundle
│   ├── index.cjs          # CommonJS bundle
│   ├── index.d.ts         # Type definitions
│   └── index.d.ts.map     # Source maps
├── package.json
├── tsconfig.json          # Extends root config
└── tsup.config.ts         # Build configuration
```

**Build Outputs (Turbo Tracking):**

- `dist/**` - All bundled code
- `.tsbuildinfo` - TypeScript incremental build cache
- Coverage reports tracked separately

### 3.3 Configuration Schema

**Root Configuration Files:**

```text
capture-bridge/
├── pnpm-workspace.yaml    # Workspace discovery
├── turbo.json             # Task orchestration
├── tsconfig.json          # TypeScript root config
├── eslint.config.mjs      # ESLint flat config
├── .prettierrc.json       # Code formatting
├── vitest.config.ts       # Test infrastructure
└── package.json           # Root scripts + engines
```

**Key Configurations:**

- **pnpm-workspace.yaml:** Glob patterns for package discovery
- **turbo.json:** Task pipeline with dependency graph
- **tsconfig.json:** Strict TypeScript with path mappings
- **eslint.config.mjs:** Boundary enforcement + TypeScript rules
- **vitest.config.ts:** TestKit integration + parallel execution

---

## 4) Control Flow & Orchestration

### 4.1 Build Pipeline Execution

```text
┌─────────────────────────────────────────────────┐
│  Developer runs: pnpm build                     │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Turbo reads turbo.json task graph              │
│  - Discovers packages via pnpm-workspace.yaml   │
│  - Builds topological sort of dependencies      │
│  - Checks cache for unchanged packages          │
└────────────┬────────────────────────────────────┘
             │
      ┌──────┴──────┐
      │             │
      ▼             ▼
┌──────────┐  ┌────────────────┐
│  Cache   │  │ Build Required │
│   HIT    │  │   Packages     │
│          │  │                │
│  Skip    │  │  1. foundation │
│  Build   │  │  2. core+storage (parallel)
└──────────┘  │  3. capture    │
              │  4. cli        │
              └────────┬───────┘
                       │
                       ▼
              ┌────────────────┐
              │  Execute TSUP  │
              │  per package   │
              │                │
              │  - Compile TS  │
              │  - Generate .d.ts
              │  - Bundle ESM+CJS
              │  - Write to dist/
              └────────┬───────┘
                       │
                       ▼
              ┌────────────────┐
              │  Validate      │
              │  Outputs       │
              │                │
              │  ✓ dist/ exists│
              │  ✓ Types valid │
              │  ✓ No errors   │
              └────────┬───────┘
                       │
                       ▼
              ┌────────────────┐
              │  Update Cache  │
              │  (Turbo)       │
              └────────────────┘
```

**Performance Characteristics:**

- First build: ~20-30s (all packages)
- Cached build: ~2-5s (cache hit)
- Incremental build: ~5-10s (changed packages only)
- Watch mode reload: < 1s

### 4.2 Test Execution Flow

```text
┌─────────────────────────────────────────────────┐
│  Developer runs: pnpm test                      │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Vitest discovers projects                      │
│  - Scans packages/*                             │
│  - Loads vitest.config.ts per package           │
│  - Creates isolated test contexts               │
└────────────┬────────────────────────────────────┘
             │
      ┌──────┴──────┬──────────────────────┐
      │             │                      │
      ▼             ▼                      ▼
┌──────────┐  ┌──────────┐         ┌──────────┐
│foundation│  │   core   │         │ storage  │
│  tests   │  │  tests   │         │  tests   │
│          │  │          │         │          │
│ Parallel │  │ Parallel │         │ Parallel │
│ Execution│  │ Execution│         │ Execution│
│          │  │          │         │          │
│ In-memory│  │ In-memory│         │In-memory │
│ context  │  │ context  │         │  SQLite  │
└────┬─────┘  └────┬─────┘         └────┬─────┘
     │             │                    │
     └─────────────┴────────────────────┘
                   │
                   ▼
        ┌────────────────────┐
        │  Aggregate Results │
        │                    │
        │  - Test counts     │
        │  - Coverage %      │
        │  - Duration        │
        └─────────┬──────────┘
                  │
                  ▼
        ┌────────────────────┐
        │  Enforce Thresholds│
        │                    │
        │  ✓ 80% coverage    │
        │  ✓ 0 failures      │
        │  ✓ < 30s duration  │
        └────────────────────┘
```

**Isolation Guarantees:**

- Each test runs in isolated context (Vitest projects)
- In-memory SQLite per test (no shared state)
- MSW mocks with auto-cleanup (no port conflicts)
- Parallel execution safe (no resource contention)

### 4.3 Doctor Command Sequence

```text
┌─────────────────────────────────────────────────┐
│  Developer runs: pnpm doctor                    │
└────────────┬────────────────────────────────────┘
             │
      ┌──────┴──────┬──────────┬──────────┐
      │             │          │          │
      ▼             ▼          ▼          ▼
┌──────────┐  ┌────────┐ ┌────────┐ ┌────────┐
│  Check   │  │ Check  │ │ Check  │ │ Check  │
│  Node    │  │  pnpm  │ │ Turbo  │ │ Pkgs   │
│  ≥20.0.0 │  │=9.15.4 │ │ ≥2.5.6 │ │  = 4   │
└────┬─────┘  └───┬────┘ └───┬────┘ └───┬────┘
     │            │          │          │
     └────────────┴──────────┴──────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
┌────────────────┐  ┌────────────────┐
│  Validate      │  │  Validate      │
│  Dependency    │  │  Build         │
│  Graph         │  │  Artifacts     │
│                │  │                │
│  - No cycles   │  │  - dist/ exist │
│  - Correct     │  │  - Types valid │
│    ordering    │  │  - No stale    │
└────────┬───────┘  └────────┬───────┘
         │                   │
         └─────────┬─────────┘
                   │
                   ▼
        ┌────────────────────┐
        │  Validate TestKit  │
        │                    │
        │  - Module resolves │
        │  - SQLite working  │
        │  - MSW available   │
        └─────────┬──────────┘
                  │
                  ▼
        ┌────────────────────┐
        │  Report Summary    │
        │                    │
        │  ✓ All checks pass │
        │  or                │
        │  ✗ Specific errors │
        └────────────────────┘
```

### 4.4 Development Workflow (Watch Mode)

```text
┌─────────────────────────────────────────────────┐
│  Developer runs: pnpm dev                       │
│  (turbo dev --parallel)                         │
└────────────┬────────────────────────────────────┘
             │
      ┌──────┴──────┬──────────────────────┐
      │             │                      │
      ▼             ▼                      ▼
┌──────────┐  ┌──────────┐         ┌──────────┐
│foundation│  │   core   │         │ storage  │
│  (watch) │  │  (watch) │         │  (watch) │
│          │  │          │         │          │
│  TSUP    │  │  TSUP    │         │  TSUP    │
│  --watch │  │  --watch │         │  --watch │
└────┬─────┘  └────┬─────┘         └────┬─────┘
     │             │                    │
     └─────────────┴────────────────────┘
                   │
                   ▼
        ┌────────────────────┐
        │  File Change       │
        │  Detected          │
        │  (< 100ms)         │
        └─────────┬──────────┘
                  │
                  ▼
        ┌────────────────────┐
        │  Incremental       │
        │  Rebuild           │
        │  (< 1s)            │
        └─────────┬──────────┘
                  │
                  ▼
        ┌────────────────────┐
        │  Hot Reload        │
        │  Downstream        │
        │  Packages          │
        └────────────────────┘
```

**Developer Experience:**

- File change detection: < 100ms
- Incremental rebuild: < 1s
- Type checking: incremental (tsc --watch)
- Test re-run: automatic (vitest --watch)

---

## 5) Failure Modes & Recovery

### 5.1 Circular Dependency Detection

**Failure Mode:**

- Developer accidentally imports from downstream package
- Build succeeds but creates circular dependency
- Future changes cause unpredictable failures

**Detection:**

1. ESLint catches during development (pre-commit)
2. Turbo build fails with cycle error
3. Doctor command validates during CI

**Recovery:**

1. ESLint error guides to violating import
2. Remove circular import
3. Re-architect if necessary (extract to shared package)

**Prevention:**

- ESLint boundary enforcement enabled by default
- Code review checklist includes boundary check
- Doctor command runs in CI pipeline

### 5.2 Build Cache Corruption

**Failure Mode:**

- Turbo cache becomes stale or corrupted
- Builds succeed but produce incorrect outputs
- Tests pass against wrong artifacts

**Detection:**

1. Doctor command validates build outputs
2. Hash mismatches in Turbo cache
3. Test failures after "successful" build

**Recovery:**

```bash
# Clear all caches
pnpm clean
rm -rf .turbo node_modules/.cache

# Rebuild from scratch
pnpm install
pnpm build
```

**Prevention:**

- Turbo cache invalidation on config changes
- Doctor command verifies output integrity
- CI builds always from clean state

### 5.3 Test Isolation Failure

**Failure Mode:**

- Tests share state between executions
- Parallel tests conflict on resources
- Flaky tests appear randomly

**Detection:**

1. Run tests 10 times in parallel
2. Look for non-deterministic failures
3. Check for resource contention (ports, files)

**Recovery:**

1. Identify shared state in failing test
2. Use TestKit isolation patterns
3. Ensure in-memory SQLite per context
4. Verify MSW mock cleanup

**Prevention:**

- Vitest projects enforce isolation
- TestKit patterns prevent shared state
- Doctor command validates test infrastructure
- CI runs tests in parallel always

### 5.4 Package Count Violation

**Failure Mode:**

- Developer adds 5th package
- Violates ADHD-optimized constraint (4 max)
- Increases cognitive complexity

**Detection:**

1. Doctor command checks package count
2. CI pipeline fails if count > 4

**Recovery:**

1. Merge new package into existing package
2. Or replace existing package if justified
3. Update architecture docs if boundary changes

**Prevention:**

- Doctor command enforces constraint
- PR template reminds of 4-package limit
- Architecture review for new packages

### 5.5 Setup Time Regression

**Failure Mode:**

- New dependencies slow down `pnpm install`
- Complex build steps exceed 5-minute target
- Developer onboarding becomes frustrating

**Detection:**

1. CI tracks setup time metrics
2. Doctor command reports setup duration
3. Developer feedback in retros

**Recovery:**

1. Profile `pnpm install` time
2. Remove unnecessary dependencies
3. Optimize build steps
4. Cache more aggressively

**Prevention:**

- Setup time tracked in CI
- Dependency additions require justification
- Regular performance reviews

---

## 6) Evolution & Scalability

### 6.1 When to Add a New Package

**Trigger Conditions:**

- Current package exceeds 500 LOC (lines of code)
- Clear architectural boundary emerges
- Shared code used by 3+ other packages

**Process:**

1. Validate package count still < 4
2. Identify clear boundary and responsibilities
3. Create package following template
4. Update dependency graph documentation
5. Add to doctor command validation

**Anti-Patterns:**

- Don't add package for convenience (extract to shared utils)
- Don't add package to bypass dependency rules
- Don't add package without clear ownership

### 6.2 When to Revisit Monorepo Structure

**Immediate Triggers (require action):**

- Build time consistently > 2 minutes
- Test time consistently > 5 minutes
- Setup time > 10 minutes
- More than 3 circular dependency incidents per quarter

**Evaluation Triggers (review needed):**

- Package count hits limit (4)
- Major feature addition (Phase 3+)
- Multi-contributor workflow begins
- Cross-platform support required

### 6.3 Migration to Advanced Tooling

**Not Needed Now (MPPP):**

- Changesets (single-user system)
- Docker containers (macOS-only)
- Advanced CI/CD (basic GitHub Actions sufficient)
- Storybook (no UI components)

**Trigger to Revisit:**

- **Changesets:** Multi-contributor workflow emerges
- **Docker:** Cross-platform distribution needed
- **Advanced CI/CD:** Team >1 person, PR workflow required
- **Storybook:** UI component library needed (Phase 5+)

### 6.4 Architectural Refactoring

**Safe Refactoring:**

- Extract utilities within package (no boundary change)
- Rename internal modules (no public API change)
- Optimize build configuration (no output change)

**Requires Planning:**

- Move code between packages (boundary change)
- Add/remove package (structure change)
- Change public API (contract change)

**Process for Major Changes:**

1. Document proposed change in ADR
2. Update architecture diagrams
3. Create migration plan
4. Update all dependent specs
5. Get architecture team sign-off

### 6.5 Performance Optimization

**Current Targets (MPPP):**

- Build: < 30s
- Test: < 30s
- Setup: < 5 min
- Watch reload: < 1s

**If Targets Missed:**

1. Profile with Turbo timing output
2. Identify bottleneck package
3. Optimize bundling configuration
4. Consider build parallelization
5. Review dependency graph complexity

**Future Optimization Opportunities:**

- Remote Turbo cache (if team grows)
- Persistent build workers
- Incremental type checking
- Test sharding

---

## 7) Related Specifications

### Foundation Documents

- [Master PRD v2.3.0-MPPP](../master/prd-master.md) - Overall project vision and scope
- [Roadmap v2.0.0-MPPP](../master/roadmap.md) - Development phases and priorities

### Monorepo Specifications

- [Foundation Monorepo PRD](./prd-foundation-monorepo.md) - Product requirements and goals
- [Foundation Monorepo TECH Spec](./spec-foundation-monorepo-tech.md) - Technical implementation details

### Supporting Guides

- [TDD Applicability Guide](../guides/guide-tdd-applicability.md) - Testing strategy
- [TestKit Usage Guide](../guides/guide-testkit-usage.md) - Test patterns
- [Monorepo MPPP Guide](../guides/guide-monorepo-mppp.md) - MPPP-specific patterns

### Gold Standard Repository

**Location:** `/Users/nathanvale/code/bun-changesets-template/`

**Key Reference Files:**

- `package.json` - Root scripts and workspace config
- `turbo.json` - Task pipeline and caching
- `tsconfig.json` - TypeScript strict configuration
- `eslint.config.mjs` - Boundary enforcement patterns
- `vitest.config.ts` - Test infrastructure setup

---

## 8) TDD Applicability Decision

### Risk Assessment

**Risk Class:** HIGH (ROOT dependency - blocks all features)

**Rationale:**

- Circular dependencies cascade to all features
- Build pipeline errors block development
- Test infrastructure failures destroy productivity
- Package boundary violations accumulate technical debt

### TDD Decision: REQUIRED

All foundation components require TDD because:

1. **Zero room for error:** Foundation failures block entire project
2. **High cascading impact:** Bugs affect all downstream packages
3. **Difficult to fix later:** Refactoring foundation requires updating all features
4. **Proven value:** TDD catches architectural violations early

### Test Coverage by Component

**Unit Tests (TDD Required):**

- Dependency graph validation
- Package boundary enforcement
- Build configuration parsing
- Content hash calculation (from core package)
- Deduplication logic (from core package)

**Integration Tests (TDD Required):**

- Build pipeline execution (Turbo task graph)
- Test isolation (Vitest projects)
- Parallel execution safety
- In-memory SQLite lifecycle
- MSW mock cleanup

**Contract Tests (TDD Required):**

- Package export surfaces (public APIs)
- @orchestr8/testkit integration points
- CLI command interfaces
- Configuration schema validation

**Visual Testing (Optional):**

- ESLint rule output (manual verification)
- Prettier formatting (visible in diffs)
- Doctor command output (manual testing)

### Coverage Thresholds

| Package    | Statements | Branches | Functions | Lines | Rationale                       |
| ---------- | ---------- | -------- | --------- | ----- | ------------------------------- |
| foundation | 90%        | 85%      | 90%       | 90%   | Shared types must be rock solid |
| core       | 85%        | 80%      | 85%       | 85%   | Business logic is critical      |
| storage    | 80%        | 75%      | 80%       | 80%   | Data integrity essential        |
| capture    | 80%        | 75%      | 80%       | 80%   | Orchestration complexity        |

### Trigger to Revisit

**Immediate (require tests before fixing):**

- Build time > 2 minutes (performance regression)
- Circular dependency detected (architectural violation)
- Test isolation failure (flaky tests)
- Package count > 4 (constraint violation)

**Continuous (add tests as features grow):**

- New package added (requires boundary tests)
- External dependency updated (integration tests)
- CLI command added (contract tests)

---

## 9) Nerdy Joke Corner

The monorepo dependency graph is like a strict ADHD morning routine: foundation (coffee) must happen first, then core+storage (shower+breakfast) can happen in parallel, then capture (getting dressed), and finally CLI (leaving the house). Skip foundation and the whole day is ruined. Try to shower before coffee and you'll just create a circular dependency that ends with you napping in the bathtub. Also, the fact that we have a "doctor" command to check if our build system has the flu is very on-brand for healthcare metaphors in DevOps. 🏥☕

---

**Document Status:**

- Version: 1.0.0
- Status: Draft
- Last Updated: 2025-09-28
- Blocks: Phase 1 Week 1 monorepo setup implementation
- Ready for: Architecture review and implementation planning
