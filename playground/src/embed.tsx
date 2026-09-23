import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource/inter/400.css"
import "@fontsource/inter/500.css"
import "@fontsource/inter/600.css"
import "@fontsource/jetbrains-mono/400.css"
import "@fontsource/jetbrains-mono/500.css"
import "@fontsource/jetbrains-mono/600.css"
import "./index.css"
import { demos } from "./demos"
import { alignable } from "./demos/frame.json"
import { PreviewAlignment } from "./preview-alignment"

// The entry tradecn.dev embeds: one demo per page, named by the root's data-item, mounted in an
// iframe the docs page sizes from the height this posts. The palette is the page's, written by
// scripts/site/build.ts around this bundle, so the demo and the docs share one theme. The two default
// faces are self-hosted through Fontsource's static packages, which register them under the names the
// tokens use ('Inter', 'JetBrains Mono'; the variable packages say 'Inter Variable'), so a preview calls
// no third party for its type and still gets the face the token names.
const root = document.getElementById("root")
if (!root) throw new Error("no #root to mount the demo in")
const item = root.dataset.item ?? ""
const canAlign = root.dataset.frame === "card" && alignable.includes(item)
if (canAlign) root.dataset.alignControls = ""

function report() {
  // The body is content-sized, so its height is the demo's. The docs page sets the iframe to it.
  window.parent.postMessage({ type: "tradecn-preview", item, height: document.body.offsetHeight }, window.location.origin)
}

const load = demos[item]
if (!load) {
  root.dataset.state = "missing"
  root.textContent = `There is no demo named ${item}.`
} else {
  load().then(({ default: Demo }) => {
    createRoot(root).render(
      <StrictMode>
        {canAlign && <PreviewAlignment />}
        <Demo />
      </StrictMode>,
    )
    root.dataset.state = "ready"
    // The observer reports once when it starts, after the demo's first commit, and again on every change.
    new ResizeObserver(report).observe(document.body)
    // The docs page asks when its script is up, in case this mounted before the page was listening.
    window.addEventListener("message", (event) => {
      if (event.origin === window.location.origin && event.source === window.parent && event.data?.type === "tradecn-preview-ask") report()
    })
  })
}
