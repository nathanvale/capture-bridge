# Coverage Testing in Monorepo - Complete Guide

**Last Updated**: 2025-10-11
**Vitest Version**: 3.2.4
**Applies To**: Capture Bridge monorepo

---

## Table of Contents

1. [Overview](#overview)
2. [Why Coverage Matters](#why-coverage-matters)
3. [Monorepo-Specific Challenges](#monorepo-specific-challenges)
4. [Coverage Configuration](#coverage-configuration)
5. [Running Coverage Correctly](#running-coverage-correctly)
6. [Common Mistakes](#common-mistakes)
7. [CI/CD Coverage](#cicd-coverage)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Overview

This guide explains how to run coverage tests correctly in the Capture Bridge monorepo. Coverage testing is essential for maintaining code quality and ensuring that our tests actually exercise the code they're supposed to test.

### Key Points

- **Coverage thresholds**: 80/80/75/80 (lines/functions/branches/statements)
- **Framework**: Vitest 3.x with V8 coverage provider
- **Monorepo challenge**: Vitest 3.x doesn't inherit coverage config from root to projects
- **Solution**: Always run coverage from monorepo root with project filters

---

## Why Coverage Matters

Coverage metrics tell you:

1. **Lines**: Which lines of code are executed by tests
2. **Functions**: Which functions are called by tests
3. **Branches**: Which conditional branches (if/else) are tested
4. **Statements**: Which executable statements run

### Why 80/80/75/80?

- **80% lines**: Most code paths exercised
- **80% functions**: Most functions have tests
- **75% branches**: Most edge cases covered (slightly lower because exhaustive branch testing can be impractical)
- **80% statements**: Most logic validated

**Lower thresholds without justification** signal:
- Missing edge case tests
- Dead code that should be removed
- Untested business logic

---

## Monorepo-Specific Challenges

### Vitest 3.x Coverage Inheritance Limitation

**Known Issue**: Vitest 3.x does NOT automatically inherit coverage configuration from root workspace config to project configs.

**What This Means**:
```bash
# ❌ WRONG: Running from package directory
cd packages/foundation
pnpm test:coverage  # Ignores root coverage config!
                     # May use default thresholds (0/0/0/0)
                     # Or package-local config only
```

**Impact**:
- Thresholds not enforced
- Wrong files included/excluded
- Inconsistent coverage reports across packages

**Solution**: Run from root with project filter (see [Running Coverage Correctly](#running-coverage-correctly))

---

## Coverage Configuration

### Root Configuration

Location: `/vitest.config.ts`

```typescript
coverage: {
  enabled: process.env['CI'] === 'true',
  provider: 'v8' as const,
  reporter: process.env['CI'] === 'true'
    ? ['lcov', 'json-summary', 'json', 'text']
    : ['text', 'html'],
  reportsDirectory: './coverage',
  exclude: [
    'node_modules/',
    'dist/',
    'coverage/',
    '**/*.d.ts',
    '**/*.config.*',
    '**/index.ts',
    // ... more exclusions
  ],
  thresholds: {
    statements: 39,  // Root-level threshold (lower for workspace)
    branches: 39,
    functions: 39,
    lines: 39,
  },
}
```

### Package Configuration

Location: `packages/{package}/vitest.config.ts`

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'json-summary', 'html'],
  reportsDirectory: './coverage',
  exclude: [
    'node_modules/**',
    'dist/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/test-setup.ts',
    '**/__tests__/**',
    '**/vitest.config.ts',
    '**/tsup.config.ts',
    // ... package-specific exclusions
  ],
  include: ['src/**/*.ts'],  // Only source code
  all: true,
  thresholds: {
    lines: 80,        // Package-level thresholds (stricter)
    functions: 80,
    branches: 75,
    statements: 80,
    autoUpdate: false,
    perFile: false,
  },
}
```

### Key Differences

| Aspect | Root Config | Package Config |
|--------|-------------|----------------|
| **Thresholds** | Lower (39%) - workspace aggregate | Higher (80/80/75/80) - per package |
| **Include** | Not specified (uses defaults) | `src/**/*.ts` (explicit) |
| **Exclude** | Workspace files, tooling | Package files, tests |
| **Reporter** | CI-aware (lcov in CI, html in dev) | Always text + html + json |

---

## Running Coverage Correctly

### Pattern 1: Single Package from Root

```bash
# ✅ CORRECT: From monorepo root
cd /Users/nathanvale/code/capture-bridge
pnpm --filter @capture-bridge/foundation test:coverage

# What this does:
# 1. Resolves package workspace location
# 2. Runs package's test:coverage script
# 3. Uses package's vitest.config.ts (with correct thresholds)
# 4. Outputs to packages/foundation/coverage/
```

### Pattern 2: All Packages from Root

```bash
# ✅ CORRECT: Run coverage for all packages
cd /Users/nathanvale/code/capture-bridge
pnpm test:coverage

# What this does:
# 1. Runs test:coverage in all workspace packages
# 2. Each package uses its own config
# 3. Aggregate results in each package's coverage/ directory
```

### Pattern 3: Vitest Direct with Project Filter

```bash
# ✅ CORRECT: Using vitest CLI with project filter
cd /Users/nathanvale/code/capture-bridge
vitest --coverage --project @capture-bridge/foundation

# What this does:
# 1. Uses root vitest.config.ts
# 2. Filters to specific project
# 3. Applies project-specific settings from vitest.projects.ts
```

### Pattern 4: Development Coverage (HTML Report)

```bash
# ✅ CORRECT: Generate HTML coverage report
cd /Users/nathanvale/code/capture-bridge
pnpm --filter @capture-bridge/foundation test:coverage

# Then open:
# packages/foundation/coverage/index.html
# Visual report showing:
# - Line-by-line coverage highlighting
# - Uncovered branches
# - Coverage percentages per file
```

---

## Common Mistakes

### Mistake 1: Running from Package Directory

```bash
# ❌ WRONG
cd packages/foundation
pnpm test:coverage

# ❓ Why wrong?
# - May use incorrect config resolution
# - Thresholds might not be enforced
# - Inconsistent with CI behavior

# ✅ CORRECT
cd /Users/nathanvale/code/capture-bridge
pnpm --filter @capture-bridge/foundation test:coverage
```

### Mistake 2: Forgetting to Build Dependencies

```bash
# ❌ WRONG: Running coverage without building dependencies
pnpm --filter @capture-bridge/foundation test:coverage
# Error: Cannot find module '@capture-bridge/build-config'

# ✅ CORRECT: Build dependencies first
pnpm --filter @capture-bridge/build-config build
pnpm --filter @capture-bridge/foundation test:coverage

# OR: Build all dependencies automatically
pnpm --filter @capture-bridge/foundation... build
pnpm --filter @capture-bridge/foundation test:coverage
```

### Mistake 3: Missing Coverage Config in New Packages

```bash
# ❌ WRONG: New package without coverage config
# packages/new-package/vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',
    // Missing coverage config!
  }
})

# ✅ CORRECT: Include full coverage config
import { createBaseVitestConfig } from '@orchestr8/testkit/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/new-package',
      environment: 'node',
      coverage: {
        provider: 'v8',
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
        // ... full config
      },
    },
  })
)
```

### Mistake 4: Incorrect Exclude Patterns

```bash
# ❌ WRONG: Overly broad exclude pattern
exclude: [
  'src/**/*',  // Excludes ALL source code!
]

