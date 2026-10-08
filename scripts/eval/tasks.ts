// The screens the agent kit eval asks for, one Markdown file each in bench/agent-kit/tasks/. A task reads the way
// someone would ask for the screen and names no rule of the contract, so what an agent knows of the contract comes
// from the kit or from the installed source, never from the request.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { ROOT } from "../lib/registry"

export const TASKS_DIR = path.join(ROOT, "bench/agent-kit/tasks")

export interface Task {
  name: string
  /** The request, as the agent gets it after the frame. */
  prompt: string
  /** Registry items a screen like this is built from; a screen that imports one of them uses the registry. */
  expects: string[]
}

/** The same words around every request, in both arms: where the app is, where the screen goes, and when it is done. */
export const FRAME = [
  "This is a Vite, React and TypeScript app with shadcn/ui, and the tradecn registry's items are installed under src/components, src/hooks and src/lib. Build with them.",
  "The screen goes in src/App.tsx, which src/main.tsx already renders. Add files under src/ as you need them, and mock every piece of data inside the app.",
  "When you're done, `bunx vite build` has to succeed. Don't start a dev server or anything else that keeps running.",
].join(" ")

export function readTasks(dir = TASKS_DIR): Task[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const text = readFileSync(path.join(dir, file), "utf8")
      const match = /^---\n([\s\S]*?)\n---\n+([\s\S]*)$/.exec(text)
      if (!match) throw new Error(`${file}: no front matter`)
      const expects = /^expects:\s*(.+)$/m.exec(match[1]!)?.[1]?.split(",").map((name) => name.trim()).filter(Boolean) ?? []
      if (!expects.length) throw new Error(`${file}: expects names no item`)
      return { name: path.basename(file, ".md"), prompt: match[2]!.trim(), expects }
    })
}

/** What the agent is handed: the request, then the frame. */
export function promptFor(task: Task): string {
  return `${task.prompt}\n\n${FRAME}`
}
