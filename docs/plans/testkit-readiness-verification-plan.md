---
title: TestKit 2.0 Readiness Verification Plan
status: approved
owner: Nathan
version: 2.0.0
date: 2025-10-01
doc_type: plan
---

# TestKit 2.0 Readiness Verification Plan

## Purpose

This plan provides comprehensive verification steps to confirm TestKit 2.0 is properly installed, configured, and ready for TDD (Test-Driven Development) workflows. It includes automated checks, manual verification, and troubleshooting guidance designed for autonomous execution by AI agents or manual use by developers.

**Target Audience:** AI agents and developers verifying TestKit setup before beginning TDD workflows.

**Key Goal:** Ensure TestKit 2.0 is fully functional and ready for reliable, fast test execution.

## When to Use This Plan

Use this plan:

- After installing TestKit (see [Installation Plan](./testkit-installation-plan.md))
- Before starting TDD workflows on a new feature
- When troubleshooting test failures
- When experiencing slow test performance
- After upgrading TestKit or dependencies
- When onboarding new team members
- When verifying CI/CD test environment

## Prerequisites

Before running verification:

1. **TestKit installed** - Complete [Installation Plan](./testkit-installation-plan.md) first
2. **Package accessible** - Can navigate to package directory
3. **Terminal access** - Can execute shell commands
4. **Network access** - For MSW/container tests (if applicable)

## Verification Levels

This plan includes three verification levels:

1. **Level 1: Quick Check** (30 seconds) - Essential functionality
2. **Level 2: Standard Check** (2 minutes) - Comprehensive verification
3. **Level 3: Deep Check** (5 minutes) - Full integration testing

Choose the level based on your needs. For TDD readiness, **Level 2** is recommended.

---

## Level 1: Quick Check (Essential)

**Time:** ~30 seconds
**Purpose:** Verify core TestKit is installed and tests can run

### Step 1.1: Dependencies Present

```bash
cd packages/<package-name>

# Check core dependencies
echo "Checking core dependencies..."
pnpm list @orchestr8/testkit vitest 2>&1 | grep -E "(testkit|vitest)" && echo "✅ Core deps OK" || echo "❌ Core deps missing"
```

**Expected Output:**
```
@orchestr8/testkit file:/Users/nathanvale/code/@orchestr8/packages/testkit
vitest 3.2.4
✅ Core deps OK
```

**Success Criteria:**
- ✅ `@orchestr8/testkit` listed
- ✅ `vitest` version 3.2.0+
- ✅ No "not found" errors

### Step 1.2: Config Exists

```bash
# Check for Vitest config
test -f vitest.config.ts && echo "✅ Config exists" || echo "❌ Config missing"

# Validate config syntax
npx tsc --noEmit vitest.config.ts 2>&1 && echo "✅ Config valid" || echo "❌ Config invalid"
```

**Success Criteria:**
- ✅ vitest.config.ts exists
- ✅ No TypeScript errors

### Step 1.3: Tests Run

```bash
# Run tests (even if none exist)
pnpm test:ci 2>&1 | grep -E "(passed|failed|No test files found)" && echo "✅ Test runner works" || echo "❌ Test runner broken"
```

**Expected Output:**
```
No test files found
✅ Test runner works
```
OR
```
Test Files  2 passed (2)
✅ Test runner works
```

**Success Criteria:**
- ✅ Vitest executes without errors
- ✅ Either finds tests or reports "no tests found"

### Quick Check Summary

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Quick Check Results:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
pnpm list @orchestr8/testkit vitest > /dev/null 2>&1 && echo "✅ Dependencies" || echo "❌ Dependencies"
test -f vitest.config.ts && echo "✅ Configuration" || echo "❌ Configuration"
pnpm test:ci > /dev/null 2>&1 && echo "✅ Test runner" || echo "❌ Test runner"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

**If all checks pass:** ✅ Ready for Level 2 verification
**If any check fails:** ❌ Review [Installation Plan](./testkit-installation-plan.md)

---

## Level 2: Standard Check (Comprehensive)

**Time:** ~2 minutes
**Purpose:** Verify all TestKit modules and common patterns work

