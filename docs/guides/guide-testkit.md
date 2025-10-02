# TestKit 1.0.9 API Reference

Complete API reference for `@orchestr8/testkit` version 1.0.9 based on actual implementation.

## Overview

TestKit is a lean testing utility library for Vitest with optional peer dependencies:
- **Core**: No dependencies (async utilities, mocks, environment detection)
- **SQLite**: Requires `better-sqlite3` (optional)
- **MSW**: Requires `msw` and `happy-dom` (optional)

## Test Examples

All examples in this guide reference actual working tests in the foundation package:
- **Core utilities**: `packages/foundation/src/__tests__/testkit-core-utilities.test.ts`
- **SQLite features**: `packages/foundation/src/__tests__/testkit-sqlite-features.test.ts`
- **SQLite advanced**: `packages/foundation/src/__tests__/testkit-sqlite-advanced.test.ts`
- **MSW features**: `packages/foundation/src/__tests__/testkit-msw-features.test.ts`
- **CLI utilities**: `packages/foundation/src/__tests__/testkit-cli-utilities.test.ts`
- **Advanced utils**: `packages/foundation/src/__tests__/testkit-utils-advanced.test.ts`

## Installation

```bash
pnpm add -D @orchestr8/testkit@1.0.9 vitest

# Optional: SQLite support
pnpm add -D better-sqlite3

# Optional: MSW support
pnpm add -D msw happy-dom
```

## Core Utilities

### Async Utilities

#### `delay(ms: number): Promise<void>`

Promise-based delay utility.

**Example**: See `testkit-core-utilities.test.ts:22-45`

```typescript
import { delay } from '@orchestr8/testkit';

await delay(100); // Wait 100ms
await delay(0);   // Yield to event loop
```

#### `retry<T>(operation: () => Promise<T>, maxRetries: number, delayMs: number): Promise<T>`

Retry failed operations with exponential backoff.

**Example**: See `testkit-core-utilities.test.ts:48-110`

```typescript
import { retry } from '@orchestr8/testkit';

const result = await retry(
  async () => fetchData(),
  5,   // max retries
  10   // base delay in ms (exponential backoff)
);
```

**Behavior**:
- First retry: ~10ms delay
- Second retry: ~20ms delay (exponential)
- Third retry: ~40ms delay
- Throws last error if all retries fail

#### `withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T>`

Timeout wrapper for promises.

**Example**: See `testkit-core-utilities.test.ts:113-148`

```typescript
import { withTimeout, delay } from '@orchestr8/testkit';

// Success within timeout
const result = await withTimeout(
  delay(50).then(() => 'completed'),
  200
);

// Throws timeout error
await withTimeout(
  delay(200).then(() => 'too late'),
  50
); // throws 'timeout'
```

**Behavior**:
- Resolves with promise value if completes within timeout
- Rejects with 'timeout' error if exceeds timeout
- Preserves original promise rejection

### Mock Functions

#### `createMockFn<T extends (...args: any[]) => any>(implementation?: T): T`

Create mock functions for testing.

**Example**: See `testkit-core-utilities.test.ts:151-185`

```typescript
import { createMockFn } from '@orchestr8/testkit';

// Basic mock (returns undefined)
const mockFn = createMockFn();
mockFn('arg1', 'arg2'); // returns undefined

// Mock with implementation
const mockFn = createMockFn((x: number) => x * 2);
mockFn(5); // returns 10
```

**Note**: Without implementation, mock returns `undefined`.

## Environment Utilities

### `getTestEnvironment()`

Detects test environment and returns configuration object.

**Example**: See `testkit-core-utilities.test.ts:187-208`

```typescript
import { getTestEnvironment } from '@orchestr8/testkit';

const env = getTestEnvironment();

// Returns:
{
  isVitest: boolean;   // Running in Vitest
  isCI: boolean;       // Running in CI environment
  isWallaby: boolean;  // Running in Wallaby.js
  isJest: boolean;     // Running in Jest
  nodeEnv: string;     // process.env.NODE_ENV
}
```

**Example**:
```typescript
const env = getTestEnvironment();
if (env.isVitest) {
  console.log('Running in Vitest!');
}
```

### `getTestTimeouts()`

