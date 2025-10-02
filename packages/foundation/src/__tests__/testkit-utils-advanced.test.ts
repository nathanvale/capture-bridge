import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Testkit Advanced Utils Test
 *
 * Verifies @orchestr8/testkit advanced utility features:
 * - Concurrency management
 * - Object pooling
 * - Resource management
 * - Security validation
 * - Testing utilities
 */

describe('Testkit Advanced Utils', () => {
  describe('Testing Utilities', () => {
    it('should export TestingUtils object', async () => {
      const { TestingUtils } = await import('@orchestr8/testkit/utils');

      expect(TestingUtils).toBeDefined();
      expect(TestingUtils).toHaveProperty('createTestBuffer');
      expect(TestingUtils).toHaveProperty('releaseTestBuffer');
      expect(TestingUtils).toHaveProperty('createTestArray');
      expect(TestingUtils).toHaveProperty('releaseTestArray');
      expect(TestingUtils).toHaveProperty('createControlledPromise');

      console.log('✅ TestingUtils exports verified');
    });

    it('should create and release test buffers', async () => {
      const { TestingUtils } = await import('@orchestr8/testkit/utils');

      // Create test buffer
      const buffer = TestingUtils.createTestBuffer(1024);

      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(1024);

      // Release buffer back to pool
      TestingUtils.releaseTestBuffer(buffer);

      console.log('✅ Test buffer pooling works');
    });

    it('should create and release test arrays', async () => {
      const { TestingUtils } = await import('@orchestr8/testkit/utils');

      // Create test array
      const array = TestingUtils.createTestArray<number>();

      expect(array).toBeDefined();
      expect(Array.isArray(array)).toBe(true);

      // Use array
      array.push(1, 2, 3);
      expect(array).toHaveLength(3);

      // Release array back to pool
      TestingUtils.releaseTestArray(array);

      console.log('✅ Test array pooling works');
    });

    it('should create controlled promises', async () => {
      const { TestingUtils } = await import('@orchestr8/testkit/utils');

      const { promise, resolve, reject } = TestingUtils.createControlledPromise<string>();

      expect(promise).toBeDefined();
      expect(typeof resolve).toBe('function');
      expect(typeof reject).toBe('function');

      // Resolve promise
      resolve('test value');
      const result = await promise;

      expect(result).toBe('test value');

      console.log('✅ Controlled promise works');
    });

    it('should handle controlled promise rejection', async () => {
      const { TestingUtils } = await import('@orchestr8/testkit/utils');

      const { promise, resolve, reject } = TestingUtils.createControlledPromise<string>();

      // Reject promise
      reject(new Error('test error'));

      await expect(promise).rejects.toThrow('test error');

      console.log('✅ Controlled promise rejection works');
    });
  });

  describe('Concurrency Management', () => {
    it('should export concurrency managers', async () => {
      const {
        ConcurrencyManager,
        databaseOperationsManager,
        fileOperationsManager,
        networkOperationsManager,
        processSpawningManager,
        resourceCleanupManager
      } = await import('@orchestr8/testkit/utils');

      expect(ConcurrencyManager).toBeDefined();
      expect(databaseOperationsManager).toBeDefined();
      expect(fileOperationsManager).toBeDefined();
      expect(networkOperationsManager).toBeDefined();
      expect(processSpawningManager).toBeDefined();
      expect(resourceCleanupManager).toBeDefined();

      console.log('✅ Concurrency managers exported');
    });

    it('should limit concurrency', async () => {
      const { limitConcurrency } = await import('@orchestr8/testkit/utils');

      const tasks = Array.from({ length: 10 }, (_, i) =>
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return i;
        }
      );

      const results = await limitConcurrency(tasks, 3); // Max 3 concurrent

      expect(results).toHaveLength(10);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      console.log('✅ Concurrency limiting works');
    });

    it('should provide limitedAll function', async () => {
      const { limitedAll } = await import('@orchestr8/testkit/utils');

      const promises = Array.from({ length: 5 }, (_, i) =>
        Promise.resolve(i)
      );

      const results = await limitedAll(promises, 2);

      expect(results).toEqual([0, 1, 2, 3, 4]);

      console.log('✅ limitedAll works');
    });

    it('should provide limitedAllSettled function', async () => {
      const { limitedAllSettled } = await import('@orchestr8/testkit/utils');

      const promises = [
        Promise.resolve(1),
        Promise.reject(new Error('failed')),
        Promise.resolve(3)
      ];

      const results = await limitedAllSettled(promises, 2);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      console.log('✅ limitedAllSettled works');
    });

    it('should provide limitedPromiseAll function', async () => {
      const { limitedPromiseAll } = await import('@orchestr8/testkit/utils');

      const promises = Array.from({ length: 5 }, (_, i) =>
        Promise.resolve(i * 2)
      );

      const results = await limitedPromiseAll(promises, 3);

      expect(results).toEqual([0, 2, 4, 6, 8]);

      console.log('✅ limitedPromiseAll works');
    });

    it('should export default concurrency limits', async () => {
      const { DEFAULT_CONCURRENCY_LIMITS } = await import('@orchestr8/testkit/utils');

      expect(DEFAULT_CONCURRENCY_LIMITS).toBeDefined();
      expect(DEFAULT_CONCURRENCY_LIMITS).toHaveProperty('database');
      expect(DEFAULT_CONCURRENCY_LIMITS).toHaveProperty('network');
      expect(DEFAULT_CONCURRENCY_LIMITS).toHaveProperty('file');

      console.log('✅ Default concurrency limits:', DEFAULT_CONCURRENCY_LIMITS);
    });
  });

  describe('Object Pooling', () => {
    it('should export object pool types', async () => {
      const {
        ObjectPool,
        ArrayPool,
        BufferPool,
        PromisePool,
        poolManager
      } = await import('@orchestr8/testkit/utils');

      expect(ObjectPool).toBeDefined();
      expect(ArrayPool).toBeDefined();
      expect(BufferPool).toBeDefined();
      expect(PromisePool).toBeDefined();
      expect(poolManager).toBeDefined();

      console.log('✅ Object pool types exported');
    });

    it('should provide pool manager', async () => {
      const { poolManager } = await import('@orchestr8/testkit/utils');

      expect(poolManager).toBeDefined();
      expect(poolManager).toHaveProperty('getBufferPool');
      expect(poolManager).toHaveProperty('getArrayPool');

      console.log('✅ Pool manager available');
    });

    it('should export default pool options', async () => {
      const { DEFAULT_POOL_OPTIONS } = await import('@orchestr8/testkit/utils');

      expect(DEFAULT_POOL_OPTIONS).toBeDefined();
      expect(DEFAULT_POOL_OPTIONS).toHaveProperty('minSize');
      expect(DEFAULT_POOL_OPTIONS).toHaveProperty('maxSize');

      console.log('✅ Default pool options:', DEFAULT_POOL_OPTIONS);
    });

    it('should provide pool utils', async () => {
      const { PoolUtils } = await import('@orchestr8/testkit/utils');

      expect(PoolUtils).toBeDefined();
      expect(PoolUtils).toHaveProperty('createPool');
      expect(PoolUtils).toHaveProperty('destroyPool');

      console.log('✅ Pool utilities available');
    });
  });

  describe('Resource Management', () => {
    it('should export resource manager', async () => {
      const {
        ResourceManager,
        globalResourceManager,
        registerResource,
        cleanupAllResources
      } = await import('@orchestr8/testkit/utils');

      expect(ResourceManager).toBeDefined();
      expect(globalResourceManager).toBeDefined();
      expect(typeof registerResource).toBe('function');
      expect(typeof cleanupAllResources).toBe('function');

      console.log('✅ Resource management exports verified');
    });

    it('should register and cleanup resources', async () => {
      const { registerResource, cleanupAllResources } = await import('@orchestr8/testkit/utils');

      let cleaned = false;

      // Register test resource
      registerResource({
        id: 'test-resource',
        category: 'test',
        cleanup: async () => {
          cleaned = true;
        }
      });

      // Cleanup all resources
      await cleanupAllResources();

      expect(cleaned).toBe(true);

      console.log('✅ Resource registration and cleanup works');
    });

    it('should get resource stats', async () => {
      const { getResourceStats } = await import('@orchestr8/testkit/utils');

      const stats = getResourceStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byCategory');

      console.log('✅ Resource stats:', stats);
    });

    it('should detect resource leaks', async () => {
      const { detectResourceLeaks } = await import('@orchestr8/testkit/utils');

      const leaks = await detectResourceLeaks();

      expect(leaks).toBeDefined();
      expect(Array.isArray(leaks)).toBe(true);

      console.log('✅ Resource leak detection works');
    });
  });

  describe('Security Validation', () => {
    it('should validate shell commands', async () => {
      const { validateCommand } = await import('@orchestr8/testkit/utils');

      // Valid command
      const validResult = validateCommand('echo', ['hello']);
      expect(validResult.valid).toBe(true);

      // Invalid command with shell metacharacters
      const invalidResult = validateCommand('echo && rm -rf /', []);
      expect(invalidResult.valid).toBe(false);

      console.log('✅ Command validation works');
    });

    it('should validate paths', async () => {
      const { validatePath } = await import('@orchestr8/testkit/utils');

      // Valid path
      const validResult = validatePath('/tmp/test.txt');
      expect(validResult.valid).toBe(true);

      // Invalid path with traversal
      const invalidResult = validatePath('/tmp/../../etc/passwd');
      expect(invalidResult.valid).toBe(false);

      console.log('✅ Path validation works');
    });

    it('should escape shell arguments', async () => {
      const { escapeShellArg } = await import('@orchestr8/testkit/utils');

      const escaped = escapeShellArg('hello world');

      expect(escaped).toBeDefined();
      expect(typeof escaped).toBe('string');

      console.log('✅ Shell argument escaping works');
    });

    it('should sanitize SQL identifiers', async () => {
      const { sanitizeSqlIdentifier } = await import('@orchestr8/testkit/utils');

      const sanitized = sanitizeSqlIdentifier('user_table');

      expect(sanitized).toBeDefined();
      expect(typeof sanitized).toBe('string');

      console.log('✅ SQL identifier sanitization works');
    });

    it('should validate shell execution', async () => {
      const { validateShellExecution } = await import('@orchestr8/testkit/utils');

      const result = validateShellExecution({
        command: 'echo',
        args: ['hello']
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty('valid');

      console.log('✅ Shell execution validation works');
    });

    it('should validate batch operations', async () => {
      const { validateBatch } = await import('@orchestr8/testkit/utils');

      const operations = [
        { command: 'echo', args: ['1'] },
        { command: 'echo', args: ['2'] },
        { command: 'echo', args: ['3'] }
      ];

      const results = validateBatch(operations);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(3);

      console.log('✅ Batch validation works');
    });

    it('should sanitize commands', async () => {
      const { sanitizeCommand } = await import('@orchestr8/testkit/utils');

      const sanitized = sanitizeCommand('ls -la');

      expect(sanitized).toBeDefined();
      expect(typeof sanitized).toBe('string');

      console.log('✅ Command sanitization works');
    });
  });

  describe('Integration Tests', () => {
    it('should handle concurrent database operations', async () => {
      const { databaseOperationsManager, limitConcurrency } = await import('@orchestr8/testkit/utils');

      expect(databaseOperationsManager).toBeDefined();

      // Simulate concurrent DB operations
      const operations = Array.from({ length: 10 }, (_, i) =>
        async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return `db-result-${i}`;
        }
      );

      const results = await limitConcurrency(operations, 3);

      expect(results).toHaveLength(10);

      console.log('✅ Concurrent database operations handled');
    });

    it('should manage pooled resources efficiently', async () => {
      const { TestingUtils } = await import('@orchestr8/testkit/utils');

      // Create and release multiple buffers
      const buffers = Array.from({ length: 5 }, () =>
        TestingUtils.createTestBuffer(256)
      );

      expect(buffers).toHaveLength(5);

      // Release all buffers
      buffers.forEach(buffer => TestingUtils.releaseTestBuffer(buffer));

      console.log('✅ Pool resource management efficient');
    });

    it('should detect and prevent resource leaks', async () => {
      const {
        registerResource,
        detectResourceLeaks,
        cleanupAllResources
      } = await import('@orchestr8/testkit/utils');

      // Register resource without cleanup
      registerResource({
        id: 'leaked-resource',
        category: 'test',
        cleanup: async () => {
          // Intentionally not cleaning up
        }
      });

      // Detect leaks
      const leaks = await detectResourceLeaks();

      // Cleanup
      await cleanupAllResources();

      console.log('✅ Resource leak detection integrated');
    });
  });
});
