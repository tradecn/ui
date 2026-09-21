// The preview card's tabs, and the iframe's height from the message its page posts.
// A file, not an inline script, so the site's Content-Security-Policy can keep script-src to 'self'.
// Loaded in <head> and not deferred, on purpose: the parser stops here until it has run, so the
// listener below exists before any preview iframe is even parsed, let alone loaded. A deferred copy
// lost the race on the live site, where the preview bundle is cached and this file is fetched fresh.
addEventListener("message", (event) => {
  if (event.origin !== location.origin || !event.data || event.data.type !== "tradecn-preview") return
  for (const frame of document.querySelectorAll(".preview iframe")) {
    if (frame.contentWindow === event.source) frame.style.height = Math.ceil(event.data.height) + "px"
  }
})

addEventListener("DOMContentLoaded", () => {
  for (const preview of document.querySelectorAll(".preview")) {
    const tabs = [...preview.querySelectorAll("[role='tab']")]
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        for (const other of tabs) {
          const on = other === tab
          other.setAttribute("aria-selected", String(on))
          const panel = document.getElementById(other.getAttribute("aria-controls"))
          if (panel) panel.hidden = !on
        }
      })
    }
  }
  // Belt and braces: a preview that is already up answers this with its height. One that is not up
  // yet ignores it and reports on its own when it mounts, which the listener above is waiting for.
  for (const frame of document.querySelectorAll(".preview iframe")) {
    const ask = () => frame.contentWindow?.postMessage({ type: "tradecn-preview-ask" }, location.origin)
    ask()
    frame.addEventListener("load", ask)
  }
})
