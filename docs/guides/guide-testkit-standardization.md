---
title: TestKit 2.0 Standardization Guide
status: approved
owner: Nathan
version: 2.0.0
date: 2025-10-01
doc_type: guide
---

# TestKit 2.0 Standardization Guide

## Purpose

This guide establishes **mandatory standardization patterns** for using TestKit 2.0 (`@orchestr8/testkit`) across all packages in the ADHD Brain monorepo. It defines consistent test structure, naming conventions, import patterns, and best practices to ensure maintainable, reliable, and AI agent-friendly test code.

**Target Audience:** All developers and AI agents writing tests in the monorepo.

**Key Goal:** Achieve 100% consistency in test patterns, eliminate custom mock implementations, and create self-documenting test code that both humans and AI agents can quickly understand and maintain.

## When to Use This Guide

Use this guide when:

- Writing ANY new test file in the monorepo
- Reviewing test code during pull requests
- Refactoring existing tests to TestKit 2.0 standards
- Creating shared test utilities or fixtures
- Debugging test failures or flaky tests
- Training AI agents on test patterns
- Onboarding new developers to testing practices

**Mandatory Application:**

- ✅ All new test files MUST follow these patterns
- ✅ All custom mock implementations MUST be replaced with TestKit utilities
- ✅ All test file names MUST follow naming conventions
- ✅ All imports MUST follow standard import patterns
- ✅ All test structure MUST follow standard organization

## Prerequisites

**Required Installation:**

```bash
# Core testkit (always required)
pnpm add -D @orchestr8/testkit vitest

# Optional dependencies (install as needed)
pnpm add -D better-sqlite3       # For SQLite testing
pnpm add -D msw                  # For HTTP mocking
pnpm add -D testcontainers       # For container testing
pnpm add -D convex-test          # For Convex testing
```

**Required Knowledge:**

- Basic Vitest test structure (`describe`, `it`, `expect`)
- TypeScript fundamentals
- Understanding of test doubles (mocks, stubs, fakes)

**Related Documentation:**

- [TestKit Usage Guide](./guide-testkit-usage.md) - Complete API reference
- [TestKit Migration Guide](./guide-testkit-migration.md) - Migrating from v1
- [TDD Applicability Guide](./guide-tdd-applicability.md) - When to use TDD
- [Test Strategy Guide](./guide-test-strategy.md) - Overall testing approach

## Quick Reference

### Standard Test File Structure

```typescript
// 1. IMPORTS (Ordered: External → TestKit → Internal)
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import Database from 'better-sqlite3'
import { UserRepository } from '../user-repository'

// 2. CONSTANTS
const SCHEMA_SQL = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  )
`

// 3. TEST SUITE
describe('UserRepository', () => {
  // 4. SETUP/TEARDOWN
  let db: Database.Database

  beforeEach(() => {
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db)
    db.exec(SCHEMA_SQL)
  })

  afterEach(() => {
    db.close()
  })

  // 5. TEST GROUPS (Optional)
  describe('create()', () => {
    // 6. TEST CASES
    it('creates user with valid data', () => {
      const repo = new UserRepository(db)
      const user = repo.create({ email: 'alice@example.com', name: 'Alice' })

      expect(user.id).toBeDefined()
      expect(user.email).toBe('alice@example.com')
      expect(user.name).toBe('Alice')
    })

    it('throws on duplicate email', () => {
      const repo = new UserRepository(db)
      repo.create({ email: 'alice@example.com', name: 'Alice' })

      expect(() => {
        repo.create({ email: 'alice@example.com', name: 'Alice Again' })
      }).toThrow('UNIQUE constraint failed')
    })
  })
})
```

### Standard Import Patterns

```typescript
// ✅ CORRECT: Modular imports from TestKit sub-exports
import { delay, retry, withTimeout } from '@orchestr8/testkit'
import { getTestEnvironment, setupTestEnv } from '@orchestr8/testkit/env'
import { createTempDirectory } from '@orchestr8/testkit/fs'
import { createMemoryUrl, createSQLitePool } from '@orchestr8/testkit/sqlite'
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'
import { spawnUtils } from '@orchestr8/testkit/cli'

// ❌ WRONG: Non-existent barrel imports
import { everything } from '@orchestr8/testkit'  // Doesn't work
import * as testkit from '@orchestr8/testkit'     // Doesn't work
```

### Naming Conventions

```typescript
// ✅ Test file naming
src/user-repository.ts          → __tests__/user-repository.test.ts
src/utils/validation.ts         → __tests__/validation.test.ts
src/services/email-service.ts   → __tests__/email-service.test.ts

// ✅ Test suite naming (matches file/class/function)
describe('UserRepository', () => {})      // For classes
describe('validateEmail', () => {})       // For functions
describe('Email Service', () => {})       // For modules/services

// ✅ Test case naming (clear, descriptive, behavior-focused)
it('creates user with valid data', () => {})
it('throws on invalid email format', () => {})
it('returns cached result on second call', () => {})
it('handles network timeout gracefully', () => {})

