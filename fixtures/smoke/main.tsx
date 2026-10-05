import { createRoot } from "react-dom/client"
import "./index.css"
import { scenes, tokens } from "./smoke/index"

// Copied over the fixture's src/main.tsx at CI time. Renders one scene per installed item.
const content = (
  <main data-smoke data-scenes={scenes.length} data-tokens={tokens.join(" ")} className="p-4">
    {scenes.map(({ name, Scene }) => (
      <section key={name} data-scene={name} className="mb-6">
        <Scene />
      </section>
    ))}
  </main>
)

if (new URLSearchParams(location.search).has("document-root")) {
  // Document-level React delegation shares a native listener node with installed primitives.
  const stylesheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), link => link.href)
  createRoot(document).render(<html lang="en"><head><title>Document root consumer</title>{stylesheets.map(href => <link key={href} rel="stylesheet" href={href} />)}</head><body>{content}</body></html>)
} else {
  createRoot(document.getElementById("root")!).render(content)
}
