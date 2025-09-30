import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import type { SetupServer } from 'msw/node';

/**
 * Testkit MSW (Mock Service Worker) Features Test
 *
 * Verifies that @orchestr8/testkit MSW utilities work correctly
 * with the lean core implementation.
 *
 * REQUIRES: msw, happy-dom
 *
 * Tests cover:
 * - MSW server setup and configuration
 * - Request handlers and mocking
 * - Response utilities
 * - Authentication mocking
 * - CRUD operation mocking
 * - Error simulation
 * - Network issues simulation
 */

describe('Testkit MSW Features', () => {
  let server: SetupServer | null = null;

  afterAll(() => {
    // Clean up server after all tests
    if (server) {
      server.close();
      server = null;
    }
  });

  describe('MSW Server Setup', () => {
    it('should create and start MSW server', async () => {
      try {
        const { createMSWServer, startMSWServer, stopMSWServer } = await import('@orchestr8/testkit/msw');

        // Create server
        server = createMSWServer([]);

        // Start server
        await startMSWServer();

        // Server should be running
        expect(server).toBeDefined();

        console.log('✅ MSW server created and started successfully');

        // Stop server
        await stopMSWServer();
      } catch (error) {
        console.error('MSW import error:', error);
        throw new Error('Failed to import MSW utilities - ensure msw is installed');
      }
    });

    it('should setup MSW with default handlers', async () => {
      const { setupMSW, defaultHandlers } = await import('@orchestr8/testkit/msw');

      // Setup with default handlers
      server = setupMSW(defaultHandlers());

      // Start listening
      server.listen({ onUnhandledRequest: 'bypass' });

      expect(server).toBeDefined();

      console.log('✅ MSW setup with default handlers');

      server.close();
    });

    it('should configure MSW with custom settings', async () => {
      const { createMSWConfig, createMSWServer, validateMSWConfig } = await import('@orchestr8/testkit/msw');

      // Create custom config
      const config = createMSWConfig({
        onUnhandledRequest: 'warn',
        quiet: false
      });

      // Validate config
      const isValid = validateMSWConfig(config);
      expect(isValid).toBe(true);

      // Create server with config
      server = createMSWServer([]);
      server.listen(config);

      console.log('✅ MSW configured with custom settings');

      server.close();
    });
  });

  describe('Request Handlers', () => {
    beforeAll(async () => {
      const { http, HttpResponse } = await import('msw');
      const { setupMSW } = await import('@orchestr8/testkit/msw');

      // Setup server with test handlers
      server = setupMSW([
        http.get('/api/users', () => {
          return HttpResponse.json([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ]);
        }),
        http.post('/api/users', async ({ request }) => {
          const body = await request.json() as { name: string };
          return HttpResponse.json(
            { id: 3, name: body.name },
            { status: 201 }
          );
        }),
        http.delete('/api/users/:id', ({ params }) => {
          return HttpResponse.json(
            { deleted: params.id },
            { status: 200 }
          );
        })
      ]);

      server.listen({ onUnhandledRequest: 'bypass' });
    });

    afterEach(() => {
      server?.resetHandlers();
    });

    afterAll(() => {
      server?.close();
    });

    it('should intercept GET requests', async () => {
      const response = await fetch('/api/users');
      const users = await response.json();

      expect(response.status).toBe(200);
      expect(users).toHaveLength(2);
      expect(users[0].name).toBe('Alice');

      console.log('✅ GET request intercepted successfully');
    });

    it('should intercept POST requests', async () => {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Charlie' })
      });
      const user = await response.json();

      expect(response.status).toBe(201);
      expect(user.name).toBe('Charlie');

      console.log('✅ POST request intercepted successfully');
    });

    it('should intercept DELETE requests', async () => {
      const response = await fetch('/api/users/1', {
        method: 'DELETE'
      });
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.deleted).toBe('1');

      console.log('✅ DELETE request intercepted successfully');
    });

    it('should add and reset handlers dynamically', async () => {
      const { http, HttpResponse } = await import('msw');
      const { addMSWHandlers, resetMSWHandlers, restoreMSWHandlers } = await import('@orchestr8/testkit/msw');

      // Add new handler
      addMSWHandlers([
        http.get('/api/test', () => {
          return HttpResponse.json({ test: true });
        })
      ]);

      let response = await fetch('/api/test');
      let data = await response.json();
      expect(data.test).toBe(true);

      console.log('✅ Dynamic handler added');

      // Reset handlers
      resetMSWHandlers();

      // Original handlers should still work
      response = await fetch('/api/users');
      expect(response.status).toBe(200);

      console.log('✅ Handlers reset successfully');
    });
  });

  describe('Response Utilities', () => {
    beforeAll(async () => {
      const { http } = await import('msw');
      const {
        setupMSW,
        createSuccessResponse,
        createErrorResponse,
        createDelayedResponse
      } = await import('@orchestr8/testkit/msw');

      server = setupMSW([
        http.get('/api/success', () => createSuccessResponse({ data: 'success' })),
        http.get('/api/error', () => createErrorResponse('Something went wrong', 500)),
        http.get('/api/delayed', () => createDelayedResponse({ data: 'delayed' }, 100))
      ]);

      server.listen({ onUnhandledRequest: 'bypass' });
    });

    afterAll(() => {
      server?.close();
    });

    it('should create success responses', async () => {
      const response = await fetch('/api/success');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toBe('success');

      console.log('✅ Success response utility works');
    });

    it('should create error responses', async () => {
      const response = await fetch('/api/error');
      const error = await response.json();

      expect(response.status).toBe(500);
      expect(error.error).toBe('Something went wrong');

      console.log('✅ Error response utility works');
    });

    it('should create delayed responses', async () => {
      const start = Date.now();
      const response = await fetch('/api/delayed');
      const elapsed = Date.now() - start;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toBe('delayed');
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some variance

      console.log('✅ Delayed response utility works');
    });
  });

  describe('Authentication Handlers', () => {
    beforeAll(async () => {
      const { setupMSW, createAuthHandlers } = await import('@orchestr8/testkit/msw');

      // Setup server with auth handlers
      server = setupMSW(createAuthHandlers({
        validCredentials: {
          username: 'testuser',
          password: 'testpass'
        },
        tokenPrefix: 'Bearer',
        sessionDuration: 3600000
      }));

      server.listen({ onUnhandledRequest: 'bypass' });
    });

    afterAll(() => {
      server?.close();
    });

    it('should handle login with valid credentials', async () => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser',
          password: 'testpass'
        })
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('token');
      expect(data).toHaveProperty('user');

      console.log('✅ Authentication handler works');
    });

    it('should reject invalid credentials', async () => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'wrong',
          password: 'wrong'
        })
      });

      expect(response.status).toBe(401);

      console.log('✅ Authentication rejection works');
    });

    it('should handle logout', async () => {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      expect(response.status).toBe(200);

      console.log('✅ Logout handler works');
    });
  });

  describe('CRUD Operation Handlers', () => {
    beforeAll(async () => {
      const { setupMSW, createCRUDHandlers } = await import('@orchestr8/testkit/msw');

      // Setup server with CRUD handlers
      server = setupMSW(createCRUDHandlers({
        resource: 'posts',
        idField: 'id',
        initialData: [
          { id: 1, title: 'First Post', content: 'Content 1' },
          { id: 2, title: 'Second Post', content: 'Content 2' }
        ]
      }));

      server.listen({ onUnhandledRequest: 'bypass' });
    });

    afterAll(() => {
      server?.close();
    });

    it('should list resources', async () => {
      const response = await fetch('/api/posts');
      const posts = await response.json();

      expect(response.status).toBe(200);
      expect(posts).toHaveLength(2);

      console.log('✅ CRUD list operation works');
    });

    it('should get single resource', async () => {
      const response = await fetch('/api/posts/1');
      const post = await response.json();

      expect(response.status).toBe(200);
      expect(post.title).toBe('First Post');

      console.log('✅ CRUD get operation works');
    });

    it('should create resource', async () => {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Post',
          content: 'New Content'
        })
      });

      const post = await response.json();

      expect(response.status).toBe(201);
      expect(post).toHaveProperty('id');
      expect(post.title).toBe('New Post');

      console.log('✅ CRUD create operation works');
    });

    it('should update resource', async () => {
      const response = await fetch('/api/posts/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated Post',
          content: 'Updated Content'
        })
      });

      const post = await response.json();

      expect(response.status).toBe(200);
      expect(post.title).toBe('Updated Post');

      console.log('✅ CRUD update operation works');
    });

    it('should delete resource', async () => {
      const response = await fetch('/api/posts/1', {
        method: 'DELETE'
      });

      expect(response.status).toBe(204);

      console.log('✅ CRUD delete operation works');
    });
  });

  describe('Error Simulation', () => {
    beforeAll(async () => {
      const { http } = await import('msw');
      const {
        setupMSW,
        createNetworkIssueHandler,
        createUnreliableHandler
      } = await import('@orchestr8/testkit/msw');

      server = setupMSW([
        createNetworkIssueHandler('/api/network-error'),
        createUnreliableHandler('/api/unreliable', {
          failureRate: 0.5,
          minDelay: 10,
          maxDelay: 50
        }),
        http.get('/api/timeout', () => {
          // Simulate timeout by never responding
          return new Promise(() => {});
        })
      ]);

      server.listen({ onUnhandledRequest: 'bypass' });
    });

    afterAll(() => {
      server?.close();
    });

    it('should simulate network errors', async () => {
      try {
        await fetch('/api/network-error');
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.message).toContain('fetch');
        console.log('✅ Network error simulation works');
      }
    });

    it('should simulate unreliable endpoints', async () => {
      const results = [];

      // Make multiple requests to test unreliability
      for (let i = 0; i < 10; i++) {
        try {
          const response = await fetch('/api/unreliable');
          results.push(response.ok);
        } catch (error) {
          results.push(false);
        }
      }

      // Should have some successes and some failures
      const successes = results.filter(r => r).length;
      const failures = results.filter(r => !r).length;

      expect(successes).toBeGreaterThan(0);
      expect(failures).toBeGreaterThan(0);

      console.log(`✅ Unreliable endpoint simulation: ${successes} successes, ${failures} failures`);
    });
  });

  describe('Pagination Support', () => {
    beforeAll(async () => {
      const { setupMSW, createPaginatedHandler } = await import('@orchestr8/testkit/msw');

      // Create test data
      const items = Array.from({ length: 25 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`
      }));

      server = setupMSW([
        createPaginatedHandler('/api/items', items, {
          pageSize: 10,
          pageParam: 'page',
          limitParam: 'limit'
        })
      ]);

      server.listen({ onUnhandledRequest: 'bypass' });
    });

    afterAll(() => {
      server?.close();
    });

    it('should return paginated results', async () => {
      // Get first page
      let response = await fetch('/api/items?page=1&limit=10');
      let data = await response.json();

      expect(data.items).toHaveLength(10);
      expect(data.total).toBe(25);
      expect(data.page).toBe(1);
      expect(data.hasMore).toBe(true);

      console.log('✅ First page retrieved');

      // Get second page
      response = await fetch('/api/items?page=2&limit=10');
      data = await response.json();

      expect(data.items).toHaveLength(10);
      expect(data.page).toBe(2);

      console.log('✅ Second page retrieved');

      // Get last page
      response = await fetch('/api/items?page=3&limit=10');
      data = await response.json();

      expect(data.items).toHaveLength(5);
      expect(data.hasMore).toBe(false);

      console.log('✅ Pagination works correctly');
    });
  });

  describe('HTTP Status Helpers', () => {
    it('should have HTTP status constants', async () => {
      const { HTTP_STATUS } = await import('@orchestr8/testkit/msw');

      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);

      console.log('✅ HTTP status constants available');
    });

    it('should have common headers helper', async () => {
      const { COMMON_HEADERS } = await import('@orchestr8/testkit/msw');

      expect(COMMON_HEADERS.JSON).toHaveProperty('Content-Type');
      expect(COMMON_HEADERS.JSON['Content-Type']).toBe('application/json');

      console.log('✅ Common headers helper available');
    });
  });
});