Get recommended timeouts for different test types.

**Example**: See `testkit-core-utilities.test.ts:210-230`

```typescript
import { getTestTimeouts } from '@orchestr8/testkit';

const timeouts = getTestTimeouts();

// Returns:
{
  unit: number;        // Unit test timeout
  integration: number; // Integration test timeout
  e2e: number;        // E2E test timeout
}
```

**Guarantees**:
- `unit < integration < e2e`
- All values > 0

### `setupTestEnv(vars: Record<string, string>): { restore: () => void }`

Setup test environment variables with cleanup.

**Example**: See `testkit-core-utilities.test.ts:232-252`

```typescript
import { setupTestEnv } from '@orchestr8/testkit';

const { restore } = setupTestEnv({
  TEST_VAR: 'test-value',
  ANOTHER_VAR: 'another-value'
});

// Use environment variables
expect(process.env.TEST_VAR).toBe('test-value');

// Restore original environment
restore();
```

**Important**: Returns object with `restore` method, not the function directly.

## File System Utilities

All file system utilities are **async** and must be awaited.

**Examples**: See `testkit-core-utilities.test.ts:255-347`

### `createTempDirectory(): Promise<TempDirectory>`

Create temporary directory with cleanup.

```typescript
import { createTempDirectory } from '@orchestr8/testkit';

const tempDir = await createTempDirectory();

console.log(tempDir.path); // /tmp/vitest-xxxxx
// Use tempDir.path...

// Cleanup
if (tempDir.cleanup) {
  await tempDir.cleanup();
}
```

### `createNamedTempDirectory(prefix: string): Promise<TempDirectory>`

Create temporary directory with custom prefix.

```typescript
import { createNamedTempDirectory } from '@orchestr8/testkit';

const tempDir = await createNamedTempDirectory('test-prefix');

expect(tempDir.path).toContain('test-prefix');

if (tempDir.cleanup) {
  await tempDir.cleanup();
}
```

### `createMultipleTempDirectories(count: number): Promise<TempDirectory[]>`

Create multiple unique temporary directories.

```typescript
import {
  createMultipleTempDirectories,
  cleanupMultipleTempDirectories
} from '@orchestr8/testkit';

const tempDirs = await createMultipleTempDirectories(3);

expect(tempDirs).toHaveLength(3);
// All paths are unique

// Cleanup all
await cleanupMultipleTempDirectories(tempDirs);
```

### `useTempDirectory<T>(callback: (dir: TempDirectory) => Promise<T>): Promise<T>`

Managed temporary directory with automatic cleanup.

```typescript
import { useTempDirectory } from '@orchestr8/testkit/fs';
import fs from 'fs/promises';
import path from 'path';

const result = await useTempDirectory(async (dir) => {
  // Write test file
  const testFile = path.join(dir.path, 'test.txt');
  await fs.writeFile(testFile, 'test content');

  // Verify file exists
  const content = await fs.readFile(testFile, 'utf-8');
  expect(content).toBe('test content');

  return 'completed';
});

// Cleanup happens automatically
expect(result).toBe('completed');
```

## Vitest Configuration

All Vitest configuration functions require an environment config parameter.

**Examples**: See `testkit-core-utilities.test.ts:349-457`

### `createVitestEnvironmentConfig()`

Create environment configuration object.

```typescript
import { createVitestEnvironmentConfig } from '@orchestr8/testkit';

const envConfig = createVitestEnvironmentConfig();

// Returns:
{
  isCI: boolean;
  isWallaby: boolean;
  // ... other environment flags
}
```

### `createBaseVitestConfig()`

Create base Vitest configuration.

```typescript
import { createBaseVitestConfig } from '@orchestr8/testkit';

const config = createBaseVitestConfig();

// Returns UserConfig with test property
export default config;
```

**Alias**: `createVitestBaseConfig` (same function)

### `createCIOptimizedConfig()`

Create CI-optimized Vitest configuration.

```typescript
import { createCIOptimizedConfig } from '@orchestr8/testkit';

const config = createCIOptimizedConfig();

// Includes CI-specific optimizations:
// - Optimized reporters
// - Coverage settings
// - Performance tuning
```

**Alias**: `createCIConfig` (same function)

