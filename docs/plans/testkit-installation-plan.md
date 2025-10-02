---
title: TestKit 2.0 Installation Plan
status: approved
owner: Nathan
version: 2.0.0
date: 2025-10-01
doc_type: plan
---

# TestKit 2.0 Installation Plan

## Purpose

This plan provides step-by-step instructions for installing TestKit 2.0 (`@orchestr8/testkit`) in any package within the ADHD Brain monorepo. It is designed to be executed autonomously by AI agents or followed manually by developers.

**Target Audience:** AI agents and developers setting up new packages or migrating existing packages to TestKit 2.0.

**Key Goal:** Ensure consistent TestKit installation across all packages with proper dependency management and configuration.

## When to Use This Plan

Use this plan when:

- Setting up a new package in the monorepo
- Migrating an existing package to TestKit 2.0
- Adding TestKit to a package that currently has no testing infrastructure
- Troubleshooting TestKit installation issues
- Verifying TestKit is properly configured

## Prerequisites Check

Before starting installation, verify these prerequisites:

### 1. Monorepo Setup
```bash
# Check you're in the monorepo root
pwd
# Should be: /Users/nathanvale/code/capture-bridge

# Verify pnpm is available
pnpm --version
# Should be: 9.x or higher
```

### 2. Package Exists
```bash
# Verify package directory exists
ls -la packages/<package-name>

# Verify package.json exists
test -f packages/<package-name>/package.json && echo "✅ package.json exists" || echo "❌ package.json missing"
```

### 3. Node Version
```bash
# Check Node version
node --version
# Should be: v20.x or v22.x
```

## Installation Steps

### Step 1: Install Core Dependencies

**Action:** Add TestKit core and required peer dependencies to package.json

**Commands:**
```bash
# Navigate to package directory
cd packages/<package-name>

# Install core TestKit and Vitest
pnpm add -D @orchestr8/testkit vitest

# Verify installation
pnpm list @orchestr8/testkit vitest
```

**Expected Output:**
```
@orchestr8/testkit file:/Users/nathanvale/code/@orchestr8/packages/testkit
vitest ^3.2.4
```

**Verification:**
```bash
# Check package.json has correct entries
grep -A2 "devDependencies" packages/<package-name>/package.json | grep -E "(testkit|vitest)"
```

**Success Criteria:**
- ✅ `@orchestr8/testkit` appears in devDependencies
- ✅ `vitest` version is 3.2.0 or higher
- ✅ No installation errors in terminal

### Step 2: Install Optional Dependencies

**Action:** Install optional dependencies based on testing needs

**Decision Matrix:**

| Need | Install | Command |
|------|---------|---------|
| SQLite database testing | `better-sqlite3` | `pnpm add -D better-sqlite3` |
| HTTP mocking | `msw` | `pnpm add -D msw` |
| DOM testing | `happy-dom` | `pnpm add -D happy-dom` |
| Container testing | `testcontainers` | `pnpm add -D testcontainers` |
| PostgreSQL containers | `pg` | `pnpm add -D pg @types/pg` |
| MySQL containers | `mysql2` | `pnpm add -D mysql2` |
| Convex testing | `convex-test` | `pnpm add -D convex-test` |

**Example for ADHD Brain packages:**
```bash
# Most packages will need SQLite and MSW
cd packages/<package-name>
pnpm add -D better-sqlite3 msw happy-dom

# Verify installation
pnpm list better-sqlite3 msw happy-dom
```

**Success Criteria:**
- ✅ Required optional dependencies installed
- ✅ All dependencies appear in devDependencies
- ✅ No peer dependency warnings

### Step 3: Create Vitest Configuration

**Action:** Create or update vitest.config.ts with TestKit settings

**Commands:**
```bash
# Navigate to package directory
cd packages/<package-name>

# Check if config exists
test -f vitest.config.ts && echo "✅ Config exists" || echo "❌ Config missing"
```

