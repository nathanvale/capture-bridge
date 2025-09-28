---
title: Foundation Monorepo Technical Specification
status: draft
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-27
spec_type: tech
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
prd_reference: docs/cross-cutting/prd-foundation-monorepo.md
comprehensive_spec: docs/cross-cutting/spec-foundation-monorepo-mppp.md
---

# Foundation Monorepo — Technical Specification

**Gold Standard:** `/Users/nathanvale/code/bun-changesets-template/`

**Tooling Stack:** pnpm@9.15.4, turbo@2.5.6, vitest@3.2.4, tsup@8.3.0, typescript@5.7.3

**Scope Note:** This is a concise technical spec focused on contracts and interfaces. For comprehensive implementation details, see [spec-foundation-monorepo-mppp.md](./spec-foundation-monorepo-mppp.md).

---

## 1) Scope & Interfaces

### 1.1 Package Exports

**@adhd-brain/foundation** (0 dependencies)
```typescript
// packages/@adhd-brain/foundation/src/index.ts
export * from './types/capture'
export * from './types/common'
export * from './errors/capture'
export * from './errors/validation'
export * from './constants'

// Core types
export interface CaptureItem {
  id: string           // ULID
  source: 'voice' | 'email'
  content: string
  contentHash: string
  createdAt: Date
  exportedAt?: Date
}

export interface CaptureSource {
  type: 'voice' | 'email'
  filePath?: string    // Voice only
  messageId?: string   // Email only
}

// Constants
export const CONSTANTS = {
  MAX_PACKAGES: 4,
  DUPLICATE_WINDOW_MS: 5 * 60 * 1000,
  BUILD_TIMEOUT_MS: 30_000,
  TEST_TIMEOUT_MS: 30_000
}
```

**@adhd-brain/core** (foundation only)
```typescript
// packages/@adhd-brain/core/src/index.ts
export { DeduplicationService } from './deduplication'
export { ValidationService } from './validation'
export { normalizationService } from './normalization'

// Public API
export class DeduplicationService {
  isDuplicate(capture: CaptureInput, existing: CaptureItem[]): boolean
  calculateContentHash(content: string): string
}
```

**@adhd-brain/storage** (foundation only)
```typescript
// packages/@adhd-brain/storage/src/index.ts
export { DatabaseClient } from './database'
export { CaptureRepository } from './repositories/capture'
export { AuditRepository } from './repositories/audit'

// Public API
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

**@adhd-brain/capture** (foundation + core + storage)
```typescript
// packages/@adhd-brain/capture/src/index.ts
export { VoiceProcessor } from './voice-processor'
export { EmailProcessor } from './email-processor'
export { ObsidianExporter } from './obsidian-exporter'

// Public API
export class VoiceProcessor {
  processVoiceFile(filePath: string): Promise<CaptureItem>
}

export class EmailProcessor {
  processEmail(messageId: string): Promise<CaptureItem>
}

export class ObsidianExporter {
  export(capture: CaptureItem, vaultPath: string): Promise<void>
}
```

### 1.2 CLI Interface

**Root Scripts (package.json)**
```json
{
  "scripts": {
    "build": "turbo run build --output-logs=errors-only",
    "dev": "turbo run dev --parallel",
    "test": "NODE_OPTIONS='--max-old-space-size=4096' vitest run",
    "test:watch": "vitest watch",
    "lint": "turbo run lint --output-logs=errors-only",
    "typecheck": "turbo run typecheck --output-logs=errors-only",
    "format": "prettier --write --cache .",
    "doctor": "tsx tools/scripts/doctor.ts",
    "clean": "turbo run clean && rm -rf node_modules"
  }
}
```

**Doctor Command Output**
```bash
pnpm doctor

# Validates:
# ✓ Node v20.0.0+
# ✓ pnpm v9.15.4
# ✓ Turbo v2.5.6
# ✓ Package count = 4 (foundation, core, storage, capture)
# ✓ Zero circular dependencies
# ✓ TypeScript configs valid
# ✓ @orchestr8/testkit available
```

### 1.3 External Adapters

**@orchestr8/testkit Integration**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { createBaseVitestConfig } from '@orchestr8/testkit/vitest-config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      environment: 'node',
      globals: true,
      coverage: {
        thresholds: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80
        }
      }
    }
  })
)
```

