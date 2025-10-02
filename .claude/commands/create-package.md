# create-package

Creates a new workspace package with optimized TestKit 2.0 configuration.

## Behavior

When invoked with `/create-package <package-name>`, this command:

1. Creates package directory structure in `packages/<package-name>/`
2. Generates package.json with TestKit dependencies
3. Creates optimized vitest.config.ts (fork pool, timeouts, memory limits)
4. Sets up test-setup.ts with automatic resource cleanup
5. Creates src/ and __tests__/ directories
6. Generates example test file demonstrating TestKit patterns
7. Creates tsconfig.json extending base config
8. Creates tsup.config.ts for building
9. Updates root pnpm-workspace.yaml if needed

## Usage

```bash
/create-package <package-name>
```

## Examples

```bash
/create-package notifications
# Creates packages/notifications/ with full TestKit setup

/create-package email-service
# Creates packages/email-service/ with full TestKit setup
```

## What Gets Created

### Directory Structure
```
packages/<package-name>/
├── src/
│   ├── index.ts
│   └── __tests__/
│       └── example.test.ts
├── package.json
├── vitest.config.ts
├── test-setup.ts
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

### package.json
- Proper naming: `@capture-bridge/<package-name>`
- TestKit 2.0 dependency
- Standard scripts (build, test, test:ui, test:watch, typecheck)
- Workspace dependencies configured

### vitest.config.ts
- Fork pool with maxForks: 4 (local), 2 (CI)
- Memory limit: 1GB per worker
- Timeouts: 10s test, 5s hooks, 20s teardown
- Hanging-process reporter (dev only)
- Bootstrap sequence configured

### test-setup.ts
- Resource cleanup enabled
- Leak detection active
- Stats logging configurable

### Example Test
- Demonstrates TestKit patterns
- Shows database cleanup
- Shows temp directory usage
- Shows MSW mocking

## Implementation

The command should:

1. **Validate Input**
   - Package name is kebab-case
   - Directory doesn't already exist
   - Name doesn't conflict with existing packages

2. **Create Directory Structure**
   ```bash
   mkdir -p packages/<package-name>/src/__tests__
   ```

3. **Generate package.json**
   ```json
   {
     "name": "@capture-bridge/<package-name>",
     "version": "0.1.0",
     "private": true,
     "type": "module",
     "exports": {
       ".": {
         "import": "./dist/index.js",
         "require": "./dist/index.cjs",
         "types": "./dist/index.d.ts"
       }
     },
     "scripts": {
       "build": "tsup",
       "dev": "tsup --watch",
       "clean": "rm -rf dist",
       "typecheck": "tsc --noEmit",
       "test": "vitest run",
       "test:watch": "vitest watch",
       "test:ui": "vitest --ui",
       "test:ci": "vitest run --bail 1",
       "test:coverage": "vitest run --coverage"
     },
     "devDependencies": {
       "@capture-bridge/build-config": "workspace:*",
       "@orchestr8/testkit": "^2.0.0",
       "@types/node": "^24.3.0",
       "tsup": "^8.3.0",
       "typescript": "^5.7.3",
       "vitest": "^3.2.4"
     }
   }
   ```

4. **Generate vitest.config.ts**
   ```typescript
   import { createBaseVitestConfig } from '@orchestr8/testkit/config'
   import { defineConfig } from 'vitest/config'

   export default defineConfig(
     createBaseVitestConfig({
       test: {
         name: '@capture-bridge/<package-name>',
         environment: 'node',

         // Bootstrap sequence (order matters!)
         setupFiles: [
           '@orchestr8/testkit/register',  // 1. TestKit bootstrap
           './test-setup.ts',               // 2. Resource cleanup config
         ],

         // Prevent zombie processes and hanging tests
         reporters: process.env.CI ? ['default'] : ['default', 'hanging-process'],

         // Timeout configuration
         testTimeout: 10000,      // 10s per test
         hookTimeout: 5000,       // 5s for hooks
         teardownTimeout: 20000,  // 20s for cleanup

         // Fork pool for process isolation
         pool: 'forks',
         poolOptions: {
           forks: {
             singleFork: false,
             maxForks: process.env.CI ? 2 : 4,
             minForks: 1,
             execArgv: ['--max-old-space-size=1024'],
           },
         },
       },
     })
   )
   ```

5. **Generate test-setup.ts**
   ```typescript
   /**
    * Global test setup for <package-name> package
    */

   import { setupResourceCleanup } from '@orchestr8/testkit/config'

   await setupResourceCleanup({
     cleanupAfterEach: true,
     cleanupAfterAll: true,
     enableLeakDetection: true,
     logStats: process.env.LOG_CLEANUP_STATS === '1',
   })

   console.log('✅ TestKit resource cleanup configured (<package-name> package)')
   ```

6. **Generate Example Test**
   ```typescript
   import { describe, it, expect } from 'vitest'
   import { useSqliteCleanup } from '@orchestr8/testkit/sqlite'
   import { useTempDirectory } from '@orchestr8/testkit/fs'
   import { setupMSW, http, HttpResponse } from '@orchestr8/testkit/msw'

   describe('<PackageName> Module', () => {
     it('should demonstrate basic test', () => {
       expect(true).toBe(true)
     })

     describe('Database Pattern', () => {
       const useDatabase = useSqliteCleanup(async () => {
         const { createMemoryDatabase } = await import('@orchestr8/testkit/sqlite')
         return createMemoryDatabase()
       })

       it('should use database with auto-cleanup', async () => {
         const db = await useDatabase()
         db.exec('CREATE TABLE users (id INTEGER, name TEXT)')
         db.exec('INSERT INTO users VALUES (1, "Test User")')

         const users = db.prepare('SELECT * FROM users').all()
         expect(users).toHaveLength(1)
         // ✅ Database auto-cleaned after test
       })
     })

     describe('File System Pattern', () => {
       const tempDir = useTempDirectory()

       it('should use temp directory with auto-cleanup', async () => {
         await tempDir.writeFile('test.txt', 'hello')
         const content = await tempDir.readFile('test.txt')

         expect(content).toBe('hello')
         // ✅ Temp directory auto-cleaned after test
       })
     })

     describe('MSW Pattern', () => {
       const msw = setupMSW([
         http.get('https://api.example.com/data', () => {
           return HttpResponse.json({ message: 'test data' })
         })
       ])

       it('should mock API calls', async () => {
         const response = await fetch('https://api.example.com/data')
         const data = await response.json()

         expect(data).toEqual({ message: 'test data' })
         // ✅ MSW server auto-cleaned after test
       })
     })
   })
   ```

7. **Generate tsconfig.json**
   ```json
   {
     "extends": "../../tooling/tsconfig/base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist"]
   }
   ```

8. **Generate tsup.config.ts**
   ```typescript
   import { defineConfig } from '@capture-bridge/build-config'

   export default defineConfig({
     entry: ['src/index.ts'],
   })
   ```

9. **Generate src/index.ts**
   ```typescript
   /**
    * @capture-bridge/<package-name>
    *
    * [Package description]
    */

   export const version = '0.1.0'

   // Export your module API here
   ```

10. **Generate README.md**
    ```markdown
    # @capture-bridge/<package-name>

    [Package description]

    ## Installation

    This is an internal workspace package.

    ## Usage

    ```typescript
    import { } from '@capture-bridge/<package-name>'
    ```

    ## Development

    ```bash
    # Run tests
    pnpm test

    # Run tests with UI
    pnpm test:ui

    # Run tests with leak detection
    LOG_CLEANUP_STATS=1 pnpm test

    # Build package
    pnpm build

    # Type check
    pnpm typecheck
    ```

    ## Testing

    This package uses TestKit 2.0 with optimized configuration:

    - ✅ Automatic resource cleanup
    - ✅ Leak detection enabled
    - ✅ Fork pool for process isolation
    - ✅ Hanging-process reporter (dev only)
    - ✅ 1GB memory limit per worker

    See `vitest.config.ts` and `test-setup.ts` for details.
    ```

11. **Run pnpm install**
    ```bash
    pnpm install
    ```

12. **Output Summary**
    ```
    ✅ Package created: @capture-bridge/<package-name>

    Location: packages/<package-name>/

    Next steps:
    1. Update src/index.ts with your module code
    2. Write tests in src/__tests__/
    3. Run: pnpm --filter @capture-bridge/<package-name> test
    4. Run with leak detection: LOG_CLEANUP_STATS=1 pnpm --filter @capture-bridge/<package-name> test

    Features enabled:
    - ✅ TestKit 2.0 with automatic resource cleanup
    - ✅ Fork pool (4 workers local, 2 in CI)
    - ✅ Memory limit: 1GB per worker
    - ✅ Hanging-process reporter (dev only)
    - ✅ Example tests demonstrating patterns
    ```

## Error Handling

- If package already exists: "Package already exists at packages/<package-name>"
- If invalid name: "Package name must be kebab-case (lowercase with hyphens)"
- If pnpm install fails: Show error and suggest manual fix

## Related Commands

- `/test` - Run tests for a package
- `/typecheck` - Type check a package
- `/build` - Build a package

---

**Category**: Package Management
**Scope**: Project
**Author**: Claude Code
**Version**: 1.0.0
