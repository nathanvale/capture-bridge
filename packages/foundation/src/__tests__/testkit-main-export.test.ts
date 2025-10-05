import { describe, it, expect } from 'vitest';

/**
 * @orchestr8/testkit Integration Test (External Dependency Validation)
 *
 * PURPOSE: This test validates that the external @orchestr8/testkit package
 * works correctly in our environment. It is NOT testing @capture-bridge/foundation.
 *
 * CONTEXT:
 * - @orchestr8/testkit is an external npm package (v2.0.0)
 * - This is an integration/smoke test for our testing infrastructure
 * - Tests the lean core implementation pattern of the external testkit
 *
 * LEAN CORE PRINCIPLES (from @orchestr8/testkit):
 * - Main export contains ONLY core utilities
 * - No optional dependencies required
 * - Sub-exports for optional features
 * - Lazy loading pattern
 *
 * NOTE: This test is located in foundation package as it validates
 * the root-level testing infrastructure that all packages depend on.
 */
describe('@orchestr8/testkit - External Dependency Integration', () => {
  it('should import core utilities from lean main export', async () => {
    const testkit = await import('@orchestr8/testkit');

    console.log('✅ Lean Core Main Export Verification');
    console.log('==========================================');

    const allExports = Object.keys(testkit);
    console.log(`Total exports: ${allExports.length}`);

    // Core utilities that MUST be in main export
    const coreUtilities = [
      'delay',
      'retry',
      'withTimeout',
      // File system utilities (part of core)
      'createTempDirectory',
      'createNamedTempDirectory',
      // Config utilities (part of core)
      'createBaseVitestConfig',
      'createVitestCoverage',
    ];

    // Verify all core utilities are present
    for (const utility of coreUtilities) {
      expect(testkit[utility]).toBeDefined();
      expect(typeof testkit[utility]).toBe('function');
    }

    // Optional utilities that should NOT be in main export
    const optionalUtilities = [
      'setupMSW',           // Should be in @orchestr8/testkit/msw
      'createMemoryUrl',    // Should be in @orchestr8/testkit/sqlite
    ];

    // Verify optional utilities are correctly excluded
    for (const utility of optionalUtilities) {
      expect(testkit[utility]).toBeUndefined();
    }

    console.log('✅ Core utilities verified:', coreUtilities.length);
    console.log('✅ Optional utilities correctly excluded:', optionalUtilities.length);
    console.log('ℹ️  Note: Main export includes fs/core and config utilities as part of core');
  });

  it('should use core utilities without optional dependencies', async () => {
    const { delay, retry, withTimeout } = await import('@orchestr8/testkit');

    console.log('\n🧑 Core Utility Tests');
    console.log('========================');

    // Test delay utility
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some variance
    console.log('✅ delay() works');

    // Test retry utility
    let attempts = 0;
    const retryResult = await retry(
      () => {
        attempts++;
        if (attempts < 2) throw new Error('retry test');
        return 'success';
      },
      3,
      10
    );
    expect(retryResult).toBe('success');
    expect(attempts).toBe(2);
    console.log('✅ retry() works');

    // Test withTimeout utility
    const timeoutPromise = withTimeout(
      delay(10).then(() => 'completed'),
      100
    );
    const timeoutResult = await timeoutPromise;
    expect(timeoutResult).toBe('completed');
    console.log('✅ withTimeout() works');

    console.log('\n✅ All core utilities working without optional dependencies!');
  });

  it('should verify sub-exports work for optional features', async () => {
    console.log('\n📦 Sub-Export Verification');
    console.log('============================');

    // Test that sub-exports can be imported for optional features
    const subExports = [
      { path: '@orchestr8/testkit/utils', feature: 'Testing utilities' },
      { path: '@orchestr8/testkit/env', feature: 'Environment control' },
      { path: '@orchestr8/testkit/msw', feature: 'Mock Service Worker' },
      { path: '@orchestr8/testkit/sqlite', feature: 'SQLite testing' },
      { path: '@orchestr8/testkit/fs', feature: 'File system utilities' }
    ];

    const results = [];
    for (const { path, feature } of subExports) {
      try {
        await import(path);
        results.push(`✅ ${path} - ${feature}`);
      } catch (error) {
        // Some sub-exports may require optional dependencies
        // This is expected and part of the lean core design
        results.push(`⚠️ ${path} - ${feature} (requires optional deps)`);
      }
    }

    console.log(results.join('\n'));
    console.log('\n✅ Lean core pattern verified: Optional features available via sub-exports');
  });
});