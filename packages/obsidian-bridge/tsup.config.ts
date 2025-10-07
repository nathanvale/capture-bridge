import { createDefinedTsupConfig } from '@capture-bridge/build-config'

// DTS generation enabled via tsup's built-in TypeScript declaration bundling
// Uses a non-composite tsconfig to avoid project reference issues
// Generates ./dist/index.d.ts as specified in package.json exports
export default createDefinedTsupConfig('src/index.ts', {
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  bundle: false,
})
