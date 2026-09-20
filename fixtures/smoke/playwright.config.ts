import { defineConfig } from "@playwright/test"

// Copied into each fixture consumer by scripts/ci/consumer-matrix.sh.
export default defineConfig({
  testDir: ".",
  testMatch: "smoke.spec.ts",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "bunx vite preview --port 4173 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
