import { createDefinedTsupConfig } from '@capture-bridge/build-config'

// Note: DTS generation disabled due to tsup incompatibility with TypeScript composite projects
// Type checking still works via `tsc --noEmit`
export default createDefinedTsupConfig('src/index.ts', {
  dts: false,
  bundle: false,
})
