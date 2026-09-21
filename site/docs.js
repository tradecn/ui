// The preview card's tabs, and the iframe's height from the message its page posts.
// A file, not an inline script, so the site's Content-Security-Policy can keep script-src to 'self'.
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
addEventListener("message", (event) => {
  if (event.origin !== location.origin || !event.data || event.data.type !== "tradecn-preview") return
  for (const frame of document.querySelectorAll(".preview iframe")) {
    if (frame.contentWindow === event.source) frame.style.height = Math.ceil(event.data.height) + "px"
  }
})
