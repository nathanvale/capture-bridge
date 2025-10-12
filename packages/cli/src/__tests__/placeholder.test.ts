import { describe, it, expect } from 'vitest'

import { cliVersion } from '../index.js'

describe('CLI Package', () => {
  it('should export cliVersion', () => {
    expect(cliVersion).toBe('0.1.0')
  })
})