---

## 2) Data & Storage

### 2.1 Configuration Files

**pnpm-workspace.yaml**
```yaml
packages:
  - apps/*
  - packages/*
```

**turbo.json** (Task Pipeline)
```json
{
  "$schema": "./node_modules/turbo/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "cache": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "cache": true
    },
    "lint": {
      "outputs": [".eslintcache"],
      "cache": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "cache": true
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  },
  "remoteCache": {
    "signature": false
  }
}
```

**tsconfig.json** (Root)
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "node16",
    "moduleResolution": "node16",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true,
    "types": ["node", "vitest/globals"],
    "baseUrl": ".",
    "paths": {
      "@adhd-brain/foundation": ["./packages/foundation/src/index.ts"],
      "@adhd-brain/core": ["./packages/core/src/index.ts"],
      "@adhd-brain/storage": ["./packages/storage/src/index.ts"],
      "@adhd-brain/capture": ["./packages/capture/src/index.ts"]
    }
  }
}
```

**eslint.config.mjs**
```javascript
import js from '@eslint/js'
import typescript from 'typescript-eslint'
import turbo from 'eslint-plugin-turbo'

export default [
  {
    ignores: ['**/dist/**', '**/.turbo/**', '**/coverage/**']
  },
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    plugins: { turbo },
    rules: {
      'turbo/no-undeclared-env-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  }
]
```

**.prettierrc.json**
```json
{
  "printWidth": 100,
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "arrowParens": "always"
}
```

### 2.2 Package Schema

**Package.json Template** (per package)
```json
{
  "name": "@adhd-brain/<package>",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.7.3",
    "vitest": "^3.2.4"
  }
}
```

**tsup.config.ts** (per package)
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true
})
```

### 2.3 Dependency Lock

**Package Constraints (enforced by doctor command)**
```typescript
// tools/scripts/doctor.ts
const REQUIRED_PACKAGES = [
  '@adhd-brain/foundation',
  '@adhd-brain/core',
  '@adhd-brain/storage',
  '@adhd-brain/capture'
]

const MAX_PACKAGES = 4

function validatePackageCount() {
  const packages = glob.sync('packages/@adhd-brain/*')
  if (packages.length > MAX_PACKAGES) {
    throw new Error(`Package count ${packages.length} exceeds maximum ${MAX_PACKAGES}`)
  }
}
```

---

## 3) Control Flow

### 3.1 Build Pipeline (Turbo Dependency Graph)

```text
┌───────────────────────────────────────────────────┐
│                 foundation                        │
│  (types, errors, constants) - 0 dependencies      │
└────────────┬──────────────────────────────────────┘
             │
        ┌────┴────┬─────────────────────────────────┐
        │         │                                 │
        ▼         ▼                                 ▼
   ┌─────────┐ ┌─────────┐                   ┌─────────┐
   │  core   │ │ storage │                   │         │
   │ (logic) │ │  (db)   │                   │         │
   └────┬────┘ └────┬────┘                   │         │
        │           │                        │         │
        └─────┬─────┘                        │         │
              ▼                              │         │
        ┌──────────┐                         │         │
        │ capture  │                         │         │
        │  (orch)  │                         │         │
        └────┬─────┘                         │         │
             │                               │         │
             └───────────────────────────────┘         │
                                             ▼         │
                                        ┌────────┐     │
                                        │  cli   │     │
                                        └────────┘     │
                                                       │
Turbo executes builds in topological order:
1. foundation (parallel: none)
2. core, storage (parallel: both)
3. capture (depends on: core, storage)
4. cli (depends on: all)
```

### 3.2 Test Execution Flow

```text
┌────────────────────────────────────────────────────┐
│  vitest run (root)                                 │
│                                                    │
│  Discovers projects:                               │
│  - packages/@adhd-brain/foundation                 │
│  - packages/@adhd-brain/core                       │
│  - packages/@adhd-brain/storage                    │
│  - packages/@adhd-brain/capture                    │
└────────────────────────────────────────────────────┘
                      │
           ┌──────────┴──────────┐
           ▼                     ▼
    ┌────────────┐        ┌────────────┐
    │  Parallel  │        │  Isolated  │
    │ Execution  │        │  Contexts  │
    └────────────┘        └────────────┘
           │                     │
           └──────────┬──────────┘
                      ▼
           ┌────────────────────┐
           │ In-Memory SQLite   │
           │ Per Test Context   │
           └────────────────────┘
                      │
                      ▼
           ┌────────────────────┐
           │   MSW Auto-Cleanup │
           │  (Gmail API mocks) │
           └────────────────────┘
                      │
                      ▼
           ┌────────────────────┐
           │  Coverage Report   │
           │   80% threshold    │
           └────────────────────┘
```