### `createWallabyOptimizedConfig()`

Create Wallaby.js-optimized Vitest configuration.

```typescript
import { createWallabyOptimizedConfig } from '@orchestr8/testkit';

const config = createWallabyOptimizedConfig();

// Optimized for Wallaby.js real-time testing
```

**Alias**: `createWallabyConfig` (same function)

### `defineVitestConfig(config: UserConfig)`

Define Vitest configuration with type safety.

```typescript
import { defineVitestConfig } from '@orchestr8/testkit';

const config = defineVitestConfig({
  test: {
    globals: true,
    environment: 'node'
  }
});
```

### `createVitestCoverage(envConfig: EnvironmentConfig)`

Create coverage configuration.

```typescript
import {
  createVitestCoverage,
  createVitestEnvironmentConfig
} from '@orchestr8/testkit';

const envConfig = createVitestEnvironmentConfig();
const coverage = createVitestCoverage(envConfig);

// Returns:
{
  enabled: boolean;
  provider: string;
  // ... coverage options
}
```

**Important**: Must pass `envConfig` parameter.

### `createVitestPoolOptions(envConfig: EnvironmentConfig)`

Create pool options for parallel test execution.

```typescript
import {
  createVitestPoolOptions,
  createVitestEnvironmentConfig
} from '@orchestr8/testkit';

const envConfig = createVitestEnvironmentConfig();
const poolOptions = createVitestPoolOptions(envConfig);

// Returns:
{
  pool: string;
  maxWorkers: number;
  // ... pool options
}
```

**Important**: Must pass `envConfig` parameter.

### `createVitestTimeouts(envConfig: EnvironmentConfig)`

Create timeout configuration.

```typescript
import {
  createVitestTimeouts,
  createVitestEnvironmentConfig
} from '@orchestr8/testkit';

const envConfig = createVitestEnvironmentConfig();
const timeouts = createVitestTimeouts(envConfig);

// Returns:
{
  test: number;
  hook: number;
  teardown: number;
}
```

**Important**: Must pass `envConfig` parameter.

### Default Configs

```typescript
import { baseVitestConfig, defaultConfig } from '@orchestr8/testkit';

// Both are aliases for the same default config
expect(defaultConfig).toBe(baseVitestConfig);
```

## SQLite Utilities

Requires `better-sqlite3` peer dependency.

**Examples**:
- Basic features: `testkit-sqlite-features.test.ts`
- Advanced features: `testkit-sqlite-advanced.test.ts`

### `createMemoryUrl(options?: { mode?: string }): string`

Create in-memory database URL.

```typescript
import { createMemoryUrl } from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

const memoryUrl = createMemoryUrl();
expect(memoryUrl).toContain(':memory:');

// Create database with better-sqlite3
const db = new Database(':memory:');
```

**With WAL mode**:
```typescript
const memoryUrl = createMemoryUrl({ mode: 'wal' });
```

### `createFileDatabase(filename: string): Promise<DatabaseMetadata>`

Create file-based database (returns metadata, not database instance).

```typescript
import { createFileDatabase } from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

// Get database metadata
const fileDb = await createFileDatabase('test.db');

// Create actual database connection
const db = new Database(fileDb.path);

// fileDb contains:
{
  url: string;      // Connection URL
  path: string;     // File path
  dir: string;      // Directory path
  cleanup: () => Promise<void>; // Cleanup function
}
```

**Important**:
- `createFileDatabase` is async
- Returns metadata object, not database instance
- Use `better-sqlite3` to create actual connection

### `applyRecommendedPragmas(db: Database): PragmaResults`

Apply recommended SQLite pragmas for testing.

```typescript
import {
  createMemoryUrl,
  applyRecommendedPragmas
} from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

const db = new Database(':memory:');

const applied = applyRecommendedPragmas(db);

// Returns:
{
  journal_mode: string;
  synchronous: string;
  temp_store: string;
  // ... other pragmas
}
```

### Migration Support

#### `applyMigrations(db: DatabaseAdapter, migrations: Migration[])`

Apply database migrations.

