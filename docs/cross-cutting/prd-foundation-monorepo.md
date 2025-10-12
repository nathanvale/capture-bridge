---
title: Foundation Monorepo PRD
status: living
owner: Nathan
version: 1.1.0-MPPP
date: 2025-01-12
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

| Metric               | Target     | Measurement                                | Status                       |
| -------------------- | ---------- | ------------------------------------------ | ---------------------------- |
| **TDD Feedback Loop** | **50-200ms** | **Change → Test result** | **✅ Achieved (source testing)** |
| Build time           | < 30s      | `time pnpm build` (production only)        | ✅ Achieved                  |
| Test suite           | < 30s      | `vitest run` duration                      | ✅ Achieved                  |
| Setup time           | < 5 min    | Fresh clone → `pnpm install && pnpm build` | ✅ Achieved                  |
| CLI startup          | < 1s       | `time adhd --version`                      | ✅ Achieved                  |
| Circular deps        | 0          | `pnpm list --depth=Infinity` validation    | ✅ Achieved                  |

### One Number Success Metric

**Time from `git clone` to running first test:** < 5 minutes (ADHD-optimized developer experience)

### Source Testing Implementation (2025-01-12)

**Critical Achievement:** Eliminated build step during development using custom export conditions.

**Implementation:**
- Custom `@capture-bridge/source` export condition points to TypeScript source files
- Vitest configured with `resolve.conditions` to use source directly
- Minimal `dist/` re-exports satisfy Vite resolution (not full builds)
- Production builds still use TSUP for optimized ESM output

**Impact:**
```
Before: Change code → pnpm build → pnpm test → See results (100-500ms latency)
After:  Change code → pnpm test → See results (50-200ms latency)
```

**Performance Improvement:** 2-5x faster TDD feedback loop

**Reference:** [ADR 0019: Monorepo Tooling Stack](../adr/0019-monorepo-tooling-stack.md) | [Source Testing Phase 2 Complete](../backlog/SOURCE-TESTING-PHASE-2-COMPLETE.md)

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
git clone https://github.com/nathanvale/capture-bridge.git
cd capture-bridge

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

### Flow B: Development Workflow (Daily Coding) - Source Testing Enabled

```bash
# Simple workflow - no build required!
# Terminal 1: Watch mode for tests (source testing = instant feedback)
pnpm test --watch

# Terminal 2 (optional): Type checking
pnpm typecheck --watch

# Test specific package (runs against source files directly)
pnpm test --filter=@capture-bridge/core

# Before commit:
pnpm lint && pnpm typecheck && pnpm test
```

**Success Criteria:**
- Source change → test feedback: 50-200ms (achieved via source testing)
- No build step required during development
- Tests run directly against TypeScript source files

**Traditional Dev Mode (only needed for complex scenarios):**
```bash
# Run concurrent build watch + test watch (rarely needed now)
pnpm dev
```

### Flow C: Adding New Package (Rare)

