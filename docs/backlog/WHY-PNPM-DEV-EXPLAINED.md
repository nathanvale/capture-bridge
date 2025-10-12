# Why `pnpm dev` Is Needed - Explained

**Question**: Why do we need `pnpm dev` for development? I thought tests should work without building?

**TL;DR**: Your monorepo packages import from each other using `workspace:*` dependencies, and those imports resolve to the **built `dist/` folder**, not the source TypeScript files. `pnpm dev` runs both the build watcher AND test watcher in parallel so changes are instantly available.

---

## The Core Issue

### Package Dependencies in Your Monorepo

```json
// packages/capture/package.json
{
  "dependencies": {
    "@capture-bridge/foundation": "workspace:*",
    "@capture-bridge/storage": "workspace:*",
    "@capture-bridge/obsidian-bridge": "workspace:*"
  }
}
```

```json
// packages/cli/package.json
{
  "dependencies": {
    "@capture-bridge/foundation": "workspace:*",
    "@capture-bridge/storage": "workspace:*",
    "@capture-bridge/capture": "workspace:*"
  }
}
```

### Where Do These Imports Resolve?

When your test code does:
```typescript
// In packages/capture/src/__tests__/auth-state-tracker.test.ts
const { createSchema } = await import('@capture-bridge/storage')
```

**This resolves to**: `packages/storage/dist/schema/index.js` (the BUILT file)
**NOT to**: `packages/storage/src/schema/index.ts` (the source file)

### Why?

Look at storage's package.json exports:
```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./schema": {
      "types": "./dist/schema/index.d.ts",
      "import": "./dist/schema/index.js"
    }
  }
}
```

The `exports` field tells Node.js where to find the package code, and it points to `dist/`.

---

## Proof: Tests Fail Without Building

```bash
# Delete storage's built output
cd packages/storage && rm -rf dist

# Try to run capture tests (which depend on storage)
cd ../capture && pnpm test

# Result:
Error: Failed to resolve entry for package "@capture-bridge/storage".
The package may have incorrect main/module/exports specified in its package.json.
```

**The tests literally cannot run** without the dependency being built first.

---

## What `pnpm dev` Actually Does

### In a Single Package (e.g., foundation)

```json
{
  "scripts": {
    "dev": "concurrently \"pnpm:dev:*\" --names \"build,test\" --prefix-colors \"blue,green\"",
    "dev:build": "tsup --watch",
    "dev:test": "vitest watch"
  }
}
```

**This runs TWO processes in parallel**:

1. **`tsup --watch`** (blue terminal output):
   - Watches `src/**/*.ts` for changes
   - Rebuilds to `dist/` on every save
   - Takes ~5-10ms per rebuild

2. **`vitest watch`** (green terminal output):
   - Watches test files for changes
   - Re-runs affected tests on every save
   - Tests run against the `dist/` files

### At Root Level

```json
{
  "scripts": {
    "dev": "turbo run dev --parallel"
  }
}
```

**This runs `dev` in ALL packages simultaneously** using Turbo's parallel execution.

---

## Why This Is Necessary

### Scenario: You Edit `packages/storage/src/schema/index.ts`

**Without `pnpm dev`**:
1. ❌ You edit the TypeScript source file
2. ❌ `dist/` folder is NOT updated (no build)
3. ❌ Tests in `packages/capture` import stale `dist/schema/index.js`
4. ❌ Your changes are NOT tested
5. ❌ You get confused why tests don't see your changes

**With `pnpm dev`**:
1. ✅ You edit the TypeScript source file
2. ✅ `tsup --watch` detects change and rebuilds in ~5-10ms
3. ✅ `vitest watch` detects new `dist/` file and re-runs affected tests
4. ✅ Tests in `packages/capture` import FRESH `dist/schema/index.js`
5. ✅ Your changes are immediately tested

---

## Alternative Approaches (and Why They Don't Work)

### "Why not make tests import source files directly?"

**Option 1: Use path aliases in tsconfig**
```json
{
  "compilerOptions": {
    "paths": {
      "@capture-bridge/storage": ["../storage/src/index.ts"]
    }
  }
}
```

**Problems**:
- Requires complex tsconfig setup in every package
- Vitest needs special configuration to resolve these
- Production imports still use `dist/`, so you're not testing what ships
- Type checking becomes inconsistent

**Option 2: Use Vitest's `resolve.alias`**
```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@capture-bridge/storage': '../storage/src/index.ts'
    }
  }
})
```

