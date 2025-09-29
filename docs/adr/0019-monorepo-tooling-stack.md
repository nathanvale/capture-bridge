---
adr: 0019
title: Monorepo Tooling Stack (pnpm + Turbo + TSUP)
status: accepted
context-date: 2025-09-28
owner: Nathan
spec_type: adr
version: 0.1.0
---

# ADR 0019: Monorepo Tooling Stack (pnpm + Turbo + TSUP)

## Status

Accepted

## Context

The ADHD Brain project requires a monorepo foundation that supports fast feedback loops (< 30s builds/tests), cognitive load reduction (ADHD-optimized), and atomic changes across packages. The foundation must serve as the ROOT dependency for all features.

Key requirements:
- Build time < 30s for full monorepo
- Test time < 30s with parallel execution
- Setup time < 5 minutes from fresh clone
- Zero circular dependencies between packages
- Maximum 4 packages for cognitive simplicity
- Proven tooling patterns from established codebases

Alternative tooling stacks considered:
1. **npm workspaces + custom build scripts + esbuild**
2. **yarn workspaces + Nx + webpack**
3. **pnpm workspaces + Turbo + TSUP** (chosen)
4. **Lerna + Rush + rollup**

## Decision

We will use **pnpm + Turbo + TSUP** as our monorepo tooling stack with external @orchestr8/testkit for test infrastructure.

**Core Stack:**
- **Package Manager:** pnpm@9.15.4 (workspaces, fast installs)
- **Build Orchestrator:** Turbo@2.5.6 (task graph, caching)
- **Bundler:** TSUP@8.3.0 (fast ESM+CJS, TypeScript)
- **Test Infrastructure:** @orchestr8/testkit (external, proven patterns)
- **Language:** TypeScript with strict mode (ESNext + node16 modules)

**Configuration:**
- ESLint flat config with boundary enforcement
- Prettier with ADHD-optimized formatting (100 char width, no semicolons)
- Vitest projects for isolated parallel testing
- No remote Turbo cache (privacy-first)

## Alternatives Considered

### Alternative 1: npm workspaces + custom build
**Pros:** Built-in to Node.js, no external dependencies
**Cons:** Slower than pnpm, no task orchestration, requires custom caching
**Rejected:** Performance doesn't meet < 30s requirement

### Alternative 2: yarn workspaces + Nx
**Pros:** Powerful task graph, extensive plugin ecosystem
**Cons:** Yarn Berry learning curve, Nx complexity overhead, not proven in gold standard
**Rejected:** Too complex for 4-package constraint, cognitive overhead

### Alternative 4: Lerna + Rush
**Pros:** Enterprise-grade monorepo management
**Cons:** Lerna deprecated, Rush overkill for small monorepo
**Rejected:** Abandoned/oversized for ADHD Brain scope

## Consequences

### Positive
- **Fast feedback loops:** Turbo caching enables < 5s incremental builds
- **Proven patterns:** Gold standard repo (`/Users/nathanvale/code/bun-changesets-template/`) validates this stack
- **TypeScript excellence:** TSUP provides fast bundling with perfect TS support
- **Test isolation:** @orchestr8/testkit prevents flaky tests and resource conflicts
- **ADHD-friendly:** 4-package limit + external testkit reduces cognitive load
- **Privacy preservation:** No remote cache, local-first development

### Negative
- **External dependency:** @orchestr8/testkit requires maintenance outside project
- **Learning curve:** Turbo task graph concepts need documentation
- **Lock-in risk:** Switching from this stack requires significant refactoring
- **Limited plugins:** TSUP has fewer plugins than webpack/rollup

### Mitigations
- External testkit is versioned and stable (@orchestr8 maintains it)
- Comprehensive doctor command validates workspace health
- Gold standard repo provides reference implementation
- 4-package constraint limits blast radius of tooling changes

## Related Decisions
- [ADR 0001: Voice File Sovereignty](./0001-voice-file-sovereignty.md) - No file copying enables faster builds
- [ADR 0002: Dual Hash Migration](./0002-dual-hash-migration.md) - BLAKE3 performance aligns with build speed goals

## References
- [Foundation Monorepo PRD](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/prd-foundation-monorepo.md)
- [Foundation Monorepo Tech Spec](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-foundation-monorepo-tech.md)
- [Foundation Monorepo Arch Spec](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-foundation-monorepo-arch.md)
- [Foundation Monorepo Test Spec](/Users/nathanvale/code/adhd-brain/docs/cross-cutting/spec-foundation-monorepo-test.md)
- Gold Standard Repository: `/Users/nathanvale/code/bun-changesets-template/`