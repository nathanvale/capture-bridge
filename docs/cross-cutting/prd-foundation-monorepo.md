---
title: Foundation Monorepo PRD
status: living
owner: Nathan
version: 1.0.0-MPPP
date: 2025-09-28
spec_type: prd
master_prd_version: 2.3.0-MPPP
roadmap_version: 2.0.0-MPPP
---

# Foundation Monorepo — PRD

**Gold Standard Repository:** `/Users/nathanvale/code/bun-changesets-template/`

## 1) Problem & Outcomes

### Problem

The ADHD Brain capture system requires a monorepo foundation that supports:

1. **Atomic changes across packages:** Voice + email capture logic share deduplication, storage, and export logic
2. **Fast feedback loops:** Build < 30s, test < 30s, setup < 5 min (ADHD-friendly)
3. **Zero circular dependencies:** Foundation is the ROOT dependency - no other feature can start without it
4. **Cognitive load reduction:** External @orchestr8/testkit, proven tooling from gold standard repo

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Build time | < 30s | `time pnpm build` |
| Test suite | < 30s | `vitest run` duration |
| Setup time | < 5 min | Fresh clone → `pnpm install && pnpm build` |
| CLI startup | < 1s | `time adhd --version` |
| Circular deps | 0 | `pnpm list --depth=Infinity` validation |

### One Number Success Metric

**Time from `git clone` to running first test:** < 5 minutes (ADHD-optimized developer experience)

## 2) Users & Jobs

### Primary User: Nathan (Developer)

**Context:**

- Software engineer with ADHD building MPPP capture system
- Needs fast feedback loops to maintain focus
- Comfortable with TypeScript, pnpm, Turbo
- Wants proven patterns from gold standard repo

**Top Jobs-to-be-Done:**

1. **Setup:** Clone repo → install deps → build → run tests (< 5 min total)
2. **Dev Mode:** Watch mode with hot reload across all packages
3. **Testing:** Parallel test execution with isolation (no conflicts)
4. **Build:** Dependency-ordered builds via Turbo task graph
5. **Health Check:** Validate workspace integrity with `doctor` command

### Secondary User: Future Contributors

**Context:**

- May not have ADHD
- Need clear documentation and conventional tooling
- Benefit from gold standard patterns (familiar to TypeScript community)

**Jobs:**

- Understand package boundaries
- Add new packages following established patterns
- Debug build/test issues with `doctor` command

## 3) Scope (MVP → v1)

### In Scope (MPPP Foundation)

✅ **Monorepo Structure:**

- pnpm workspaces (`apps/*`, `packages/*`)
- Turborepo task orchestration (build, test, lint, typecheck)
- 4-package limit: `foundation`, `core`, `storage`, `capture`
- External `@orchestr8/testkit` for test infrastructure

✅ **Build Tooling:**

- TSUP for bundling (fast, simple, proven in gold standard)
- Strict TypeScript config (ESNext, node16 modules, vitest/globals types)
- Flat ESLint config (TypeScript, React, Turbo plugins)
- Prettier with ADHD-optimized formatting (from gold standard)

✅ **Testing Infrastructure:**

- Vitest with projects for multi-package testing
- In-memory SQLite for storage tests
- MSW for API mocks with auto-cleanup
- Parallel test execution with isolation
- Coverage thresholds: 80% min, 90% target

✅ **Scripts & Automation:**

- `pnpm dev` - Parallel watch mode
- `pnpm build` - Dependency-ordered builds
- `pnpm test` - Parallel tests with coverage
- `pnpm lint` - ESLint + Prettier checks
- `pnpm typecheck` - TypeScript validation
- `pnpm doctor` - Health diagnostics

✅ **Package Boundaries:**

```text
foundation (0 deps) ← types, errors, constants
    ↑
core (foundation) ← business logic, deduplication
    ↑
storage (foundation) ← SQLite operations
    ↑
capture (foundation + core + storage) ← orchestration
    ↑
cli (all packages) ← commands, entry point
```

### Out Scope (YAGNI - Phase 3+)

❌ **Not Building Now:**

- Changesets (single-user, no versioning needed for MPPP)
- Web apps / Next.js (CLI-only for MPPP)
- Docker / deployment configs (local-first macOS app)
- Storybook (no UI components in MPPP)
- Queue systems / background services (sequential processing only)
- Plugin architecture (no extensibility needed yet)
- Advanced monitoring dashboards (basic observability in Phase 1)

