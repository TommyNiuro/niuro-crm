import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Aísla cada test de la DB local del repo (data/crm.db). Ver vitest.setup.ts.
    setupFiles: ["./vitest.setup.ts"],
    // El primer run en frío compila/carga el binario nativo (better-sqlite3-
    // multiple-ciphers), lo que en CI puede empujar el primer test más allá del
    // default de 5s. 20s da margen sin enmascarar cuelgues reales.
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/db/schema.ts"],
    },
  },
});