**Create vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@capture-bridge/<package-name>',
    environment: 'node',
    globals: false,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/fixtures/**',
        '**/test-helpers/**'
      ]
    },
    // Wallaby integration
    testTimeout: 10000,
    hookTimeout: 10000
  }
})
```

**Alternative (Using TestKit Config):**
```typescript
import { defineConfig } from 'vitest/config'
import { createVitestConfig } from '@orchestr8/testkit/config'

export default defineConfig(
  createVitestConfig({
    test: {
      name: '@capture-bridge/<package-name>',
      environment: 'node'
    }
  })
)
```

**Verification:**
```bash
# Check config file exists and is valid TypeScript
npx tsc --noEmit vitest.config.ts

# Try running vitest to check config loads
pnpm test --run --reporter=verbose --bail 1 2>&1 | head -20
```

**Success Criteria:**
- ✅ vitest.config.ts exists
- ✅ Config is valid TypeScript
- ✅ Vitest can load the config without errors

### Step 4: Update Package Scripts

**Action:** Add or update test scripts in package.json

**Required Scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:ci": "vitest run --bail 1",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Commands:**
```bash
# Check current scripts
grep -A5 "scripts" packages/<package-name>/package.json

# Verify scripts work
pnpm test:ci 2>&1 | grep -E "(PASS|FAIL|No test files found)"
```

**Success Criteria:**
- ✅ All required scripts present
- ✅ `pnpm test` executes without errors
- ✅ Scripts reference vitest (not jest or other runners)

### Step 5: Create Test Directory Structure

**Action:** Set up standard test directory layout

**Commands:**
```bash
cd packages/<package-name>

# Create test directories if they don't exist
mkdir -p src/__tests__
mkdir -p test-helpers
mkdir -p fixtures

# Verify structure
ls -la src/ | grep __tests__
test -d test-helpers && echo "✅ test-helpers exists"
test -d fixtures && echo "✅ fixtures exists"
```

**Expected Structure:**
```
packages/<package-name>/
├── src/
│   ├── __tests__/           # Test files co-located with source
│   │   └── example.test.ts
│   └── example.ts
├── test-helpers/            # Shared test utilities
│   └── builders.ts
├── fixtures/                # Test fixtures
│   └── data.json
├── vitest.config.ts
└── package.json
```

**Success Criteria:**
- ✅ `src/__tests__/` directory exists
- ✅ `test-helpers/` directory exists (if needed)
- ✅ `fixtures/` directory exists (if needed)

### Step 6: Create Verification Test

**Action:** Create a simple test to verify TestKit is working

**Commands:**
```bash
cd packages/<package-name>

# Create verification test file
cat > src/__tests__/testkit-verification.test.ts << 'EOF'
/**
 * @file testkit-verification.test.ts
 * @description Verification test to ensure TestKit 2.0 is properly installed
 */

import { describe, it, expect } from 'vitest'
import { delay, retry } from '@orchestr8/testkit'

describe('TestKit Verification', () => {
  it('core utilities are available', async () => {
    // Test delay utility
    const start = Date.now()
    await delay(10)
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(10)
  })

  it('retry utility works', async () => {
    let attempts = 0

    const result = await retry(
      async () => {
        attempts++
        if (attempts < 2) throw new Error('Not ready')
        return 'success'
      },
      3,
      10
    )

    expect(result).toBe('success')
    expect(attempts).toBe(2)
  })
})
EOF

# Run verification test
pnpm test testkit-verification
```

**Expected Output:**
```
✓ TestKit Verification
  ✓ core utilities are available
  ✓ retry utility works

Test Files  1 passed (1)
Tests  2 passed (2)
```

**Success Criteria:**
- ✅ Verification test file created
- ✅ Test runs without errors
- ✅ All assertions pass

### Step 7: Optional - Add SQLite Verification

**Action:** If better-sqlite3 is installed, verify SQLite testing works

**Commands:**
```bash
cd packages/<package-name>

