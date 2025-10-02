# TestKit 1.0.7 Critical Bugs - Support Ticket

**Project:** @orchestr8/testkit
**Version:** 1.0.7
**Reported By:** Nathan Vale
**Date:** 2025-10-02
**Severity:** Critical - Package Unusable

## Executive Summary

TestKit 1.0.7 has **3 critical build/export issues** that make the package completely unusable in production. All issues are related to ES module exports and prevent basic functionality from working.

## Environment

- **Package:** `@orchestr8/testkit@1.0.7`
- **Node.js:** v24.3.0
- **Package Manager:** pnpm 9.15.4
- **Test Framework:** Vitest 3.2.4
- **Platform:** macOS (Darwin 24.3.0)

## Critical Issues

### Issue 1: Directory Import Error in Security Module

**Severity:** P0 - Critical
**Impact:** Breaks main export and utils sub-export
**Affects:** All code importing from `@orchestr8/testkit`

**Error:**
```
Error: Directory import '/Users/nathanvale/code/capture-bridge/node_modules/.pnpm/@orchestr8+testkit@file+..+@orchestr8+packages+testkit_@vitest+ui@3.2.4_better-sqlite3@12.4.1_ytbjuhs5wylb5kv474m5k6n2em/node_modules/@orchestr8/testkit/dist/security' is not supported resolving ES modules imported from /Users/nathanvale/code/capture-bridge/node_modules/.pnpm/@orchestr8+testkit@file+..+@orchestr8+packages+testkit_@vitest+ui@3.2.4_better-sqlite3@12.4.1_ytbjuhs5wylb5kv474m5k6n2em/node_modules/@orchestr8/testkit/dist/utils/index.js

Code: ERR_UNSUPPORTED_DIR_IMPORT
```

**Root Cause:**
- `dist/utils/index.js` tries to import from `dist/security` as a directory
- ES modules require explicit file paths with extensions
- Missing `/index.js` in the import statement

**Reproduction:**
```typescript
import { delay } from '@orchestr8/testkit';
// Error: Directory import .../dist/security is not supported
```

**Expected Behavior:**
Import should work without errors.

**Suggested Fix:**
Change directory imports to explicit file imports:
```javascript
// In dist/utils/index.js
// BEFORE:
import * as security from '../security'

// AFTER:
import * as security from '../security/index.js'
```

---

### Issue 2: Missing MSW Handlers Module

**Severity:** P0 - Critical
**Impact:** Breaks all MSW functionality
**Affects:** `@orchestr8/testkit/msw` sub-export

**Error:**
```
Error: Cannot find module '/Users/nathanvale/code/capture-bridge/node_modules/.pnpm/@orchestr8+testkit@file+..+@orchestr8+packages+testkit_@vitest+ui@3.2.4_better-sqlite3@12.4.1_ytbjuhs5wylb5kv474m5k6n2em/node_modules/@orchestr8/testkit/dist/msw/handlers' imported from /Users/nathanvale/code/capture-bridge/node_modules/.pnpm/@orchestr8+testkit@file+..+@orchestr8+packages+testkit_@vitest+ui@3.2.4_better-sqlite3@12.4.1_ytbjuhs5wylb5kv474m5k6n2em/node_modules/@orchestr8/testkit/dist/msw/example-handlers/vite-demo.js

Code: ERR_MODULE_NOT_FOUND
```

**Root Cause:**
- `dist/msw/example-handlers/vite-demo.js` imports from `../handlers`
- File `dist/msw/handlers.js` or `dist/msw/handlers/index.js` doesn't exist
- Build process didn't generate this file

**Reproduction:**
```typescript
import { setupMSW } from '@orchestr8/testkit/msw';
// Error: Cannot find module .../dist/msw/handlers
```

**Expected Behavior:**
MSW utilities should import without errors.

**Suggested Fix:**
1. Ensure `handlers.ts` is included in build
2. Or fix import in `vite-demo.js`:
```javascript
// BEFORE:
import { ... } from '../handlers'

// AFTER:
import { ... } from '../handlers.js'
// OR
import { ... } from './handlers/index.js'
```

---

### Issue 3: FileDatabase Is Not a Constructor

**Severity:** P0 - Critical
**Impact:** Breaks all SQLite functionality
**Affects:** `@orchestr8/testkit/sqlite` sub-export

**Error:**
```
TypeError: FileDatabase is not a constructor
    at /Users/nathanvale/code/capture-bridge/packages/foundation/src/__tests__/testkit-sqlite-features.test.ts:50:24
```

**Root Cause:**
- `FileDatabase` is exported but not as a constructor
- Likely exported as a default export or wrapped incorrectly
- Type definitions show it as a class, but runtime export is different

**Reproduction:**
```typescript
import { FileDatabase, createMemoryUrl } from '@orchestr8/testkit/sqlite';

const memoryUrl = createMemoryUrl();
const fileDb = new FileDatabase(memoryUrl); // TypeError: FileDatabase is not a constructor
```

**Type Definition (dist/sqlite/index.d.ts):**
```typescript
export { FileDatabase, createFileDatabase, createFileSQLiteDatabase, createFileDBWithPool } from './file.js';
```

**Expected Behavior:**
`FileDatabase` should be instantiable as a class constructor.

**Suggested Fix:**
Check `dist/sqlite/file.js` export:
```javascript
// Ensure it's exported as:
export class FileDatabase { ... }

// NOT:
export default FileDatabase
// OR
export const FileDatabase = ...
```

---

## Test Results