// ❌ WRONG: Vague or implementation-focused names
it('works', () => {})
it('test case 1', () => {})
it('calls database.insert', () => {})
```

### Setup/Teardown Patterns

```typescript
// ✅ CORRECT: Resources created in beforeEach, cleaned in afterEach
describe('DatabaseService', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db)
    db.exec(SCHEMA_SQL)
  })

  afterEach(() => {
    db.close()
  })

  it('performs operations', () => {
    // Test with isolated database
  })
})

// ❌ WRONG: Shared state without cleanup
describe('DatabaseService', () => {
  const db = new Database(':memory:')  // Shared across tests

  it('test 1', () => {})
  it('test 2', () => {})  // May see data from test 1
})
```

## File Organization Standards

### Test File Location

```
src/
├── user-repository.ts
├── validation.ts
└── __tests__/
    ├── user-repository.test.ts    ✅ Co-located with source
    └── validation.test.ts
```

**Rules:**

- Place test files in `__tests__/` directory adjacent to source code
- Use `.test.ts` suffix (NOT `.spec.ts`)
- Mirror source file name exactly: `user-repository.ts` → `user-repository.test.ts`

### Fixture Organization

```
packages/testkit/fixtures/
├── README.md                       # Documentation of fixtures
├── database/
│   ├── schemas/
│   │   ├── user-schema.sql
│   │   └── capture-schema.sql
│   └── seed-data/
│       ├── users.json
│       └── captures.json
├── files/
│   ├── sample.txt
│   └── config.json
└── http/
    ├── auth-responses.json
    └── api-responses.json
```

**Rules:**

- Shared fixtures go in `packages/testkit/fixtures/`
- Package-specific fixtures go in `packages/<name>/fixtures/`
- Group by resource type (database, files, http)
- Document fixture purpose in README

### Helper Organization

```
packages/testkit/helpers/
├── README.md                       # Documentation of helpers
├── database.ts                     # Database setup helpers
├── filesystem.ts                   # File system helpers
├── assertions.ts                   # Custom assertions
└── builders.ts                     # Test data builders
```

**Rules:**

- Shared helpers go in `packages/testkit/helpers/`
- Package-specific helpers go in `packages/<name>/test-helpers/`
- One helper module per concern
- Export named functions (no default exports)

## Import Pattern Standards

### Standard Import Order

```typescript
// 1. External dependencies (test framework)
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// 2. External dependencies (runtime)
import Database from 'better-sqlite3'
import { http, HttpResponse } from 'msw'

// 3. TestKit utilities (core)
import { delay, retry } from '@orchestr8/testkit'

// 4. TestKit utilities (sub-exports)
import { createMemoryUrl } from '@orchestr8/testkit/sqlite'
import { createTempDirectory } from '@orchestr8/testkit/fs'
import { setupMSW } from '@orchestr8/testkit/msw'

// 5. Internal imports (source code under test)
import { UserRepository } from '../user-repository'
import { validateEmail } from '../validation'

// 6. Internal imports (test utilities)
import { createUserFixture } from './test-helpers/builders'
```

### TestKit Module Imports

```typescript
// ✅ CORRECT: Import from specific sub-exports
import { delay, retry, withTimeout } from '@orchestr8/testkit'
import { getTestEnvironment, setupTestEnv, useFakeTime } from '@orchestr8/testkit/env'
import { createTempDirectory, ensureDirectoryExists } from '@orchestr8/testkit/fs'
import { createMemoryUrl, createSQLitePool } from '@orchestr8/testkit/sqlite'
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'
import { spawnUtils, createProcessMock } from '@orchestr8/testkit/cli'
import { createPostgreSQLContext } from '@orchestr8/testkit/containers'
import { createConvexTestHarness } from '@orchestr8/testkit/convex'

