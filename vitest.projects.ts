import { resolve } from 'path'
import { createBaseVitestConfig } from '@orchestr8/testkit/config'

/**
 * Build the list of Vitest projects for this monorepo.
 * This is the single source of truth used by both Vitest and Wallaby.
 */
export function getVitestProjects() {
  const isWallaby = process.env['WALLABY_ENV'] === 'true'
  const isIntegration = process.env['TEST_MODE'] === 'integration' && !isWallaby
  const isE2E = process.env['TEST_MODE'] === 'e2e' && !isWallaby
  const globalTeardownPath = resolve(__dirname, 'node_modules/@orchestr8/testkit/dist/teardown/globalTeardown.js')

  const root = createBaseVitestConfig({
    test: {
      name: 'root',
      root: '.',
      environment: 'node',
      include: ['*.test.ts', 'tests/**/*.test.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/*.integration.test.*',
      ],
      ...(isWallaby ? {} : { globalTeardown: globalTeardownPath }),
      setupFiles: ['@orchestr8/testkit/register'],
      // Consistent overrides
      globals: true,
      mockReset: true,
      clearMocks: true,
      restoreMocks: false,
      sequence: { shuffle: false },
      env: {
        NODE_ENV: 'test',
        TEST_SEED: process.env['TEST_SEED'] || '12345',
        VITEST: 'true',
      },
    },
  })

  const foundation = createBaseVitestConfig({
    test: {
      name: 'foundation',
      root: resolve(__dirname, 'packages/foundation'),
      environment: 'node',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/*.integration.test.*',
      ],
      ...(isWallaby ? {} : { globalTeardown: globalTeardownPath }),
      setupFiles: [
        '@orchestr8/testkit/register',
        resolve(__dirname, 'packages/foundation/test-setup.ts'),
      ],
      // Use threads pool for MSW compatibility (MSW doesn't work with forks)
      pool: 'threads',
      poolOptions: {
        threads: {
          singleThread: false,
          isolate: true,
        },
      },
      testTimeout: 10000,
      hookTimeout: 5000,
      teardownTimeout: 20000,
      globals: true,
      mockReset: true,
      clearMocks: true,
      restoreMocks: false,
      sequence: { shuffle: false },
      env: {
        NODE_ENV: 'test',
        TEST_SEED: process.env['TEST_SEED'] || '12345',
        VITEST: 'true',
      },
    },
  })

  const capture = createBaseVitestConfig({
    test: {
      name: 'capture',
      root: resolve(__dirname, 'packages/capture'),
      environment: 'node',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/*.integration.test.*',
      ],
      ...(isWallaby ? {} : { globalTeardown: globalTeardownPath }),
      setupFiles: ['@orchestr8/testkit/register'],
      globals: true,
      mockReset: true,
      clearMocks: true,
      restoreMocks: false,
      sequence: { shuffle: false },
      env: {
        NODE_ENV: 'test',
        TEST_SEED: process.env['TEST_SEED'] || '12345',
        VITEST: 'true',
      },
    },
  })

  const cli = createBaseVitestConfig({
    test: {
      name: 'cli',
      root: resolve(__dirname, 'packages/cli'),
      environment: 'node',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/*.integration.test.*',
      ],
      ...(isWallaby ? {} : { globalTeardown: globalTeardownPath }),
      setupFiles: ['@orchestr8/testkit/register'],
      globals: true,
      mockReset: true,
      clearMocks: true,
      restoreMocks: false,
      sequence: { shuffle: false },
      env: {
        NODE_ENV: 'test',
        TEST_SEED: process.env['TEST_SEED'] || '12345',
        VITEST: 'true',
      },
    },
  })

  const storage = createBaseVitestConfig({
    test: {
      name: 'storage',
      root: resolve(__dirname, 'packages/storage'),
      environment: 'node',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/*.integration.test.*',
      ],
      ...(isWallaby ? {} : { globalTeardown: globalTeardownPath }),
      setupFiles: ['@orchestr8/testkit/register'],
      globals: true,
      mockReset: true,
      clearMocks: true,
      restoreMocks: false,
      sequence: { shuffle: false },
      env: {
        NODE_ENV: 'test',
        TEST_SEED: process.env['TEST_SEED'] || '12345',
        VITEST: 'true',
      },
    },
  })

  if (isIntegration) {
    // When integration mode is active, return ONLY the integration projects
    return [
      createBaseVitestConfig({
        test: {
          name: 'foundation-integration',
          root: resolve(__dirname, 'packages/foundation'),
          environment: 'node',
          include: [
            'src/**/*.integration.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'tests/**/*.integration.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
          ],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
          ...(isWallaby ? {} : { globalTeardown: globalTeardownPath }),
          setupFiles: [
            '@orchestr8/testkit/register',
            resolve(__dirname, 'packages/foundation/test-setup.ts'),
          ],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          teardownTimeout: 30_000,
          pool: 'threads',
          poolOptions: { threads: { singleThread: false, isolate: true } },
          globals: true,
          mockReset: true,
          clearMocks: true,
          restoreMocks: false,
          sequence: { shuffle: false },
          env: {
            NODE_ENV: 'test',
            TEST_SEED: process.env['TEST_SEED'] || '12345',
            VITEST: 'true',
          },
        },
      }),
    ]
  }

  if (isE2E) {
    // When e2e mode is active, return ONLY the e2e projects
    return [
      createBaseVitestConfig({
        test: {
          name: 'foundation-e2e',
          root: resolve(__dirname, 'packages/foundation'),
          environment: 'node',
          include: [
            'src/**/*.e2e.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'tests/**/*.e2e.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
          ],
          exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
          ...(isWallaby ? {} : { globalTeardown: globalTeardownPath }),
          setupFiles: [
            '@orchestr8/testkit/register',
            resolve(__dirname, 'packages/foundation/test-setup.ts'),
          ],
          testTimeout: 120_000,
          hookTimeout: 120_000,
          teardownTimeout: 60_000,
          pool: 'threads',
          poolOptions: { threads: { singleThread: false, isolate: true } },
          globals: true,
          mockReset: true,
          clearMocks: true,
          restoreMocks: false,
          sequence: { shuffle: false },
          env: {
            NODE_ENV: 'test',
            TEST_SEED: process.env['TEST_SEED'] || '12345',
            VITEST: 'true',
          },
        },
      }),
    ]
  }

  // Return unit test projects when not in integration/e2e mode
  return [root, foundation, capture, cli, storage]
}