### 3.3 Doctor Command Sequence

```text
┌─────────────────────┐
│  pnpm doctor        │
└──────────┬──────────┘
           │
     ┌─────┴─────┬──────────┬──────────┬──────────┐
     ▼           ▼          ▼          ▼          ▼
┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│  Check  │ │ Check  │ │ Check  │ │ Check  │ │ Check  │
│  Node   │ │  pnpm  │ │ Turbo  │ │ Pkgs   │ │ Deps   │
│  ≥20    │ │ =9.15.4│ │ ≥2.5.6 │ │  = 4   │ │  0 ⭕   │
└────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
     │          │          │          │          │
     └──────────┴──────────┴──────────┴──────────┘
                      │
           ┌──────────┴──────────┐
           ▼                     ▼
    ┌────────────┐        ┌────────────┐
    │  Validate  │        │  Validate  │
    │   Configs  │        │   Build    │
    └────────────┘        └────────────┘
           │                     │
           └──────────┬──────────┘
                      ▼
           ┌────────────────────┐
           │  Report Summary    │
           │  ✓ All checks pass │
           └────────────────────┘
```

### 3.4 Development Workflow (Watch Mode)

```text
┌────────────────────────────────────────────────────┐
│  pnpm dev (turbo dev --parallel)                   │
└────────────────────────────────────────────────────┘
                      │
           ┌──────────┴──────────┬──────────┐
           ▼                     ▼          ▼
    ┌────────────┐        ┌────────────┐ ┌────────┐
    │ foundation │        │    core    │ │storage │
    │  (watch)   │        │  (watch)   │ │(watch) │
    └──────┬─────┘        └─────┬──────┘ └───┬────┘
           │                    │            │
           └────────────┬───────┴────────────┘
                        ▼
                 ┌────────────┐
                 │  capture   │
                 │  (watch)   │
                 └──────┬─────┘
                        │
                        ▼
                 ┌────────────┐
                 │    cli     │
                 │  (watch)   │
                 └────────────┘

File change detection: < 1s
Hot reload: < 1s
Type checking: incremental
```

---

## 4) TDD Applicability Decision

### 4.1 Risk Assessment

**Risk Class:** HIGH (ROOT dependency - blocks all features)

**Decision:** TDD REQUIRED for all packages

### 4.2 Test Coverage by Type

**Unit Testing (TDD Required)**
- Dependency validation logic
- Package boundary enforcement (ESLint rules)
- Content hash calculation (determinism critical)
- Deduplication logic (core business value)
- Input validation (prevent bad data)

**Integration Testing (TDD Required)**
- Build pipeline execution (Turbo task graph)
- Test isolation (Vitest projects)
- Parallel execution safety (no resource conflicts)
- In-memory SQLite lifecycle
- MSW mock cleanup

**Contract Testing (TDD Required)**
- Package export surfaces (public APIs)
- @orchestr8/testkit integration points
- CLI command interfaces
- Configuration schema validation

**Visual Testing (YAGNI)**
- ESLint rule output (manual verification sufficient)
- Prettier formatting (visible in diffs)
- Package.json scripts (manual testing adequate)

### 4.3 Coverage Thresholds

| Package | Statements | Branches | Functions | Lines | Rationale |
|---------|-----------|----------|-----------|-------|-----------|
| foundation | 90% | 85% | 90% | 90% | Shared types must be correct |
| core | 85% | 80% | 85% | 85% | Business logic critical |
| storage | 80% | 75% | 80% | 80% | Data integrity essential |
| capture | 80% | 75% | 80% | 80% | Orchestration complexity |

### 4.4 Trigger to Revisit

**Immediate Triggers (require tests before fixing):**
- Build time > 2 minutes (performance regression)
- Circular dependency detected (architectural violation)
- Test isolation failure (flaky tests detected)
- Package count > 4 (constraint violation)