// ❌ WRONG: Incorrect import patterns
import testkit from '@orchestr8/testkit'                    // No default export
import * as testkit from '@orchestr8/testkit'               // Don't use namespace
import { setupMSW } from '@orchestr8/testkit'               // Wrong - use /msw
import { everything } from '@orchestr8/testkit'             // Doesn't exist
```

## Test Structure Standards

### Standard Test File Template

```typescript
/**
 * @file user-repository.test.ts
 * @description Tests for UserRepository class
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import Database from 'better-sqlite3'
import { UserRepository } from '../user-repository'

// Test constants
const SCHEMA_SQL = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  )
`

describe('UserRepository', () => {
  let db: Database.Database
  let repo: UserRepository

  beforeEach(() => {
    // Setup: Create isolated resources
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db)
    db.exec(SCHEMA_SQL)
    repo = new UserRepository(db)
  })

  afterEach(() => {
    // Teardown: Clean up resources
    db.close()
  })

  describe('create()', () => {
    it('creates user with valid data', () => {
      const user = repo.create({
        email: 'alice@example.com',
        name: 'Alice'
      })

      expect(user.id).toBeDefined()
      expect(user.email).toBe('alice@example.com')
      expect(user.name).toBe('Alice')
    })

    it('throws on duplicate email', () => {
      repo.create({ email: 'alice@example.com', name: 'Alice' })

      expect(() => {
        repo.create({ email: 'alice@example.com', name: 'Bob' })
      }).toThrow('UNIQUE constraint failed')
    })

    it('validates email format', () => {
      expect(() => {
        repo.create({ email: 'invalid-email', name: 'Alice' })
      }).toThrow('Invalid email format')
    })
  })

  describe('findByEmail()', () => {
    it('returns user when found', () => {
      repo.create({ email: 'alice@example.com', name: 'Alice' })

      const user = repo.findByEmail('alice@example.com')

      expect(user).toBeDefined()
      expect(user?.email).toBe('alice@example.com')
    })

    it('returns null when not found', () => {
      const user = repo.findByEmail('nonexistent@example.com')

      expect(user).toBeNull()
    })
  })
})
```

### Nested Describe Blocks

```typescript
// ✅ CORRECT: Logical grouping with clear hierarchy
describe('EmailService', () => {
  describe('sendEmail()', () => {
    describe('with valid recipient', () => {
      it('sends email successfully', () => {})
      it('returns message ID', () => {})
    })

    describe('with invalid recipient', () => {
      it('throws validation error', () => {})
      it('does not send email', () => {})
    })

    describe('when network fails', () => {
      it('retries up to 3 times', () => {})
      it('throws after max retries', () => {})
    })
  })

  describe('validateRecipient()', () => {
    it('accepts valid email', () => {})
    it('rejects invalid email', () => {})
  })
})

// ❌ WRONG: Too deeply nested or poorly organized
describe('EmailService', () => {
  describe('sendEmail', () => {
    describe('when', () => {
      describe('the recipient', () => {
        describe('is valid', () => {
          it('works', () => {})  // Too deep!
        })
      })
    })
  })
})
```

### Test Case Naming

```typescript
// ✅ CORRECT: Behavior-focused, clear, specific
it('creates user with valid data', () => {})
it('throws on duplicate email address', () => {})
it('returns cached result on subsequent calls', () => {})
it('retries failed requests up to 3 times', () => {})
it('handles network timeout gracefully', () => {})
it('validates email format before saving', () => {})

// ❌ WRONG: Vague, implementation-focused, unclear
it('works correctly', () => {})
it('test 1', () => {})
it('should work', () => {})
it('calls database.insert()', () => {})  // Too implementation-focused
it('returns true', () => {})  // What does true mean?
```

## Mock Configuration Standards

### Database Mocking

```typescript
// ✅ CORRECT: TestKit SQLite with recommended pragmas
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import Database from 'better-sqlite3'

describe('DatabaseService', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db, {
      journalMode: 'WAL',
      foreignKeys: true,
      busyTimeoutMs: 5000
    })

    // Apply schema
    db.exec(SCHEMA_SQL)
  })

  afterEach(() => {
    db.close()
  })

  it('performs database operations', () => {
    // Real SQLite behavior with constraints
  })
})

// ❌ WRONG: Custom database mocks
const mockDB = {
  query: vi.fn(),
  insert: vi.fn(),
  close: vi.fn()
}  // Unrealistic behavior, no constraints
```

### File System Mocking

```typescript
// ✅ CORRECT: TestKit temporary directories
import { createTempDirectory } from '@orchestr8/testkit/fs'
import * as fs from 'fs/promises'
import * as path from 'path'

describe('FileService', () => {
  let tempDir: ReturnType<typeof createTempDirectory>

  beforeEach(() => {
    tempDir = createTempDirectory({ prefix: 'test-' })
  })

  afterEach(async () => {
    // Cleanup happens automatically
  })

  it('writes file atomically', async () => {
    const filePath = path.join(tempDir.path, 'test.txt')
    await fs.writeFile(filePath, 'content')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('content')
  })
})

// ❌ WRONG: Custom file system mocks
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn()
}))  // Unrealistic behavior
```

### HTTP Mocking

```typescript
// ✅ CORRECT: MSW with TestKit setup
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

const server = setupMSW([
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ])
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json(
      { id: 3, ...body },
      { status: 201 }
    )
  })
])

describe('UserService', () => {
  it('fetches users from API', async () => {
    const service = new UserService('https://api.example.com')
    const users = await service.getUsers()

    expect(users).toHaveLength(2)
    expect(users[0].name).toBe('Alice')
  })
})

// ❌ WRONG: Custom HTTP mocks
vi.mock('axios', () => ({
  get: vi.fn(),
  post: vi.fn()
}))  // Unrealistic behavior
```

### Time Mocking

```typescript
// ✅ CORRECT: TestKit fake timers
import { useFakeTime } from '@orchestr8/testkit/env'

describe('CacheService', () => {
  it('expires cached values after TTL', () => {
    const timeCtrl = useFakeTime(new Date('2023-01-01'))
    const cache = new CacheService({ ttl: 5000 })

    cache.set('key', 'value')
    expect(cache.get('key')).toBe('value')

    timeCtrl.advance(6000)
    expect(cache.get('key')).toBeUndefined()

    timeCtrl.restore()
  })
})

// ❌ WRONG: Real delays or custom time mocks
it('expires after 5 seconds', async () => {
  cache.set('key', 'value')
  await new Promise(resolve => setTimeout(resolve, 5000))  // Slow!
  expect(cache.get('key')).toBeUndefined()
})
```

### Randomness Mocking

```typescript
// ✅ CORRECT: TestKit randomness control
import { quickRandom, quickCrypto } from '@orchestr8/testkit/env'

describe('IDGenerator', () => {
  it('generates deterministic IDs', () => {
    const restore = quickCrypto.uuid([
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001'
    ])

    const gen = new IDGenerator()
    expect(gen.generate()).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(gen.generate()).toBe('550e8400-e29b-41d4-a716-446655440001')

    restore()
  })

  it('generates deterministic random numbers', () => {
    const restore = quickRandom.sequence([0.1, 0.5, 0.9])

    expect(Math.random()).toBe(0.1)
    expect(Math.random()).toBe(0.5)
    expect(Math.random()).toBe(0.9)

    restore()
  })
})

// ❌ WRONG: Custom crypto/random mocks
vi.spyOn(crypto, 'randomUUID').mockReturnValue('fake-uuid')  // Fragile
```

## Assertion Standards

### Standard Assertions

```typescript
// ✅ CORRECT: Specific, meaningful assertions
expect(user.id).toBeDefined()
expect(user.email).toBe('alice@example.com')
expect(users).toHaveLength(2)
expect(result).toEqual({ success: true, data: expectedData })
expect(() => service.create(invalid)).toThrow('Invalid email')
expect(cache.get('key')).toBeNull()
expect(promise).rejects.toThrow('Network error')

// ❌ WRONG: Vague or weak assertions
expect(user).toBeTruthy()  // What exactly is true?
expect(result).toBeDefined()  // But is it correct?
expect(users.length > 0).toBe(true)  // Use toHaveLength
```

### Custom Assertions

```typescript
// ✅ CORRECT: Create reusable custom assertions
// packages/testkit/helpers/assertions.ts
export function expectValidEmail(email: string) {
  expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
}

export function expectValidUUID(uuid: string) {
  expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
}

export function expectDatabaseRow(
  db: Database.Database,
  table: string,
  where: Record<string, unknown>
) {
  const conditions = Object.entries(where)
    .map(([key]) => `${key} = ?`)
    .join(' AND ')
  const values = Object.values(where)

  const row = db.prepare(`SELECT * FROM ${table} WHERE ${conditions}`).get(...values)
  expect(row).toBeDefined()
  return row
}

// Usage in tests
import { expectValidEmail, expectDatabaseRow } from '@orchestr8/testkit/helpers/assertions'

it('creates user with valid email', () => {
  const user = repo.create({ email: 'alice@example.com', name: 'Alice' })

  expectValidEmail(user.email)
  expectDatabaseRow(db, 'users', { email: 'alice@example.com' })
})
```

## Documentation Standards

### File-Level Documentation

```typescript
/**
 * @file user-repository.test.ts
 * @description Tests for UserRepository class covering CRUD operations,
 * validation, and error handling. Uses TestKit SQLite for database isolation.
 *
 * @see {@link UserRepository} - Implementation under test
 * @see {@link guide-testkit-usage.md} - TestKit patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// ... rest of imports
```

### Test Suite Documentation

```typescript
/**
 * UserRepository test suite
 *
 * Covers:
 * - CRUD operations (create, read, update, delete)
 * - Email validation and uniqueness constraints
 * - Error handling for invalid data
 * - Database transaction behavior
 */