**Trigger to Revisit:**

- **Changesets:** Multi-contributor workflow emerges
- **Web App:** CLI becomes insufficient for daily use (>1000 captures)
- **Docker:** Cross-platform distribution need proven
- **Queues:** Processing >100 captures/day with performance issues

## 4) User Flows

### Flow A: Fresh Setup (Developer Onboarding)

```bash
# Step 1: Clone repository
git clone https://github.com/nathanvale/adhd-brain.git
cd adhd-brain

# Step 2: Install dependencies (pnpm@9.15.4)
pnpm install

# Step 3: Build all packages (dependency-ordered)
pnpm build

# Step 4: Run tests (verify setup)
pnpm test

# Step 5: Check health
pnpm doctor
```

**Success Criteria:** All steps complete < 5 minutes, zero errors

### Flow B: Development Workflow (Daily Coding)

```bash
# Terminal 1: Watch mode (hot reload)
pnpm dev

# Terminal 2: Run specific tests
pnpm test --filter=@adhd-brain/core

# Terminal 3: Type checking
pnpm typecheck

# Before commit:
pnpm lint && pnpm test
```

**Success Criteria:** Hot reload < 1s, tests complete < 30s

### Flow C: Adding New Package (Rare)

```bash
# 1. Check current package count (must be < 4)
pnpm doctor

# 2. Create package structure
mkdir -p packages/@adhd-brain/new-package/src
cd packages/@adhd-brain/new-package

# 3. Copy package.json template
# 4. Update pnpm-workspace.yaml (auto-discovered via glob)
# 5. Verify no circular deps
pnpm build
```

**Success Criteria:** Build succeeds, no circular deps, package count ≤ 4

### Flow D: Health Check (Debugging)

```bash
pnpm doctor
```

**Validates:**

- pnpm version (9.15.4)
- Node version (≥20.0.0)
- Package count (≤4)
- Circular dependencies (0)
- TypeScript configs
- Test infrastructure
- Build outputs

## 5) Non-Functional Requirements

### Privacy

**Local-First Architecture:**

- No remote Turbo cache for MPPP (privacy-first)
- SQLite local-only (no cloud sync)
- No telemetry or external services
- Git ignored: `node_modules`, `dist`, `.turbo`, coverage

### Reliability

**Zero-Flake Testing:**

- Vitest projects with test isolation
- In-memory SQLite (no disk conflicts)
- MSW with auto-cleanup (no port conflicts)
- Parallel tests with isolated contexts
- Deterministic test ordering

**Build Reliability:**

- Turbo caching for fast rebuilds
- Dependency-ordered task execution
- Type-safe package boundaries
- ESLint enforcement of import rules

### Performance

**Build Performance:**

| Operation | Target | Strategy |
|-----------|--------|----------|
| Full build | < 30s | Turbo parallel tasks + TSUP |
| Incremental | < 5s | Turbo cache + watch mode |
| Test suite | < 30s | Vitest parallel + in-memory DB |
| Typecheck | < 10s | TSC with incremental builds |

**Development Performance:**

- Hot reload < 1s (watch mode)
- CLI startup < 1s (bundled binary)
- Memory usage < 200MB (dev mode)

### Developer Experience (ADHD-Optimized)

**Cognitive Load Reduction:**

- External @orchestr8/testkit (no custom mock infrastructure)
- Gold standard configs (proven patterns, minimal decisions)
- 4-package limit (manageable mental model)
- Clear dependency chain (no circular complexity)

**Fast Feedback Loops:**

- Watch mode for instant feedback
- Parallel tests with clear output
- Doctor command for quick diagnostics
- Prettier auto-format (no manual formatting)

## 6) TDD Applicability Decision

### Risk Assessment

| Component | Risk Class | TDD Required? | Rationale |
|-----------|-----------|---------------|-----------|
| Package boundaries | **HIGH** | ✅ YES | Circular deps cascade to all features |
| Dependency graph | **HIGH** | ✅ YES | Foundation errors block everything |
| Test isolation | **HIGH** | ✅ YES | Flaky tests destroy productivity |
| Build pipeline | **MEDIUM** | ⚠️ RECOMMENDED | Turbo misconfig causes subtle issues |
| ESLint rules | **LOW** | ❌ NO | Visual verification sufficient |

### TDD Required Components

**Must Write Tests First:**

1. **Dependency Validation:**
   - Detect circular dependencies
   - Validate import paths
   - Enforce package boundaries

