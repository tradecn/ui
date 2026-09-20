import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Tests run from the repo root against the playground's installed shadcn built-ins,
// with the same alias rules the playground and the CLI transformer use.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/registry\//, replacement: `${path.resolve(import.meta.dirname, "registry")}/` },
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, "playground/src")}/` },
    ],
  },
  test: {
    environment: "happy-dom",
    include: ["registry/**/*.test.{ts,tsx}", "playground/src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    passWithNoTests: true,
  },
})