# Check if better-sqlite3 is installed
pnpm list better-sqlite3 > /dev/null 2>&1 && echo "✅ SQLite available" || echo "⚠️  SQLite not installed"

# Create SQLite verification test
cat > src/__tests__/sqlite-verification.test.ts << 'EOF'
/**
 * @file sqlite-verification.test.ts
 * @description Verification test for TestKit SQLite utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import Database from 'better-sqlite3'

describe('SQLite Verification', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db)
  })

  afterEach(() => {
    db.close()
  })

  it('creates in-memory database', () => {
    const result = db.prepare('SELECT 1 as test').get() as { test: number }
    expect(result.test).toBe(1)
  })

  it('enforces foreign key constraints', () => {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `)

    expect(() => {
      db.prepare('INSERT INTO posts (user_id) VALUES (?)').run(999)
    }).toThrow('FOREIGN KEY constraint failed')
  })
})
EOF

# Run SQLite verification test
pnpm test sqlite-verification
```

**Success Criteria:**
- ✅ SQLite test file created
- ✅ Test runs without errors
- ✅ Foreign key constraints work

### Step 8: Optional - Add MSW Verification

**Action:** If msw is installed, verify HTTP mocking works

**Commands:**
```bash
cd packages/<package-name>

# Check if msw is installed
pnpm list msw > /dev/null 2>&1 && echo "✅ MSW available" || echo "⚠️  MSW not installed"

# Create MSW verification test
cat > src/__tests__/msw-verification.test.ts << 'EOF'
/**
 * @file msw-verification.test.ts
 * @description Verification test for TestKit MSW utilities
 */

import { describe, it, expect } from 'vitest'
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

const server = setupMSW([
  http.get('https://api.example.com/test', () => {
    return HttpResponse.json({ message: 'success' })
  })
])

describe('MSW Verification', () => {
  it('intercepts HTTP requests', async () => {
    const response = await fetch('https://api.example.com/test')
    const data = await response.json()

    expect(data.message).toBe('success')
  })
})
EOF

# Run MSW verification test
pnpm test msw-verification
```

**Success Criteria:**
- ✅ MSW test file created
- ✅ Test runs without errors
- ✅ HTTP requests are intercepted

### Step 9: Run Full Test Suite

**Action:** Execute complete test suite to verify everything works

**Commands:**
```bash
cd packages/<package-name>

# Run all tests
pnpm test:ci

# Check coverage
pnpm test:coverage

# Verify test output
pnpm test 2>&1 | tee test-output.log
cat test-output.log | grep -E "(passed|failed)"
```

**Success Criteria:**
- ✅ All tests pass
- ✅ No import errors
- ✅ Coverage reports generate successfully
- ✅ Test output is clean (no warnings)

### Step 10: Update Documentation

**Action:** Document TestKit usage in package README

**Commands:**
```bash
cd packages/<package-name>

# Check if README exists
test -f README.md && echo "✅ README exists" || echo "❌ README missing"
```

**Add to README.md:**
```markdown
## Testing

This package uses TestKit 2.0 for testing.

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run CI tests (bail on first failure)
pnpm test:ci
```

### Test Structure

Tests are co-located with source code in `src/__tests__/` directories.

### Testing Utilities

- **Core utilities**: `@orchestr8/testkit`
- **SQLite testing**: `@orchestr8/testkit/sqlite`
- **HTTP mocking**: `@orchestr8/testkit/msw`
- **File system**: `@orchestr8/testkit/fs`
- **Environment control**: `@orchestr8/testkit/env`

See [TestKit Usage Guide](../../docs/guides/guide-testkit-usage.md) for complete documentation.
```

**Success Criteria:**
- ✅ README updated with testing section
- ✅ Test commands documented
- ✅ Links to guides included

## Post-Installation Verification

After completing all steps, run this verification checklist:

