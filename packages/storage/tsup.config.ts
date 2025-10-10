import { createDefinedTsupConfig } from '@capture-bridge/build-config'

// Override bundle:false from base config since we only export a single entry point
// This prevents import errors for './schema/index.js' that would otherwise not be compiled
export default createDefinedTsupConfig('src/index.ts', {
  bundle: true,
})
