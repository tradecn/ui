// The colors in a code block: shiki, with GitHub's light and dark themes, the pair shadcn's site highlights with,
// over the grammars the docs' fences name. The engine is Oniguruma, the WebAssembly one its package inlines: it
// colors the registry's largest file in a fifth of a second, where the JavaScript engine takes eight times as
// long, and a build colors every Manual tab's source and every demo. It loads once, as the module does, so that
// coloring a block is a plain call, the way the rest of a page's rendering is.
import { createHighlighterCoreSync } from "@shikijs/core"
import { createOnigurumaEngine } from "@shikijs/engine-oniguruma"
import wasm from "@shikijs/engine-oniguruma/wasm-inlined"
import bash from "@shikijs/langs/bash"
import css from "@shikijs/langs/css"
import html from "@shikijs/langs/html"
import json from "@shikijs/langs/json"
import tsx from "@shikijs/langs/tsx"
import typescript from "@shikijs/langs/typescript"
import githubDark from "@shikijs/themes/github-dark"
import githubLight from "@shikijs/themes/github-light"

/** The two sides of a block's colors, one theme per mode: the pair shadcn's site highlights with. */
export const THEMES = { light: "github-light", dark: "github-dark" } as const

const highlighter = createHighlighterCoreSync({
  themes: [githubLight, githubDark],
  langs: [tsx, typescript, css, bash, json, html],
  engine: await createOnigurumaEngine(wasm),
})

/** The languages a fence may name and be colored in, with the aliases the grammars declare (`ts`, `sh`). Any other stays as written. */
export const LANGUAGES: ReadonlySet<string> = new Set(highlighter.getLoadedLanguages())

/** Each theme's own foreground: text it leaves in this color gets no color of its own and wears the block's. */
const FOREGROUND = { light: highlighter.getTheme(THEMES.light).fg.toLowerCase(), dark: highlighter.getTheme(THEMES.dark).fg.toLowerCase() }

// shiki's font styles are bits: italic is 1 and bold is 2 (underline and strikethrough follow, and the themes use them on markup alone).
const ITALIC = 1
const BOLD = 2

/** A run of a line in one color: its text, and the CSS that colors it when the themes do. */
export type Token = { text: string; style?: string }

const colored = new Map<string, Token[][]>()

/**
 * A block's source in colors, line by line: each token's text with a `color` that is a `light-dark()` of the two
 * themes' colors, or the one color where they agree (a comment is the same grey on both sides), and no style at
 * all for text the themes leave in their foreground. `undefined` for a language the site does not highlight.
 * Memoized on the source: a file several items install is colored once per build.
 */
export function highlightLines(code: string, language: string): Token[][] | undefined {
  if (!LANGUAGES.has(language)) return undefined
  const key = `${language}\n${code}`
  const cached = colored.get(key)
  if (cached) return cached
  const lines = highlighter.codeToTokensWithThemes(code, { lang: language, themes: THEMES }).map((line) =>
    line.map(({ content, variants }): Token => {
      const light = variants.light?.color?.toLowerCase() ?? FOREGROUND.light
      const dark = variants.dark?.color?.toLowerCase() ?? FOREGROUND.dark
      const declarations: string[] = []
      if (light !== FOREGROUND.light || dark !== FOREGROUND.dark) declarations.push(`color:${light === dark ? light : `light-dark(${light},${dark})`}`)
      // The two themes agree on every font style; -1 is shiki's "not set".
      const fontStyle = Math.max(variants.light?.fontStyle ?? 0, 0)
      if (fontStyle & ITALIC) declarations.push("font-style:italic")
      if (fontStyle & BOLD) declarations.push("font-weight:600")
      return declarations.length ? { text: content, style: declarations.join(";") } : { text: content }
    }),
  )
  colored.set(key, lines)
  return lines
}
