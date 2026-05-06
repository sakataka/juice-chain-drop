import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/juice-chain-drop/",
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      reporter: ["text", "html"],
      thresholds: {
        branches: 60,
        functions: 60,
        lines: 60,
        statements: 60,
      },
    },
  },
});
