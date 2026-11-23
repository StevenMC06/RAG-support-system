import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/api/**/route.ts"],
      exclude: ["lib/prisma.ts", "lib/s3.ts", "lib/embeddings.ts"],
    },
  },
});