Ran comprehensive verification test suite (69 tests):
- **45 tests failed** due to these 3 issues
- **6 tests passed** (only config utilities that don't trigger imports)
- **18 tests skipped** (afterEach cleanup couldn't run)

### Test Breakdown by Module

**Core Utilities (testkit-core-utilities.test.ts):**
- Status: ❌ Failed
- Cause: Issue #1 (Security directory import)
- Tests: 0/25 passed

**SQLite Features (testkit-sqlite-features.test.ts):**
- Status: ❌ Failed
- Cause: Issue #3 (FileDatabase not a constructor)
- Tests: 0/15 passed

**MSW Features (testkit-msw-features.test.ts):**
- Status: ❌ Failed
- Cause: Issue #2 (Missing handlers module)
- Tests: 0/25 passed

**Main Export (testkit-main-export.test.ts):**
- Status: ❌ Failed
- Cause: Issue #1 (Security directory import)
- Tests: 0/3 passed

**Final Validation (testkit-final-validation.test.ts):**
- Status: ⚠️ Partial
- Tests: 4/5 passed (only config sub-export works)

---

## Impact Assessment

**Severity:** **Critical - Package Unusable**

- ❌ Cannot use core utilities (delay, retry, withTimeout)
- ❌ Cannot use SQLite test helpers
- ❌ Cannot use MSW test helpers
- ❌ Cannot use file system utilities
- ❌ Cannot use environment utilities
- ✅ Can use Vitest config utilities (only working feature)

**Workaround:** None available without modifying node_modules

---

## Expected Package.json Exports (For Reference)

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./sqlite": {
      "types": "./dist/sqlite/index.d.ts",
      "import": "./dist/sqlite/index.js",
      "default": "./dist/sqlite/index.js"
    },
    "./msw": {
      "types": "./dist/msw/index.d.ts",
      "import": "./dist/msw/index.js",
      "default": "./dist/msw/index.js"
    }
  }
}
```

All exports are correctly defined in package.json, but the built files have issues.

---

## Requested Actions

1. **Fix directory imports** - Change all directory imports to explicit file paths with `.js` extensions
2. **Fix MSW handlers build** - Ensure `dist/msw/handlers.js` is generated or fix import paths
3. **Fix FileDatabase export** - Ensure it's exported as a proper class constructor
4. **Publish patch version** - Release 1.0.8 with fixes
5. **Add ES module build tests** - Prevent these issues in future releases

---

## Additional Context

**Build Configuration:**
The package uses `tsup` for building (from package.json):
```json
{
  "scripts": {
    "build": "tsup"
  }
}
```

**TypeScript Config:**
All TypeScript definitions are correct - this is purely a build/export issue.

**Package Type:**
```json
{
  "type": "module"
}
```

Package is correctly marked as ES module.

---

## Verification Test Suite

We've created a comprehensive test suite that can verify all fixes:
- Tests all core utilities
- Tests all SQLite features
- Tests all MSW features
- Tests all sub-exports
- Available at: https://github.com/nathanvale/capture-bridge (if public)

Once fixes are published, we can run this suite to verify 1.0.8 works correctly.

---

## Contact

**Reporter:** Nathan Vale
**Project:** ADHD Brain Digital Second Brain
**GitHub:** @nathanvale (if applicable)

Please let me know if you need any additional information, logs, or reproduction steps.

---

## Appendix: Full Error Logs

<details>
<summary>Click to expand full test output</summary>

```
stderr | src/__tests__/testkit-final-validation.test.ts > Testkit Lean Core Fix Verification > should verify lean core implementation
Main export still failing: Error: Directory import '/Users/nathanvale/code/capture-bridge/node_modules/.pnpm/@orchestr8+testkit@file+..+@orchestr8+packages+testkit_@vitest+ui@3.2.4_better-sqlite3@12.4.1_ytbjuhs5wylb5kv474m5k6n2em/node_modules/@orchestr8/testkit/dist/security' is not supported resolving ES modules imported from /Users/nathanvale/code/capture-bridge/node_modules/.pnpm/@orchestr8+testkit@file+..+@orchestr8+packages+testkit_@vitest+ui@3.2.4_better-sqlite3@12.4.1_ytbjuhs5wylb5kv474m5k6n2em/node_modules/@orchestr8/testkit/dist/utils/index.js

stderr | src/__tests__/testkit-msw-features.test.ts > Testkit MSW Features > MSW Server Setup > should create and start MSW server
MSW import error: Error: Cannot find module '/Users/nathanvale/code/capture-bridge/node_modules/.pnpm/@orchestr8+testkit@file+..+@orchestr8+packages+testkit_@vitest+ui@3.2.4_better-sqlite3@12.4.1_ytbjuhs5wylb5kv474m5k6n2em/node_modules/@orchestr8/testkit/dist/msw/handlers' imported from /Users/nathanvale/code/capture-bridge/node_modules/.pnpm/@orchestr8+testkit@file+..+@orchestr8+packages+testkit_@vitest+ui@3.2.4_better-sqlite3@12.4.1_ytbjuhs5wylb5kv474m5k6n2em/node_modules/@orchestr8/testkit/dist/msw/example-handlers/vite-demo.js

stderr | src/__tests__/testkit-sqlite-features.test.ts > Testkit SQLite Features > Database Creation > should create in-memory SQLite database
SQLite import error: TypeError: FileDatabase is not a constructor
    at /Users/nathanvale/code/capture-bridge/packages/foundation/src/__tests__/testkit-sqlite-features.test.ts:50:24

Test Files  5 failed (5)
     Tests  45 failed | 6 passed | 18 skipped (69)
  Start at  15:12:12
  Duration  1.32s
```

</details>

---

## Priority

**CRITICAL** - Please prioritize these fixes as the package is currently unusable in production environments.

Thank you for your attention to these issues!