### Step 2.1: Verify All Dependencies

```bash
cd packages/<package-name>

echo "📦 Dependency Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Core
pnpm list @orchestr8/testkit vitest | grep -E "(testkit|vitest)"

# Optional (check if installed)
echo ""
echo "Optional dependencies:"
pnpm list better-sqlite3 2>/dev/null && echo "  ✅ better-sqlite3 (SQLite testing)" || echo "  ⚠️  better-sqlite3 (not installed)"
pnpm list msw 2>/dev/null && echo "  ✅ msw (HTTP mocking)" || echo "  ⚠️  msw (not installed)"
pnpm list happy-dom 2>/dev/null && echo "  ✅ happy-dom (DOM testing)" || echo "  ⚠️  happy-dom (not installed)"
pnpm list testcontainers 2>/dev/null && echo "  ✅ testcontainers (Container testing)" || echo "  ⚠️  testcontainers (not installed)"
```

**Success Criteria:**
- ✅ Core deps present
- ✅ Expected optional deps present (based on package needs)

### Step 2.2: Verify TestKit Imports

Create and run import verification test:

```bash
cd packages/<package-name>

# Create import test
cat > src/__tests__/__testkit-import-check.test.ts << 'EOF'
/**
 * Import verification test - DO NOT COMMIT
 * Auto-generated by readiness verification plan
 */

import { describe, it, expect } from 'vitest'

describe('TestKit Import Check', () => {
  it('imports core utilities', async () => {
    const { delay, retry, withTimeout, createMockFn } = await import('@orchestr8/testkit')
    expect(typeof delay).toBe('function')
    expect(typeof retry).toBe('function')
    expect(typeof withTimeout).toBe('function')
    expect(typeof createMockFn).toBe('function')
  })

  it('imports env utilities', async () => {
    const { getTestEnvironment, setupTestEnv, useFakeTime } = await import('@orchestr8/testkit/env')
    expect(typeof getTestEnvironment).toBe('function')
    expect(typeof setupTestEnv).toBe('function')
    expect(typeof useFakeTime).toBe('function')
  })

  it('imports fs utilities', async () => {
    const { createTempDirectory, ensureDirectoryExists } = await import('@orchestr8/testkit/fs')
    expect(typeof createTempDirectory).toBe('function')
    expect(typeof ensureDirectoryExists).toBe('function')
  })
})
EOF

# Run import test
pnpm test __testkit-import-check
IMPORT_STATUS=$?

# Cleanup
rm src/__tests__/__testkit-import-check.test.ts

if [ $IMPORT_STATUS -eq 0 ]; then
  echo "✅ All core imports work"
else
  echo "❌ Import errors detected"
fi
```

**Success Criteria:**
- ✅ All import tests pass
- ✅ No "Cannot find module" errors

### Step 2.3: Verify SQLite Testing (If Installed)

```bash
# Check if SQLite is installed
if pnpm list better-sqlite3 > /dev/null 2>&1; then
  echo "🗄️  Verifying SQLite testing..."

  # Create SQLite test
  cat > src/__tests__/__sqlite-check.test.ts << 'EOF'
/**
 * SQLite verification test - DO NOT COMMIT
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import Database from 'better-sqlite3'

describe('SQLite Check', () => {
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

  it('applies recommended pragmas', () => {
    const pragmas = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(pragmas.foreign_keys).toBe(1)
  })
})
EOF

  # Run test
  pnpm test __sqlite-check
  SQLITE_STATUS=$?

  # Cleanup
  rm src/__tests__/__sqlite-check.test.ts

  if [ $SQLITE_STATUS -eq 0 ]; then
    echo "  ✅ SQLite testing ready"
  else
    echo "  ❌ SQLite testing broken"
  fi
else
  echo "⚠️  SQLite not installed (optional)"
fi
```

**Success Criteria:**
- ✅ SQLite tests pass (if installed)
- ✅ In-memory databases work
- ✅ Pragmas apply correctly

### Step 2.4: Verify MSW Testing (If Installed)