describe('UserRepository', () => {
  // ... tests
})
```

### Complex Test Case Documentation

```typescript
/**
 * Tests atomic transaction behavior when creating multiple users.
 * Ensures that if any user creation fails, the entire transaction
 * is rolled back and no users are persisted.
 */
it('rolls back transaction on any failure', async () => {
  await withSQLiteTransaction(db, async (tx) => {
    tx.run('INSERT INTO users (email, name) VALUES (?, ?)', 'alice@example.com', 'Alice')

    // This should fail due to invalid email
    expect(() => {
      tx.run('INSERT INTO users (email, name) VALUES (?, ?)', 'invalid', 'Bob')
    }).toThrow()
  })

  // Verify rollback - no users should exist
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
  expect(count.count).toBe(0)
})
```

### Setup/Teardown Documentation

```typescript
describe('EmailService', () => {
  let db: Database.Database
  let tempDir: ReturnType<typeof createTempDirectory>
  let server: ReturnType<typeof setupMSW>

  /**
   * Setup: Create isolated test environment
   * - In-memory SQLite database with schema
   * - Temporary directory for email attachments
   * - MSW server for mocking SMTP API
   */
  beforeEach(() => {
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db)
    db.exec(EMAIL_SCHEMA)

    tempDir = createTempDirectory({ prefix: 'email-test-' })

    server = setupMSW([
      http.post('https://api.smtp.com/send', () => {
        return HttpResponse.json({ messageId: 'test-123' })
      })
    ])
  })

  /**
   * Teardown: Clean up all test resources
   */
  afterEach(() => {
    db.close()
    // tempDir cleanup happens automatically
    // server cleanup happens automatically
  })
})
```

## Anti-Patterns to Avoid

### ❌ Custom Mock Implementations

```typescript
// ❌ WRONG: Custom database mock
const mockDB = {
  query: vi.fn(),
  insert: vi.fn(),
  close: vi.fn()
}

