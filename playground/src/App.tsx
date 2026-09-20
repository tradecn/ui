import { items } from "./items"

// One route per item at /items/<name>, the bench at /bench, an index at /.
// Path-based on purpose: no router dependency in a playground.
export function App() {
  const path = window.location.pathname
  const item = path.startsWith("/items/") ? items[path.slice("/items/".length)] : undefined
  if (item) return <item.Scene />
  return (
    <main className="mx-auto max-w-2xl p-6 font-mono text-sm">
      <h1 className="mb-4 text-base font-semibold">tradecn playground</h1>
      <ul className="space-y-1">
        {Object.entries(items).map(([name, { title }]) => (
          <li key={name}>
            <a className="underline underline-offset-4" href={`/items/${name}`}>
              {title}
            </a>
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
