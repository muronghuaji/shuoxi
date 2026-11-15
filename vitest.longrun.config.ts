import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/realLongRun.manual.test.ts'],
    testTimeout: 24 * 60 * 60 * 1000,
    hookTimeout: 24 * 60 * 60 * 1000,
  },
})