```bash
# Check if MSW is installed
if pnpm list msw > /dev/null 2>&1; then
  echo "🌐 Verifying MSW testing..."

  # Create MSW test
  cat > src/__tests__/__msw-check.test.ts << 'EOF'
/**
 * MSW verification test - DO NOT COMMIT
 */

import { describe, it, expect } from 'vitest'
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

const server = setupMSW([
  http.get('https://api.test.com/status', () => {
    return HttpResponse.json({ status: 'ok' })
  })
])

describe('MSW Check', () => {
  it('intercepts HTTP requests', async () => {
    const response = await fetch('https://api.test.com/status')
    const data = await response.json()
    expect(data.status).toBe('ok')
  })
})
EOF

  # Run test
  pnpm test __msw-check
  MSW_STATUS=$?

  # Cleanup
  rm src/__tests__/__msw-check.test.ts

  if [ $MSW_STATUS -eq 0 ]; then
    echo "  ✅ MSW testing ready"
  else
    echo "  ❌ MSW testing broken"
  fi
else
  echo "⚠️  MSW not installed (optional)"
fi
```

**Success Criteria:**
- ✅ MSW tests pass (if installed)
- ✅ HTTP interception works
- ✅ Server lifecycle managed

### Step 2.5: Verify Environment Control

```bash
echo "🌍 Verifying environment control..."

cat > src/__tests__/__env-check.test.ts << 'EOF'
/**
 * Environment control verification - DO NOT COMMIT
 */

import { describe, it, expect } from 'vitest'
import { getTestEnvironment, setupTestEnv, useFakeTime, quickRandom, quickCrypto } from '@orchestr8/testkit/env'

describe('Environment Check', () => {
  it('detects test environment', () => {
    const env = getTestEnvironment()
    expect(env.runner).toBe('vitest')
  })

  it('controls environment variables', () => {
    const restore = setupTestEnv({ TEST_VAR: 'test-value' })
    expect(process.env.TEST_VAR).toBe('test-value')
    restore.restore()
  })

  it('controls time', () => {
    const timeCtrl = useFakeTime(new Date('2023-01-01'))
    expect(Date.now()).toBe(new Date('2023-01-01').getTime())
    timeCtrl.advance(1000)
    expect(Date.now()).toBe(new Date('2023-01-01').getTime() + 1000)
    timeCtrl.restore()
  })

  it('controls randomness', () => {
    const restore = quickRandom.sequence([0.1, 0.5, 0.9])
    expect(Math.random()).toBe(0.1)
    expect(Math.random()).toBe(0.5)
    restore()
  })

  it('controls crypto', () => {
    const restore = quickCrypto.uuid(['test-uuid-1', 'test-uuid-2'])
    expect(crypto.randomUUID()).toBe('test-uuid-1')
    expect(crypto.randomUUID()).toBe('test-uuid-2')
    restore()
  })
})
EOF

# Run test
pnpm test __env-check
ENV_STATUS=$?

# Cleanup
rm src/__tests__/__env-check.test.ts

if [ $ENV_STATUS -eq 0 ]; then
  echo "  ✅ Environment control ready"
else
  echo "  ❌ Environment control broken"
fi
```

**Success Criteria:**
- ✅ Environment detection works
- ✅ Fake timers work
- ✅ Randomness control works
- ✅ Crypto mocking works

### Step 2.6: Verify File System Utilities

