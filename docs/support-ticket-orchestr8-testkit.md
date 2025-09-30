# Support Ticket: @orchestr8/testkit Package Import and Dependency Issues

**Ticket ID:** TESTKIT-002
**Priority:** CRITICAL
**Status:** RESOLVED ✅
**Reporter:** Nathan Vale (ADHD Brain Project)
**Date:** 2025-09-29
**Resolution Date:** 2025-09-30
**Package:** @orchestr8/testkit version 1.0.0-1.0.1 (Fixed in 1.1.0+)

## ✅ RESOLUTION SUMMARY (2025-09-30)

### Issue Fixed with Lean Core Approach

The @orchestr8/testkit package has been successfully fixed using a **lean core architecture**:

1. **Main Export Fixed** ✅ - The main export (`@orchestr8/testkit`) now includes ONLY core utilities with no optional dependencies
2. **Sub-Exports Fixed** ✅ - All optional features are available via working sub-exports:
   - `@orchestr8/testkit/msw` - Mock Service Worker utilities
   - `@orchestr8/testkit/sqlite` - SQLite testing utilities
   - `@orchestr8/testkit/fs` - File system utilities
   - `@orchestr8/testkit/env` - Environment and time control
   - `@orchestr8/testkit/cli` - CLI mocking utilities
   - `@orchestr8/testkit/utils` - Core testing utilities
   - `@orchestr8/testkit/config/vitest` - Vitest configuration helpers
   - `@orchestr8/testkit/convex` - Convex testing (optional)
   - `@orchestr8/testkit/containers` - Docker containers (optional)

3. **Lazy Loading Implemented** ✅ - The package now uses lazy loading, only importing what you explicitly request
4. **Module Resolution Fixed** ✅ - Resolved the vitest/vite/pnpm module resolution issues

### Implementation Details

The fix implements the **Immediate Actions** suggested in this ticket:
- ✅ Lazy loading pattern for optional features
- ✅ Fixed package.json exports configuration for vitest/vite compatibility
- ✅ Core utilities separated from optional features
- ✅ No eager loading of optional dependencies

### Migration Instructions

```typescript
// Old (broken) - would fail without all optional dependencies
import { delay, createMockFn } from '@orchestr8/testkit'; // ❌ FAILED

// New (working) - lean core approach
import { delay, createMockFn } from '@orchestr8/testkit'; // ✅ WORKS

// Optional features via sub-exports (only load what you need)
import { setupMSW } from '@orchestr8/testkit/msw'; // ✅ WORKS
import { createMemoryUrl } from '@orchestr8/testkit/sqlite'; // ✅ WORKS
```

### Verification

The fixes have been verified to work with:
- ✅ pnpm workspaces
- ✅ Vitest 3.2.4
- ✅ Vite (via Vitest)
- ✅ TypeScript 5.7.3
- ✅ No optional dependencies required for core utilities

---

## Original Issue Summary (Historical Record)

The @orchestr8/testkit package had two critical issues:
1. **Eager loading of ALL optional dependencies** - The main export failed because it tried to import optional dependencies (convex-test, etc.) even when not using those features
2. **Broken sub-exports** - All sub-export imports failed with "Cannot find package" errors in vitest/vite environments

These issues made the package completely unusable without installing ALL optional dependencies, defeating the purpose of optional features.

## Environment Details

### Project Configuration
- **Monorepo:** ADHD Brain (pnpm workspaces)
- **Package Manager:** pnpm 9.15.4
- **Node.js:** v20.18.0
- **Test Framework:** Vitest 3.2.4
- **TypeScript:** 5.7.3
- **Build Tool:** Vite (via Vitest)

### Package Structure
- 4 packages: foundation, storage, capture, cli
- External test infrastructure approach (no custom test utilities)
- TSUP for building, Turbo for orchestration

### Installation Status
✅ **Package Installation:** SUCCESS via `pnpm add -D @orchestr8/testkit`
✅ **TypeScript Types:** Available at `./dist/index.d.ts`
❌ **Main Export:** FAILS - tries to import missing 'convex-test' package
❌ **Sub-exports:** ALL FAILING - module resolution errors

## Specific Error Messages

### Issue 1: Main Export Fails Due to Missing Dependencies
```
Error: Cannot find package 'convex-test' imported from
/node_modules/@orchestr8/testkit/dist/convex/harness.js
```

This happens when simply trying to import basic utilities:
```typescript
import { delay, createMockFn } from '@orchestr8/testkit'; // FAILS
```

### Issue 2: Sub-Export Resolution Fails
```
Cannot find package '@orchestr8/testkit/{sub-export}' imported from '{test-file-path}'
```

