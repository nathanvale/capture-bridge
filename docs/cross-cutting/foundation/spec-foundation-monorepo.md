# Foundation — Monorepo Topology

**Decision:** pnpm workspaces + Turbo orchestration; TypeScript 5 strict; tsup builds.

## Workspace Map
```
apps/
  adhd-brain-pwa/       → Main PWA (private)

packages/
  @adhd-brain/capture/  → Capture channels (voice/text/web/email)
  @adhd-brain/staging/  → SQLite ledger + outbox
  @adhd-brain/bridge/   → Obsidian vault writer
  @adhd-brain/ai/       → PARA classifier (local-first)
  @adhd-brain/inbox/    → Review UI components
  @adhd-brain/shared/   → Common types/utils

tooling/
  @adhd-brain/config-tsconfig/ → Shared TS configs
  @adhd-brain/config-eslint/   → ESLint presets
  @adhd-brain/config-vitest/   → Test configs
```

## Files
- `pnpm-workspace.yaml` → workspace globs
- `turbo.json` → pipeline DAG
- Root `tsconfig.json` → project references
- Each workspace: `package.json` + `tsconfig.json`

## Commands
```bash
pnpm install         # Install all
pnpm build          # Turbo build all
pnpm test           # Vitest workspace mode
pnpm validate       # Full CI locally
```

## TDD: Boundary test that all packages build.