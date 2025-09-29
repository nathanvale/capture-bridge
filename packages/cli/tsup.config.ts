import { createDefinedTsupConfig } from '@adhd-brain/build-config'

export default createDefinedTsupConfig('src/index.ts', {
  // CLI-specific overrides - example of how to customize
  minify: true, // CLI tools benefit from minification
})