### Failing Sub-exports (All tested)
```bash
❌ @orchestr8/testkit/utils
❌ @orchestr8/testkit/config/vitest
❌ @orchestr8/testkit/msw
❌ @orchestr8/testkit/env
❌ @orchestr8/testkit/fs
❌ @orchestr8/testkit/sqlite
❌ @orchestr8/testkit/convex
❌ @orchestr8/testkit/containers
❌ @orchestr8/testkit/cli
```

### Complete Error Example
```
Error: Cannot find package '@orchestr8/testkit/utils' imported from '/Users/nathanvale/code/adhd-brain/packages/foundation/src/__tests__/testkit-final-validation.test.ts'
```

## Root Cause Analysis

### Identified Issues

1. **Eager Loading Problem (CRITICAL)**
   - The main index.js imports ALL modules, including optional ones
   - When any optional dependency is missing (convex-test, better-sqlite3, etc.), the entire package fails
   - This happens in dist/index.js which has statements like:
     ```javascript
     export * from './convex/harness.js'; // Requires convex-test
     export * from './sqlite/file.js';     // Requires better-sqlite3
     export * from './containers/mysql.js'; // Requires mysql2
     ```
   - **Impact:** Cannot use ANY utility without installing ALL dependencies

2. **Module Resolution Conflict**
   - Vitest/Vite cannot resolve the conditional exports properly
   - The package.json exports configuration doesn't work with pnpm/vitest
   - Node.js module resolution algorithm not finding the correct paths

3. **Missing Peer Dependencies Declaration**
   - Only declares `vitest` as a peer dependency
   - Missing: msw, happy-dom (required)
   - Missing in peerDependenciesMeta: better-sqlite3, convex-test, testcontainers, mysql2, pg (optional)

## Expected vs Actual Behavior

### Expected (According to Documentation)
```typescript
// Should work
import { createTestFixture } from "@orchestr8/testkit/utils"
import { createBaseVitestConfig } from "@orchestr8/testkit/config/vitest"
import { setupMSW, http } from "@orchestr8/testkit/msw"
```

### Actual
```typescript
// All imports fail with "Cannot find package" error
import { anything } from "@orchestr8/testkit/utils" // ❌ FAILS
```

### Workaround Status
❌ **Direct dist/ imports** - Path resolution issues
❌ **Adding missing dependencies manually** - Too many required, creates bloat
❌ **Different import patterns** - Fundamental resolution issue
✅ **Native vitest utilities** - Working alternative for basic functionality

## Impact Assessment

### Project Impact
- **Severity:** HIGH - Blocks adoption of external test infrastructure
- **Workaround Available:** YES - Native vitest capabilities sufficient for basic testing
- **Development Velocity:** MEDIUM impact - Can proceed with project but without testkit benefits

### Affected Features
- Mock Service Worker integration
- SQLite in-memory testing
- Test fixture management
- Custom vitest configuration
- Environment setup utilities
- File system testing utilities

## Reproduction Steps

1. **Setup Environment**
   ```bash
   git clone https://github.com/nathanvale/adhd-brain.git
   cd adhd-brain
   pnpm install
   ```

2. **Verify Package Installation**
   ```bash
   pnpm ls @orchestr8/testkit
   # Should show: @orchestr8/testkit 1.0.0
   ```

3. **Run Failing Test**
   ```bash
   pnpm run test packages/foundation/src/__tests__/testkit-final-validation.test.ts
   ```

4. **Observe Errors**
   - All sub-export imports will fail
   - Error messages clearly show "Cannot find package" for each sub-export

## Attempted Solutions

### Tried Approaches
1. **Direct Path Imports**
   ```typescript
   import { utils } from "@orchestr8/testkit/dist/utils/index.js"
   // Result: Path resolution issues in vitest environment
   ```

2. **Manual Dependency Addition**
   ```bash
   pnpm add -D better-sqlite3 convex-test testcontainers
   # Result: Too many dependencies required, creates project bloat
   ```

3. **Alternative Import Patterns**
   ```typescript
   const { utils } = await import("@orchestr8/testkit")
   // Result: utils not available on main export
   ```

## Suggested Fixes

### Immediate Actions (CRITICAL)

1. **Implement Lazy Loading for Optional Features**
   ```typescript
   // Instead of eager imports in index.js:
   export * from './convex/harness.js'; // BAD - loads immediately

   // Use lazy loading pattern:
   export const createConvexTestHarness = async (...args) => {
     const { createConvexTestHarness } = await import('./convex/harness.js');
     return createConvexTestHarness(...args);
   };
   ```

   Or better yet, don't export optional features from main index at all - require explicit sub-imports.

