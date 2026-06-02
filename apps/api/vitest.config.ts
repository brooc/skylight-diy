import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      all: true,
      exclude: ["tests/**", "src/index.ts"],
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 90,
        statements: 90
      }
    },
    environment: "node",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"]
  }
});