// ✅ CORRECT: TestKit SQLite
const db = new Database(createMemoryUrl('raw'))
```

### ❌ Shared Test State

```typescript
// ❌ WRONG: Shared database across tests
const db = new Database(':memory:')

describe('UserRepository', () => {
  it('test 1', () => {
    // Modifies shared db
  })

  it('test 2', () => {
    // May see data from test 1
  })
})

// ✅ CORRECT: Isolated database per test
describe('UserRepository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(createMemoryUrl('raw'))
  })

  afterEach(() => {
    db.close()
  })
})
```

### ❌ Missing Cleanup

```typescript
// ❌ WRONG: Resources not cleaned up
beforeEach(() => {
  db = setupDatabase()
  tempDir = createTempDirectory()
  // Missing afterEach cleanup!
})

// ✅ CORRECT: Always clean up
beforeEach(() => {
  db = setupDatabase()
  tempDir = createTempDirectory()
})

afterEach(() => {
  db.close()
  // tempDir cleanup automatic
})
```

### ❌ Implementation-Focused Tests

```typescript
// ❌ WRONG: Testing implementation details
it('calls database.insert()', () => {
  const spy = vi.spyOn(db, 'insert')
  repo.create({ email: 'test@example.com', name: 'Test' })
  expect(spy).toHaveBeenCalled()
})

// ✅ CORRECT: Testing behavior
it('creates user with valid data', () => {
  const user = repo.create({ email: 'test@example.com', name: 'Test' })
  expect(user.id).toBeDefined()
  expect(user.email).toBe('test@example.com')
})
```

### ❌ Vague Test Names

```typescript
// ❌ WRONG: Vague or meaningless names
it('works', () => {})
it('test 1', () => {})
it('should do something', () => {})

// ✅ CORRECT: Clear, specific names
it('creates user with valid email', () => {})
it('throws on duplicate email address', () => {})
it('returns null when user not found', () => {})
```

### ❌ Too Many Assertions

```typescript
// ❌ WRONG: Testing multiple behaviors in one test
it('handles all user operations', () => {
  const user = repo.create({ email: 'test@example.com', name: 'Test' })
  expect(user.id).toBeDefined()

  const found = repo.findById(user.id)
  expect(found).toBeDefined()

  repo.update(user.id, { name: 'Updated' })
  expect(repo.findById(user.id)?.name).toBe('Updated')

  repo.delete(user.id)
  expect(repo.findById(user.id)).toBeNull()
})

// ✅ CORRECT: One behavior per test
it('creates user with valid data', () => {
  const user = repo.create({ email: 'test@example.com', name: 'Test' })
  expect(user.id).toBeDefined()
})

it('finds user by ID', () => {
  const user = repo.create({ email: 'test@example.com', name: 'Test' })
  const found = repo.findById(user.id)
  expect(found).toBeDefined()
})

it('updates user name', () => {
  const user = repo.create({ email: 'test@example.com', name: 'Test' })
  repo.update(user.id, { name: 'Updated' })
  expect(repo.findById(user.id)?.name).toBe('Updated')
})
```

## Common Patterns

### Database Testing Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryUrl, applyRecommendedPragmas, withSQLiteTransaction } from '@orchestr8/testkit/sqlite'
import Database from 'better-sqlite3'

const SCHEMA_SQL = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`

