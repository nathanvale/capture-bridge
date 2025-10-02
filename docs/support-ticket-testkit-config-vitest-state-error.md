# TestKit Support Ticket: Vitest Config Loading Failure

**Date**: 2025-10-03
**Package**: @orchestr8/testkit@1.0.9
**Severity**: Critical - Blocking Test Execution
**Status**: Open

## Summary

When using `createBaseVitestConfig` or `createVitestConfig` from `@orchestr8/testkit/config`, vitest fails to load the configuration with error:

```
Error: Vitest failed to access its internal state.
```

This prevents all tests from running in packages that use TestKit's config helpers.

## Environment

### System Information
- **OS**: macOS 24.3.0 (Darwin)
- **Node**: v20+ (using pnpm@9.15.4)
- **Package Manager**: pnpm (monorepo workspace)

### Package Versions
```json
{
  "@orchestr8/testkit": "^1.0.9",
  "vitest": "^3.2.4",
  "@vitest/ui": "^3.2.4",
  "@vitest/coverage-v8": "^3.2.4",
  "typescript": "^5.7.3",
  "vite": "^7.1.7"
}
```

### Project Structure
- Monorepo with 4 packages: foundation, capture, storage, cli
- Using workspace protocol for internal dependencies
- TypeScript with ESM modules (`"type": "module"`)

## Steps to Reproduce

### 1. Create vitest.config.ts using TestKit helper

**File**: `packages/foundation/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import { createBaseVitestConfig } from '@orchestr8/testkit/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/foundation',
      environment: 'node',
    },
  })
)
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Attempt to run tests

```bash
cd packages/foundation
pnpm test
```

## Expected Behavior

- Vitest should load the configuration successfully
- Tests should execute with TestKit's optimized settings:
  - Pool configuration based on environment (CI/Wallaby detection)
  - Timeout configurations
  - Coverage settings
  - Resource cleanup integration

## Actual Behavior

Vitest fails immediately during config load:

```
failed to load config from /Users/nathanvale/code/capture-bridge/packages/foundation/vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Vitest failed to access its internal state.

