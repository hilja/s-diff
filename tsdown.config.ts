import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: './index.ts',
  outDir: './dist',
  platform: 'browser',
  dts: true,
  define: { 'import.meta.vitest': 'undefined' },
})
