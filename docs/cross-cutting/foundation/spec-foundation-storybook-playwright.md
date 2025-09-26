# Foundation — Storybook & Playwright Setup

**Status:** Scaffolding only (no stories/tests yet).

## Storybook (Component Development)
```bash
npx storybook@latest init --skip-install
pnpm add -D @storybook/react-vite
```

### Structure
```
packages/inbox/
  src/
    InboxItem.tsx
    InboxItem.stories.tsx  → component states
```

### Config
```js
// .storybook/main.ts
export default {
  stories: ['../packages/*/src/**/*.stories.tsx'],
  framework: '@storybook/react-vite'
};
```

## Playwright (E2E)
```bash
pnpm add -D @playwright/test
npx playwright install
```

### Structure
```
e2e/
  inbox.spec.ts    → user flows
  fixtures/        → test data
```

### Config
```js
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173'
  }
});
```

## Commands
```bash
pnpm storybook      # Dev server :6006
pnpm test:e2e       # Playwright suite
```

## TDD: Deferred (UI not built).