# ✅ CORRECT: Exclude only test files
exclude: [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/__tests__/**',
  '**/test-setup.ts',
  '**/vitest.config.ts',
]

# Include source code explicitly
include: ['src/**/*.ts']
```

### Mistake 5: Lowering Thresholds Without Justification

```bash
# ❌ WRONG: Arbitrary threshold reduction
thresholds: {
  lines: 50,        // Lowered from 80 because tests failed
  functions: 50,    // No justification documented
  branches: 40,
  statements: 50,
}

# ✅ CORRECT: Keep standards high, write missing tests
thresholds: {
  lines: 80,
  functions: 80,
  branches: 75,     // Only this can be lower with reason
  statements: 80,
}

# If you must lower temporarily, document why:
// TEMPORARY: Reduced to 70% while we add tests for new features
// Target: 80% by 2025-10-20
// Tracker: #123
```

---

## CI/CD Coverage

### How Coverage is Collected in CI

**Workflow**: `.github/workflows/ci.yml`

```yaml
- name: Run tests with coverage
  run: pnpm test:coverage
  env:
    CI: 'true'  # Enables coverage in vitest.config.ts

- name: Upload coverage reports
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: true
```

### Coverage Reports in CI

**Reporters used in CI**:
- `lcov`: Standard format for coverage tools (Codecov, Coveralls)
- `json-summary`: Quick overview for CI logs
- `json`: Full structured data
- `text`: Human-readable console output

**Where reports are stored**:
- `./coverage/lcov.info` - LCOV format (uploaded to Codecov)
- `./coverage/coverage-final.json` - JSON format
- `./coverage/coverage-summary.json` - Summary only
- CI artifacts (GitHub Actions stores for 90 days)

### Coverage Enforcement in CI

**Threshold enforcement**:
```typescript
thresholds: {
  lines: 80,
  functions: 80,
  branches: 75,
  statements: 80,
  autoUpdate: false,  // CRITICAL: Don't auto-lower thresholds
}
```

**What happens on failure**:
1. Vitest exits with non-zero code
2. CI build fails
3. Pull request blocked from merging
4. Developer must add missing tests

---

## Troubleshooting

### Problem: Coverage Not Collected

**Symptoms**:
```bash
pnpm test:coverage
# Tests run, but no coverage report generated
```

**Diagnosis**:
```bash
# Check if coverage is enabled
grep -A5 "coverage:" packages/foundation/vitest.config.ts

