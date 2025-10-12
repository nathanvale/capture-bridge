import { describe, it, expect } from 'vitest'

describe('Storage Package Exports', () => {
  it('should export storageVersion', async () => {
    const { storageVersion } = await import('../index.js')
    expect(storageVersion).toBe('0.1.0')
  })

  it('should export schema functions', async () => {
    const {
      createSchema,
      initializePragmas,
      initializeDatabase,
      verifySchema,
      verifyPragmas,
      verifyIntegrity,
      validateTransition,
      getValidTransitions,
      isTerminalState,
      assertValidTransition,
      StateTransitionError,
      queryRecoverableCaptures,
    } = await import('../index.js')

    // Verify all exports are defined
    expect(createSchema).toBeDefined()
    expect(initializePragmas).toBeDefined()
    expect(initializeDatabase).toBeDefined()
    expect(verifySchema).toBeDefined()
    expect(verifyPragmas).toBeDefined()
    expect(verifyIntegrity).toBeDefined()
    expect(validateTransition).toBeDefined()
    expect(getValidTransitions).toBeDefined()
    expect(isTerminalState).toBeDefined()
    expect(assertValidTransition).toBeDefined()
    expect(StateTransitionError).toBeDefined()
    expect(queryRecoverableCaptures).toBeDefined()
  })

  it('should export StagingLedger class and types', async () => {
    const { StagingLedger, StagingLedgerError } = await import('../index.js')

    expect(StagingLedger).toBeDefined()
    expect(StagingLedgerError).toBeDefined()
  })
})