```bash
# 1. Check current package count (must be < 4)
pnpm doctor

# 2. Create package structure
mkdir -p packages/@capture-bridge/new-package/src
cd packages/@capture-bridge/new-package

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
- Comprehensive .gitignore: dependencies, builds, caches, environment files, security artifacts

**⚠️ CRITICAL GAP IDENTIFIED:** Current .gitignore (5 lines) vs @orchestr8 Gold Standard (160+ lines)

- Missing: Build artifacts (.turbo/, .tsbuildinfo), testing (coverage/, .vitest/), environment security (.env patterns), IDE configs, caches, SQLite artifacts, security files
- **Risk:** Accidental commits of sensitive data, build artifacts, and environment files
- **Action Required:** Adopt @orchestr8 .gitignore patterns as HIGH PRIORITY (see alignment plan update)

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

| Operation   | Target | Strategy                       |
| ----------- | ------ | ------------------------------ |
| Full build  | < 30s  | Turbo parallel tasks + TSUP    |
| Incremental | < 5s   | Turbo cache + watch mode       |
| Test suite  | < 30s  | Vitest parallel + in-memory DB |
| Typecheck   | < 10s  | TSC with incremental builds    |

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

| Component          | Risk Class | TDD Required?  | Rationale                             |
| ------------------ | ---------- | -------------- | ------------------------------------- |
| Package boundaries | **HIGH**   | ✅ YES         | Circular deps cascade to all features |
| Dependency graph   | **HIGH**   | ✅ YES         | Foundation errors block everything    |
| Test isolation     | **HIGH**   | ✅ YES         | Flaky tests destroy productivity      |
| Build pipeline     | **MEDIUM** | ⚠️ RECOMMENDED | Turbo misconfig causes subtle issues  |
| ESLint rules       | **LOW**    | ❌ NO          | Visual verification sufficient        |

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

**Decision: TSUP for production builds + Custom Export Conditions for development**

- **Why:** TSUP proven for production, custom export conditions eliminate dev builds
- **Production Config (TSUP):**
  ```typescript
  // tsup.config.ts
  export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],  // ESM-only for ADHD Brain
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
  })
  ```
- **Development Config (Custom Export Conditions):**
  ```json
  // package.json
  {
    "type": "module",
    "exports": {
      ".": {
        "@capture-bridge/source": {
          "types": "./src/index.ts",
          "import": "./src/index.ts"
        },
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
  ```
- **Consequences:**
  - Fast production builds with tree-shaking
  - Zero build latency during development (source testing)
  - 2-5x faster TDD feedback loop
  - ESM-only simplifies configuration

### Vitest Configuration

**Decision: Projects-based multi-package testing + Source Testing**

- **Why:** Parallel execution with isolation, source testing eliminates builds
- **Configuration:**
  ```typescript
  // vitest.config.ts
  export default defineConfig(
    createBaseVitestConfig({
      resolve: {
        // Custom export condition enables source testing
        conditions: ['@capture-bridge/source', 'import', 'default'],
      },
      test: {
        projects: getVitestProjects(),
        environment: "node",
        coverage: {
          thresholds: {
            statements: 80,
            branches: 80,
            functions: 80,
            lines: 80,
          },
        },
      },
    })
  )
  ```
- **Consequences:**
  - Fast parallel tests with no flakiness
  - Tests run directly against TypeScript source files
  - 50-200ms feedback loop (no build latency)
  - Simplified development workflow

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
        "turbo/no-undeclared-env-vars": "off",
      },
    },
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

**Updated for ADHD Brain with .gitignore sync:**

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
    "clean": "turbo run clean",
    "doctor": "node scripts/doctor.js",
    "sync:gitignore": "node scripts/sync-gitignore.js",
    "setup": "pnpm install && pnpm sync:gitignore && pnpm build && pnpm test"
  },
  "packageManager": "pnpm@9.15.4",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

**New Scripts Added:**

- `doctor`: Health check with .gitignore validation
- `sync:gitignore`: Sync .gitignore with @orchestr8 gold standard
- `setup`: Complete setup for new clones (replaces manual steps)

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
      "inputs": [
        "$TURBO_DEFAULT$",
        "!**/*.test.ts",
        "!**/*.spec.ts",
        "!tests/**"
      ]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "cache": true,
      "inputs": [
        "$TURBO_DEFAULT$",
        "vitest.config.ts",
        "src/**/*.{ts,tsx,js,jsx}"
      ],
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
      "@capture-bridge/foundation": ["./packages/foundation/src/index.ts"],
      "@capture-bridge/core": ["./packages/core/src/index.ts"],
      "@capture-bridge/storage": ["./packages/storage/src/index.ts"],
      "@capture-bridge/capture": ["./packages/capture/src/index.ts"],
      "@orchestr8/testkit": [
        "./node_modules/@orchestr8/testkit/dist/index.d.ts"
      ]
    }
  },
  "include": ["packages/*/src/**/*", "apps/*/src/**/*"],
  "exclude": ["node_modules", "dist", "coverage", ".turbo"]
}
```

### ESLint Flat Config

**From `/Users/nathanvale/code/bun-changesets-template/eslint.config.mjs`:**

```javascript
import js from "@eslint/js"
import typescript from "typescript-eslint"
import turbo from "eslint-plugin-turbo"

export default [
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/node_modules/**",
    ],
  },

  js.configs.recommended,
  ...typescript.configs.recommended,

  {
    plugins: { turbo },
    rules: {
      "turbo/no-undeclared-env-vars": "off",
    },
  },

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "error",
    },
  },
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
import { defineConfig } from "vitest/config"
import { createBaseVitestConfig } from "@orchestr8/testkit/vitest-config"

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: "capture-bridge",
      environment: "node",
      globals: true,
      coverage: {
        enabled: process.env.CI === "true",
        provider: "v8",
        reporter: ["text", "html", "json"],
        reportsDirectory: "./coverage",
        thresholds: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  })
)
```

### .gitignore Sync Script Implementation

**`scripts/sync-gitignore.js`:**

```javascript
#!/usr/bin/env node
/**
 * Sync .gitignore with @orchestr8 gold standard patterns
 * Preserves ADHD Brain specific patterns (.vault-id)
 */

import { readFileSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = dirname(__dirname)

// @orchestr8 gold standard .gitignore content (fetch from GitHub or local copy)
const ORCHESTR8_GITIGNORE_URL =
  "https://raw.githubusercontent.com/nathanvale/orchestr8/main/.gitignore"

// ADHD Brain specific patterns to preserve
const ADHD_BRAIN_SPECIFIC = ["# ADHD Brain Specific", ".vault-id", ""].join(
  "\n"
)

async function syncGitignore() {
  console.log("🔄 Syncing .gitignore with @orchestr8 gold standard...")

  try {
    // Fetch @orchestr8 .gitignore
    const response = await fetch(ORCHESTR8_GITIGNORE_URL)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch @orchestr8 .gitignore: ${response.statusText}`
      )
    }

    const orchestr8Content = await response.text()

    // Combine ADHD Brain specific + @orchestr8 patterns
    const combinedContent = [ADHD_BRAIN_SPECIFIC, orchestr8Content].join("\n")

    // Write to .gitignore
    const gitignorePath = join(rootDir, ".gitignore")
    writeFileSync(gitignorePath, combinedContent, "utf8")

    console.log("✅ .gitignore updated successfully!")
    console.log("📊 Patterns: ADHD Brain (2) + @orchestr8 (160+)")
    console.log(
      "🔒 Security: Environment files, SQLite, cache patterns now protected"
    )
  } catch (error) {
    console.error("❌ Failed to sync .gitignore:", error.message)
    process.exit(1)
  }
}