2. **Test Isolation:**
   - In-memory SQLite creation
   - MSW mock lifecycle
   - Parallel execution safety

3. **Build Graph:**
   - Topological sort correctness
   - Cache invalidation logic
   - Output validation

### TDD Optional Components

**Visual Testing Sufficient:**

- ESLint rule configs (lint run shows errors)
- Prettier formatting (visible in diffs)
- Package.json scripts (manual verification)

## 7) Master PRD Success Criteria Alignment

**From Master PRD v2.3.0-MPPP §12:**

✅ **Monorepo setup complete:**

- pnpm workspaces configured
- Turbo pipeline operational
- TypeScript configs aligned
- Build < 30s target met

✅ **TestKit integrated across all packages:**

- @orchestr8/testkit available to all packages
- In-memory SQLite working
- MSW mocks with auto-cleanup

✅ **Test suite < 30s:**

- Vitest parallel execution
- No port/resource conflicts
- Coverage thresholds enforced

✅ **Parallel tests pass (zero conflicts):**

- Each package isolated
- No shared state between tests
- Deterministic execution order

✅ **In-memory DB tests working:**

- better-sqlite3 `:memory:` mode
- Schema applied per test
- Cleanup after each test

✅ **MSW mocks with auto-cleanup:**

- HTTP mocks for Gmail API tests
- Automatic cleanup after tests
- No port conflicts in parallel runs

## 8) Decisions (Locked for MPPP)

### Tooling Stack

**Decision: pnpm + Turbo + TSUP**

- **Why:** Proven in gold standard repo (`bun-changesets-template`)
- **Alternatives Rejected:**
  - npm workspaces (slower, less reliable)
  - yarn workspaces (Berry has steep learning curve)
  - esbuild direct (TSUP wraps it with better DX)
- **Consequences:** Fast builds, reliable caching, familiar to TypeScript community

**Related ADR:** [ADR 0019: Monorepo Tooling Stack](../adr/0019-monorepo-tooling-stack.md)

### Package Structure

**Decision: 4-package maximum for MPPP**

- **Why:** Cognitive load constraint (ADHD-optimized)
- **Packages:**
  1. `foundation` - Types, errors, constants
  2. `core` - Business logic, deduplication
  3. `storage` - SQLite operations
  4. `capture` - Orchestration (voice + email)
- **Consequences:** Clear mental model, enforced simplicity

### Test Infrastructure

**Decision: External @orchestr8/testkit**