### Automated Verification Script

```bash
#!/bin/bash
# testkit-verify.sh - Automated TestKit installation verification

PACKAGE_PATH="packages/<package-name>"
ERRORS=0

echo "🔍 Verifying TestKit installation for $PACKAGE_PATH"
echo ""

# Check dependencies
echo "📦 Checking dependencies..."
cd "$PACKAGE_PATH"

if pnpm list @orchestr8/testkit > /dev/null 2>&1; then
  echo "  ✅ @orchestr8/testkit installed"
else
  echo "  ❌ @orchestr8/testkit missing"
  ERRORS=$((ERRORS + 1))
fi

if pnpm list vitest > /dev/null 2>&1; then
  echo "  ✅ vitest installed"
else
  echo "  ❌ vitest missing"
  ERRORS=$((ERRORS + 1))
fi

# Check configuration
echo ""
echo "⚙️  Checking configuration..."

if test -f vitest.config.ts; then
  echo "  ✅ vitest.config.ts exists"
else
  echo "  ❌ vitest.config.ts missing"
  ERRORS=$((ERRORS + 1))
fi

# Check test directory
echo ""
echo "📁 Checking test structure..."

if test -d src/__tests__; then
  echo "  ✅ src/__tests__/ directory exists"
else
  echo "  ❌ src/__tests__/ directory missing"
  ERRORS=$((ERRORS + 1))
fi

# Check test scripts
echo ""
echo "📜 Checking package scripts..."

if grep -q '"test":' package.json; then
  echo "  ✅ test script exists"
else
  echo "  ❌ test script missing"
  ERRORS=$((ERRORS + 1))
fi

# Run tests
echo ""
echo "🧪 Running tests..."

if pnpm test:ci > /dev/null 2>&1; then
  echo "  ✅ Tests pass"
else
  echo "  ❌ Tests fail"
  ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
  echo "✅ All checks passed! TestKit is properly installed."
  exit 0
else
  echo "❌ $ERRORS error(s) found. Review installation steps."
  exit 1
fi
```

### Manual Verification Checklist

```bash
# 1. Dependencies installed
pnpm list @orchestr8/testkit vitest

# 2. Config file valid
test -f vitest.config.ts && echo "✅" || echo "❌"

# 3. Test directory exists
test -d src/__tests__ && echo "✅" || echo "❌"

# 4. Scripts work
pnpm test:ci 2>&1 | grep -E "(passed|failed)"

# 5. TestKit imports work
grep -r "from '@orchestr8/testkit" src/__tests__/ | head -5

# 6. No import errors
pnpm test 2>&1 | grep -E "Cannot find module"
```

## Troubleshooting

### Issue: "Cannot find module '@orchestr8/testkit'"

**Cause:** TestKit not installed or wrong path

**Solution:**
```bash
# Check installation
pnpm list @orchestr8/testkit

# Reinstall if missing
pnpm add -D @orchestr8/testkit

# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Issue: "Cannot find module '@orchestr8/testkit/sqlite'"

**Cause:** Missing optional peer dependency

**Solution:**
```bash
# Install required peer dependency
pnpm add -D better-sqlite3

# Verify installation
pnpm list better-sqlite3
```

### Issue: Vitest config errors

**Cause:** Invalid TypeScript or wrong Vitest version

**Solution:**
```bash
# Check Vitest version
pnpm list vitest

# Upgrade if needed
pnpm add -D vitest@^3.2.0

# Validate config
npx tsc --noEmit vitest.config.ts
```

### Issue: Tests don't run

**Cause:** Missing test files or incorrect glob pattern

**Solution:**
```bash
# Check for test files
find src -name "*.test.ts"

# Verify Vitest can find tests
pnpm test --reporter=verbose --bail 1
```

### Issue: Import errors in tests

**Cause:** Wrong import paths or missing dependencies

**Solution:**
```bash
# Check imports in test files
grep -r "from '@orchestr8/testkit" src/__tests__/