describe('UserRepository', () => {
  let db: Database.Database
  let repo: UserRepository

  beforeEach(() => {
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db, {
      journalMode: 'WAL',
      foreignKeys: true
    })
    db.exec(SCHEMA_SQL)
    repo = new UserRepository(db)
  })

  afterEach(() => {
    db.close()
  })

  it('creates user with auto-generated ID', () => {
    const user = repo.create({
      email: 'alice@example.com',
      name: 'Alice'
    })

    expect(user.id).toBeGreaterThan(0)
    expect(user.email).toBe('alice@example.com')
    expect(user.created_at).toBeDefined()
  })

  it('enforces unique email constraint', () => {
    repo.create({ email: 'alice@example.com', name: 'Alice' })

    expect(() => {
      repo.create({ email: 'alice@example.com', name: 'Bob' })
    }).toThrow('UNIQUE constraint failed')
  })

  it('uses transactions for atomic operations', async () => {
    await withSQLiteTransaction(db, async (tx) => {
      tx.run('INSERT INTO users (email, name) VALUES (?, ?)', 'alice@example.com', 'Alice')
      tx.run('INSERT INTO users (email, name) VALUES (?, ?)', 'bob@example.com', 'Bob')
    })

    const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }
    expect(count.count).toBe(2)
  })
})
```

### File System Testing Pattern

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createTempDirectory } from '@orchestr8/testkit/fs'
import * as fs from 'fs/promises'
import * as path from 'path'

describe('ConfigManager', () => {
  let tempDir: ReturnType<typeof createTempDirectory>
  let manager: ConfigManager

  beforeEach(() => {
    tempDir = createTempDirectory({ prefix: 'config-test-' })
    manager = new ConfigManager(tempDir.path)
  })

  it('saves configuration to file', async () => {
    await manager.save({ theme: 'dark', fontSize: 14 })

    const configPath = path.join(tempDir.path, 'config.json')
    const content = await fs.readFile(configPath, 'utf-8')
    const config = JSON.parse(content)

    expect(config.theme).toBe('dark')
    expect(config.fontSize).toBe(14)
  })

  it('loads existing configuration', async () => {
    const configPath = path.join(tempDir.path, 'config.json')
    await fs.writeFile(configPath, JSON.stringify({ theme: 'light' }))

    const config = await manager.load()

    expect(config.theme).toBe('light')
  })

  it('handles missing configuration file', async () => {
    const config = await manager.load()

    expect(config).toEqual({})  // Default empty config
  })
})
```

### HTTP Testing Pattern

```typescript
import { describe, it, expect } from 'vitest'
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

const server = setupMSW([
  http.get('https://api.example.com/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ])
  }),

  http.post('https://api.example.com/users', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json(
      { id: 3, ...body },
      { status: 201 }
    )
  }),

  http.get('https://api.example.com/error', () => {
    return HttpResponse.json(
      { error: 'Server error' },
      { status: 500 }
    )
  })
])

describe('UserService', () => {
  let service: UserService

  beforeEach(() => {
    service = new UserService('https://api.example.com')
  })

  it('fetches users from API', async () => {
    const users = await service.getUsers()

    expect(users).toHaveLength(2)
    expect(users[0].name).toBe('Alice')
  })

  it('creates new user', async () => {
    const user = await service.createUser({ name: 'Charlie' })

    expect(user.id).toBe(3)
    expect(user.name).toBe('Charlie')
  })

  it('handles API errors gracefully', async () => {
    await expect(service.triggerError()).rejects.toThrow('Server error')
  })
})
```

### Time-Dependent Testing Pattern

```typescript
import { describe, it, expect } from 'vitest'
import { useFakeTime } from '@orchestr8/testkit/env'

describe('CacheService', () => {
  it('expires cached values after TTL', () => {
    const timeCtrl = useFakeTime(new Date('2023-01-01T00:00:00Z'))
    const cache = new CacheService({ ttl: 5000 })

    // Cache a value
    cache.set('user:1', { id: 1, name: 'Alice' })
    expect(cache.get('user:1')).toEqual({ id: 1, name: 'Alice' })

    // Advance time by 4 seconds (still within TTL)
    timeCtrl.advance(4000)
    expect(cache.get('user:1')).toEqual({ id: 1, name: 'Alice' })

    // Advance time by 2 more seconds (past TTL)
    timeCtrl.advance(2000)
    expect(cache.get('user:1')).toBeUndefined()

    timeCtrl.restore()
  })

  it('refreshes TTL on cache hit', () => {
    const timeCtrl = useFakeTime(new Date('2023-01-01T00:00:00Z'))
    const cache = new CacheService({ ttl: 5000, refreshOnHit: true })

    cache.set('key', 'value')

    // Advance 4 seconds and access (refreshes TTL)
    timeCtrl.advance(4000)
    expect(cache.get('key')).toBe('value')

    // Advance another 4 seconds (would be expired without refresh)
    timeCtrl.advance(4000)
    expect(cache.get('key')).toBe('value')  // Still cached

    timeCtrl.restore()
  })
})
```

### Randomness Testing Pattern

```typescript
import { describe, it, expect } from 'vitest'
import { quickRandom, quickCrypto } from '@orchestr8/testkit/env'

describe('IDGenerator', () => {
  it('generates deterministic UUIDs', () => {
    const restore = quickCrypto.uuid([
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002'
    ])

    const gen = new IDGenerator()

    expect(gen.generateID()).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(gen.generateID()).toBe('550e8400-e29b-41d4-a716-446655440001')
    expect(gen.generateID()).toBe('550e8400-e29b-41d4-a716-446655440002')

    restore()
  })

  it('generates deterministic random selections', () => {
    const restore = quickRandom.sequence([0.1, 0.5, 0.9])

    const items = ['a', 'b', 'c', 'd', 'e']
    const selector = new RandomSelector(items)

    // 0.1 → index 0
    expect(selector.pick()).toBe('a')
    // 0.5 → index 2
    expect(selector.pick()).toBe('c')
    // 0.9 → index 4
    expect(selector.pick()).toBe('e')

    restore()
  })
})
```