syncGitignore()
```

**`scripts/doctor.js` - Enhanced with .gitignore Validation:**

```javascript
#!/usr/bin/env node
/**
 * ADHD Brain Doctor - Health check with .gitignore validation
 */

import { readFileSync, existsSync } from "fs"
import { execSync } from "child_process"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = dirname(__dirname)

// Critical .gitignore patterns that MUST be present
const CRITICAL_PATTERNS = [
  // Security
  ".env",
  "*.pem",
  "*.key",
  "private/",

  // SQLite (critical for ADHD Brain)
  "*.sqlite",
  "*.sqlite-wal",
  "*.sqlite-shm",
  "*.db",
  "*.db-wal",
  "*.db-shm",

  // Build artifacts
  ".turbo/",
  "*.tsbuildinfo",

  // Performance caches
  ".eslintcache",
  ".prettiercache",
  ".cache/",

  // Claude Code
  ".claude/settings.local.json",
  "PROJECT_INDEX.json",
]

let hasErrors = false

function checkSection(title, checks) {
  console.log(`\n${checks.every((c) => c.passed) ? "✅" : "⚠️ "} ${title}`)

  checks.forEach((check) => {
    const icon = check.passed ? "✓" : "❌"
    console.log(`  ${icon} ${check.message}`)
    if (!check.passed) hasErrors = true
  })
}

function checkGitignore() {
  const gitignorePath = join(rootDir, ".gitignore")

  if (!existsSync(gitignorePath)) {
    return [
      {
        passed: false,
        message: ".gitignore file missing",
      },
    ]
  }

  const content = readFileSync(gitignorePath, "utf8")
  const lines = content.split("\n").map((line) => line.trim())

  const checks = []
  const missingPatterns = []
  const presentPatterns = []

  CRITICAL_PATTERNS.forEach((pattern) => {
    const isPresent = lines.some(
      (line) =>
        line === pattern ||
        line.includes(pattern.replace("*", "")) ||
        (pattern.includes("*") &&
          lines.some((l) => new RegExp(pattern.replace("*", ".*")).test(l)))
    )

    if (isPresent) {
      presentPatterns.push(pattern)
    } else {
      missingPatterns.push(pattern)
    }
  })

  // Overall completeness check
  const totalLines = lines.filter(
    (line) => line && !line.startsWith("#")
  ).length
  const orchestr8Expected = 160
  const completeness = Math.round((totalLines / orchestr8Expected) * 100)

  checks.push({
    passed: completeness >= 90,
    message: `.gitignore completeness: ${completeness}% (${totalLines}/${orchestr8Expected}+ patterns)`,
  })

  if (missingPatterns.length > 0) {
    checks.push({
      passed: false,
      message: `Missing ${missingPatterns.length} critical patterns: ${missingPatterns.slice(0, 3).join(", ")}${missingPatterns.length > 3 ? "..." : ""}`,
    })
  }

  if (presentPatterns.length > 0) {
    checks.push({
      passed: true,
      message: `${presentPatterns.length} critical patterns present`,
    })
  }

  return checks
}