One of the following is possible:
- "vitest" is imported directly without running "vitest" command
- "vitest" is imported inside "globalSetup" (to fix this, use "setupFiles" instead, because "globalSetup" runs in a different context)
- "vitest" is imported inside Vite / Vitest config file
- Otherwise, it might be a Vitest bug. Please report it to https://github.com/vitest-dev/vitest/issues

    at getWorkerState (file:///Users/nathanvale/code/capture-bridge/node_modules/.pnpm/vitest@3.2.4_@types+node@24.5.2_@vitest+ui@3.2.4_happy-dom@18.0.1_msw@2.11.3_@types+node@24.5_ksejcb2umftpep3drz7xyxq2ge/node_modules/vitest/dist/chunks/utils.XdZDrNZV.js:9:9)
    at getCurrentEnvironment (file:///Users/nathanvale/code/capture-bridge/node_modules/.pnpm/vitest@3.2.4_@types+node@24.5.2_@vitest+ui@3.2.4_happy-dom@18.0.1_msw@2.11.3_@types+node@24.5_ksejcb2umftpep3drz7xyxq2ge/node_modules/vitest/dist/chunks/utils.XdZDrNZV.js:23:16)
    at createExpect (file:///Users/nathanvale/code/capture-bridge/node_modules/.pnpm/vitest@3.2.4_@types+node@24.5.2_@vitest+ui@3.2.4_happy-dom@18.0.1_msw@2.11.3_@types+node@24.5_ksejcb2umftpep3drz7xyxq2ge/node_modules/vitest/dist/chunks/vi.bdSIJ99Y.js:426:16)
    at file:///Users/nathanvale/code/capture-bridge/node_modules/.pnpm/vitest@3.2.4_@types+node@24.5.2_@vitest+ui@3.2.4_happy-dom@18.0.1_msw@2.11.3_@types+node@24.5_ksejcb2umftpep3drz7xyxq2ge/node_modules/vitest/dist/chunks/vi.bdSIJ99Y.js:464:22)
    at ModuleJob.run (node:internal/modules/esm/module_job:234:25)
    at async ModuleLoader.import (node:internal/modules/esm/loader:473:24)
```

## Root Cause Analysis

### Investigation Findings

1. **TestKit's config module structure verified**:
   ```bash
   ls node_modules/@orchestr8/testkit/dist/config/
   # ✓ index.d.ts
   # ✓ index.js
   # ✓ vitest.base.d.ts
   # ✓ vitest.base.js
   # ✓ vitest-resources.d.ts
   # ✓ vitest-resources.js
   ```

2. **Export structure verified** (package.json):
   ```json
   "./config": {
     "vitest": "./dist/config/index.js",
     "development": "./dist/config/index.js",
     "types": "./dist/config/index.d.ts",
     "import": "./dist/config/index.js",
     "default": "./dist/config/index.js"
   }
   ```

3. **Functions available in index.d.ts**:
   ```typescript
   export {
     createBaseVitestConfig,
     createVitestConfig,  // Alias for createBaseVitestConfig
     createCIConfig,
     createWallabyConfig,
     // ... other exports
   } from './vitest.base.js'
   ```

4. **Checked vitest.base.js imports**:
   ```javascript
   import { defineConfig } from 'vitest/config';
   import { getTestEnvironment, getTestTimeouts } from '../env/core.js';
   import fs from 'node:fs';
   import path from 'node:path';
   ```

5. **Checked env/core.js** - No vitest internal imports found:
   ```javascript
   // Only uses process.env checks
   function getTestEnvironment() {
     return {
       isCI: isCI(),
       isWallaby: isWallaby(),
       isVitest: Boolean(process.env.VITEST),
       isJest: Boolean(process.env.JEST_WORKER_ID),
       nodeEnv: process.env.NODE_ENV || "test"
     };
   }
   ```

### Suspected Issue

The error message indicates vitest is being imported during config loading, but the TestKit source appears clean. Possible causes:

1. **Transitive imports**: Something in the dependency chain is importing vitest globals
2. **Build artifact issue**: The published dist/ may differ from source
3. **Environment detection side effects**: Detection code may trigger vitest imports
4. **Vitest version compatibility**: TestKit may have been built/tested with different vitest version

## Workaround

### Temporary Solution: Use Simple Config

Reverting to basic vitest config works but loses TestKit optimizations:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@capture-bridge/foundation',
    environment: 'node',
  },
})
```

**Trade-offs**:
- ✅ Tests run successfully
- ❌ No CI/Wallaby environment detection
- ❌ No optimized pool configuration
- ❌ No automatic timeout adjustments
- ❌ No resource cleanup integration
- ❌ No coverage threshold defaults

## Additional Context

### Package Installation Context

Following SETUP.md instructions from /Users/nathanvale/code/@orchestr8/packages/testkit/SETUP.md:

```markdown
## 2. Configuration

### Vitest Configuration (Basic)

Create `vitest.config.ts` in your project root:

```typescript
import { defineConfig } from 'vitest/config'
import { createVitestConfig } from '@orchestr8/testkit/config'

export default defineConfig(
  createVitestConfig({
    test: {
      globals: true,
      environment: 'node',
    },
  })
)
```
```

This is the documented approach that's failing.

### TestKit's Own Config

Interestingly, TestKit's own vitest.config.ts works fine and uses similar pattern:

**File**: `@orchestr8/testkit/vitest.config.ts` (in source)
```typescript
import { defineConfig } from 'vitest/config'
import { createBaseVitestConfig } from './src/config/vitest.base.js'

const cfg = createBaseVitestConfig({
  test: {
    name: 'testkit',
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/register.ts'],
    pool: 'forks' as const,
    // ...
  },
})

export default defineConfig(cfg)
```

**Question**: Why does TestKit's own config work but consuming it from npm fails?

### Monorepo Context

- Using pnpm workspaces
- Packages have workspace dependencies on each other
- @orchestr8/testkit installed as regular npm dependency (not workspace)
- All packages use same vitest version (^3.2.4)

### What Works

1. ✅ Simple vitest configs without TestKit
2. ✅ Installing @orchestr8/testkit (no errors)
3. ✅ Importing TestKit utilities in test files (`import { delay } from '@orchestr8/testkit'`)
4. ✅ TypeScript compilation with TestKit types

### What Fails

1. ❌ Any vitest.config.ts using `createBaseVitestConfig`
2. ❌ Any vitest.config.ts using `createVitestConfig` (alias)
3. ❌ Affects all packages in monorepo identically

## Impact

### Severity Justification: Critical

1. **Blocking**: Cannot run tests in any package using TestKit config
2. **Scope**: Affects entire monorepo (4 packages)
3. **No workaround**: Reverting to simple config loses key features
4. **Setup documentation**: SETUP.md instructions don't work

### Business Impact

- Cannot follow TestKit setup guide
- Must choose between:
  - Using TestKit utilities but losing config benefits
  - Not using TestKit at all
- Defeats purpose of standardized testing infrastructure

## Requested Actions

### Investigation Needed

1. **Verify published package**: Check if dist/ artifacts match source
2. **Test with vitest@3.2.4**: Reproduce with exact version we're using
3. **Check build process**: Ensure no vitest imports leak into dist/config/
4. **Review package.json exports**: Verify conditional exports work correctly

### Potential Fixes

1. **Lazy imports**: Delay any vitest imports until after config load
2. **Environment detection**: Move env checks outside config helpers
3. **Build fix**: Re-publish with cleaned build artifacts
4. **Documentation**: Update SETUP.md if workaround is required

### Information Needed

1. What vitest version was TestKit 1.0.9 tested with?
2. Can you reproduce this in a fresh monorepo?
3. Are there any known compatibility issues with vitest@3.2.4?
4. Is there a TestKit 1.0.10+ that fixes this?

## Test Case for Reproduction

### Minimal Reproduction Repository

```bash
# Create test monorepo
mkdir testkit-bug-repro && cd testkit-bug-repro
pnpm init
mkdir -p packages/test-pkg

# Setup monorepo
cat > pnpm-workspace.yaml << EOF
packages:
  - packages/*
EOF

# Setup package
cd packages/test-pkg
pnpm init
pnpm add -D @orchestr8/testkit@1.0.9 vitest@3.2.4 @vitest/ui@3.2.4

# Create failing config
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config'
import { createBaseVitestConfig } from '@orchestr8/testkit/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: 'test-pkg',
      environment: 'node',
    },
  })
)
EOF

# Create simple test
mkdir src
cat > src/example.test.ts << 'EOF'
import { describe, it, expect } from 'vitest'

describe('Example', () => {
  it('should pass', () => {
    expect(true).toBe(true)
  })
})
EOF

# Try to run - WILL FAIL
pnpm vitest run
```

## References

### Documentation
- SETUP.md: /Users/nathanvale/code/@orchestr8/packages/testkit/SETUP.md (lines 92-103)
- API Reference: @orchestr8/testkit README.md

### Error Stack
- Vitest version: 3.2.4
- Error location: `vitest/dist/chunks/utils.XdZDrNZV.js:9:9`
- Function: `getWorkerState()` → `getCurrentEnvironment()` → `createExpect()`

### Related Issues
- Vitest: https://github.com/vitest-dev/vitest/issues
- Similar pattern: Config-time imports causing state errors

## Contact Information

**Reporter**: Nathan Vale (capture-bridge project)
**Project**: ADHD Digital Second Brain (capture-bridge monorepo)
**TestKit Usage**: Foundation package testing infrastructure
**Priority**: High - Blocking test infrastructure setup

## Attachments

### File: packages/foundation/vitest.config.ts (failing)
```typescript
import { defineConfig } from 'vitest/config'
import { createBaseVitestConfig } from '@orchestr8/testkit/config'

export default defineConfig(
  createBaseVitestConfig({
    test: {
      name: '@capture-bridge/foundation',
      environment: 'node',
    },
  })
)
```

### File: packages/foundation/package.json (relevant sections)
```json
{
  "name": "@capture-bridge/foundation",
  "type": "module",
  "devDependencies": {
    "@orchestr8/testkit": "^1.0.9",
    "vitest": "^3.2.4",
    "better-sqlite3": "^12.4.1",
    "happy-dom": "^18.0.1",
    "msw": "^2.11.3"
  }
}
```

### File: tsconfig.json (base config)
```json
{
  "compilerOptions": {
    "types": ["vitest/globals", "node"],
    "module": "node16",
    "moduleResolution": "node16"
  }
}
```

---

**Follow-up Questions Welcome**

Please let me know if you need:
- Full error stack traces
- Package-lock/pnpm-lock.yaml
- Complete monorepo structure
- Additional debugging output
- Screen recording of the failure

Thank you for maintaining TestKit! Looking forward to getting this resolved.
