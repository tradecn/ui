import path from "node:path"
import { defineConfig, mergeConfig } from "vite"
import base from "./vite.config"

// The previews tradecn.dev embeds at /preview/<item>/: one bundle from src/embed.tsx with a chunk
// per demo, no HTML of its own. scripts/site/build.ts reads the manifest and writes a page per
// item around it, with the theme's palette, so the demo and the docs page share one look.
export default mergeConfig(
  base,
  defineConfig({
    base: "/preview/",
    build: {
      outDir: "dist/embed",
      manifest: true,
      rollupOptions: { input: path.resolve(import.meta.dirname, "src/embed.tsx") },
    },
  }),
)
