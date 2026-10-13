import { defineConfig } from "vitest/config";

// The K4 mode's pure utilities (src/utils/k4) are unit-tested; the rest of
// ChessCam is upstream's and has no tests. `npm test` runs them; the build
// (tsc, Biome, Vite) stays as upstream has it.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