2. **Fix Package Exports Configuration**
   - Ensure exports work with vitest/vite/pnpm
   - Add "default" condition for broader compatibility:
   ```json
   "./utils": {
     "types": "./dist/utils/index.d.ts",
     "import": "./dist/utils/index.js",
     "default": "./dist/utils/index.js"
   }
   ```

3. **Declare ALL Peer Dependencies**
   ```json
   {
     "peerDependencies": {
       "vitest": "^3.2.4",
       "@vitest/ui": "^3.2.4",
       "better-sqlite3": "^12.4.1",
       "convex-test": "^0.0.38",
       "testcontainers": "^10.17.2",
       "mysql2": "^3.15.0",
       "pg": "^8.16.3"
     },
     "peerDependenciesMeta": {
       "better-sqlite3": { "optional": true },
       "convex-test": { "optional": true },
       "testcontainers": { "optional": true },
       "mysql2": { "optional": true },
       "pg": { "optional": true }
     }
   }
   ```

3. **Test Environment Compatibility**
   - Create test suite that validates exports in vitest environment
   - Add CI pipeline testing against different package managers (pnpm, npm, yarn)
   - Test with different Node.js versions

### Medium-term Improvements

1. **Modular Package Structure**
   - Split into smaller, focused packages to avoid dependency issues:
   - `@orchestr8/testkit-core` - Essential utilities (delay, createMockFn, etc.)
   - `@orchestr8/testkit-msw` - MSW utilities (requires msw)
   - `@orchestr8/testkit-sqlite` - SQLite utilities (requires better-sqlite3)
   - `@orchestr8/testkit-containers` - Docker containers (requires testcontainers)
   - `@orchestr8/testkit-convex` - Convex utilities (requires convex-test)
   - This completely solves the eager loading problem

2. **Enhanced Documentation**
   - Document which dependencies are required for which features
   - Add troubleshooting section for common resolution issues
   - Provide examples for different environments (vite, webpack, etc.)

## Testing Verification

### Success Criteria
After fixes, the following should work:

```typescript
// Basic sub-export imports
import { createTestFixture } from "@orchestr8/testkit/utils" // ✅
import { createBaseVitestConfig } from "@orchestr8/testkit/config/vitest" // ✅
import { setupMSW, http } from "@orchestr8/testkit/msw" // ✅

// With optional dependencies installed
import { createMemoryUrl } from "@orchestr8/testkit/sqlite" // ✅
import { createTempDirectory } from "@orchestr8/testkit/fs" // ✅
```

### Test Commands
```bash
# Should pass without errors
pnpm run test packages/foundation/src/__tests__/testkit-final-validation.test.ts

# Should not show import errors
node --eval "import('@orchestr8/testkit/utils').then(() => console.log('SUCCESS'))"
```

## Workaround for Project Continuation

### Current Alternative Approach
The ADHD Brain project can continue development using native vitest capabilities:

```typescript
// Instead of @orchestr8/testkit utilities
import { vi } from 'vitest'

// Available without testkit:
// ✅ Mock functions: vi.fn()
// ✅ Timer mocking: vi.useFakeTimers()
// ✅ Module mocking: vi.mock()
// ✅ Environment setup: setup files
// ✅ Custom matchers: expect.extend()
```

### Migration Plan
1. **Phase 1:** Use native vitest for immediate needs
2. **Phase 2:** Monitor testkit package updates
3. **Phase 3:** Migrate to fixed testkit when available
4. **Phase 4:** Leverage enhanced testing infrastructure

## Additional Context

### Package Repository
- **Source:** https://github.com/nathanvale/bun-changesets-template.git
- **Directory:** packages/testkit
- **Published:** NPM registry as @orchestr8/testkit@1.0.0

### Community Impact
This issue likely affects other users trying to adopt @orchestr8/testkit in modern JavaScript toolchains (Vite, Vitest, pnpm workspaces).

### Support Expectations
Given that the support team can "fix issues instantly when properly documented," this comprehensive report should provide all necessary information for a rapid resolution.

---

**Contact Information:**
- **Reporter:** Nathan Vale
- **Project:** ADHD Brain Monorepo
- **GitHub:** https://github.com/nathanvale/adhd-brain
- **Environment:** MacOS Darwin 24.3.0, Node.js 20.18.0

**Next Steps:**
1. Review and validate reported issues
2. Implement suggested fixes
3. Test against reproduction case
4. Release updated version
5. Confirm resolution with reporter

Thank you for your attention to this issue. The testkit concept is excellent and we're excited to use it once these resolution issues are addressed.