# Verify package.json exports
cat node_modules/@orchestr8/testkit/package.json | grep exports -A20
```

## Installation Variations

### New Package (No Tests)

For a completely new package with no existing tests:

```bash
# 1. Navigate to package
cd packages/<package-name>

# 2. Install all dependencies at once
pnpm add -D @orchestr8/testkit vitest better-sqlite3 msw happy-dom

# 3. Create config
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@capture-bridge/<package-name>',
    environment: 'node'
  }
})
EOF

# 4. Add scripts to package.json
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest watch"
npm pkg set scripts.test:ci="vitest run --bail 1"
npm pkg set scripts.test:coverage="vitest run --coverage"

# 5. Create test structure
mkdir -p src/__tests__ test-helpers fixtures

# 6. Create first test
cat > src/__tests__/example.test.ts << 'EOF'
import { describe, it, expect } from 'vitest'

describe('Example', () => {
  it('works', () => {
    expect(true).toBe(true)
  })
})
EOF

# 7. Run tests
pnpm test
```

### Existing Package (Migration)

For a package with existing tests (e.g., Jest):

```bash
# 1. Install TestKit alongside existing test framework
pnpm add -D @orchestr8/testkit vitest

# 2. Create parallel Vitest config (don't remove Jest yet)
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@capture-bridge/<package-name>',
    environment: 'node',
    include: ['src/**/*.vitest.ts']  // Use .vitest.ts for new tests
  }
})
EOF

# 3. Add vitest scripts (keep Jest scripts)
npm pkg set scripts.test:vitest="vitest run"
npm pkg set scripts.test:vitest:watch="vitest watch"

# 4. Create one test with TestKit to verify
cat > src/__tests__/example.vitest.ts << 'EOF'
import { describe, it, expect } from 'vitest'
import { delay } from '@orchestr8/testkit'

describe('TestKit Migration', () => {
  it('works', async () => {
    await delay(1)
    expect(true).toBe(true)
  })
})
EOF

# 5. Run new tests
pnpm test:vitest

# 6. Gradually migrate tests from Jest to Vitest
# 7. Once complete, remove Jest and rename test scripts
```

## Quick Start Commands

### For AI Agents

```bash
# Complete installation in one command block
PACKAGE_NAME="<package-name>"
cd "packages/$PACKAGE_NAME" && \
pnpm add -D @orchestr8/testkit vitest better-sqlite3 msw happy-dom && \
mkdir -p src/__tests__ test-helpers fixtures && \
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    name: '@capture-bridge/<package-name>',
    environment: 'node'
  }
})
EOF
npm pkg set scripts.test="vitest run" && \
npm pkg set scripts.test:watch="vitest watch" && \
npm pkg set scripts.test:ci="vitest run --bail 1" && \
npm pkg set scripts.test:coverage="vitest run --coverage" && \
echo "✅ TestKit installation complete"
```

## Related Documentation

- [TestKit Readiness Verification Plan](./testkit-readiness-verification-plan.md) - Verify TestKit is ready for TDD
- [TestKit Usage Guide](../guides/guide-testkit-usage.md) - Complete API reference
- [TestKit Standardization Guide](../guides/guide-testkit-standardization.md) - Mandatory patterns
- [TDD Applicability Guide](../guides/guide-tdd-applicability.md) - When to use TDD

## Maintenance

### When to Update This Plan

- TestKit version updates require new installation steps
- New optional dependencies are added
- Installation issues are discovered
- Monorepo tooling changes (e.g., pnpm → npm)

### Version Compatibility

- **TestKit**: 2.0.0+
- **Vitest**: 3.2.0+
- **pnpm**: 9.0.0+
- **Node**: 20.x or 22.x

---

**Summary: This plan provides complete, actionable steps for installing TestKit 2.0 in any package, with automated verification and troubleshooting guidance for both AI agents and human developers.**
