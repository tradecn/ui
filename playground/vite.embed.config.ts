import path from "node:path"
import { defineConfig, mergeConfig } from "vite"
import base from "./vite.config"

// The previews tradecn.dev embeds at /preview/<item>/: one bundle from src/embed.tsx with a chunk
// per demo, no HTML of its own. scripts/site/build.ts reads the manifest and writes a page per
// item around it, with the theme's palette, so the demo and the docs page share one look.
// A relative base, so one build serves the root's /preview/assets/ and a release's own under
// /vX.Y.Z/preview/assets/ alike: a chunk finds the next by its own URL, and the page names the entry.
export default mergeConfig(
  base,
  defineConfig({
    base: "./",
    build: {
      outDir: "dist/embed",
      manifest: true,
      rollupOptions: { input: path.resolve(import.meta.dirname, "src/embed.tsx") },
      // A font is always a file under /preview/assets/, never a data: URL: the site's policy allows fonts from
      // 'self' alone, and one inlined subset would be blocked and logged on every preview.
      assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    },
  }),
)
