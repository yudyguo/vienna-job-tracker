import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    coverage: { reporter: ["text", "json", "html"] },
  },
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/server-only.ts"),
    },
  },
});