**Continuous Triggers (add tests as features grow):**
- New package added (requires boundary tests)
- External dependency updated (integration tests)
- CLI command added (contract tests)

---

## 5) Dependencies & Contracts

### 5.1 Upstream Systems

**Gold Standard Repository**
- Location: `/Users/nathanvale/code/bun-changesets-template/`
- Provides: Configuration patterns, tooling versions
- Contract: Proven patterns for TypeScript monorepos

**External Tooling**
- pnpm@9.15.4 (package manager)
- turbo@2.5.6 (build orchestrator)
- vitest@3.2.4 (test runner)
- tsup@8.3.0 (bundler)
- typescript@5.7.3 (compiler)

### 5.2 Downstream Consumers

**All Feature Packages Depend on Foundation**
```text
foundation
  ↑
  ├── core (business logic)
  ├── storage (database operations)
  └── capture (orchestration)
        ↑
        └── cli (user interface)
```

**Constraint:** No feature can start until monorepo foundation is complete and passing all tests.

### 5.3 External Contracts

**@orchestr8/testkit** (Test Infrastructure)
```typescript
// Expected interface
interface TestKit {
  createBaseVitestConfig(options: VitestOptions): VitestConfig
  // MSW utilities available but not documented
  // In-memory SQLite patterns available
}
```

**Package Manager Contract**
```json
{
  "packageManager": "pnpm@9.15.4",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

### 5.4 Package Boundary Rules

**Enforced by ESLint + Turbo**
```text
✓ foundation → (none)
✓ core → foundation
✓ storage → foundation
✓ capture → foundation + core + storage
✗ core → storage (FORBIDDEN)
✗ storage → core (FORBIDDEN)
✗ Any circular imports (FORBIDDEN)
```

**Turbo Task Graph Ordering**
```json
{
  "build": {
    "dependsOn": ["^build"]  // Wait for upstream packages
  }
}
```

See [comprehensive monorepo spec](./spec-foundation-monorepo-mppp.md#3-package-structure) for detailed dependency rules and examples.

---

## 6) Risks & Mitigations

### 6.1 Circular Dependencies

**Risk:** Accidental imports between core and storage packages

**Mitigation:**
- ESLint boundary enforcement plugin
- Turbo build fails fast on circular deps
- Doctor command validates dependency graph
- Code review checklist includes boundary checks

**Detection:**
```bash
# Automated check in CI
pnpm doctor  # Validates zero circular dependencies
```

### 6.2 Build Time Bloat

**Risk:** Build time exceeds 30s target as packages grow

**Mitigation:**
- TSUP fast bundling (10x faster than tsc)
- Turbo caching (subsequent builds < 5s)
- Parallel task execution where possible
- Build time monitoring in doctor command

**Trigger:** If build time > 2 minutes, investigate cache invalidation or dependency graph issues.

### 6.3 Test Flakiness

**Risk:** Parallel tests conflict on resources (ports, files, databases)

**Mitigation:**
- Vitest projects with complete isolation
- In-memory SQLite per test context
- MSW with auto-cleanup (no port conflicts)
- No shared state between test suites
- Deterministic test execution order

**Validation:**
```bash
# Run tests 10 times in parallel
for i in {1..10}; do pnpm test & done
wait
# All runs must pass
```

### 6.4 Cognitive Overload

**Risk:** 4 packages + dependencies = mental model too complex

**Mitigation:**
- External @orchestr8/testkit (don't build custom mocks)
- Clear dependency diagram in docs
- Doctor command visualizes package structure
- Package naming convention enforces clarity
- Maximum 4 packages constraint (MPPP)

**Trigger:** If contributors struggle with package boundaries, add interactive documentation.

### 6.5 Setup Complexity

**Risk:** New contributor setup takes > 5 minutes

**Mitigation:**
- Single `pnpm install && pnpm build` command
- Doctor command validates environment
- Automated setup script checks prerequisites
- Clear error messages with fix instructions

**Validation:**
```bash
time (git clone <repo> && cd adhd-brain && pnpm install && pnpm build)
# Must complete < 5 minutes
```

---

## 7) Rollout & Telemetry (local-only)

### 7.1 Local Metrics

**Doctor Command Metrics**
```typescript
interface HealthCheckMetrics {
  nodeVersion: string
  pnpmVersion: string
  turboVersion: string
  packageCount: number
  circularDeps: number
  buildTime: number
  testTime: number
  timestamp: Date
}
```

**Build Performance Logging**
```bash
# Turbo output includes timing
pnpm build
# ✓ foundation built in 2.1s
# ✓ core built in 1.8s
# ✓ storage built in 2.3s
# ✓ capture built in 2.5s
# Total: 8.7s
```

**Test Execution Metrics**
```bash
pnpm test
# Test Files  12 passed (12)
# Tests       87 passed (87)
# Duration    12.34s (in-thread 45.67s)
# Coverage    85.3% (statements)
```

### 7.2 No External Telemetry

**Privacy-First Design:**
- No remote Turbo cache (disabled in config)
- No analytics or tracking
- No error reporting to external services
- All metrics logged locally only

**Rationale:** MPPP is single-user, local-first system. No need for centralized metrics.

### 7.3 Health Monitoring

**Doctor Command Output**
```text
ADHD Brain Monorepo Health Check
================================

