import { useEffect, useMemo, useState } from "react"
import { createFlashMemory, directionClass, directionOf } from "@/registry/tradecn/hooks/use-flash"
import { formatPrice, formatSigned } from "@/registry/tradecn/lib/format"
import { FlashCell } from "@/registry/tradecn/ui/flash-cell"

const N = 24

export function FlashCellScene() {
  const memory = useMemo(() => createFlashMemory(), [])
  const [rows, setRows] = useState(() => Array.from({ length: N }, (_, i) => ({ id: `R${i}`, px: 100, prev: 100 })))
  useEffect(() => {
    const t = setInterval(() => {
      setRows((rs) =>
        rs.map((r) => {
          if (Math.random() > 0.35) return r
          const roll = Math.random()
          const d = roll < 0.1 ? 0 : (Math.random() - 0.5) * 0.5
          return { ...r, prev: r.px, px: Number((r.px + d).toFixed(2)) }
        }),
      )
    }, 250)
    return () => clearInterval(t)
  }, [])
  return (
    <main className="mx-auto max-w-2xl p-6 font-mono text-xs tabular-nums">
      <h1 className="mb-2 text-sm font-semibold">flash-cell</h1>
      <p className="mb-4 text-muted-foreground">Fill on the left, ring on the right. Zero change flashes flat. Shared memory keyed by cell.</p>
      <div className="grid grid-cols-2 gap-6">
        {(["fill", "ring"] as const).map((variant) => (
          <table key={variant} className="w-full">
            <tbody>
              {rows.map((r) => {
                const dir = directionOf(r.prev, r.px)
                return (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-0.5 pr-3 text-muted-foreground">{r.id}</td>
                    <td className="py-0.5">
                      <FlashCell value={r.px} variant={variant} memory={memory} cellKey={`${r.id}\u0000${variant}`} className="px-1 text-right">
                        {formatPrice(r.px, { kind: "decimal", decimals: 2 })}
                      </FlashCell>
                    </td>
                    <td className={`py-0.5 pl-3 text-right ${directionClass(dir)}`}>{formatSigned(r.px - r.prev)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ))}
      </div>
    </main>
  )
}