```typescript
import { applyMigrations } from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

const db = new Database(':memory:');

const migrations = [
  {
    version: 1,
    up: `CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    )`
  },
  {
    version: 2,
    up: `ALTER TABLE users ADD COLUMN email TEXT`
  }
];

// Create adapter
const adapter = {
  exec: (sql: string) => db.exec(sql),
  prepare: (sql: string) => db.prepare(sql),
  pragma: (pragma: string) => db.pragma(pragma),
  close: () => db.close()
};

for (const migration of migrations) {
  adapter.exec(migration.up);
}
```

#### `resetDatabase(db: DatabaseAdapter): Promise<void>`

Reset database to clean state (drops all tables).

```typescript
import { resetDatabase } from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

const db = new Database(':memory:');

// Create some tables
db.exec(`CREATE TABLE test_table (id INTEGER PRIMARY KEY)`);

// Reset - drops all tables
await resetDatabase({
  exec: (sql: string) => db.exec(sql),
  prepare: (sql: string) => db.prepare(sql),
  pragma: (pragma: string) => db.pragma(pragma),
  close: () => {}
});

// Verify tables are gone
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
).all();

expect(tables).toHaveLength(0);
```

### Seeding Utilities

#### `seedWithSql(db: Database, sql: string): Promise<void>`

Seed database with SQL statements.

```typescript
import { seedWithSql } from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

const db = new Database(':memory:');

db.exec(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL
  )
`);

await seedWithSql(db, `
  INSERT INTO products (name, price) VALUES
    ('Widget', 9.99),
    ('Gadget', 19.99),
    ('Doohickey', 14.99);
`);

const products = db.prepare('SELECT * FROM products').all();
expect(products).toHaveLength(3);
```

#### `seedWithBatch(db: Database, options: BatchOptions): Promise<void>`

Seed database with batch operations.

```typescript
import { seedWithBatch } from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

const db = new Database(':memory:');

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    age INTEGER
  )
`);

await seedWithBatch(db, {
  table: 'users',
  data: [
    { name: 'Alice', age: 30 },
    { name: 'Bob', age: 25 },
    { name: 'Charlie', age: 35 }
  ],
  chunkSize: 2
});

const users = db.prepare('SELECT * FROM users').all();
expect(users).toHaveLength(3);
```

### Transaction Management

#### `withTransaction<T>(db: Database, callback: (tx: Database) => Promise<T>): Promise<T>`

Execute callback in transaction with automatic rollback on error.

```typescript
import { withTransaction } from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

const db = new Database(':memory:');

db.exec(`
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    balance REAL NOT NULL
  )
`);

// Transaction that rolls back on error
try {
  await withTransaction(db, async (tx) => {
    tx.prepare('UPDATE accounts SET balance = balance - 30 WHERE id = 1').run();
    tx.prepare('UPDATE accounts SET balance = balance + 30 WHERE id = 2').run();

    // Force rollback
    throw new Error('Simulated error');
  });
} catch (error) {
  // Transaction rolled back - balances unchanged
}

// Successful transaction
await withTransaction(db, async (tx) => {
  tx.prepare('INSERT INTO accounts (id, balance) VALUES (?, ?)').run(1, 100.0);
  tx.prepare('INSERT INTO accounts (id, balance) VALUES (?, ?)').run(2, 50.0);
});
```

### Cleanup Utilities

#### `registerDatabaseCleanup(db: Database): () => Promise<void>`

Register database for cleanup.

```typescript
import {
  registerDatabaseCleanup,
  executeDatabaseCleanup,
  getCleanupCount
} from '@orchestr8/testkit/sqlite';
import Database from 'better-sqlite3';

const db1 = new Database(':memory:');
const db2 = new Database(':memory:');

// Register for cleanup
registerDatabaseCleanup(db1);
registerDatabaseCleanup(db2);

// Check count
const count = getCleanupCount();
expect(count).toBeGreaterThanOrEqual(2);

// Execute cleanup
await executeDatabaseCleanup();

// Verify cleanup
expect(getCleanupCount()).toBe(0);
```

### ORM URL Generation

#### `prismaUrl(path: string): string`

Generate Prisma-compatible database URL.