- **Why:** Cognitive load reduction (don't build custom mock infrastructure)
- **Alternatives Rejected:**
  - Custom testkit package (adds 5th package, maintenance burden)
  - Inline mocks (duplicated across packages)
- **Consequences:** External dependency, but proven stable

### Processing Model

**Decision: Sequential processing only (no queues)**

- **Why:** MPPP scope is simple (<100 captures/day expected)
- **Alternatives Rejected:**
  - Bull/BullMQ (overkill, adds Redis dependency)
  - Custom queue (premature complexity)
- **Consequences:** Simple retry logic, no background services
- **Trigger to Revisit:** Processing >100 captures/day with performance issues

### TypeScript Config

**Decision: Strict mode with ESNext + node16 modules**

- **Why:** Maximum type safety, import.meta support, Node.js compatibility
- **From Gold Standard:**
  ```json
  {
    "target": "ESNext",
    "module": "node16",
    "moduleResolution": "node16",
    "strict": true,
    "types": ["node", "vitest/globals"]
  }
  ```
- **Consequences:** Catch bugs at compile time, modern JS features

### Bundling Strategy

**Decision: TSUP for all packages**

- **Why:** Fast, simple, handles ESM + CJS, proven in gold standard
- **Config:**
  ```typescript
  // tsup.config.ts
  export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true
  })
  ```
- **Consequences:** Fast builds, dual format support, tree-shakeable

### Vitest Configuration

**Decision: Projects-based multi-package testing**

- **Why:** Parallel execution with isolation, environment matching
- **From Gold Standard:**
  ```typescript
  // vitest.config.ts
  export default defineConfig(
    createBaseVitestConfig({
      test: {
        projects: getVitestProjects(),
        environment: 'node',
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
- **Consequences:** Fast parallel tests, no flakiness

### ESLint Flat Config

**Decision: Flat config with TypeScript + Turbo plugins**

- **Why:** Modern ESLint pattern, fewer config files
- **From Gold Standard:**
  ```javascript
  export default [
    js.configs.recommended,
    ...typescript.configs.recommended,
    {
      plugins: { turbo },
      rules: {
        'turbo/no-undeclared-env-vars': 'off'
      }
    }
  ]
  ```
- **Consequences:** Single config file, easier to reason about

### Prettier Configuration

**Decision: ADHD-optimized formatting from gold standard**

- **Why:** Proven DX patterns (printWidth: 100, no semicolons, single quotes)
- **From Gold Standard:**
  ```json
  {
    "printWidth": 100,
    "semi": false,
    "singleQuote": true,
    "trailingComma": "all"
  }
  ```
- **Consequences:** Consistent formatting, less visual noise

## 9) Open Questions

### Resolved (All Locked for MPPP)

✅ **Package manager:** pnpm@9.15.4 (proven in gold standard)
✅ **Build tool:** Turbo 2.5.6 (proven in gold standard)
✅ **Bundler:** TSUP 8.3.0 (proven in gold standard)
✅ **Test framework:** Vitest 3.2.4 (proven in gold standard)
✅ **Package count:** 4 maximum (MPPP constraint)
✅ **TestKit location:** External @orchestr8/testkit (cognitive load reduction)
✅ **Processing model:** Sequential only (no queues for MPPP)
✅ **Remote cache:** Disabled (privacy-first for MPPP)

### None Remaining

All architectural decisions locked for MPPP implementation. No open questions.

## 10) Implementation Details (From Gold Standard)

### Root package.json Scripts

**From `/Users/nathanvale/code/bun-changesets-template/package.json`:**

```json
{
  "scripts": {
    "build": "turbo run build --output-logs=errors-only",
    "dev": "turbo run dev --parallel",
    "test": "NODE_OPTIONS='--max-old-space-size=4096' vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "NODE_OPTIONS='--max-old-space-size=4096' vitest run --coverage",
    "lint": "turbo run lint --continue=dependencies-successful --output-logs=errors-only",
    "lint:fix": "turbo run lint:fix --continue=dependencies-successful --output-logs=errors-only",
    "typecheck": "turbo run typecheck --output-logs=errors-only",
    "format": "prettier --write --cache --cache-location .prettierrcache .",
    "format:check": "prettier --check --cache --cache-location .prettierrcache .",
    "clean": "turbo run clean"
  },
  "packageManager": "pnpm@9.15.4",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

### Turbo Task Pipeline

**From `/Users/nathanvale/code/bun-changesets-template/turbo.json`:**

```json
{
  "$schema": "./node_modules/turbo/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "dist-node/**", "dist-types/**", ".tsbuildinfo"],
      "cache": true,
      "inputs": ["$TURBO_DEFAULT$", "!**/*.test.ts", "!**/*.spec.ts", "!tests/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "cache": true,
      "inputs": ["$TURBO_DEFAULT$", "vitest.config.ts", "src/**/*.{ts,tsx,js,jsx}"],
      "env": ["NODE_ENV", "VITEST_SILENT", "CI"],
      "outputLogs": "new-only"
    },
    "lint": {
      "dependsOn": ["//#format:root"],
      "outputs": [".eslintcache"],
      "cache": true,
      "inputs": ["$TURBO_DEFAULT$", "eslint.config.mjs"],
      "outputLogs": "errors-only"
    },
    "typecheck": {
      "dependsOn": ["^build", "^typecheck"],
      "outputs": [],
      "cache": true,
      "inputs": ["$TURBO_DEFAULT$", "src/**/*.{ts,tsx}"],
      "outputLogs": "errors-only"
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  },
  "globalDependencies": [
    "tsconfig.json",
    "eslint.config.mjs",
    "vitest.config.ts",
    ".prettierrc*",
    "turbo.json*"
  ],
  "globalEnv": ["NODE_ENV", "CI", "VITEST", "DEBUG"],
  "remoteCache": {
    "signature": false
  }
}
```

**Note for MPPP:** `remoteCache.signature: false` disables remote caching (privacy-first)

### pnpm Workspace Config

**From `/Users/nathanvale/code/bun-changesets-template/pnpm-workspace.yaml`:**

```yaml
packages:
  - apps/*
  - packages/*
```

**Simple glob pattern auto-discovers all packages.**

### TypeScript Root Config

**From `/Users/nathanvale/code/bun-changesets-template/tsconfig.json`:**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "node16",
    "moduleResolution": "node16",
    "moduleDetection": "force",

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "removeComments": false,
    "noEmitOnError": true,

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,

    "allowJs": true,
    "checkJs": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,

    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo",

    "types": ["node", "vitest/globals"],

    "baseUrl": ".",
    "paths": {
      "@adhd-brain/foundation": ["./packages/foundation/src/index.ts"],
      "@adhd-brain/core": ["./packages/core/src/index.ts"],
      "@adhd-brain/storage": ["./packages/storage/src/index.ts"],
      "@adhd-brain/capture": ["./packages/capture/src/index.ts"],
      "@orchestr8/testkit": ["./node_modules/@orchestr8/testkit/dist/index.d.ts"]
    }
  },
  "include": [
    "packages/*/src/**/*",
    "apps/*/src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "coverage",
    ".turbo"
  ]
}
```

### ESLint Flat Config

**From `/Users/nathanvale/code/bun-changesets-template/eslint.config.mjs`:**

```javascript
import js from '@eslint/js'
import typescript from 'typescript-eslint'
import turbo from 'eslint-plugin-turbo'

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/node_modules/**'
    ]
  },

  js.configs.recommended,
  ...typescript.configs.recommended,

  {
    plugins: { turbo },
    rules: {
      'turbo/no-undeclared-env-vars': 'off'
    }
  },

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'error'
    }
  }
]
```

### Prettier Config

**From `/Users/nathanvale/code/bun-changesets-template/.prettierrc.json`:**

```json
{
  "$schema": "https://json.schemastore.org/prettierrc",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### Vitest Base Config

**From `/Users/nathanvale/code/bun-changesets-template/vitest.config.ts`:**

```typescript
import { defineConfig } from 'vitest/config'
import { createBaseVitestConfig } from '@orchestr8/testkit/vitest-config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: 'adhd-brain',
      environment: 'node',
      globals: true,
      coverage: {
        enabled: process.env.CI === 'true',
        provider: 'v8',
        reporter: ['text', 'html', 'json'],
        reportsDirectory: './coverage',
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

## 11) Doctor Command Specification

**Purpose:** Validate workspace integrity and catch common issues early.

### Health Checks

```bash
pnpm doctor
```

**Validates:**

1. **Environment:**
   - Node version ≥20.0.0
   - pnpm version = 9.15.4
   - Turbo installed and working

2. **Package Structure:**
   - Package count ≤ 4 (MPPP constraint)
   - No circular dependencies
   - All packages buildable

3. **Configuration:**
   - tsconfig.json valid
   - eslint.config.mjs valid
   - vitest.config.ts valid
   - turbo.json valid

4. **Test Infrastructure:**
   - @orchestr8/testkit available
   - In-memory SQLite working
   - MSW imports resolve

5. **Build Outputs:**
   - `dist/` folders present for built packages
   - Type definitions generated
   - No stale outputs

**Output Format:**

```text
✅ Environment
  ✓ Node v20.0.0
  ✓ pnpm v9.15.4
  ✓ Turbo v2.5.6

✅ Package Structure
  ✓ 4/4 packages (foundation, core, storage, capture)
  ✓ No circular dependencies
  ✓ All packages buildable

✅ Configuration
  ✓ tsconfig.json valid
  ✓ eslint.config.mjs valid
  ✓ vitest.config.ts valid
  ✓ turbo.json valid

✅ Test Infrastructure
  ✓ @orchestr8/testkit available
  ✓ In-memory SQLite working
  ✓ MSW imports resolve

✅ Build Outputs
  ✓ All packages built
  ✓ Type definitions present

All checks passed! 🎉
```

## 12) Related Specifications

### Master Documents

- [Master PRD v2.3.0-MPPP](/Users/nathanvale/code/adhd-brain/docs/master/prd-master.md) - Overall system requirements
- [Roadmap v2.0.0-MPPP](/Users/nathanvale/code/adhd-brain/docs/master/roadmap.md) - Dependency-ordered delivery plan

### Cross-Cutting Specs

- [Foundation Monorepo TECH Spec](./spec-foundation-monorepo-tech.md) - Technical implementation details
- [Foundation Monorepo ARCH Spec](./spec-foundation-monorepo-arch.md) - Architecture specification
- [TestKit Tech Spec](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-testkit-tech.md) - Test isolation patterns

### Supporting Guides

- [TDD Applicability Guide](/Users/nathanvale/code/adhd-brain/docs/guides/tdd-applicability.md) - When to apply TDD
- [Test Strategy](/Users/nathanvale/code/adhd-brain/docs/guides/test-strategy.md) - Test patterns and coverage

### Gold Standard Repository

- **Location:** `/Users/nathanvale/code/bun-changesets-template/`
- **Proven Packages:** testkit, quality-check, voice-vault
- **Tooling Versions:**
  - pnpm@9.15.4
  - turbo@2.5.6
  - vitest@3.2.4
  - tsup@8.3.0
  - typescript@5.7.3

## 13) YAGNI Boundaries (Consolidated)

### Building Now (Phase 1-2)

✅ pnpm workspaces with 4 packages
✅ Turbo task pipeline (build, test, lint, typecheck)
✅ TSUP bundling for all packages
✅ Strict TypeScript with ESNext + node16
✅ Vitest parallel testing with isolation
✅ External @orchestr8/testkit integration
✅ ESLint flat config with TypeScript + Turbo plugins
✅ Prettier ADHD-optimized formatting
✅ Doctor health command
✅ Sequential processing only (no queues)

### Not Building (Explicit Deferrals)

❌ **Phase 3+ (Changesets & Versioning):**

- Changesets workflow (single-user doesn't need it)
- Semantic versioning automation
- Changelog generation
- NPM publishing

❌ **Phase 5+ (Advanced Tooling):**

- Storybook (no UI components in MPPP)
- Playwright E2E tests (CLI-only app)
- Docker containers (local macOS app)
- CI/CD pipelines (beyond basic GitHub Actions)
- Advanced monitoring dashboards

❌ **Out of Scope (Never or Distant Future):**

- Nx instead of Turbo (Turbo proven sufficient)
- Lerna (deprecated, Turbo replaces it)
- Rush (overkill for 4 packages)
- Custom build scripts (Turbo + TSUP sufficient)
- Monorepo plugins architecture (YAGNI)

### Trigger Conditions

| Feature | Trigger to Revisit |
|---------|-------------------|
| Changesets | Multi-contributor workflow emerges |
| Docker | Cross-platform distribution needed |
| Storybook | UI component library needed (Phase 5+) |
| Advanced CI/CD | Team >1 person, PR workflow needed |
| Nx Migration | Turbo performance insufficient (unlikely) |

## 14) Success Criteria Checklist

### Phase 1 Success (End Week 1)

- [ ] Monorepo structure created (pnpm + Turbo)
- [ ] 4 packages scaffolded (foundation, core, storage, capture)
- [ ] Build pipeline working (`pnpm build < 30s`)
- [ ] Test infrastructure working (Vitest + @orchestr8/testkit)
- [ ] Doctor command operational
- [ ] TypeScript strict mode enabled
- [ ] ESLint + Prettier configured
- [ ] Setup time < 5 minutes

### Quality Gates

- [ ] Zero circular dependencies
- [ ] All packages buildable in dependency order
- [ ] Tests run in parallel with isolation
- [ ] Coverage thresholds enforced (80%+ min)
- [ ] CLI startup < 1s
- [ ] Hot reload working in dev mode

### Documentation Complete

- [ ] README with setup instructions
- [ ] Package READMEs with usage examples
- [ ] Architecture decision records
- [ ] Contributing guide
- [ ] Troubleshooting guide

## 15) Nerdy Joke Corner

This monorepo is like an ADHD brain's perfect filing cabinet - only 4 drawers (packages) because more would be overwhelming, everything labeled clearly (TypeScript types), fast to open (< 30s builds), and impossible to lose things in (no circular dependencies). The gold standard repo is basically "adult supervision" in the form of proven configs, so you don't have to decide which semicolon style aligns with your chakras. Also, the fact that we're spending more time documenting the build system than actually building the capture system is very on-brand for software engineering. 🚀

---

## 16. Revision History

- **v1.0.0-MPPP** (2025-09-28): Promoted to living status (P2-4 phase)
- **v1.0.0-MPPP** (2025-09-27): Full PRD expansion for MPPP foundation

**Next Steps:**

1. **Week 1:** Scaffold monorepo structure following gold standard patterns
2. **Week 1:** Integrate @orchestr8/testkit for all packages
3. **Week 1:** Implement doctor command for health validation
4. **Week 2:** Begin storage package implementation (depends on foundation)

**Remember:** This is the ROOT dependency. No other feature can start until monorepo foundation is solid. Build it right, build it once. 🎯