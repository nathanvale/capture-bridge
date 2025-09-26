# Foundation Tech Spec — ADHD Brain (Production Diamond)

**Area:** Cross-cutting → Foundation
**Status:** Draft
**Owner:** Nathan
**Last Updated:** $(date +%Y-%m-%d)

This document is the **overview**. Detailed sub-specs live alongside:

- `spec-foundation-monorepo.md` — pnpm/Turbo layout, project refs, workspace map
- `spec-foundation-testing.md` — Vitest lanes, CI validate, boundary tests
- `spec-foundation-linting.md` — Orchestr8 ESLint (flat) + Prettier
- `spec-foundation-ci.md` — GitHub Actions pipeline & caches
- `spec-foundation-storybook-playwright.md` — Storybook/Playwright stubs & enablement
- `spec-foundation-boundaries.md` — package import rules & guardrails

## Purpose
Private, zero-impl monorepo with <5s feedback loops and deterministic CI.

## Outcomes (DoD)
- `pnpm validate` green on clean clone (macOS/Linux)
- All workspaces private + build via tsup
- Vitest workspace lanes: unit + contracts
- Orchestr8 ESLint/Prettier applied verbatim
- CI: install → lint → typecheck → test

## TDD Applicability (from Guide)
- **Risk:** Medium overall; **High** for pipeline integrity
- **Decision:** **Required** → boundary tests, CI validate; **Optional** → trivial unit scaffolds
- **YAGNI:** No publish, no runtime deps, no DB/UI/AI impl in scaffolding

See sub-specs for details.