import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // onnxruntime-node native bindings crash in worker threads
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts', 'src/proxy/**'],
    },
  },
});
