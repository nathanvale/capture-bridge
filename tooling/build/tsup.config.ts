import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/tsup.base.ts', 'src/createTsupConfig.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  outDir: 'dist',
  target: 'es2022',
  platform: 'node',
})