## Troubleshooting

### "Module not found" for TestKit sub-exports

**Symptom:**
```
Cannot find module '@orchestr8/testkit/sqlite'
```

**Cause:** Missing optional peer dependency

**Solution:**
```bash
# Install required peer dependency
pnpm add -D better-sqlite3  # For /sqlite
pnpm add -D msw             # For /msw
pnpm add -D testcontainers  # For /containers
```

### Database locked errors

**Symptom:**
```
SQLITE_BUSY: database is locked
```

**Cause:** Not using memory URLs or sharing database across tests

**Solution:**
```typescript
// ✅ Use memory URLs for isolation
beforeEach(() => {
  db = new Database(createMemoryUrl('raw'))  // Each test gets own DB
})

afterEach(() => {
  db.close()  // Always clean up
})
```

### MSW handlers not intercepting

**Symptom:** HTTP requests not being mocked

**Cause:** Incorrect MSW setup or lifecycle

**Solution:**
```typescript
// ✅ Ensure proper MSW lifecycle
const server = setupMSW([...handlers])

// Server setup happens automatically with setupMSW
```

### Tests pass individually but fail in suite

**Symptom:** Tests pass when run alone, fail when run together

**Cause:** Shared state or missing cleanup

**Solution:**
```typescript
// ✅ Ensure complete isolation
beforeEach(() => {
  // Create fresh resources for each test
  db = new Database(createMemoryUrl('raw'))
  tempDir = createTempDirectory()
})

afterEach(() => {
  // Clean up all resources
  db.close()
  // tempDir cleanup automatic
})
```

### Flaky time-dependent tests

**Symptom:** Tests sometimes pass, sometimes fail

**Cause:** Using real time instead of fake timers

**Solution:**
```typescript
// ❌ WRONG: Real delays
await new Promise(resolve => setTimeout(resolve, 5000))

// ✅ CORRECT: Fake timers
const timeCtrl = useFakeTime()
timeCtrl.advance(5000)
timeCtrl.restore()
```

## Examples

### Complete Test File Example

```typescript
/**
 * @file email-service.test.ts
 * @description Comprehensive tests for EmailService including validation,
 * sending, retry logic, and error handling. Uses TestKit for database,
 * file system, and HTTP mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryUrl, applyRecommendedPragmas } from '@orchestr8/testkit/sqlite'
import { createTempDirectory } from '@orchestr8/testkit/fs'
import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'
import Database from 'better-sqlite3'
import * as fs from 'fs/promises'
import * as path from 'path'
import { EmailService } from '../email-service'

// Test schema
const SCHEMA_SQL = `
  CREATE TABLE email_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    sent_at TEXT
  )
`

// MSW server
const server = setupMSW([
  http.post('https://api.smtp.com/send', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({
      messageId: 'test-message-id',
      recipient: body.recipient
    })
  }),

  http.post('https://api.smtp.com/send-with-error', () => {
    return HttpResponse.json(
      { error: 'SMTP server error' },
      { status: 500 }
    )
  })
])

describe('EmailService', () => {
  let db: Database.Database
  let tempDir: ReturnType<typeof createTempDirectory>
  let service: EmailService

  beforeEach(() => {
    // Setup database
    db = new Database(createMemoryUrl('raw'))
    applyRecommendedPragmas(db)
    db.exec(SCHEMA_SQL)

    // Setup temp directory for attachments
    tempDir = createTempDirectory({ prefix: 'email-test-' })

    // Create service
    service = new EmailService({
      db,
      attachmentDir: tempDir.path,
      smtpUrl: 'https://api.smtp.com'
    })
  })

  afterEach(() => {
    db.close()
  })

  describe('validateEmail()', () => {
    it('accepts valid email addresses', () => {
      expect(() => service.validateEmail('alice@example.com')).not.toThrow()
      expect(() => service.validateEmail('bob+tag@example.co.uk')).not.toThrow()
    })

    it('rejects invalid email addresses', () => {
      expect(() => service.validateEmail('invalid')).toThrow('Invalid email')
      expect(() => service.validateEmail('@example.com')).toThrow('Invalid email')
      expect(() => service.validateEmail('user@')).toThrow('Invalid email')
    })
  })

  describe('sendEmail()', () => {
    it('sends email successfully', async () => {
      const result = await service.sendEmail({
        to: 'alice@example.com',
        subject: 'Test',
        body: 'Test body'
      })

      expect(result.messageId).toBe('test-message-id')
      expect(result.success).toBe(true)

      // Verify database record
      const record = db.prepare(
        'SELECT * FROM email_queue WHERE recipient = ?'
      ).get('alice@example.com')

      expect(record).toBeDefined()
      expect(record.status).toBe('sent')
    })

    it('handles attachments', async () => {
      // Create test attachment
      const attachmentPath = path.join(tempDir.path, 'test.pdf')
      await fs.writeFile(attachmentPath, 'PDF content')

      const result = await service.sendEmail({
        to: 'alice@example.com',
        subject: 'Test',
        body: 'Test body',
        attachments: [attachmentPath]
      })

      expect(result.success).toBe(true)
    })

    it('retries on network failure', async () => {
      // TODO: Implement retry test
    })

    it('throws on validation error', async () => {
      await expect(
        service.sendEmail({
          to: 'invalid-email',
          subject: 'Test',
          body: 'Test body'
        })
      ).rejects.toThrow('Invalid email')
    })
  })

  describe('queueEmail()', () => {
    it('queues email for later sending', async () => {
      await service.queueEmail({
        to: 'alice@example.com',
        subject: 'Test',
        body: 'Test body'
      })

      const record = db.prepare(
        'SELECT * FROM email_queue WHERE recipient = ?'
      ).get('alice@example.com')

      expect(record).toBeDefined()
      expect(record.status).toBe('queued')
      expect(record.sent_at).toBeNull()
    })
  })

  describe('processQueue()', () => {
    it('processes all queued emails', async () => {
      // Queue multiple emails
      await service.queueEmail({
        to: 'alice@example.com',
        subject: 'Test 1',
        body: 'Body 1'
      })
      await service.queueEmail({
        to: 'bob@example.com',
        subject: 'Test 2',
        body: 'Body 2'
      })

      // Process queue
      const results = await service.processQueue()

      expect(results.sent).toBe(2)
      expect(results.failed).toBe(0)

      // Verify all emails marked as sent
      const pending = db.prepare(
        'SELECT COUNT(*) as count FROM email_queue WHERE status = ?'
      ).get('queued') as { count: number }

      expect(pending.count).toBe(0)
    })
  })
})
```

