import { lazy, Suspense } from "react"
import { BenchPage } from "./bench/BenchPage"
import { demos } from "./demos"
import { items } from "./items"

// Made once, outside render, so React keeps the same component across renders.
const lazyDemos = Object.fromEntries(Object.entries(demos).map(([name, load]) => [name, lazy(load)]))

// The docs-site demo for one item, in the box tradecn.dev gives it, so it can be worked on here.
function DemoPage({ name }: { name: string }) {
  const Demo = lazyDemos[name]
  if (!Demo) return <main className="p-6 font-(family-name:--tradecn-font-mono) text-xs">No demo named {name}.</main>
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 font-(family-name:--tradecn-font-mono) text-sm font-semibold">{name} demo</h1>
      <div className="border border-border p-4">
        <Suspense>
          <Demo />
        </Suspense>
      </div>
    </main>
  )
}

// One route per item at /items/<name>, its docs demo at /demos/<name>, the bench at /bench, an index at /.
// Path-based on purpose: no router dependency in a playground.
export function App() {
  const path = window.location.pathname
  const item = path.startsWith("/items/") ? items[path.slice("/items/".length)] : undefined
  if (item) return <item.Scene />
  if (path.startsWith("/demos/")) return <DemoPage name={path.slice("/demos/".length)} />
  if (path === "/bench") return <BenchPage />
  return (
    <main className="mx-auto max-w-2xl p-6 font-(family-name:--tradecn-font-mono) text-sm">
      <h1 className="mb-4 text-base font-semibold">tradecn playground</h1>
      <ul className="space-y-1">
        {Object.entries(items).map(([name, { title }]) => (
          <li key={name} className="flex gap-3">
            <a className="underline underline-offset-4" href={`/items/${name}`}>
              {title}
            </a>
            {name in demos && (
              <a className="text-muted-foreground underline underline-offset-4" href={`/demos/${name}`}>
                demo
              </a>
            )}
          </li>
        ))}
        <li>
          <a className="underline underline-offset-4" href="/bench">
            bench
          </a>
        </li>
      </ul>
    </main>
  )
}
