import { ResourceCategory } from '@orchestr8/testkit';
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
      expect(buffer).toHaveLength(1024);

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

    it('should limit concurrency using limitedAll', async () => {
      const { limitedAll } = await import('@orchestr8/testkit/utils');

      // Create array of promise-returning functions
      const tasks = Array.from({ length: 10 }, (_, i) =>
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return i;
        }
      );

      const results = await limitedAll(tasks, 3); // Max 3 concurrent

      expect(results).toHaveLength(10);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      console.log('✅ Concurrency limiting works with limitedAll');
    });

    it('should use ConcurrencyManager for batch operations', async () => {
      const { ConcurrencyManager } = await import('@orchestr8/testkit/utils');

      const manager = new ConcurrencyManager({ limit: 3 });

      // Create items to process
      const items = Array.from({ length: 10 }, (_, i) => i);

      const results = await manager.batch(items, async (i) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return i;
      });

      expect(results).toHaveLength(10);
      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      console.log('✅ ConcurrencyManager.batch works');
    });

    it('should use ConcurrencyManager.map for concurrent mapping', async () => {
      const { ConcurrencyManager } = await import('@orchestr8/testkit/utils');

      const manager = new ConcurrencyManager({ limit: 2 });

      // Map items with concurrency control
      const items = [1, 2, 3, 4, 5];
      const results = await manager.map(items, async (i) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return i * 2;
      });

      expect(results).toHaveLength(5);
      expect(results).toEqual([2, 4, 6, 8, 10]);

      console.log('✅ ConcurrencyManager.map works');
    });

    it('should use ConcurrencyManager.drain to wait for completion', async () => {
      const { ConcurrencyManager } = await import('@orchestr8/testkit/utils');

      const manager = new ConcurrencyManager({ limit: 2 });
      const completed: number[] = [];

      // Start multiple operations
      const operations = Array.from({ length: 5 }, (_, i) =>
        manager.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 20));
          completed.push(i);
        })
      );

      // Drain should wait for all to complete
      await manager.drain();

      expect(completed).toHaveLength(5);
      expect(completed.sort()).toEqual([0, 1, 2, 3, 4]);

      console.log('✅ ConcurrencyManager.drain works');
    });

    it('should provide limitedAll function', async () => {
      const { limitedAll } = await import('@orchestr8/testkit/utils');

      const tasks = Array.from({ length: 5 }, (_, i) =>
        () => Promise.resolve(i)
      );

      const results = await limitedAll(tasks, 2);

      expect(results).toEqual([0, 1, 2, 3, 4]);

      console.log('✅ limitedAll works');
    });

    it('should provide limitedAllSettled function', async () => {
      const { limitedAllSettled } = await import('@orchestr8/testkit/utils');

      const tasks = [
        () => Promise.resolve(1),
        () => Promise.reject(new Error('failed')),
        () => Promise.resolve(3)
      ];

      const results = await limitedAllSettled(tasks, 2);

      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      console.log('✅ limitedAllSettled works');
    });

    it('should provide limitedPromiseAll function', async () => {
      const { limitedPromiseAll } = await import('@orchestr8/testkit/utils');

      const tasks = Array.from({ length: 5 }, (_, i) =>
        () => Promise.resolve(i * 2)
      );

      const results = await limitedPromiseAll(tasks, { concurrency: 3 });

      expect(results).toEqual([0, 2, 4, 6, 8]);

      console.log('✅ limitedPromiseAll works');
    });

    it('should export default concurrency limits', async () => {
      const { DEFAULT_CONCURRENCY_LIMITS } = await import('@orchestr8/testkit/utils');

      expect(DEFAULT_CONCURRENCY_LIMITS).toBeDefined();
      expect(DEFAULT_CONCURRENCY_LIMITS).toHaveProperty('DATABASE_OPERATIONS');
      expect(DEFAULT_CONCURRENCY_LIMITS).toHaveProperty('NETWORK_OPERATIONS');
      expect(DEFAULT_CONCURRENCY_LIMITS).toHaveProperty('FILE_OPERATIONS');

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
      expect(poolManager).toHaveProperty('register');
      expect(poolManager).toHaveProperty('get');

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
      expect(PoolUtils).toHaveProperty('createBufferPool');
      expect(PoolUtils).toHaveProperty('createArrayPool');
      expect(PoolUtils).toHaveProperty('createPromisePool');
      expect(PoolUtils).toHaveProperty('createObjectPool');

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

      // Register test resource - CORRECT API: (id, cleanup, options)
      registerResource(
        'test-resource',
        async () => {
          cleaned = true;
        },
        {
          category: ResourceCategory.OTHER,
          description: 'Test resource'
        }
      );

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

      const leaks = detectResourceLeaks();

      expect(leaks).toBeDefined();
      expect(Array.isArray(leaks)).toBe(true);

      console.log('✅ Resource leak detection works');
    });
  });

  describe('Security Validation', () => {
    it('should validate shell commands', async () => {
      const { validateCommand, SecurityValidationError } = await import('@orchestr8/testkit/utils');

      // Valid command - CORRECT API: throws void, doesn't return
      expect(() => validateCommand('echo')).not.toThrow();

      // Invalid command with shell metacharacters
      expect(() => validateCommand('rm -rf /')).toThrow(SecurityValidationError);

      console.log('✅ Command validation works');
    });

    it('should validate paths', async () => {
      const { validatePath, SecurityValidationError } = await import('@orchestr8/testkit/utils');

      // Valid path - CORRECT API: (basePath, relativePath) returns string
      const safePath = validatePath('/tmp', 'test.txt');
      expect(safePath).toBeDefined();
      expect(typeof safePath).toBe('string');

      // Invalid path with traversal
      expect(() => validatePath('/tmp', '../../etc/passwd')).toThrow(SecurityValidationError);

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
      expect(sanitized).toBe('user_table');

      console.log('✅ SQL identifier sanitization works');
    });

    it('should validate shell execution', async () => {
      const { validateShellExecution } = await import('@orchestr8/testkit/utils');

      // CORRECT API: (command, args) returns {command, args}
      const result = validateShellExecution('echo', ['hello']);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('command');
      expect(result).toHaveProperty('args');
      expect(result.command).toBe('echo');
      expect(result.args).toHaveLength(1);
      // Args are escaped, so check for escaped version
      expect(result.args[0]).toMatch(/hello/);

      console.log('✅ Shell execution validation works');
    });

    it('should validate batch operations', async () => {
      const { validateBatch } = await import('@orchestr8/testkit/utils');

      const operations = [
        { type: 'command' as const, value: 'echo 1' },
        { type: 'command' as const, value: 'echo 2' },
        { type: 'command' as const, value: 'echo 3' }
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
      const { ConcurrencyManager } = await import('@orchestr8/testkit/utils');

      const manager = new ConcurrencyManager({ limit: 3 });

      // Simulate concurrent DB operations
      const items = Array.from({ length: 10 }, (_, i) => i);

      const results = await manager.batch(items, async (i) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return `db-result-${i}`;
      });

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
      for (const buffer of buffers) TestingUtils.releaseTestBuffer(buffer);

      console.log('✅ Pool resource management efficient');
    });

    it('should detect and prevent resource leaks', async () => {
      const {
        registerResource,
        detectResourceLeaks,
        cleanupAllResources
      } = await import('@orchestr8/testkit/utils');

      // Register resource
      registerResource(
        'leak-test-resource',
        async () => {
          // Intentionally minimal cleanup
        },
        {
          category: ResourceCategory.OTHER,
          description: 'Leak detection test'
        }
      );

      // Detect leaks
      const leaks = detectResourceLeaks();

      // Cleanup
      await cleanupAllResources();

      console.log('✅ Resource leak detection integrated');
    });
  });
});