## Related Documentation

### TestKit Documentation

- [TestKit Usage Guide](./guide-testkit-usage.md) - Complete API reference
- [TestKit Migration Guide](./guide-testkit-migration.md) - Migrating from v1
- TestKit API Reference: `/Users/nathanvale/code/@orchestr8/packages/testkit/API.md`
- TestKit README: `/Users/nathanvale/code/@orchestr8/packages/testkit/README.md`

### Testing Strategy

- [TDD Applicability Guide](./guide-tdd-applicability.md) - When to use TDD
- [Test Strategy Guide](./guide-test-strategy.md) - Overall testing approach
- [Wallaby TDD Integration Guide](./guide-wallaby-tdd-integration.md) - TDD with Wallaby

### Project Documentation

- [Master PRD](../master/prd-master.md) - System requirements
- [Agent Workflow Guide](./guide-agent-workflow.md) - AI agent patterns

## Maintenance Notes

### When to Update This Guide

Update this guide when:

- New TestKit utilities or patterns are introduced
- Common anti-patterns are discovered in code reviews
- TestKit API changes require pattern updates
- New standardization rules are established
- AI agents struggle with existing patterns

### Version Compatibility

- **TestKit:** 2.0.0+
- **Vitest:** 3.2.0+
- **MSW:** 2.0.0+ (breaking changes from v1)
- **Better-sqlite3:** 12.0.0+

### Enforcement

**Code Review Checklist:**

- [ ] Test files follow naming convention (`*.test.ts`)
- [ ] Imports follow standard order (external → testkit → internal)
- [ ] Setup/teardown properly isolates tests
- [ ] No custom mock implementations
- [ ] TestKit utilities used for all mocking
- [ ] Test names are clear and behavior-focused
- [ ] Assertions are specific and meaningful
- [ ] Resources properly cleaned up
- [ ] Documentation added for complex tests

**Future Linting:**

```javascript
// .eslintrc.js (planned)
{
  "rules": {
    "test/no-custom-mocks": "error",
    "test/require-cleanup": "error",
    "test/prefer-testkit": "error",
    "test/descriptive-test-names": "warn"
  }
}
```

---

## Summary

**TestKit 2.0 Standardization ensures:**

1. **Consistent structure** - All tests follow same organization
2. **Standard imports** - Modular TestKit imports, no custom mocks
3. **Clear naming** - Files, suites, and tests are self-documenting
4. **Proper isolation** - Resources created in `beforeEach`, cleaned in `afterEach`
5. **Real behavior** - TestKit provides realistic test doubles
6. **AI-friendly** - Patterns optimized for AI agent understanding
7. **Maintainable** - Standardization reduces cognitive load

**Key Principles:**

- **No custom mocks** - Always use TestKit utilities
- **Isolation first** - Each test gets fresh resources
- **Clear naming** - Test names describe behavior, not implementation
- **Documentation** - Complex patterns are documented
- **Consistency** - Same patterns across entire codebase

_Testing should be so standardized that AI agents and humans alike can read any test file and immediately understand its structure, purpose, and patterns—like reading a well-formatted book where every chapter follows the same outline._
