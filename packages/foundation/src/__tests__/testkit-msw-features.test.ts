/* eslint-disable no-console, sonarjs/no-nested-functions, require-await, unicorn/consistent-function-scoping, sonarjs/no-ignored-exceptions, @typescript-eslint/no-unused-vars, vitest/expect-expect, sonarjs/assertions-in-tests, @typescript-eslint/no-empty-function, sonarjs/no-hardcoded-passwords, sonarjs/file-permissions, sonarjs/no-alphabetical-sort, sonarjs/different-types-comparison */
import {
  setupMSW,
  createMSWServer,
  startMSWServer,
  stopMSWServer,
  defaultHandlers,
  createMSWConfig,
  validateMSWConfig,
  createSuccessResponse,
  createErrorResponse,
  createDelayedResponse,
  addMSWHandlers,
  resetMSWHandlers,
  restoreMSWHandlers,
  createAuthHandlers,
  createCRUDHandlers,
  createNetworkIssueHandler,
  createUnreliableHandler,
  createPaginatedHandler,
  HTTP_STATUS,
  COMMON_HEADERS,
} from '@orchestr8/testkit/msw'
import { http, HttpResponse } from 'msw'
import { describe, it, expect } from 'vitest'

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

// Set up MSW at module level with ALL handlers needed for all tests
// This is required because MSW must initialize interceptors at module evaluation time
setupMSW(
  [
    // Request Handlers test handlers
    http.get('*/api/users', () => {
      return HttpResponse.json([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ])
    }),
    http.post('*/api/users', async ({ request }) => {
      const body = (await request.json()) as { name: string }
      return HttpResponse.json({ id: 3, name: body.name }, { status: 201 })
    }),
    http.delete('*/api/users/:id', ({ params }) => {
      return HttpResponse.json({ deleted: params['id'] }, { status: 200 })
    }),
    http.get('*/api/test', () => {
      return HttpResponse.json({ test: true })
    }),

    // Response Utilities handlers
    http.get('*/api/success', () => createSuccessResponse({ data: 'success' })),
    http.get('*/api/error', () => createErrorResponse('Something went wrong', 500)),
    http.get('*/api/delayed', () => createDelayedResponse({ data: 'delayed' }, 100)),

    // Auth Handlers (use full URL for proper path matching)
    ...createAuthHandlers('http://localhost/api'),

    // CRUD Handlers (use full URL for proper path matching)
    ...createCRUDHandlers(
      'posts',
      [
        { id: '1', title: 'First Post', content: 'Content 1' },
        { id: '2', title: 'Second Post', content: 'Content 2' },
      ],
      'http://localhost/api'
    ),

    // Error Simulation handlers
    createNetworkIssueHandler('*/api/network-error'),
    createUnreliableHandler('*/api/unreliable', { success: true }, 0.5),
    http.get('*/api/timeout', () => {
      return new Promise(() => {})
    }),

    // Pagination handler
    createPaginatedHandler(
      '*/api/items',
      Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` })),
      10
    ),
  ],
  { onUnhandledRequest: 'bypass' }
)

describe('Testkit MSW Features', () => {
  describe('MSW Server Setup', () => {
    // NOTE: Tests that call createMSWServer() are skipped because they interfere
    // with the global MSW setup at module level

    it('should verify MSW utilities are available', () => {
      expect(createMSWServer).toBeDefined()
      expect(startMSWServer).toBeDefined()
      expect(stopMSWServer).toBeDefined()
      expect(defaultHandlers).toBeDefined()
      expect(createMSWConfig).toBeDefined()
      expect(validateMSWConfig).toBeDefined()

      console.log('✅ MSW utilities are available')
    })

    it('should validate MSW config structure', () => {
      const config = createMSWConfig({
        onUnhandledRequest: 'warn',
        quiet: false,
      })

      validateMSWConfig(config)

      expect(config.onUnhandledRequest).toBe('warn')
      expect(config.quiet).toBe(false)

      console.log('✅ MSW configuration validation works')
    })
  })

  describe('Request Handlers', () => {
    // Handlers are set up globally at module level

    it('should intercept GET requests', async () => {
      const response = await fetch('http://localhost/api/users')
      const users = await response.json()

      expect(response.status).toBe(200)
      expect(users).toHaveLength(2)
      expect(users[0].name).toBe('Alice')

      console.log('✅ GET request intercepted successfully')
    })

    it('should intercept POST requests', async () => {
      const response = await fetch('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Charlie' }),
      })
      const user = await response.json()

      expect(response.status).toBe(201)
      expect(user.name).toBe('Charlie')

      console.log('✅ POST request intercepted successfully')
    })

    it('should intercept DELETE requests', async () => {
      const response = await fetch('http://localhost/api/users/1', {
        method: 'DELETE',
      })
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.deleted).toBe('1')

      console.log('✅ DELETE request intercepted successfully')
    })

    it('should add and reset handlers dynamically', async () => {
      // Add new handler (addMSWHandlers uses rest parameters, not array)
      addMSWHandlers(
        http.get('*/api/test', () => {
          return HttpResponse.json({ test: true })
        })
      )

      let response = await fetch('http://localhost/api/test')
      const data = await response.json()
      expect(data.test).toBe(true)

      console.log('✅ Dynamic handler added')

      // Reset handlers
      resetMSWHandlers()

      // Original handlers should still work
      response = await fetch('http://localhost/api/users')
      expect(response.status).toBe(200)

      console.log('✅ Handlers reset successfully')
    })
  })

  describe('Response Utilities', () => {
    // Handlers are set up globally at module level

    it('should create success responses', async () => {
      const response = await fetch('http://localhost/api/success')
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toBe('success')

      console.log('✅ Success response utility works')
    })

    it('should create error responses', async () => {
      const response = await fetch('http://localhost/api/error')
      const error = await response.json()

      expect(response.status).toBe(500)
      expect(error.error.message).toBe('Something went wrong')

      console.log('✅ Error response utility works')
    })

    it('should create delayed responses', async () => {
      const start = Date.now()
      const response = await fetch('http://localhost/api/delayed')
      const elapsed = Date.now() - start
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toBe('delayed')
      expect(elapsed).toBeGreaterThanOrEqual(90) // Allow some variance

      console.log('✅ Delayed response utility works')
    })
  })

  describe('Authentication Handlers', () => {
    // Handlers are set up globally at module level

    it('should handle login with valid credentials', async () => {
      const response = await fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password',
        }),
      })

      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('token')
      expect(data).toHaveProperty('user')

      console.log('✅ Authentication handler works')
    })

    it('should reject invalid credentials', async () => {
      const response = await fetch('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'wrong@example.com',
          password: 'wrong',
        }),
      })

      expect(response.status).toBe(401)

      console.log('✅ Authentication rejection works')
    })

    it('should handle logout', async () => {
      const response = await fetch('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
        },
      })

      expect(response.status).toBe(204)

      console.log('✅ Logout handler works')
    })
  })

  describe('CRUD Operation Handlers', () => {
    // Handlers are set up globally at module level

    it('should list resources', async () => {
      const response = await fetch('http://localhost/api/posts')
      const posts = await response.json()

      expect(response.status).toBe(200)
      expect(posts).toHaveLength(2)

      console.log('✅ CRUD list operation works')
    })

    it('should get single resource', async () => {
      const response = await fetch('http://localhost/api/posts/1')
      const post = await response.json()

      expect(response.status).toBe(200)
      expect(post.title).toBe('First Post')

      console.log('✅ CRUD get operation works')
    })

    it('should create resource', async () => {
      const response = await fetch('http://localhost/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Post',
          content: 'New Content',
        }),
      })

      const post = await response.json()

      expect(response.status).toBe(201)
      expect(post).toHaveProperty('id')
      expect(post.title).toBe('New Post')

      console.log('✅ CRUD create operation works')
    })

    it('should update resource', async () => {
      const response = await fetch('http://localhost/api/posts/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated Post',
          content: 'Updated Content',
        }),
      })

      const post = await response.json()

      expect(response.status).toBe(200)
      expect(post.title).toBe('Updated Post')

      console.log('✅ CRUD update operation works')
    })

    it('should delete resource', async () => {
      const response = await fetch('http://localhost/api/posts/1', {
        method: 'DELETE',
      })

      expect(response.status).toBe(204)

      console.log('✅ CRUD delete operation works')
    })
  })

  describe('Error Simulation', () => {
    // Handlers are set up globally at module level

    it('should simulate network errors', async () => {
      const response = await fetch('http://localhost/api/network-error')
      const data = await response.json()

      // Network issue handler returns HTTP error responses (408, 503, 500)
      expect(response.ok).toBe(false)
      expect(data.error).toBeDefined()
      expect(data.error.message).toBeTruthy()

      console.log('✅ Network error simulation works')
    })

    it('should simulate unreliable endpoints', async () => {
      const results = []

      // Make multiple requests to test unreliability
      for (let i = 0; i < 10; i++) {
        try {
          const response = await fetch('http://localhost/api/unreliable')
          results.push(response.ok)
        } catch (error) {
          results.push(false)
        }
      }

      // Should have some successes and some failures
      const successes = results.filter((r) => r).length
      const failures = results.filter((r) => !r).length

      expect(successes).toBeGreaterThan(0)
      expect(failures).toBeGreaterThan(0)

      console.log(`✅ Unreliable endpoint simulation: ${successes} successes, ${failures} failures`)
    })
  })

  describe('Pagination Support', () => {
    // Handlers are set up globally at module level

    it('should return paginated results', async () => {
      // Get first page
      let response = await fetch('http://localhost/api/items?page=1&pageSize=10')
      let data = await response.json()

      expect(data.items).toHaveLength(10)
      expect(data.pagination.total).toBe(25)
      expect(data.pagination.page).toBe(1)
      expect(data.pagination.hasNext).toBe(true)

      console.log('✅ First page retrieved')

      // Get second page
      response = await fetch('http://localhost/api/items?page=2&pageSize=10')
      data = await response.json()

      expect(data.items).toHaveLength(10)
      expect(data.pagination.page).toBe(2)

      console.log('✅ Second page retrieved')

      // Get last page
      response = await fetch('http://localhost/api/items?page=3&pageSize=10')
      data = await response.json()

      expect(data.items).toHaveLength(5)
      expect(data.pagination.hasNext).toBe(false)

      console.log('✅ Pagination works correctly')
    })
  })

  describe('HTTP Status Helpers', () => {
    it('should have HTTP status constants', async () => {
      expect(HTTP_STATUS.OK).toBe(200)
      expect(HTTP_STATUS.CREATED).toBe(201)
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400)
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401)
      expect(HTTP_STATUS.NOT_FOUND).toBe(404)
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500)

      console.log('✅ HTTP status constants available')
    })

    it('should have missing HTTP status constants', async () => {
      expect(HTTP_STATUS.NO_CONTENT).toBe(204)
      expect(HTTP_STATUS.FORBIDDEN).toBe(403)
      expect(HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503)

      console.log('✅ Extended HTTP status constants available')
    })

    it('should have common headers helper', async () => {
      expect(COMMON_HEADERS.JSON).toHaveProperty('Content-Type')
      expect(COMMON_HEADERS.JSON['Content-Type']).toBe('application/json')

      console.log('✅ Common headers helper available')
    })
  })

  describe('MSW Advanced Functions', () => {
    it('should call restoreMSWHandlers without errors', async () => {
      // restoreMSWHandlers() is designed to restore handlers to initial state
      // This function should be callable and not throw errors
      expect(() => {
        restoreMSWHandlers()
      }).not.toThrow()

      // Verify MSW still works after restore
      const response = await fetch('http://localhost/api/users')
      expect(response.status).toBe(200)

      console.log('✅ restoreMSWHandlers() executes without errors')
    })

    it('should get MSW server instance', async () => {
      const { getMSWServer } = await import('@orchestr8/testkit/msw')

      const server = getMSWServer()

      expect(server).toBeDefined()
      expect(server).not.toBeNull()
      expect(server).toHaveProperty('use')
      expect(server).toHaveProperty('resetHandlers')

      console.log('✅ getMSWServer() returns valid server instance')
    })

    it('should get MSW config', async () => {
      const { getMSWConfig } = await import('@orchestr8/testkit/msw')

      const config = getMSWConfig()

      expect(config).toBeDefined()
      expect(config).not.toBeNull()
      expect(config).toHaveProperty('onUnhandledRequest')
      expect(config?.onUnhandledRequest).toBe('bypass')

      console.log('✅ getMSWConfig() returns current configuration')
    })

    it('should update MSW config', async () => {
      const { updateMSWConfig, getMSWConfig } = await import('@orchestr8/testkit/msw')

      // Get initial config
      const initialConfig = getMSWConfig()
      const initialQuiet = initialConfig?.quiet ?? false

      // Update config
      updateMSWConfig({ quiet: !initialQuiet })

      // Verify update
      const updatedConfig = getMSWConfig()
      expect(updatedConfig?.quiet).toBe(!initialQuiet)

      console.log('✅ updateMSWConfig() updates configuration')

      // Restore original config
      updateMSWConfig({ quiet: initialQuiet })
    })

    it('should provide disposeMSWServer for cleanup', async () => {
      const { disposeMSWServer } = await import('@orchestr8/testkit/msw')

      // disposeMSWServer is designed for cleanup/teardown
      // It should be callable (actual disposal would break other tests, so we just verify it exists)
      expect(typeof disposeMSWServer).toBe('function')

      console.log('✅ disposeMSWServer() function is available for cleanup')
    })
  })

  describe('MSW Setup Functions', () => {
    it('should create test-scoped MSW with isolated handlers', async () => {
      const { createTestScopedMSW } = await import('@orchestr8/testkit/msw')

      const scoped = createTestScopedMSW([http.get('*/api/scoped', () => HttpResponse.json({ scoped: true }))])

      expect(scoped).toHaveProperty('addHandlers')
      expect(scoped).toHaveProperty('setup')
      expect(scoped).toHaveProperty('cleanup')

      console.log('✅ createTestScopedMSW() creates scoped instance')
    })

    it('should provide quick setup utility', async () => {
      const { quickSetupMSW } = await import('@orchestr8/testkit/msw')

      // quickSetupMSW should not throw
      expect(() => {
        quickSetupMSW([http.get('*/api/quick', () => HttpResponse.json({ quick: true }))], { quiet: true })
      }).not.toThrow()

      console.log('✅ quickSetupMSW() executes without errors')
    })

    it('should provide environment-aware setup', async () => {
      const { setupMSWForEnvironment } = await import('@orchestr8/testkit/msw')

      // setupMSWForEnvironment should not throw
      expect(() => {
        setupMSWForEnvironment([http.get('*/api/env', () => HttpResponse.json({ env: true }))], { quiet: true })
      }).not.toThrow()

      console.log('✅ setupMSWForEnvironment() configures based on environment')
    })

    it('should provide global setup with lifecycle methods', async () => {
      const { setupMSWGlobal } = await import('@orchestr8/testkit/msw')

      const global = setupMSWGlobal([http.get('*/api/global', () => HttpResponse.json({ global: true }))], {
        quiet: true,
      })

      expect(global).toHaveProperty('setup')
      expect(global).toHaveProperty('teardown')
      expect(typeof global.setup).toBe('function')
      expect(typeof global.teardown).toBe('function')

      console.log('✅ setupMSWGlobal() provides setup/teardown lifecycle')
    })

    it('should provide manual setup with fine-grained control', async () => {
      const { setupMSWManual } = await import('@orchestr8/testkit/msw')

      const manual = setupMSWManual([http.get('*/api/manual', () => HttpResponse.json({ manual: true }))], {
        quiet: true,
      })

      expect(manual).toHaveProperty('start')
      expect(manual).toHaveProperty('stop')
      expect(manual).toHaveProperty('reset')
      expect(manual).toHaveProperty('dispose')
      expect(typeof manual.start).toBe('function')
      expect(typeof manual.stop).toBe('function')
      expect(typeof manual.reset).toBe('function')
      expect(typeof manual.dispose).toBe('function')

      console.log('✅ setupMSWManual() provides full lifecycle control')
    })
  })

  describe('MSW Edge Cases', () => {
    it('should handle config validation errors', async () => {
      const { validateMSWConfig } = await import('@orchestr8/testkit/msw')

      // Invalid onUnhandledRequest value
      expect(() => {
        validateMSWConfig({
          enabled: true,
          baseUrl: 'http://localhost',
          timeout: 5000,
          onUnhandledRequest: 'invalid' as any,
          quiet: false,
        })
      }).toThrow()

      console.log('✅ Config validation rejects invalid values')
    })
  })
})