```bash
echo "📁 Verifying file system utilities..."

cat > src/__tests__/__fs-check.test.ts << 'EOF'
/**
 * File system verification - DO NOT COMMIT
 */

import { describe, it, expect } from 'vitest'
import { createTempDirectory, ensureDirectoryExists, safePathJoin } from '@orchestr8/testkit/fs'
import * as fs from 'fs/promises'
import * as path from 'path'

describe('File System Check', () => {
  it('creates temp directory', async () => {
    const tempDir = createTempDirectory({ prefix: 'test-' })
    expect(tempDir.path).toContain('test-')

    // Verify directory exists
    const stats = await fs.stat(tempDir.path)
    expect(stats.isDirectory()).toBe(true)
  })

  it('ensures directory exists', async () => {
    const tempDir = createTempDirectory()
    const subDir = path.join(tempDir.path, 'nested', 'deep')

    await ensureDirectoryExists(subDir)

    const stats = await fs.stat(subDir)
    expect(stats.isDirectory()).toBe(true)
  })

  it('safely joins paths', () => {
    const safePath = safePathJoin('/base', 'sub', 'file.txt')
    expect(safePath).toBe('/base/sub/file.txt')
  })
})
EOF

# Run test
pnpm test __fs-check
FS_STATUS=$?

# Cleanup
rm src/__tests__/__fs-check.test.ts

if [ $FS_STATUS -eq 0 ]; then
  echo "  ✅ File system utilities ready"
else
  echo "  ❌ File system utilities broken"
fi
```

**Success Criteria:**
- ✅ Temp directories work
- ✅ Directory creation works
- ✅ Path joining works

### Step 2.7: Verify Test Scripts

```bash
echo "📜 Verifying test scripts..."

# Check scripts exist
echo "Required scripts:"
grep -q '"test":' package.json && echo "  ✅ test" || echo "  ❌ test"
grep -q '"test:watch":' package.json && echo "  ✅ test:watch" || echo "  ❌ test:watch"
grep -q '"test:ci":' package.json && echo "  ✅ test:ci" || echo "  ❌ test:ci"
grep -q '"test:coverage":' package.json && echo "  ✅ test:coverage" || echo "  ❌ test:coverage"

# Test each script
echo ""
echo "Script execution:"
pnpm test:ci > /dev/null 2>&1 && echo "  ✅ test:ci works" || echo "  ❌ test:ci broken"
pnpm test:coverage --run > /dev/null 2>&1 && echo "  ✅ test:coverage works" || echo "  ❌ test:coverage broken"
```

**Success Criteria:**
- ✅ All required scripts present
- ✅ Scripts execute without errors

### Step 2.8: Performance Check

```bash
echo "⚡ Performance check..."

# Measure test execution time
START_TIME=$(date +%s)
pnpm test:ci > /dev/null 2>&1
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "  Test suite completed in ${DURATION}s"

if [ $DURATION -lt 10 ]; then
  echo "  ✅ Performance excellent (<10s)"
elif [ $DURATION -lt 30 ]; then
  echo "  ⚠️  Performance acceptable (10-30s)"
else
  echo "  ❌ Performance poor (>30s)"
fi
```

**Success Criteria:**
- ✅ Tests complete in under 10 seconds (ideal)
- ⚠️ Tests complete in under 30 seconds (acceptable)

### Standard Check Summary

```bash
cat << 'EOF'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Standard Check Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

# Dependencies
pnpm list @orchestr8/testkit vitest > /dev/null 2>&1 && echo "✅ Core dependencies" || echo "❌ Core dependencies"

# Imports
echo "  (Tested with verification tests above)"

# Configuration
test -f vitest.config.ts && echo "✅ Configuration" || echo "❌ Configuration"

# Scripts
grep -q '"test":' package.json && echo "✅ Test scripts" || echo "❌ Test scripts"

# Performance
echo "  (See performance check above)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

**If all checks pass:** ✅ Ready for TDD workflows
**If optional features fail:** ⚠️ Review and install optional dependencies
**If core features fail:** ❌ Review [Troubleshooting](#troubleshooting) section

---

## Level 3: Deep Check (Integration)

**Time:** ~5 minutes
**Purpose:** Verify TestKit works with real-world patterns and edge cases

### Step 3.1: Integration Pattern Test

Create a comprehensive integration test covering multiple TestKit features:

```bash
cd packages/<package-name>