# Check environment variable
echo $CI  # Should be 'true' in CI, empty in dev
```

**Solutions**:
1. **In CI**: Verify `CI=true` environment variable is set
2. **In dev**: Coverage may be disabled for speed - enable explicitly:
   ```bash
   env CI=true pnpm test:coverage
   ```
3. **Check config**: Ensure `coverage` block exists in vitest.config.ts

---

### Problem: Thresholds Not Enforced

**Symptoms**:
```bash
# Coverage is below 80%, but tests pass
Coverage: 45% lines, 50% functions
✅ All tests passed  # Should have failed!
```

**Diagnosis**:
```bash
# Check if running from wrong directory
pwd  # Should be /Users/nathanvale/code/capture-bridge

# Check effective config
vitest --coverage --project @capture-bridge/foundation --showConfig
```

**Solutions**:
1. **Run from root**: `cd /Users/nathanvale/code/capture-bridge`
2. **Use project filter**: `vitest --coverage --project <name>`
3. **Check thresholds**: Verify `thresholds` in package's vitest.config.ts

---

### Problem: Wrong Files Covered

**Symptoms**:
```bash
# Coverage includes test files, excludes source files
Coverage includes:
  src/__tests__/foo.test.ts ❌ Should be excluded
Coverage excludes:
  src/foo.ts ❌ Should be included
```

**Diagnosis**:
```bash
# Check include/exclude patterns
jq '.test.coverage | {include, exclude}' vitest.config.json
```

**Solutions**:

1. **Update include pattern**:
   ```typescript
   include: ['src/**/*.ts']  // Only source files
   ```

2. **Update exclude pattern**:
   ```typescript
   exclude: [
     '**/__tests__/**',
     '**/*.test.ts',
     '**/*.spec.ts',
   ]
   ```

3. **Verify with `all: true`**:
   ```typescript
   all: true  // Include all files matching 'include', not just tested ones
   ```

---

### Problem: Coverage Report Missing Files

**Symptoms**:
```bash
# Some source files don't appear in coverage report
src/foo.ts     80% ✅
src/bar.ts     MISSING ❌
```

**Diagnosis**:
```bash
# Check if file matches include pattern
echo "src/bar.ts" | grep -E 'src/.*\.ts$'  # Should match

# Check if file is excluded
grep -E 'bar' packages/foundation/vitest.config.ts
```

**Solutions**:

1. **Ensure `all: true`**: Forces inclusion of untested files
2. **Check exclude patterns**: Make sure file isn't excluded
3. **Verify import**: File must be importable (no syntax errors)

---

### Problem: Memory Errors During Coverage

**Symptoms**:
```bash
pnpm test:coverage
# JavaScript heap out of memory
```

**Solutions**:

1. **Increase Node memory**:
   ```json
   // package.json
   "scripts": {
     "test:coverage": "NODE_OPTIONS='--max-old-space-size=4096' vitest --coverage"
   }
   ```

2. **Run packages separately**:
   ```bash
   pnpm --filter @capture-bridge/foundation test:coverage
   pnpm --filter @capture-bridge/storage test:coverage
   ```

3. **Use fork pool** (already configured):
   ```typescript
   pool: 'forks',
   poolOptions: {
     forks: {
       maxForks: 6,
       execArgv: ['--max-old-space-size=1024']
     }
   }
   ```

---

## Best Practices

### 1. Always Run from Monorepo Root

```bash
# ✅ CORRECT
cd /Users/nathanvale/code/capture-bridge
pnpm --filter <package> test:coverage

