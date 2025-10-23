import { describe, it, expect } from 'vitest'

import { program } from '../index.js'

describe('CLI Package', () => {
  it('should export program', () => {
    expect(program).toBeDefined()
    expect(program.name()).toBe('capture')
  })
})