```typescript
import { prismaUrl } from '@orchestr8/testkit/sqlite';

const memoryUrl = prismaUrl(':memory:');
expect(memoryUrl).toContain('file:');

const fileUrl = prismaUrl('/path/to/db.sqlite');
expect(fileUrl).toContain('file:');
```

#### `drizzleUrl(path: string): string`

Generate Drizzle-compatible database URL.

```typescript
import { drizzleUrl } from '@orchestr8/testkit/sqlite';

const memoryUrl = drizzleUrl(':memory:');
const fileUrl = drizzleUrl('/path/to/db.sqlite');
```

## MSW Utilities

Requires `msw` and `happy-dom` peer dependencies.

**Examples**: See `testkit-msw-features.test.ts`

### Server Setup

#### `createMSWServer(handlers: RequestHandler[]): SetupServer`

Create MSW server instance (use instead of setupMSW).

```typescript
import { createMSWServer } from '@orchestr8/testkit/msw';
import { http, HttpResponse } from 'msw';

const server = createMSWServer([
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' }
    ]);
  })
]);

server.listen({ onUnhandledRequest: 'bypass' });

// Use server...

server.close();
```

**Important**:
- Returns server instance directly
- Use this instead of `setupMSW` (which uses vitest hooks and doesn't return server)

#### `startMSWServer(): Promise<void>`

Start global MSW server.

```typescript
import { startMSWServer, stopMSWServer } from '@orchestr8/testkit/msw';

await startMSWServer();
// Server running...
await stopMSWServer();
```

#### `stopMSWServer(): Promise<void>`

Stop global MSW server.

### Default Handlers

#### `defaultHandlers: RequestHandler[]`

Array of default request handlers.

```typescript
import { createMSWServer, defaultHandlers } from '@orchestr8/testkit/msw';

// defaultHandlers is an array, not a function
const server = createMSWServer(defaultHandlers);
```

**Important**: `defaultHandlers` is an array, not a function.

### Configuration

#### `createMSWConfig(options: MSWConfigOptions): MSWConfig`

Create MSW configuration object.

```typescript
import { createMSWConfig, validateMSWConfig } from '@orchestr8/testkit/msw';

const config = createMSWConfig({
  onUnhandledRequest: 'warn',
  quiet: false
});

const isValid = validateMSWConfig(config);
expect(isValid).toBe(true);
```

#### `validateMSWConfig(config: MSWConfig): boolean`

Validate MSW configuration.

### Handler Management

#### `addMSWHandlers(handlers: RequestHandler[]): void`

Add handlers to running server.

```typescript
import { addMSWHandlers } from '@orchestr8/testkit/msw';
import { http, HttpResponse } from 'msw';

addMSWHandlers([
  http.get('/api/test', () => {
    return HttpResponse.json({ test: true });
  })
]);
```

#### `resetMSWHandlers(): void`

Reset handlers to initial state.

```typescript
import { resetMSWHandlers } from '@orchestr8/testkit/msw';

// Add some handlers...

// Reset to original handlers
resetMSWHandlers();
```

#### `restoreMSWHandlers(): void`

Restore handlers (alias for reset).

### Response Utilities

#### `createSuccessResponse(data: any, status?: number): HttpResponse`

Create success response.

```typescript
import { createSuccessResponse } from '@orchestr8/testkit/msw';
import { http } from 'msw';

http.get('/api/success', () =>
  createSuccessResponse({ data: 'success' })
);
```

#### `createErrorResponse(message: string, status: number): HttpResponse`

Create error response.

```typescript
import { createErrorResponse } from '@orchestr8/testkit/msw';
import { http } from 'msw';

http.get('/api/error', () =>
  createErrorResponse('Something went wrong', 500)
);
```

#### `createDelayedResponse(data: any, delayMs: number): HttpResponse`

Create delayed response.

```typescript
import { createDelayedResponse } from '@orchestr8/testkit/msw';
import { http } from 'msw';

http.get('/api/delayed', () =>
  createDelayedResponse({ data: 'delayed' }, 100)
);
```

### Authentication Handlers

#### `createAuthHandlers(options: AuthOptions): RequestHandler[]`

Create authentication handlers.

```typescript
import { createMSWServer, createAuthHandlers } from '@orchestr8/testkit/msw';

const server = createMSWServer(createAuthHandlers({
  validCredentials: {
    username: 'testuser',
    password: 'testpass'
  },
  tokenPrefix: 'Bearer',
  sessionDuration: 3600000
}));

server.listen({ onUnhandledRequest: 'bypass' });

// POST /api/auth/login - accepts valid credentials
// POST /api/auth/logout - clears session
```

### CRUD Handlers

#### `createCRUDHandlers(options: CRUDOptions): RequestHandler[]`

Create CRUD operation handlers.

```typescript
import { createMSWServer, createCRUDHandlers } from '@orchestr8/testkit/msw';

const server = createMSWServer(createCRUDHandlers({
  resource: 'posts',
  idField: 'id',
  initialData: [
    { id: 1, title: 'First Post', content: 'Content 1' },
    { id: 2, title: 'Second Post', content: 'Content 2' }
  ]
}));

// GET /api/posts - list all
// GET /api/posts/:id - get one
// POST /api/posts - create
// PUT /api/posts/:id - update
// DELETE /api/posts/:id - delete
```

### Error Simulation

#### `createNetworkIssueHandler(path: string): RequestHandler`

Simulate network errors.

```typescript
import { createNetworkIssueHandler } from '@orchestr8/testkit/msw';

const handler = createNetworkIssueHandler('/api/network-error');

// Throws network error when fetched
```

#### `createUnreliableHandler(path: string, options: UnreliableOptions): RequestHandler`

Simulate unreliable endpoints.

```typescript
import { createUnreliableHandler } from '@orchestr8/testkit/msw';

const handler = createUnreliableHandler('/api/unreliable', {
  failureRate: 0.5,  // 50% failure rate
  minDelay: 10,
  maxDelay: 50
});

// Randomly succeeds or fails based on failure rate
```

### Pagination Support

#### `createPaginatedHandler(path: string, items: any[], options: PaginationOptions): RequestHandler`

Create paginated endpoint handler.

```typescript
import { createMSWServer, createPaginatedHandler } from '@orchestr8/testkit/msw';

const items = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`
}));

