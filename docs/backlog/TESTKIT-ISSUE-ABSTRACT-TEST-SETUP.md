# [Feature Request] Provide pre-configured test-setup export to eliminate boilerplate

**Repository**: https://github.com/nathanvale/orchestr8
**Package**: @orchestr8/testkit
**Version**: 2.1.2
**Priority**: Low (DX improvement)
**Effort**: Small (~1-2 hours)

---

## Problem

Every package using TestKit needs to create a nearly-identical `test-setup.ts` file that configures resource cleanup. This creates unnecessary duplication and maintenance burden.

### Current State (Duplication)

**Across 5 packages in capture-bridge monorepo:**

```typescript
// packages/capture/test-setup.ts
import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: process.env['LOG_CLEANUP_STATS'] === '1',
})

console.log('✅ TestKit resource cleanup configured (capture package)')
```

```typescript
// packages/storage/test-setup.ts
import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: process.env['LOG_CLEANUP_STATS'] === '1',
})

console.log('✅ TestKit resource cleanup configured (storage package)')
```

```typescript
// packages/cli/test-setup.ts
import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: process.env['LOG_CLEANUP_STATS'] === '1',
})

console.log('✅ TestKit resource cleanup configured (cli package)')
```

...and 2 more identical files in `foundation/` and `obsidian-bridge/`.

**Issues:**
- 5 nearly-identical files (95% code duplication)
- Only difference: package name in console.log (not even necessary)
- Manual maintenance if defaults change
- New users have to create boilerplate
- Violates DRY principle

---

## Proposed Solution

### Option 1: Pre-configured Setup Export (Recommended)

**Add a new export at `@orchestr8/testkit/setup`:**

```typescript
// packages/testkit/src/setup/index.ts
import { setupResourceCleanup } from '../config'
import { cleanupAllResources } from '../utils'
import { afterAll } from 'vitest'

// Apply recommended defaults for most projects
await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: process.env['LOG_CLEANUP_STATS'] === '1',
})

// Add comprehensive cleanup hook
afterAll(async () => {
  await cleanupAllResources()
})

// Optional: Log confirmation in non-production
if (process.env['NODE_ENV'] !== 'production') {
  // eslint-disable-next-line no-console
  console.log('✅ TestKit resource cleanup configured')
}
```

**Update package exports:**

```json
// packages/testkit/package.json
{
  "exports": {
    ".": "./dist/index.js",
    "./config": "./dist/config/index.js",
    "./setup": "./dist/setup/index.js",  // ← NEW
    "./sqlite": "./dist/sqlite/index.js",
    "./msw": "./dist/msw/index.js",
    "./cli": "./dist/cli/index.js",
    "./fs": "./dist/fs/index.js",
    "./utils": "./dist/utils/index.js"
  }
}
```

**Consumer usage (simplified):**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: [
      '@orchestr8/testkit/register',  // 1. Bootstrap
      '@orchestr8/testkit/setup',     // 2. Pre-configured cleanup ✨
    ],
  },
})
```

**Result:** Delete 5 test-setup.ts files from capture-bridge monorepo.

---

### Option 2: Factory Function (More Flexible)

**For users who need customization:**

```typescript
// packages/testkit/src/setup/index.ts
import { setupResourceCleanup } from '../config'
import { cleanupAllResources } from '../utils'
import { afterAll } from 'vitest'

export interface TestSetupOptions {
  cleanupAfterEach?: boolean
  cleanupAfterAll?: boolean
  enableLeakDetection?: boolean
  logStats?: boolean
  packageName?: string
}

export async function createTestSetup(options: TestSetupOptions = {}) {
  const {
    cleanupAfterEach = true,
    cleanupAfterAll = true,
    enableLeakDetection = true,
    logStats = process.env['LOG_CLEANUP_STATS'] === '1',
    packageName,
  } = options

  await setupResourceCleanup({
    cleanupAfterEach,
    cleanupAfterAll,
    enableLeakDetection,
    logStats,
  })

  afterAll(async () => {
    await cleanupAllResources()
  })

  if (packageName && process.env['NODE_ENV'] !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`✅ TestKit resource cleanup configured (${packageName})`)
  }
}

