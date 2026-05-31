import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    env: {
      WORDBASE_DB_PATH: ':memory:',
    },
  },
});
