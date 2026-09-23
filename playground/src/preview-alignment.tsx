import { useSyncExternalStore } from "react"
import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart } from "lucide-react"
import "./preview-alignment.css"

const alignments = [
  { value: "left", Icon: AlignHorizontalJustifyStart },
  { value: "center", Icon: AlignHorizontalJustifyCenter },
  { value: "right", Icon: AlignHorizontalJustifyEnd },
] as const

const currentAlignment = () => document.documentElement.dataset.previewAlign ?? "center"
function subscribe(onChange: () => void) {
  window.addEventListener("tradecn-preview-alignment-change", onChange)
  return () => window.removeEventListener("tradecn-preview-alignment-change", onChange)
}

/** Preview chrome: theme.js owns the shared, persisted choice. The demo remains mounted. */
export function PreviewAlignment() {
  const alignment = useSyncExternalStore(subscribe, currentAlignment)
  return (
    <div data-preview-controls>
      <div className="preview-alignment" role="group" aria-label="Preview alignment">
        {alignments.map(({ value, Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={`Align all previews ${value}`}
            title={`Align all previews ${value}`}
            aria-pressed={alignment === value}
            onClick={() => window.dispatchEvent(new CustomEvent("tradecn-preview-align", { detail: value }))}
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}
