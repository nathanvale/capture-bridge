import { createTsupConfig } from '../../tooling/build/tsup.base.js'

export default createTsupConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts'],
})
