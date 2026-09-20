import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const root = path.resolve(import.meta.dirname, "..")

// The playground is a shadcn consumer that sees registry source live:
// `@/registry/tradecn/*` resolves to ../registry/tradecn/* (no `shadcn add` needed),
// while `@/components/ui/*` resolves to the built-ins installed in this app.
// The array form keeps the more specific alias first.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@\/registry\//, replacement: `${root}/registry/` },
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname, "src")}/` },
    ],
  },
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
})
