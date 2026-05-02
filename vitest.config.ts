import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'templates/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
