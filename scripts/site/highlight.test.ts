import { describe, expect, it } from "vitest"
import { highlightLines, LANGUAGES, THEMES, type Token } from "./highlight"

/** The lines' text back as one string, the way a browser reads the spans. */
const textOf = (lines: Token[][]) => lines.map((line) => line.map((token) => token.text).join("")).join("\n")
/** Each token's style by its text. */
const styles = (line: Token[]) => Object.fromEntries(line.map((token) => [token.text, token.style]))

describe("highlighting", () => {
  it("colors the languages the docs' fences name, under the aliases the grammars declare, and nothing else", () => {
    expect(THEMES).toEqual({ light: "github-light", dark: "github-dark" })
    for (const language of ["tsx", "ts", "typescript", "css", "bash", "sh", "json", "html"]) expect(LANGUAGES.has(language), language).toBe(true)
    expect(highlightLines("plain words", "text")).toBeUndefined()
    expect(highlightLines("fn main() {}", "rust")).toBeUndefined()
  })

  it("keeps every character of the source, on the lines it was written on, the last one empty after a trailing newline", () => {
    const code = 'import { a } from "b"\n\n// c\nexport function D() {\n  return <E f="g" />\n}\n'
    const lines = highlightLines(code, "tsx")!
    expect(lines).toHaveLength(code.split("\n").length)
    expect(lines.at(-1)).toEqual([])
    expect(textOf(lines)).toBe(code)
  })

  it("writes a token's color as a light-dark() of the two themes, one color where they agree, and none for their foreground", () => {
    const [line] = highlightLines('import { a } from "b" // c', "tsx")!
    const styled = styles(line!)
    expect(styled.import).toBe("color:light-dark(#d73a49,#f97583)")
    expect(styled['"b"']).toBe("color:light-dark(#032f62,#9ecbff)")
    expect(styled["// c"]).toBe("color:#6a737d")
    expect(styled[" { a } "]).toBeUndefined()
    // No token carries the themes' own foreground, or a color a page's palette would fight.
    for (const token of line!) expect(token.style ?? "").not.toMatch(/#24292e|#e1e4e8/)
  })

  it("colors the shapes the pages show most: a demo's JSX, an install command, and a theme's stylesheet", () => {
    const [jsx] = highlightLines('<Accordion defaultValue={["shipping"]} />', "tsx")!
    expect(styles(jsx!).Accordion).toBe("color:light-dark(#005cc5,#79b8ff)")
    expect(styles(jsx!).defaultValue).toBe("color:light-dark(#6f42c1,#b392f0)")
    const [command] = highlightLines("npx shadcn@latest add tradecn/ui/ticket#v1.0.0   # look first", "bash")!
    expect(styles(command!).npx).toBe("color:light-dark(#6f42c1,#b392f0)")
    expect(styles(command!)["# look first"]).toBe("color:#6a737d")
    const [, rule] = highlightLines(":root {\n  --up: oklch(0.55 0.15 250);\n}", "css")!
    expect(styles(rule!)["--up"]).toBeDefined()
    expect(textOf(highlightLines('{ "a": 1 }', "json")!)).toBe('{ "a": 1 }')
  })

  it("returns the same lines for the same source, so a file several items install is colored once", () => {
    expect(highlightLines("const a = 1", "ts")).toBe(highlightLines("const a = 1", "ts"))
    expect(highlightLines("const a = 1", "ts")).not.toBe(highlightLines("const a = 1", "tsx"))
  })
})