async function runDoctor() {
  console.log("🩺 ADHD Brain Doctor - System Health Check\n")

  // Environment checks
  checkSection("Environment", [
    {
      passed: process.version.match(/v(\d+)/)[1] >= 20,
      message: `Node ${process.version}`,
    },
    // Add other environment checks...
  ])

  // Git Configuration & Security
  checkSection("Git Configuration & Security", checkGitignore())

  // ... other existing checks ...

  console.log("\n" + "=".repeat(50))

  if (hasErrors) {
    console.log("❌ Critical issues found! Address immediately for security.")
    console.log(
      '\n🔧 Quick fix: Run "pnpm sync:gitignore" to adopt @orchestr8 patterns'
    )
    process.exit(1)
  } else {
    console.log("✅ All checks passed! System healthy. 🎉")
  }
}

runDoctor()
```

## 11) .gitignore Synchronization (HIGH PRIORITY)

### Critical Gap Analysis

**Current ADHD Brain .gitignore (5 lines):**

```
.vault-id
node_modules
dist
coverage
```

**@orchestr8 Gold Standard (160+ lines with comprehensive coverage):**

### Missing Critical Categories

#### 1. Build Artifacts & Performance

```gitignore
# Missing from ADHD Brain
.turbo/                    # Turbo cache (critical for monorepo)
*.tsbuildinfo             # TypeScript incremental builds
.next/                    # Next.js builds (future-proofing)
.nuxt/                    # Nuxt builds
out/                      # Additional build outputs
dist-node/                # Node-specific builds
dist-types/               # Type-only builds
dist-ssr/                 # SSR builds
```

#### 2. Testing & Coverage

```gitignore
# Missing from ADHD Brain
.vitest/                  # Vitest cache
test-results/             # Test outputs
playwright-report/        # E2E test reports
playwright/.cache/        # Playwright cache
.nyc_output/              # NYC coverage
*.lcov                    # Coverage files
junit.xml                 # Test result XML
```

#### 3. Environment & Security (CRITICAL)

```gitignore
# Missing from ADHD Brain - SECURITY RISK
.env                      # Environment files
.env*.local               # Local environment overrides
.env.development          # Development env
.env.production           # Production env
.env.test                 # Test env
!.env.example             # Keep example (important pattern)