cat > src/__tests__/__integration-check.test.ts << 'EOF'
/**
 * Integration pattern test - DO NOT COMMIT
 * Tests realistic TDD workflow with multiple TestKit features
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import { createTempDirectory } from '@orchestr8/testkit/fs'
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'
import { delay, retry } from '@orchestr8/testkit'
import { useFakeTime } from '@orchestr8/testkit/env'
import Database from 'better-sqlite3'
import * as fs from 'fs/promises'
import * as path from 'path'

// Mock external API
const server = setupMSW([
  http.get('https://api.example.com/data', () => {
    return HttpResponse.json({ value: 42 })
  })
])

describe('Integration Pattern Check', () => {
  let db: Database.Database
  let tempDir: ReturnType<typeof createTempDirectory>

  beforeEach(() => {
    // Setup database
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db)
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')

    // Setup temp directory
    tempDir = createTempDirectory({ prefix: 'integration-' })
  })

  afterEach(() => {
    db.close()
  })

  it('integrates database, file system, and HTTP', async () => {
    // 1. Fetch from API
    const response = await fetch('https://api.example.com/data')
    const apiData = await response.json()
    expect(apiData.value).toBe(42)

    // 2. Store in database
    db.prepare('INSERT INTO test (value) VALUES (?)').run(String(apiData.value))

    // 3. Verify database
    const dbData = db.prepare('SELECT value FROM test').get() as { value: string }
    expect(dbData.value).toBe('42')

    // 4. Write to file
    const filePath = path.join(tempDir.path, 'data.json')
    await fs.writeFile(filePath, JSON.stringify(apiData))

    // 5. Read back from file
    const fileContent = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(fileContent).value).toBe(42)
  })

  it('handles async operations with delays and retries', async () => {
    let attempts = 0

    const result = await retry(
      async () => {
        attempts++
        await delay(10)
        if (attempts < 2) throw new Error('Not ready')
        return 'success'
      },
      3,
      10
    )

    expect(result).toBe('success')
    expect(attempts).toBe(2)
  })

  it('controls time for time-dependent operations', () => {
    const timeCtrl = useFakeTime(new Date('2023-01-01'))

    db.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, created_at TEXT)')
    db.prepare('INSERT INTO events (created_at) VALUES (?)').run(new Date().toISOString())

    timeCtrl.advance(1000 * 60 * 60) // 1 hour

    db.prepare('INSERT INTO events (created_at) VALUES (?)').run(new Date().toISOString())

    const events = db.prepare('SELECT created_at FROM events ORDER BY id').all() as Array<{ created_at: string }>
    expect(events).toHaveLength(2)

    const time1 = new Date(events[0].created_at).getTime()
    const time2 = new Date(events[1].created_at).getTime()
    expect(time2 - time1).toBe(1000 * 60 * 60)

    timeCtrl.restore()
  })
})
EOF

# Run integration test
echo "🔗 Running integration pattern test..."
pnpm test __integration-check
INTEGRATION_STATUS=$?

# Cleanup
rm src/__tests__/__integration-check.test.ts

if [ $INTEGRATION_STATUS -eq 0 ]; then
  echo "  ✅ Integration patterns work"
else
  echo "  ❌ Integration patterns broken"
fi
```

**Success Criteria:**
- ✅ All integration patterns pass
- ✅ Database, file system, and HTTP work together
- ✅ Time control works with database operations

### Step 3.2: Concurrency Test

```bash
echo "⚡ Testing concurrency handling..."

cat > src/__tests__/__concurrency-check.test.ts << 'EOF'
/**
 * Concurrency test - DO NOT COMMIT
 */

import { describe, it, expect } from 'vitest'
import { limitConcurrency, limitedPromiseAll } from '@orchestr8/testkit'
import { delay } from '@orchestr8/testkit'

