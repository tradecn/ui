import { createRoot } from "react-dom/client"
import "./index.css"
import { scenes, tokens } from "./smoke/index"

// Copied over the fixture's src/main.tsx at CI time. Renders one scene per installed item.
createRoot(document.getElementById("root")!).render(
  <main data-smoke data-scenes={scenes.length} data-tokens={tokens.join(" ")} className="p-4">
    {scenes.map(({ name, Scene }) => (
      <section key={name} data-scene={name} className="mb-6">
        <Scene />
      </section>
    ))}
  </main>,
)
