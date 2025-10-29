import { createDefinedTsupConfig } from '@capture-bridge/build-config'

export default createDefinedTsupConfig(
  ['src/index.ts', 'src/lib/**/*.ts', 'src/commands/**/*.ts', 'src/utils/**/*.ts'],
  {
    // CLI-specific overrides - example of how to customize
    minify: true, // CLI tools benefit from minification
  }
)