describe('Concurrency Check', () => {
  it('limits concurrent operations', async () => {
    const operations: number[] = []
    let concurrent = 0
    let maxConcurrent = 0

    const tasks = Array.from({ length: 10 }, (_, i) =>
      limitConcurrency(async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        operations.push(i)
        await delay(10)
        concurrent--
        return i
      }, 3)
    )

    const results = await Promise.all(tasks)

    expect(results).toHaveLength(10)
    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it('batches promises with concurrency limit', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      delay(10).then(() => i)
    )

    const results = await limitedPromiseAll(promises, { maxConcurrent: 3 })

    expect(results).toHaveLength(10)
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})
EOF

pnpm test __concurrency-check
CONCURRENCY_STATUS=$?

rm src/__tests__/__concurrency-check.test.ts

if [ $CONCURRENCY_STATUS -eq 0 ]; then
  echo "  ✅ Concurrency control works"
else
  echo "  ❌ Concurrency control broken"
fi
```

**Success Criteria:**
- ✅ Concurrency limits enforced
- ✅ Batch processing works

### Step 3.3: Resource Cleanup Test

```bash
echo "🧹 Testing resource cleanup..."

cat > src/__tests__/__cleanup-check.test.ts << 'EOF'
/**
 * Resource cleanup test - DO NOT COMMIT
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { registerResource, cleanupAllResources, getResourceStats, ResourceCategory, ResourcePriority } from '@orchestr8/testkit'

describe('Cleanup Check', () => {
  beforeEach(() => {
    // Clear any existing resources
    cleanupAllResources()
  })

  it('registers and cleans up resources', async () => {
    let cleaned = false

    registerResource('test-resource', () => {
      cleaned = true
    }, {
      category: ResourceCategory.OTHER,
      priority: ResourcePriority.NORMAL
    })

    const statsBefore = getResourceStats()
    expect(statsBefore.active).toBeGreaterThan(0)

    await cleanupAllResources()

    expect(cleaned).toBe(true)

    const statsAfter = getResourceStats()
    expect(statsAfter.active).toBe(0)
  })
})
EOF

pnpm test __cleanup-check
CLEANUP_STATUS=$?

rm src/__tests__/__cleanup-check.test.ts

if [ $CLEANUP_STATUS -eq 0 ]; then
  echo "  ✅ Resource cleanup works"
else
  echo "  ❌ Resource cleanup broken"
fi
```

**Success Criteria:**
- ✅ Resource registration works
- ✅ Cleanup executes properly

### Step 3.4: Security Validation Test

```bash
echo "🔒 Testing security validation..."

cat > src/__tests__/__security-check.test.ts << 'EOF'
/**
 * Security validation test - DO NOT COMMIT
 */

import { describe, it, expect } from 'vitest'
import { validateCommand, sanitizeCommand, validatePath, sanitizeSqlIdentifier, escapeShellArg } from '@orchestr8/testkit'

describe('Security Check', () => {
  it('validates commands', () => {
    expect(() => validateCommand('echo hello')).not.toThrow()
    expect(() => validateCommand('rm -rf /')).toThrow()
  })

  it('sanitizes commands', () => {
    const sanitized = sanitizeCommand('echo "test; rm -rf /"')
    expect(sanitized).toContain('\\;')
  })

  it('validates paths', () => {
    const safe = validatePath('/tmp/test', 'file.txt')
    expect(safe).toBe('/tmp/test/file.txt')

    expect(() => validatePath('/tmp/test', '../../../etc/passwd')).toThrow()
  })

  it('sanitizes SQL identifiers', () => {
    const safe = sanitizeSqlIdentifier('user_table')
    expect(safe).toBe('user_table')

    expect(() => sanitizeSqlIdentifier('table; DROP TABLE users;')).toThrow()
  })

  it('escapes shell arguments', () => {
    const escaped = escapeShellArg('hello world; rm -rf /')
    expect(escaped).toContain("'")
  })
})
EOF

pnpm test __security-check
SECURITY_STATUS=$?

rm src/__tests__/__security-check.test.ts

if [ $SECURITY_STATUS -eq 0 ]; then
  echo "  ✅ Security validation works"
else
  echo "  ❌ Security validation broken"
fi
```

**Success Criteria:**
- ✅ Command validation works
- ✅ Path validation works
- ✅ SQL sanitization works

### Deep Check Summary

```bash
cat << 'EOF'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Deep Check Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

echo "(Check individual test results above)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

---

## TDD Readiness Checklist

Use this checklist to confirm TestKit is ready for TDD workflows:

### Core Functionality
- [ ] ✅ TestKit installed and importable
- [ ] ✅ Vitest 3.2.0+ installed
- [ ] ✅ vitest.config.ts exists and valid
- [ ] ✅ Test scripts work (test, test:watch, test:ci)
- [ ] ✅ Tests can run (even if none exist)

### Essential Utilities
- [ ] ✅ Core utilities work (delay, retry, withTimeout)
- [ ] ✅ Environment control works (getTestEnvironment, setupTestEnv)
- [ ] ✅ File system utilities work (createTempDirectory)
- [ ] ✅ Time control works (useFakeTime)
- [ ] ✅ Randomness control works (quickRandom, quickCrypto)

### Optional Features (Based on Needs)
- [ ] ⚠️ SQLite testing works (if using database)
- [ ] ⚠️ MSW testing works (if mocking HTTP)
- [ ] ⚠️ Container testing works (if using containers)

### Performance & Quality
- [ ] ✅ Tests complete in under 30 seconds
- [ ] ✅ No import errors in test files
- [ ] ✅ No security validation errors
- [ ] ✅ Resource cleanup works properly

### Documentation
- [ ] ✅ README has testing section
- [ ] ✅ Test commands documented
- [ ] ✅ Links to guides included

## Automated Verification Script

Complete verification script for AI agents:

```bash
#!/bin/bash
# testkit-readiness.sh - Complete TestKit readiness verification

set -e

PACKAGE_PATH="${1:-packages/foundation}"
LEVEL="${2:-2}"  # Default to Level 2 (standard)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TestKit 2.0 Readiness Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Package: $PACKAGE_PATH"
echo "Level: $LEVEL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PACKAGE_PATH"

ERRORS=0
WARNINGS=0

# Level 1: Quick Check
echo "📋 Level 1: Quick Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Dependencies
if pnpm list @orchestr8/testkit vitest > /dev/null 2>&1; then
  echo "✅ Core dependencies installed"
else
  echo "❌ Core dependencies missing"
  ERRORS=$((ERRORS + 1))
fi

# Config
if test -f vitest.config.ts; then
  echo "✅ Vitest config exists"
else
  echo "❌ Vitest config missing"
  ERRORS=$((ERRORS + 1))
fi

# Test runner
if pnpm test:ci > /dev/null 2>&1; then
  echo "✅ Test runner works"
else
  echo "❌ Test runner broken"
  ERRORS=$((ERRORS + 1))
fi

echo ""

if [ $LEVEL -ge 2 ]; then
  echo "📋 Level 2: Standard Check"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Optional dependencies
  if pnpm list better-sqlite3 > /dev/null 2>&1; then
    echo "✅ SQLite support available"
  else
    echo "⚠️  SQLite not installed (optional)"
    WARNINGS=$((WARNINGS + 1))
  fi

  if pnpm list msw > /dev/null 2>&1; then
    echo "✅ MSW support available"
  else
    echo "⚠️  MSW not installed (optional)"
    WARNINGS=$((WARNINGS + 1))
  fi

  # Test scripts
  if grep -q '"test:watch":' package.json; then
    echo "✅ All test scripts present"
  else
    echo "❌ Missing test scripts"
    ERRORS=$((ERRORS + 1))
  fi

  # Performance
  START_TIME=$(date +%s)
  pnpm test:ci > /dev/null 2>&1
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  if [ $DURATION -lt 30 ]; then
    echo "✅ Performance acceptable (${DURATION}s)"
  else
    echo "⚠️  Performance slow (${DURATION}s)"
    WARNINGS=$((WARNINGS + 1))
  fi

  echo ""
fi

if [ $LEVEL -ge 3 ]; then
  echo "📋 Level 3: Deep Check"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "(Run integration tests manually - see plan)"
  echo ""
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -eq 0 ]; then
  echo "✅ TestKit is ready for TDD workflows!"
  echo ""
  echo "Next steps:"
  echo "1. Start writing tests: pnpm test:watch"
  echo "2. Follow TDD workflow: Red → Green → Refactor"
  echo "3. See: docs/guides/guide-testkit-usage.md"
  exit 0
else
  echo "❌ TestKit setup incomplete. Fix errors above."
  echo ""
  echo "Troubleshooting:"
  echo "1. Review: docs/plans/testkit-installation-plan.md"
  echo "2. Check: docs/plans/testkit-readiness-verification-plan.md#troubleshooting"
  exit 1
fi
```

**Usage:**
```bash
# Quick check
./testkit-readiness.sh packages/foundation 1

# Standard check (recommended)
./testkit-readiness.sh packages/foundation 2

# Deep check
./testkit-readiness.sh packages/foundation 3
```

## Troubleshooting

### Import Errors

**Symptom:** "Cannot find module '@orchestr8/testkit'"

**Diagnosis:**
```bash
# Check installation
pnpm list @orchestr8/testkit

# Check node_modules
ls -la node_modules/@orchestr8/testkit
```

**Solution:**
```bash
# Reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Optional Module Errors

**Symptom:** "Cannot find module '@orchestr8/testkit/sqlite'"

**Diagnosis:**
```bash
# Check if peer dependency installed
pnpm list better-sqlite3
```

**Solution:**
```bash
# Install missing peer dependency
pnpm add -D better-sqlite3
```

### Test Runner Failures

**Symptom:** Tests don't run or crash

**Diagnosis:**
```bash
# Check Vitest version
pnpm list vitest

# Validate config
npx tsc --noEmit vitest.config.ts

# Run with debug
pnpm test --reporter=verbose --bail 1
```

**Solution:**
```bash
# Upgrade Vitest
pnpm add -D vitest@^3.2.0

# Fix config errors
# Review vitest.config.ts
```

### Performance Issues

**Symptom:** Tests run slowly (>30s)

**Diagnosis:**
```bash
# Profile tests
pnpm test --reporter=verbose --silent=false

# Check for slow tests
pnpm test --reporter=verbose | grep -E "[0-9]+ms" | sort -n
```

**Solution:**
1. Use in-memory databases (not file-based)
2. Use fake timers instead of real delays
3. Limit concurrency for I/O operations
4. Review test setup/teardown overhead

### SQLite Issues

**Symptom:** Database locked or constraint errors

**Diagnosis:**
```bash
# Check SQLite version
pnpm list better-sqlite3

# Verify memory URLs used
grep -r "createMemoryUrl" src/__tests__/
```

**Solution:**
```bash
# Always use memory URLs
# Always close databases in afterEach
# Apply recommended pragmas
```

### MSW Issues

**Symptom:** HTTP requests not intercepted

**Diagnosis:**
```bash
# Check MSW version
pnpm list msw

# Verify server setup
grep -r "setupMSW" src/__tests__/
```

**Solution:**
```bash
# Use MSW v2 API (http.* not rest.*)
# Verify server lifecycle
# Check handler patterns
```

## Quick Reference

### Minimum Requirements

```bash
# Dependencies
@orchestr8/testkit: latest
vitest: ^3.2.0

# Files
vitest.config.ts: required
src/__tests__/: required

# Scripts
test: required
test:watch: required
test:ci: required
```

### Common Issues

| Issue | Quick Fix |
|-------|-----------|
| Import error | `pnpm install` |
| Module not found | Install peer dependency |
| Tests don't run | Check vitest.config.ts |
| Slow tests | Use memory DBs, fake timers |
| Database locked | Use memory URLs |
| HTTP not mocked | Verify MSW setup |

## Related Documentation

- [TestKit Installation Plan](./testkit-installation-plan.md) - Install TestKit first
- [TestKit Usage Guide](../guides/guide-testkit-usage.md) - Complete API reference
- [TestKit Standardization Guide](../guides/guide-testkit-standardization.md) - Mandatory patterns
- [TDD Applicability Guide](../guides/guide-tdd-applicability.md) - When to use TDD

## Maintenance

### When to Update This Plan

- TestKit API changes
- New verification checks needed
- Common issues discovered
- Performance benchmarks change

### Version Compatibility

- **TestKit**: 2.0.0+
- **Vitest**: 3.2.0+
- **better-sqlite3**: 12.0.0+
- **msw**: 2.0.0+

---

**Summary: This plan provides complete verification of TestKit readiness with three levels of depth, automated scripts, and comprehensive troubleshooting for both AI agents and human developers.**
