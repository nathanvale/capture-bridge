/* eslint-disable */
/**
 * Database Connection
 *
 * Provides database access for error logging and capture metadata
 */

export const db = {
  get: async (_query: string, _params?: any[]): Promise<any> => {
    // Mock implementation for testing
    return null
  },

  run: async (_query: string, _params?: any[]): Promise<any> => {
    // Mock implementation for testing
    return { lastID: 1, changes: 1 }
  },

  all: async (_query: string, _params?: any[]): Promise<any[]> => {
    // Mock implementation for testing
    return []
  },
}