const server = createMSWServer([
  createPaginatedHandler('/api/items', items, {
    pageSize: 10,
    pageParam: 'page',
    limitParam: 'limit'
  })
]);

// GET /api/items?page=1&limit=10
// Returns: { items: [...], total: 25, page: 1, hasMore: true }
```

### HTTP Status Helpers

#### `HTTP_STATUS`

HTTP status code constants.

```typescript
import { HTTP_STATUS } from '@orchestr8/testkit/msw';

expect(HTTP_STATUS.OK).toBe(200);
expect(HTTP_STATUS.CREATED).toBe(201);
expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
expect(HTTP_STATUS.NOT_FOUND).toBe(404);
expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
```

#### `COMMON_HEADERS`

Common header constants.

```typescript
import { COMMON_HEADERS } from '@orchestr8/testkit/msw';

expect(COMMON_HEADERS.JSON).toHaveProperty('Content-Type');
expect(COMMON_HEADERS.JSON['Content-Type']).toBe('application/json');
```

## Migration from TestKit 1.0.7

### Breaking Changes

1. **FileDatabase removed**: Use `createFileDatabase()` + `better-sqlite3` directly
   ```typescript
   // Before (1.0.7):
   const fileDb = new FileDatabase(memoryUrl);
   const db = fileDb.getDatabase();

   // After (1.0.9):
   import Database from 'better-sqlite3';
   const db = new Database(':memory:');
   ```

2. **setupMSW doesn't return server**: Use `createMSWServer()`
   ```typescript
   // Before (1.0.7):
   const server = setupMSW([handlers]);

   // After (1.0.9):
   const server = createMSWServer([handlers]);
   ```

3. **setupTestEnv returns object**: Not function directly
   ```typescript
   // Before (1.0.7):
   const restore = setupTestEnv({ VAR: 'value' });

   // After (1.0.9):
   const { restore } = setupTestEnv({ VAR: 'value' });
   ```

4. **Vitest config functions require envConfig**: Must pass environment config
   ```typescript
   // Before (1.0.7):
   const coverage = createVitestCoverage();

   // After (1.0.9):
   const envConfig = createVitestEnvironmentConfig();
   const coverage = createVitestCoverage(envConfig);
   ```

5. **getTestEnvironment returns isVitest**: Not isTest
   ```typescript
   // Before (1.0.7):
   const env = getTestEnvironment();
   expect(env.isTest).toBe(true);

   // After (1.0.9):
   const env = getTestEnvironment();
   expect(env.isVitest).toBe(true);
   ```

6. **All temp directory functions are async**: Must await
   ```typescript
   // Before (1.0.7):
   const tempDir = createTempDirectory();

   // After (1.0.9):
   const tempDir = await createTempDirectory();
   ```

7. **defaultHandlers is array**: Not function
   ```typescript
   // Before (1.0.7):
   const server = createMSWServer(defaultHandlers());

   // After (1.0.9):
   const server = createMSWServer(defaultHandlers);
   ```

## Known Issues

### MSW Node.js Compatibility

MSW in Node.js requires full URLs, not relative paths:

```typescript
// Won't work in Node.js:
await fetch('/api/users');