# Security files
*.pem                     # SSL certificates
*.key                     # Private keys
*.crt                     # Certificates
*.p12                     # PKCS#12 files
private/                  # Private directory
```

#### 4. IDE & Development Tools

```gitignore
# Missing from ADHD Brain
.vscode/*                 # VSCode settings
!.vscode/extensions.json  # Keep extensions list
!.vscode/settings.json    # Keep workspace settings
!.vscode/tasks.json       # Keep tasks
!.vscode/launch.json      # Keep debug config
.idea/                    # JetBrains IDEs
*.swp                     # Vim swap files
*.swo                     # Vim swap files
*~                        # Backup files
.fleet/                   # Fleet IDE
.history/                 # File history
```

#### 5. Cache & Performance Files

```gitignore
# Missing from ADHD Brain - PERFORMANCE IMPACT
.cache/                   # Generic cache
.parcel-cache/            # Parcel bundler
.eslintcache              # ESLint cache (important for speed)
.stylelintcache           # Stylelint cache
.prettiercache            # Prettier cache (important for speed)
.grunt/                   # Grunt cache
.agent-os/cache/          # Agent OS cache
```

#### 6. Claude Code & Agent Integration

```gitignore
# Missing from ADHD Brain - CLAUDE CODE SPECIFIC
.claude/settings.local.json  # Local Claude settings
PROJECT_INDEX.json           # Claude project index

# Agent OS
.agentos/                    # Agent OS files
.agent-os/**                 # Agent OS directory
```

#### 7. System Files (Cross-Platform)

```gitignore
# Missing from ADHD Brain
.DS_Store                 # macOS Finder
.DS_Store?                # macOS variations
._*                       # macOS resource forks
.Spotlight-V100           # macOS Spotlight
.Trashes                  # macOS Trash
ehthumbs.db               # Windows thumbnails
Thumbs.db                 # Windows thumbnails
desktop.ini               # Windows desktop config
```

#### 8. Database & SQLite (CRITICAL FOR ADHD BRAIN)

```gitignore
# Missing from ADHD Brain - DATABASE CRITICAL
*.sqlite                  # SQLite databases
*.sqlite-wal              # SQLite WAL files
*.sqlite-shm              # SQLite shared memory
*.db                      # Generic database files
*.db-wal                  # Database WAL files
*.db-shm                  # Database shared memory

# Special SQLite test patterns
file:*?mode=memory&cache=shared
packages/testkit/file:*?mode=memory&cache=shared
```

#### 9. Temporary & Debug Files

```gitignore
# Missing from ADHD Brain
tmp/                      # Temporary directory
temp/                     # Temporary directory
test-temp/                # Test temporary
.tmp/                     # Hidden temporary
*.tmp                     # Temporary files
*.bak                     # Backup files
*.backup                  # Backup files

# Debug files
*.map                     # Source maps
.sourceMap                # Source map directory

# Performance data
.ci-performance-data.json
.cache-performance.json
```

#### 10. Package & Archive Files

```gitignore
# Missing from ADHD Brain
*.tgz                     # Compressed tarballs
*.tar.gz                  # Compressed tarballs
*.zip                     # Zip archives
*.7z                      # 7-Zip archives
*.rar                     # RAR archives
```

### .gitignore Synchronization Plan

#### Phase 1: Immediate Security & Critical Files (HIGH PRIORITY)

```bash
# 1. Environment & Security (IMMEDIATE)
echo ".env" >> .gitignore
echo ".env*.local" >> .gitignore
echo ".env.development" >> .gitignore
echo ".env.production" >> .gitignore
echo ".env.test" >> .gitignore
echo "!.env.example" >> .gitignore
echo "*.pem" >> .gitignore
echo "*.key" >> .gitignore
echo "private/" >> .gitignore

# 2. Database Files (IMMEDIATE - ADHD Brain uses SQLite)
echo "*.sqlite" >> .gitignore
echo "*.sqlite-wal" >> .gitignore
echo "*.sqlite-shm" >> .gitignore
echo "*.db" >> .gitignore
echo "*.db-wal" >> .gitignore
echo "*.db-shm" >> .gitignore

# 3. Build Artifacts (IMMEDIATE)
echo ".turbo/" >> .gitignore
echo "*.tsbuildinfo" >> .gitignore
```

#### Phase 2: Development Experience & Performance

```bash
# 4. Cache Files (PERFORMANCE)
echo ".cache/" >> .gitignore
echo ".eslintcache" >> .gitignore
echo ".prettiercache" >> .gitignore

# 5. Testing
echo ".vitest/" >> .gitignore
echo "test-results/" >> .gitignore
echo "playwright-report/" >> .gitignore

# 6. Claude Code Integration
echo ".claude/settings.local.json" >> .gitignore
echo "PROJECT_INDEX.json" >> .gitignore
```

#### Phase 3: Complete @orchestr8 Adoption

Replace entire .gitignore with @orchestr8 version, preserving ADHD Brain specifics:

```gitignore
# ADHD Brain Specific (preserve)
.vault-id

# [Full @orchestr8 .gitignore content follows]
# Dependencies
node_modules/
.pnp
.pnp.js
# ... [complete @orchestr8 patterns]
```

### Implementation Recommendation

**IMMEDIATE ACTION:** Replace current .gitignore with complete @orchestr8 version + .vault-id

**Rationale:**

- Current 5-line .gitignore has CRITICAL security gaps
- Missing database file patterns = accidental SQLite commits
- Missing environment patterns = potential secret leaks
- Missing build artifacts = repository bloat
- Missing cache patterns = slower development experience

**Risk if Delayed:**

- ❌ Accidental commit of SQLite databases with sensitive capture data
- ❌ Environment file leaks (API keys, OAuth tokens)
- ❌ Build artifact bloat slowing git operations
- ❌ Cache pollution affecting team development

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

4. **Git Configuration & Security:**
   - .gitignore completeness (vs @orchestr8 gold standard)
   - Critical patterns present: SQLite files, environment files, build artifacts
   - No sensitive files accidentally tracked
   - Cache patterns configured for performance

5. **Test Infrastructure:**
   - @orchestr8/testkit available
   - In-memory SQLite working
   - MSW imports resolve

6. **Build Outputs:**
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

⚠️  Git Configuration & Security
  ❌ .gitignore incomplete (5/160+ patterns from gold standard)
  ❌ Missing SQLite patterns (*.sqlite, *.db, WAL files)
  ❌ Missing environment security (.env*, *.key, *.pem)
  ❌ Missing build artifacts (.turbo/, *.tsbuildinfo)
  ❌ Missing cache patterns (.eslintcache, .prettiercache)
  ❌ Missing Claude Code patterns (.claude/, PROJECT_INDEX.json)

  🔧 Action Required: Run 'pnpm sync:gitignore' to adopt @orchestr8 patterns

✅ Test Infrastructure
  ✓ @orchestr8/testkit available
  ✓ In-memory SQLite working
  ✓ MSW imports resolve

✅ Build Outputs
  ✓ All packages built
  ✓ Type definitions present

❌ Critical issues found! Address .gitignore gaps immediately for security.
```

## 12) Related Specifications

### Master Documents

- [Master PRD v2.3.0-MPPP](/Users/nathanvale/code/capture-bridge/docs/master/prd-master.md) - Overall system requirements
- [Roadmap v2.0.0-MPPP](/Users/nathanvale/code/capture-bridge/docs/master/roadmap.md) - Dependency-ordered delivery plan

### Cross-Cutting Specs

- [Foundation Monorepo TECH Spec](./spec-foundation-monorepo-tech.md) - Technical implementation details
- [Foundation Monorepo ARCH Spec](./spec-foundation-monorepo-arch.md) - Architecture specification
- [TestKit Tech Spec](../guides/guide-testkit-usage.md) - Test isolation patterns

### Supporting Guides

- [TDD Applicability Guide](/Users/nathanvale/code/capture-bridge/docs/guides/tdd-applicability.md) - When to apply TDD
- [Test Strategy](/Users/nathanvale/code/capture-bridge/docs/guides/test-strategy.md) - Test patterns and coverage

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

| Feature        | Trigger to Revisit                        |
| -------------- | ----------------------------------------- |
| Changesets     | Multi-contributor workflow emerges        |
| Docker         | Cross-platform distribution needed        |
| Storybook      | UI component library needed (Phase 5+)    |
| Advanced CI/CD | Team >1 person, PR workflow needed        |
| Nx Migration   | Turbo performance insufficient (unlikely) |

## 14) Success Criteria Checklist

### Phase 1 Success (End Week 1)

**PRIORITY 1 (Security & Foundation):**

- [ ] .gitignore synchronized with @orchestr8 gold standard (160+ patterns)
- [ ] Critical patterns protected: SQLite files, environment files, build artifacts
- [ ] `pnpm sync:gitignore` script working
- [ ] `pnpm doctor` detecting .gitignore gaps

**PRIORITY 2 (Monorepo Structure):**

- [ ] Monorepo structure created (pnpm + Turbo)
- [ ] 4 packages scaffolded (foundation, core, storage, capture)
- [ ] Build pipeline working (`pnpm build < 30s`)
- [ ] Test infrastructure working (Vitest + @orchestr8/testkit)
- [ ] Doctor command operational with all checks
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

- **v1.1.0-MPPP** (2025-01-12): Source testing implementation - eliminated build step during development via custom export conditions
- **v1.0.0-MPPP** (2025-09-28): Promoted to living status (P2-4 phase)
- **v1.0.0-MPPP** (2025-09-27): Full PRD expansion for MPPP foundation

**Next Steps:**

**IMMEDIATE (Priority 1 - Security):**

1. **Today:** Sync .gitignore with @orchestr8 patterns (`pnpm sync:gitignore`)
2. **Today:** Implement doctor command with .gitignore validation
3. **Today:** Validate no sensitive files are currently tracked

**Week 1 (Priority 2 - Foundation):** 4. **Week 1:** Scaffold monorepo structure following gold standard patterns 5. **Week 1:** Integrate @orchestr8/testkit for all packages 6. **Week 1:** Complete doctor command for all health validation 7. **Week 2:** Begin storage package implementation (depends on foundation)

**Remember:**

- ⚠️ **SECURITY FIRST:** .gitignore gaps = potential data leaks. Fix immediately.
- 🏗️ **ROOT DEPENDENCY:** No other feature can start until monorepo foundation is solid.
- 🎯 **Build it right, build it once:** The foundation determines everything that follows.
