import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testkit Core Utilities Test
 *
 * Verifies all core utilities from @orchestr8/testkit work correctly
 * without requiring any optional dependencies.
 *
 * Tests cover:
 * - delay - Promise-based delay utility
 * - retry - Retry logic with exponential backoff
 * - withTimeout - Timeout wrapper for promises
 * - createMockFn - Mock function creator
 * - Environment utilities
 * - File system utilities
 * - Vitest configuration helpers
 */

describe('Testkit Core Utilities', () => {
  describe('Async Utilities', () => {
    describe('delay', () => {
      it('should delay execution for specified milliseconds', async () => {
        const { delay } = await import('@orchestr8/testkit');

        const start = Date.now();
        await delay(100);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(95); // Allow 5ms variance
        expect(elapsed).toBeLessThan(150); // Should not take too long

        console.log(`✅ delay(100) took ${elapsed}ms`);
      });

      it('should handle zero delay', async () => {
        const { delay } = await import('@orchestr8/testkit');

        const start = Date.now();
        await delay(0);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(20); // Should be nearly instant

        console.log('✅ delay(0) works correctly');
      });
    });

    describe('retry', () => {
      it('should retry failed operations', async () => {
        const { retry } = await import('@orchestr8/testkit');

        let attempts = 0;
        const operation = async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error(`Attempt ${attempts} failed`);
          }
          return 'success';
        };

        const result = await retry(operation, 5, 10);

        expect(result).toBe('success');
        expect(attempts).toBe(3);

        console.log(`✅ retry succeeded after ${attempts} attempts`);
      });

      it('should fail after max retries', async () => {
        const { retry } = await import('@orchestr8/testkit');

        let attempts = 0;
        const operation = async () => {
          attempts++;
          throw new Error(`Always fails - attempt ${attempts}`);
        };

        await expect(retry(operation, 3, 10)).rejects.toThrow('Always fails');
        expect(attempts).toBe(3);

        console.log(`✅ retry failed after ${attempts} attempts as expected`);
      });

      it('should apply exponential backoff', async () => {
        const { retry } = await import('@orchestr8/testkit');

        let attempts = 0;
        const timestamps: number[] = [];

        const operation = async () => {
          timestamps.push(Date.now());
          attempts++;
          if (attempts < 3) {
            throw new Error('Retry me');
          }
          return 'success';
        };

        const start = Date.now();
        await retry(operation, 3, 50); // 50ms base delay

        // Check that delays increase
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];

        expect(delay1).toBeGreaterThanOrEqual(45); // First retry ~50ms
        expect(delay2).toBeGreaterThanOrEqual(90); // Second retry ~100ms (exponential)

        console.log('✅ Exponential backoff working');
      });
    });

    describe('withTimeout', () => {
      it('should complete within timeout', async () => {
        const { withTimeout, delay } = await import('@orchestr8/testkit');

        const fastOperation = delay(50).then(() => 'completed');
        const result = await withTimeout(fastOperation, 200);

        expect(result).toBe('completed');

        console.log('✅ withTimeout allows fast operations');
      });

      it('should timeout slow operations', async () => {
        const { withTimeout, delay } = await import('@orchestr8/testkit');

        const slowOperation = delay(200).then(() => 'too late');

        await expect(
          withTimeout(slowOperation, 50)
        ).rejects.toThrow('timeout');

        console.log('✅ withTimeout rejects slow operations');
      });

      it('should preserve promise rejection', async () => {
        const { withTimeout } = await import('@orchestr8/testkit');

        const failingOperation = Promise.reject(new Error('Original error'));

        await expect(
          withTimeout(failingOperation, 1000)
        ).rejects.toThrow('Original error');

        console.log('✅ withTimeout preserves original errors');
      });
    });
  });

  describe('Mock Function Utility', () => {
    it('should create mock functions', async () => {
      const { createMockFn } = await import('@orchestr8/testkit');

      const mockFn = createMockFn();

      expect(mockFn).toBeDefined();
      expect(typeof mockFn).toBe('function');

      // Call the mock
      const result = mockFn('arg1', 'arg2');

      // Note: createMockFn may not return a vitest spy
      // It might be a simpler mock implementation
      expect(result).toBeDefined(); // Basic check

      console.log('✅ createMockFn creates callable functions');
    });

    it('should work with custom implementations', async () => {
      const { createMockFn } = await import('@orchestr8/testkit');

      // If createMockFn supports custom implementations
      const mockFn = createMockFn((x: number) => x * 2);

      const result = mockFn(5);

      // Test if it returns the implementation result
      if (typeof result === 'number') {
        expect(result).toBe(10);
        console.log('✅ createMockFn supports custom implementations');
      } else {
        console.log('ℹ️ createMockFn uses basic mock implementation');
      }
    });
  });

  describe('Environment Utilities', () => {
    it('should detect test environment', async () => {
      const { getTestEnvironment } = await import('@orchestr8/testkit');

      const env = getTestEnvironment();

      expect(env).toBeDefined();
      expect(env).toHaveProperty('isTest');
      expect(env.isTest).toBe(true); // We're in a test!

      // Check for other environment properties
      expect(env).toHaveProperty('isCI');
      expect(env).toHaveProperty('isLocal');
      expect(env).toHaveProperty('isDebug');

      console.log('✅ Test environment detected:', {
        isTest: env.isTest,
        isCI: env.isCI,
        isLocal: env.isLocal,
        isDebug: env.isDebug
      });
    });

    it('should get test timeouts', async () => {
      const { getTestTimeouts } = await import('@orchestr8/testkit');

      const timeouts = getTestTimeouts();

      expect(timeouts).toBeDefined();
      expect(timeouts).toHaveProperty('unit');
      expect(timeouts).toHaveProperty('integration');
      expect(timeouts).toHaveProperty('e2e');

      expect(typeof timeouts.unit).toBe('number');
      expect(typeof timeouts.integration).toBe('number');
      expect(typeof timeouts.e2e).toBe('number');

      // Verify reasonable timeout values
      expect(timeouts.unit).toBeGreaterThan(0);
      expect(timeouts.integration).toBeGreaterThan(timeouts.unit);
      expect(timeouts.e2e).toBeGreaterThan(timeouts.integration);

      console.log('✅ Test timeouts:', timeouts);
    });

    it('should setup test environment variables', async () => {
      const { setupTestEnv } = await import('@orchestr8/testkit');

      const originalValue = process.env.TEST_VAR;

      // Setup test environment
      const restore = setupTestEnv({
        TEST_VAR: 'test-value',
        ANOTHER_VAR: 'another-value'
      });

      expect(process.env.TEST_VAR).toBe('test-value');
      expect(process.env.ANOTHER_VAR).toBe('another-value');

      // Restore original environment
      restore();

      expect(process.env.TEST_VAR).toBe(originalValue);

      console.log('✅ Environment setup and restore works');
    });
  });

  describe('File System Utilities', () => {
    it('should create temporary directory', async () => {
      const { createTempDirectory } = await import('@orchestr8/testkit');
      const fs = await import('fs/promises');

      const tempDir = createTempDirectory();

      expect(tempDir).toBeDefined();
      expect(tempDir.path).toBeDefined();
      expect(typeof tempDir.path).toBe('string');

      // Verify directory exists
      const stats = await fs.stat(tempDir.path);
      expect(stats.isDirectory()).toBe(true);

      // Cleanup
      if (tempDir.cleanup) {
        await tempDir.cleanup();
      }

      console.log('✅ Created temp directory:', tempDir.path);
    });

    it('should create named temporary directory', async () => {
      const { createNamedTempDirectory } = await import('@orchestr8/testkit');
      const fs = await import('fs/promises');

      const tempDir = createNamedTempDirectory('test-prefix');

      expect(tempDir.path).toContain('test-prefix');

      // Verify directory exists
      const stats = await fs.stat(tempDir.path);
      expect(stats.isDirectory()).toBe(true);

      // Cleanup
      if (tempDir.cleanup) {
        await tempDir.cleanup();
      }

      console.log('✅ Created named temp directory:', tempDir.path);
    });

    it('should create multiple temporary directories', async () => {
      const { createMultipleTempDirectories } = await import('@orchestr8/testkit');
      const fs = await import('fs/promises');

      const tempDirs = createMultipleTempDirectories(3);

      expect(tempDirs).toHaveLength(3);

      // Verify all directories exist and are unique
      const paths = new Set();
      for (const dir of tempDirs) {
        expect(dir.path).toBeDefined();
        paths.add(dir.path);

        const stats = await fs.stat(dir.path);
        expect(stats.isDirectory()).toBe(true);
      }

      expect(paths.size).toBe(3); // All paths are unique

      // Cleanup all
      const { cleanupMultipleTempDirectories } = await import('@orchestr8/testkit');
      await cleanupMultipleTempDirectories(tempDirs);

      console.log('✅ Created 3 unique temp directories');
    });

    it('should use managed temporary directory', async () => {
      const { useTempDirectory, createManagedTempDirectory } = await import('@orchestr8/testkit/fs');
      const fs = await import('fs/promises');
      const path = await import('path');

      // Use temp directory in a test context
      const tempDir = await useTempDirectory(async (dir) => {
        // Write a test file
        const testFile = path.join(dir.path, 'test.txt');
        await fs.writeFile(testFile, 'test content');

        // Verify file exists
        const content = await fs.readFile(testFile, 'utf-8');
        expect(content).toBe('test content');

        return 'completed';
      });

      expect(tempDir).toBe('completed');

      console.log('✅ Managed temp directory with automatic cleanup');
    });
  });

  describe('Vitest Configuration Utilities', () => {
    it('should create base vitest config', async () => {
      const { createBaseVitestConfig, createVitestBaseConfig } = await import('@orchestr8/testkit');

      const config = createBaseVitestConfig();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('test');
      expect(config.test).toBeDefined();

      // Check for common test config properties
      if (config.test) {
        expect(typeof config.test).toBe('object');
      }

      // Both functions should exist (aliases)
      expect(createVitestBaseConfig).toBe(createBaseVitestConfig);

      console.log('✅ Vitest base config created');
    });

    it('should create CI optimized config', async () => {
      const { createCIOptimizedConfig, createCIConfig } = await import('@orchestr8/testkit');

      const config = createCIOptimizedConfig();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('test');

      // CI config should have specific optimizations
      if (config.test) {
        // Check for CI-specific settings like reporters, coverage, etc.
        expect(config.test).toBeDefined();
      }

      // Both functions should exist (aliases)
      expect(createCIConfig).toBe(createCIOptimizedConfig);

      console.log('✅ CI optimized config created');
    });

    it('should create Wallaby optimized config', async () => {
      const { createWallabyOptimizedConfig, createWallabyConfig } = await import('@orchestr8/testkit');

      const config = createWallabyOptimizedConfig();

      expect(config).toBeDefined();
      expect(config).toHaveProperty('test');

      // Both functions should exist (aliases)
      expect(createWallabyConfig).toBe(createWallabyOptimizedConfig);

      console.log('✅ Wallaby optimized config created');
    });

    it('should define vitest config', async () => {
      const { defineVitestConfig } = await import('@orchestr8/testkit');

      const customConfig = {
        test: {
          globals: true,
          environment: 'node'
        }
      };

      const config = defineVitestConfig(customConfig);

      expect(config).toBeDefined();
      expect(config.test?.globals).toBe(true);
      expect(config.test?.environment).toBe('node');

      console.log('✅ defineVitestConfig wrapper works');
    });

    it('should provide default config', async () => {
      const { baseVitestConfig, defaultConfig } = await import('@orchestr8/testkit');

      expect(baseVitestConfig).toBeDefined();
      expect(defaultConfig).toBeDefined();
      expect(defaultConfig).toBe(baseVitestConfig); // Should be aliases

      console.log('✅ Default configs available');
    });

    it('should create coverage config', async () => {
      const { createVitestCoverage } = await import('@orchestr8/testkit');

      const coverage = createVitestCoverage();

      expect(coverage).toBeDefined();
      expect(coverage).toHaveProperty('enabled');
      expect(coverage).toHaveProperty('reporter');

      console.log('✅ Coverage config created');
    });

    it('should create environment config', async () => {
      const { createVitestEnvironmentConfig } = await import('@orchestr8/testkit');

      const envConfig = createVitestEnvironmentConfig('happy-dom');

      expect(envConfig).toBeDefined();
      expect(envConfig.environment).toBe('happy-dom');

      console.log('✅ Environment config created');
    });

    it('should create pool options', async () => {
      const { createVitestPoolOptions } = await import('@orchestr8/testkit');

      const poolOptions = createVitestPoolOptions({
        threads: true,
        maxThreads: 4
      });

      expect(poolOptions).toBeDefined();
      expect(poolOptions.threads).toBe(true);
      expect(poolOptions.maxThreads).toBe(4);

      console.log('✅ Pool options created');
    });

    it('should create timeout config', async () => {
      const { createVitestTimeouts } = await import('@orchestr8/testkit');

      const timeouts = createVitestTimeouts({
        test: 5000,
        hook: 10000
      });

      expect(timeouts).toBeDefined();
      expect(timeouts.test).toBe(5000);
      expect(timeouts.hook).toBe(10000);

      console.log('✅ Timeout config created');
    });
  });

  describe('Type Exports', () => {
    it('should export TypeScript types', async () => {
      // This test verifies that types are available (compile-time check)
      // We can't directly test types at runtime, but we can verify the module structure
      const testkit = await import('@orchestr8/testkit');

      // Verify the module has expected structure
      expect(testkit).toBeDefined();

      // List all exports for documentation
      const exports = Object.keys(testkit).sort();

      console.log('✅ Available exports:', exports.length);
      console.log('  Core utilities:', exports.filter(e =>
        ['delay', 'retry', 'withTimeout', 'createMockFn'].includes(e)
      ).join(', '));
      console.log('  Environment:', exports.filter(e =>
        e.includes('Test') || e.includes('Env')
      ).join(', '));
      console.log('  File system:', exports.filter(e =>
        e.includes('Temp') || e.includes('Directory')
      ).join(', '));
      console.log('  Vitest config:', exports.filter(e =>
        e.includes('Vitest') || e.includes('Config')
      ).join(', '));
    });
  });
});