// Use full URL:
await fetch('http://localhost/api/users');
```

This affects test environment setup - either:
1. Use full URLs in tests
2. Set up base URL configuration
3. Use MSW browser mode (not Node.js mode)

## CLI Utilities

Process mocking and spawn utilities for command-line testing.

**Examples**: See `testkit-cli-utilities.test.ts`

### Process Mocking

- `createProcessMocker()` - Create process mocker instance
- `getGlobalProcessMocker()` - Get global process mocker
- `setupProcessMocking(config)` - Setup process mocking with config
- `processHelpers` - Utilities for capturing stdout/stderr

### Spawn Mocking

- `mockSpawn(options)` - Create mock spawn function
- `commonCommands` - Pre-configured mocks for git, npm, node
- `quickMocks` - Quick mocks for success, failure, timeout scenarios
- `spawnUtils` - Utilities for waiting, killing processes

## Advanced Utils

Advanced testing utilities including concurrency, pooling, and security.

**Examples**: See `testkit-utils-advanced.test.ts`

### Testing Utilities

- `TestingUtils.createTestBuffer(size)` - Create pooled test buffer
- `TestingUtils.releaseTestBuffer(buffer)` - Release buffer to pool
- `TestingUtils.createTestArray<T>()` - Create pooled test array
- `TestingUtils.releaseTestArray(array)` - Release array to pool
- `TestingUtils.createControlledPromise<T>()` - Create controllable promise

### Concurrency Management

- `limitConcurrency(tasks, limit)` - Limit concurrent task execution
- `limitedAll(promises, limit)` - Promise.all with concurrency limit
- `limitedAllSettled(promises, limit)` - Promise.allSettled with limit
- `databaseOperationsManager` - Database concurrency manager
- `fileOperationsManager` - File operations concurrency manager
- `networkOperationsManager` - Network concurrency manager

### Object Pooling

- `ObjectPool` - Generic object pool implementation
- `ArrayPool` - Pooled array management
- `BufferPool` - Pooled buffer management
- `PromisePool` - Pooled promise management
- `poolManager` - Global pool manager

### Resource Management

- `registerResource(resource)` - Register resource for cleanup
- `cleanupAllResources()` - Cleanup all registered resources
- `getResourceStats()` - Get resource usage statistics
- `detectResourceLeaks()` - Detect resource leaks
- `globalResourceManager` - Global resource manager

### Security Validation

- `validateCommand(cmd, args)` - Validate shell commands
- `validatePath(path)` - Validate file paths
- `escapeShellArg(arg)` - Escape shell arguments
- `sanitizeSqlIdentifier(id)` - Sanitize SQL identifiers
- `validateShellExecution(options)` - Validate shell execution
- `validateBatch(operations)` - Validate batch operations

## Version Information

- **Package**: `@orchestr8/testkit`
- **Version**: 1.0.9
- **Published**: 2025-10-02
- **Peer Dependencies**:
  - `vitest`: ^3.2.4 (required)
  - `better-sqlite3`: ^12.0.0 (optional)
  - `msw`: ^2.0.0 (optional)
  - `happy-dom`: ^18.0.0 (optional)

## Support

For issues or questions, create support ticket at project repository.
