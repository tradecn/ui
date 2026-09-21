import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { demos } from "./demos"

// The entry tradecn.dev embeds: one demo per page, named by the root's data-item, mounted in an
// iframe the docs page sizes from the height this posts. The palette is the page's, written by
// scripts/site/build.ts around this bundle, so the demo and the docs share one theme.
const root = document.getElementById("root")
if (!root) throw new Error("no #root to mount the demo in")
const item = root.dataset.item ?? ""

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
        <Demo />
      </StrictMode>,
    )
    root.dataset.state = "ready"
    // The observer reports once when it starts, after the demo's first commit, and again on every change.
    new ResizeObserver(report).observe(document.body)
  })
}
