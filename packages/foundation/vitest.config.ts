import { defineConfig } from 'vitest/config'

// Note: When using @orchestr8/testkit configuration:
// import { createVitestBaseConfig } from '@orchestr8/testkit/config/vitest'
//
// export default createVitestBaseConfig({
//   test: {
//     name: '@capture-bridge/foundation',
//   },
// })

export default defineConfig({
  test: {
    name: '@capture-bridge/foundation',
    environment: 'node',
  },
})