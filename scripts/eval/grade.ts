// Grading for the agent kit eval: what an agent's screen does against the item contract, read from the source it
// wrote and from the page that source renders. The source rules are the validator's rule 14 checks; the page rules
// are checkContract's, the same function the kit hands the agent.
import path from "node:path"
import type { Browser } from "@playwright/test"
import { checkContract, CONTRACT_RULES, type ContractFinding, type ContractRule } from "../../registry/tradecn/lib/agent-kit"
import { fontSizesUnderFloor } from "../lib/registry"

// As the validator reads them.
const TABULAR = /\btabular-nums\b/
const LINING = /\blining-nums\b/
const TAILWIND_FONT = /(?<![\w-])(?:[\w-]+:)*font-(?:mono|sans|serif)(?![\w-])/
// Numbers formatted by hand where the format lib belongs. A count to read, not a rule: a date or a row count may
// fairly go through toLocaleString.
const HAND_FORMAT = /\.toFixed\(|\.toLocaleString\(|new Intl\.NumberFormat\(/g

export interface SourceFile {
  file: string
  source: string
}

/** Where the contract's source rules break in the files an agent wrote, as `file:line: what`. */
export interface SourceFindings {
  floor: string[]
  font: string[]
  tabular: string[]
  handFormatted: string[]
}

export function sourceFindings(files: SourceFile[]): SourceFindings {
  const out: SourceFindings = { floor: [], font: [], tabular: [], handFormatted: [] }
  for (const { file, source } of files) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue
    source.split("\n").forEach((line, index) => {
      const at = `${file}:${index + 1}`
      for (const size of fontSizesUnderFloor(line)) out.floor.push(`${at}: ${size}`)
      const font = line.match(TAILWIND_FONT)
      if (font) out.font.push(`${at}: ${font[0]}`)
      if (TABULAR.test(line) && !LINING.test(line)) out.tabular.push(`${at}: tabular-nums without lining-nums`)
      for (const hand of line.match(HAND_FORMAT) ?? []) out.handFormatted.push(`${at}: ${hand}`)
    })
  }
  return out
}

/** The tradecn items the files import, by registry name: `@/components/ui/data-grid`, `./lib/format`, `@/components/ticket`. */
export function itemsImported(files: SourceFile[], items: ReadonlySet<string>): string[] {
  const used = new Set<string>()
  for (const { source } of files) {
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
      const name = path.basename(match[1]!).replace(/\.(tsx?|jsx?)$/, "")
      if (items.has(name)) used.add(name)
    }
  }
  return [...used].sort()
}

export interface PageGrade {
  /** Something under #root with text in it. */
  rendered: boolean
  pageErrors: string[]
  findings: Record<ContractRule, number>
  checked: Record<ContractRule, number>
  /** The first findings, for reading a result by eye. */
  examples: ContractFinding[]
  /** The direction rule under visibleCue: what a sighted reader alone would miss. Reported, not graded. */
  visibleCueDirection: number
}

const empty = (): Record<ContractRule, number> => ({ floor: 0, numeric: 0, direction: 0, name: 0 })

/** Serve a built app, open it, let its mock feeds run, and read the page with checkContract. */
export async function gradePage(dist: string, browser: Browser, options: { settleMs?: number; screenshot?: string } = {}): Promise<PageGrade> {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname)
      const file = Bun.file(path.join(dist, pathname === "/" ? "index.html" : pathname))
      return (await file.exists()) ? new Response(file) : new Response(Bun.file(path.join(dist, "index.html")))
    },
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 300)))
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text().slice(0, 300))
  })
  try {
    await page.goto(`http://localhost:${server.port}/`, { waitUntil: "load", timeout: 30_000 })
    await page.waitForTimeout(options.settleMs ?? 2500)
    const rendered = await page.evaluate(() => (document.getElementById("root")?.innerText ?? "").trim().length > 0)
    if (options.screenshot) await page.screenshot({ path: options.screenshot, fullPage: true })
    const findings = empty()
    const checked = empty()
    let examples: ContractFinding[] = []
    let visibleCueDirection = 0
    if (rendered) {
      const report = await page.evaluate(checkContract, { root: "#root" })
      for (const rule of CONTRACT_RULES) {
        findings[rule] = report.findings.filter((finding) => finding.rule === rule).length
        checked[rule] = report.checked[rule]
      }
      examples = report.findings.slice(0, 8)
      const direction: ContractRule[] = ["direction"]
      const visible = await page.evaluate(checkContract, { root: "#root", rules: direction, visibleCue: true })
      visibleCueDirection = visible.findings.length
    }
    return { rendered, pageErrors, findings, checked, examples, visibleCueDirection }
  } finally {
    await page.close()
    server.stop(true)
  }
}