**Problems**:
- Same as Option 1
- Breaks when you publish packages (they won't have source files)
- Development behavior diverges from production

### "Why not use a TypeScript-only test runner?"

**Problem**: You'd still need to transpile TypeScript to JavaScript eventually. The build step is unavoidable in a production app.

---

## The Design Philosophy

Your monorepo is set up to **mirror production**:

1. **Source code** lives in `src/`
2. **Built artifacts** live in `dist/` (ignored by git)
3. **Packages import from other packages** via `dist/` (just like npm packages)
4. **Tests run against built code** (what actually ships)

This ensures:
- ✅ Tests validate what will run in production
- ✅ No surprises when publishing packages
- ✅ Build issues caught early
- ✅ Type definitions are generated and tested

---

## Workflow Comparison

### Without `pnpm dev` (manual approach)

```bash
# Edit packages/storage/src/schema/index.ts
vim packages/storage/src/schema/index.ts

# Build manually
cd packages/storage && pnpm build

# Run tests manually
cd ../capture && pnpm test

# Result: 15-30 seconds per iteration, error-prone
```

### With `pnpm dev` (automated approach)

```bash
# Start dev mode ONCE
pnpm dev

# Edit packages/storage/src/schema/index.ts
# [tsup rebuilds automatically in 5-10ms]
# [vitest re-runs affected tests automatically]

# Result: <1 second per iteration, zero manual steps
```

**Time saved**: ~20-30 seconds per code change
**Over 100 changes**: ~30-50 minutes saved per day

---

## When You DON'T Need `pnpm dev`

### Scenario 1: Working on an Isolated Package

If you're ONLY working on `packages/foundation` and it has NO dependencies on other workspace packages:

```bash
cd packages/foundation

# Just run tests
pnpm test

# Or watch mode
pnpm test:watch
```

**Why this works**: Foundation doesn't import from other packages, so it only needs its own source files.

### Scenario 2: Quick Validation

If you just want to run tests once without watching:

```bash
# Build everything once
pnpm build

# Run tests once
pnpm test
```

**Why this works**: One-time build ensures all `dist/` folders are up-to-date.

---

## Best Practices

### For Active Development (Recommended)

```bash
# Start in one terminal, leave it running
pnpm dev

# Edit code in your editor
# Watch terminal for instant feedback
```

**Pros**: Instant feedback, zero manual steps, catches issues immediately

### For Quick Checks

```bash
# Run tests across all packages
pnpm test

# If failures, check if build is needed
pnpm build && pnpm test
```

**Pros**: Simple, good for CI-like validation

### For CI/CD

```bash
# Always build first
pnpm build

# Then test
pnpm test
```

**Pros**: Validates complete build pipeline, catches build errors

---

## Technical Details

### How tsup Works

```bash
tsup --watch

# Watches: src/**/*.ts
# Builds to: dist/**/*.js + dist/**/*.d.ts
# Speed: ~5-10ms per rebuild (incremental)
# Uses: esbuild (extremely fast)
```

### How Vitest Watch Works

```bash
vitest watch

# Watches:
#   - Test files: src/__tests__/**/*.test.ts
#   - Source files: src/**/*.ts
#   - Dependencies: node_modules/@capture-bridge/**/dist/**
# Re-runs: Only affected tests (smart diffing)
# Speed: ~100-500ms per test run (depends on test count)
```

### Why Both Are Needed

1. **Edit source** → tsup rebuilds `dist/` → vitest re-runs tests
2. **Edit test** → vitest re-runs immediately (no build needed)
3. **Edit dependency source** → tsup rebuilds dependency → vitest re-runs dependent tests

---

## Common Questions

### Q: Why not use TypeScript's `tsc` instead of `tsup`?

**A**: `tsc` is slow (~1-2 seconds per rebuild). `tsup` uses esbuild which is 10-100x faster (~5-10ms). For watch mode, speed matters.

### Q: Can I use `pnpm test:watch` without `pnpm dev`?

**A**: Only if you're working on a package with NO dependencies on other workspace packages. Otherwise, tests will use stale `dist/` files.

### Q: Why does the root `pnpm dev` run ALL packages?

**A**: Turbo's parallel mode means all packages watch simultaneously. This ensures ANY package change triggers the right rebuilds across the whole monorepo.

### Q: What if I only want to watch ONE package?

**A**:
```bash
# Option 1: Run dev in that package only
cd packages/capture && pnpm dev

# Option 2: Use turbo's filter
turbo run dev --filter=@capture-bridge/capture
```

---

## Summary

**You NEED `pnpm dev` because**:

1. ✅ Packages import from other packages' `dist/` folders
2. ✅ Tests run against built code (not source)
3. ✅ Watch mode needs both build AND test watching
4. ✅ Manual building is slow and error-prone

**`pnpm dev` provides**:

1. ✅ Automatic rebuilds on source changes (5-10ms)
2. ✅ Automatic test re-runs on any changes
3. ✅ Parallel execution across all packages
4. ✅ Instant feedback loop

**The alternative (manual builds) wastes 30-50 minutes per day.**

---

**Created**: 2025-10-12
**Related**: CLAUDE.md Development Workflow section