Environment:
✓ Node v20.0.0
✓ pnpm v9.15.4
✓ Turbo v2.5.6

Package Structure:
✓ 4/4 packages (max limit)
✓ 0 circular dependencies
✓ All packages buildable

Performance:
✓ Build time: 8.7s (target: <30s)
✓ Test time: 12.3s (target: <30s)
✓ CLI startup: 0.8s (target: <1s)

Configuration:
✓ tsconfig.json valid
✓ eslint.config.mjs valid
✓ vitest.config.ts valid
✓ turbo.json valid

Test Infrastructure:
✓ @orchestr8/testkit v1.0.0 available
✓ In-memory SQLite working
✓ MSW imports resolve

All checks passed! 🎉
```

### 7.4 No Feature Flags

**Decision:** Monorepo foundation is all-or-nothing

**Rationale:**
- Can't partially enable package structure
- Build pipeline must be complete
- Test infrastructure is binary (working or not)
- No gradual rollout needed for single-user system

### 7.5 Success Tracking

**Manual Checklist (tracked in roadmap)**
- [ ] Monorepo setup complete
- [ ] Build < 30s achieved
- [ ] Test < 30s achieved
- [ ] Setup < 5 min validated
- [ ] Zero circular dependencies confirmed
- [ ] Doctor command operational
- [ ] TestKit integrated across all packages
- [ ] Parallel tests passing with zero conflicts

See [Master PRD Success Criteria](../master/prd-master.md#12-success-criteria) for alignment.

---

## Related Specifications

### Master Documents
- [Master PRD v2.3.0-MPPP](/Users/nathanvale/code/adhd-brain/docs/master/prd-master.md)
- [Roadmap v2.0.0-MPPP](/Users/nathanvale/code/adhd-brain/docs/master/roadmap.md)

### PRD Reference
- [Foundation Monorepo PRD](./prd-foundation-monorepo.md) - Product requirements and goals

### Comprehensive Spec
- [Foundation Monorepo TECH Spec](./spec-foundation-monorepo-tech.md) - Technical implementation details
- [Foundation Monorepo ARCH Spec](./spec-foundation-monorepo-arch.md) - Architecture specification

### Supporting Guides
- [TDD Applicability Guide](/Users/nathanvale/code/adhd-brain/docs/guides/tdd-applicability.md)
- [Test Strategy](/Users/nathanvale/code/adhd-brain/docs/guides/test-strategy.md)
- [TestKit Usage](/Users/nathanvale/code/adhd-brain/docs/guides/guide-testkit-usage.md)

### Gold Standard Repository
**Location:** `/Users/nathanvale/code/bun-changesets-template/`

**Reference Files:**
- `package.json` - Root scripts and workspace config
- `turbo.json` - Task pipeline patterns
- `tsconfig.json` - TypeScript strict config
- `eslint.config.mjs` - Flat ESLint config
- `.prettierrc.json` - ADHD-optimized formatting
- `vitest.config.ts` - Test infrastructure patterns

---

**Implementation Note:** This specification defines contracts and interfaces. For step-by-step implementation details, migration strategies, and comprehensive examples, refer to [spec-foundation-monorepo-mppp.md](./spec-foundation-monorepo-mppp.md).