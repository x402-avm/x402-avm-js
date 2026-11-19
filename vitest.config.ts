import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // The LocalNet golden files pay from the same wallets and assert exact balance deltas.
    fileParallelism: false,
  },
});
