import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // The LocalNet golden files pay from the same wallets and assert exact balance deltas.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'text'],
      // Offline coverage (LocalNet and public-network tests are skipped); rounded down from the achieved level.
      thresholds: { lines: 99, statements: 99, functions: 100, branches: 97 },
    },
  },
});