# ❌ WRONG
cd packages/<package>
pnpm test:coverage
```

**Why**: Ensures consistent config resolution and matches CI behavior.

---

### 2. Check Coverage Before Committing

```bash
# Pre-commit checklist
pnpm --filter <package> test:coverage
# ✅ All thresholds met: 80/80/75/80
# ✅ No uncovered critical code paths
# ✅ New code has tests

git commit -m "feat: add new feature"
```

**Why**: Catches missing tests early, before CI fails.

---

### 3. Don't Lower Thresholds Without Justification

```bash
# ❌ WRONG: Silent threshold reduction
thresholds: {
  lines: 70,  // Changed from 80, no explanation
}

# ✅ CORRECT: Document temporary reduction
// TEMPORARY: Reduced to 70% while refactoring auth module
// This is acceptable because:
// 1. Refactoring in progress (ADR-042)
// 2. Critical paths still covered (see auth.test.ts)
// 3. Target: 80% by 2025-10-20
// 4. Tracker: #456
thresholds: {
  lines: 70,  // TODO: Restore to 80 after refactor
}
```

**Why**: Maintains quality standards and creates accountability.

---

### 4. Keep Exclude Patterns Consistent

**Standard exclude pattern** (use in all packages):

```typescript
exclude: [
  'node_modules/**',
  'dist/**',
  'coverage/**',
  '**/*.d.ts',
  '**/__tests__/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/test-setup.ts',
  '**/vitest.config.ts',
  '**/tsup.config.ts',
]
```

**Why**: Prevents inconsistencies between packages.

---

### 5. Review Coverage Reports Visually

```bash
# Generate HTML report
pnpm --filter <package> test:coverage

# Open in browser
open packages/<package>/coverage/index.html

# Review:
# - Untested lines (red highlighting)
# - Uncovered branches (yellow highlighting)
# - Missing functions (not in report)
```

**Why**: Metrics can lie - visual review catches edge cases.

---

### 6. Test Critical Paths First

**Prioritize coverage for**:

1. **Business logic** (calculations, transformations)
2. **Error handling** (catch blocks, retries)
3. **Edge cases** (empty inputs, boundary values)
4. **Security** (input validation, authentication)

**Lower priority**:

1. Type definitions (covered by TypeScript)
2. Simple getters/setters
3. Config files (validated by runtime)

**Why**: 80% coverage of the RIGHT code is better than 100% of trivial code.

---

## Cross-References

### Related Documentation

- **Master PRD Coverage Requirements**: `docs/master/prd-master.md` (lines 319-343)
- **TestKit TDD Guide**: `.claude/rules/testkit-tdd-guide-condensed.md`
- **Vitest Config Examples**: `vitest.config.ts`, `packages/*/vitest.config.ts`
- **CI Workflow**: `.github/workflows/ci.yml`

### Package Examples

- **Foundation Package**: `packages/foundation/vitest.config.ts` (lines 39-72)
  - Shows complete coverage config
  - 80/80/75/80 thresholds
  - Proper include/exclude patterns

- **Root Config**: `vitest.config.ts` (lines 21-48)
  - Shows workspace-level config
  - Lower thresholds (39%)
  - CI-aware reporters

---

## Quick Reference

### Commands Cheat Sheet

```bash
# Single package coverage
pnpm --filter @capture-bridge/<package> test:coverage

# All packages coverage
pnpm test:coverage

# With HTML report (open packages/<package>/coverage/index.html)
pnpm --filter @capture-bridge/<package> test:coverage

# Force coverage in dev mode
env CI=true pnpm --filter @capture-bridge/<package> test:coverage

# Check coverage without running tests (if already run)
vitest --coverage --run
```

### Threshold Reference

| Metric | Target | Minimum Acceptable | Never Below |
|--------|--------|-------------------|-------------|
| Lines | 80% | 75% (with justification) | 70% |
| Functions | 80% | 75% (with justification) | 70% |
| Branches | 75% | 70% (with justification) | 65% |
| Statements | 80% | 75% (with justification) | 70% |

---

**Last Updated**: 2025-10-11
**Maintained By**: Nathan Vale & AI Agents
**Questions**: See [Troubleshooting](#troubleshooting) or ask in #eng-testing