// Also export default setup for 99% use case
await createTestSetup()
```

**Usage:**

```typescript
// test-setup.ts (only if you need customization)
import { createTestSetup } from '@orchestr8/testkit/setup'

await createTestSetup({
  packageName: 'my-custom-package',
  logStats: true
})
```

**Or just use defaults:**

```typescript
// vitest.config.ts
setupFiles: ['@orchestr8/testkit/register', '@orchestr8/testkit/setup']
```

---

## Benefits

✅ **Less boilerplate** - Eliminate 5 test-setup.ts files from capture-bridge
✅ **Single source of truth** - Updates happen in TestKit, consumers get them automatically
✅ **Consistent defaults** - All consumers use recommended configuration
✅ **Better DX** - New users just add one line to setupFiles
✅ **Backwards compatible** - Existing test-setup.ts files still work
✅ **Matches industry patterns** - Similar to how Jest handles `@jest/globals/setup`

---

## Current Workaround

Manually maintain 5 identical test-setup.ts files across capture-bridge monorepo packages.

---

## Implementation Checklist

- [ ] Create `packages/testkit/src/setup/index.ts` with default configuration
- [ ] Export both default setup and `createTestSetup()` factory
- [ ] Add `./setup` to package.json exports
- [ ] Update TypeScript configuration to include new entry point
- [ ] Add tests for setup configuration
- [ ] Update TestKit documentation with examples
- [ ] Add migration guide for existing consumers
- [ ] Consider adding to condensed TDD guide as recommended pattern

---

## Related Files in capture-bridge

**Files that could be deleted after this feature:**
- `packages/foundation/test-setup.ts` (42 lines)
- `packages/capture/test-setup.ts` (13 lines)
- `packages/cli/test-setup.ts` (13 lines)
- `packages/storage/test-setup.ts` (13 lines)
- `packages/obsidian-bridge/test-setup.ts` (20 lines)

**Total reduction:** 101 lines of boilerplate across 5 files

---

## Questions for Implementation

1. **Should we provide both Option 1 and Option 2?**
   Recommendation: Yes - default export for 99% use case, factory for power users

2. **Should we log configuration confirmation by default?**
   Recommendation: Only in non-production environments to avoid test output noise

3. **Should this be in testkit-tdd-guide-condensed.md?**
   Recommendation: Yes, update "Test Templates Index" section with new simplified pattern

---

## Example Documentation Update

**Before:**
```markdown
### Test Setup

Create a test-setup.ts file in your package:

\`\`\`typescript
import { setupResourceCleanup } from '@orchestr8/testkit/config'

await setupResourceCleanup({
  cleanupAfterEach: true,
  cleanupAfterAll: true,
  enableLeakDetection: true,
  logStats: process.env['LOG_CLEANUP_STATS'] === '1',
})
\`\`\`
```

**After:**
```markdown
### Test Setup

Add TestKit's pre-configured setup to your vitest.config.ts:

\`\`\`typescript
setupFiles: [
  '@orchestr8/testkit/register',
  '@orchestr8/testkit/setup',  // ✨ Automatic resource cleanup
]
\`\`\`

For custom configuration, create test-setup.ts:

\`\`\`typescript
import { createTestSetup } from '@orchestr8/testkit/setup'

await createTestSetup({
  packageName: 'my-package',
  logStats: true
})
\`\`\`
```

---

## Priority Justification

**Low priority** because:
- Workaround exists (manual test-setup.ts files)
- Not blocking any functionality
- Purely a DX/maintenance improvement

**However, high value** because:
- Reduces cognitive load for new TestKit users
- Eliminates 100+ lines of boilerplate from capture-bridge
- Follows lean core principle (simplify adoption)
- One-time implementation benefits all future consumers

---

**Created by**: Claude Code (AI assistant)
**Date**: 2025-01-12
**Context**: During cleanup of `createMemoryUrl()` removal, identified opportunity to reduce test-setup duplication
