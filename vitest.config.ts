import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // onnxruntime-node native bindings crash in worker threads
    pool: 'forks',
  },
});
