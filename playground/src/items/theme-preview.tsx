import { useEffect, useState, type CSSProperties } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LinkGroupProvider, useLinkGroup } from "@/registry/tradecn/hooks/use-link-group"
import { createRowStore } from "@/registry/tradecn/lib/row-store"
import { FlashCell } from "@/registry/tradecn/ui/flash-cell"
import { LinkGroupDot, Panel, PanelActions, PanelContent, PanelHeader, PanelTitle, SymbolTag } from "@/registry/tradecn/ui/panel"
import { Watchlist, type WatchlistRow } from "@/registry/tradecn/ui/watchlist"
// As text, so the playground's tsconfig does not need JSON modules for one demo.
import registryText from "../../../registry.json?raw"

interface ThemeItem {
  name: string
  type: string
  title: string
  description: string
  cssVars?: { theme?: Record<string, string>; light?: Record<string, string>; dark?: Record<string, string> }
}

const themes = (JSON.parse(registryText) as { items: ThemeItem[] }).items.filter((item) => item.type === "registry:theme")

// What the CLI would write into a stylesheet, scoped to one element instead, so the playground's own
// look survives next to it. The utilities read var(--background) and friends, so this is enough.
function scoped(theme: ThemeItem): CSSProperties {
  const vars = Object.fromEntries(Object.entries(theme.cssVars?.dark ?? {}).map(([k, v]) => [`--${k}`, v]))
  return { ...vars, "--radius": theme.cssVars?.light?.radius ?? "0rem", fontFamily: theme.cssVars?.theme?.["font-sans"] } as CSSProperties
}

const SEED: WatchlistRow[] = [
  { symbol: "ZN", last: 110.5, bid: 110.48, ask: 110.52, change: 0.25, changePct: 0.23, volume: 1_250_000 },
  { symbol: "ZB", last: 118.75, bid: 118.72, ask: 118.78, change: -0.31, changePct: -0.26, volume: 410_000 },
  { symbol: "ES", last: 5012.25, bid: 5012, ask: 5012.5, change: -12.5, changePct: -0.25, volume: 980_000 },
  { symbol: "CL", last: 78.1, bid: 78.09, ask: 78.11, change: 0, changePct: 0, volume: 322_000 },
]

function Book() {
  const link = useLinkGroup({ defaultGroup: 2, defaultSymbol: "ZN", source: "preview" })
  const [store] = useState(() => {
    const s = createRowStore<WatchlistRow>({ getRowId: (r) => r.symbol })
    s.applyDeltas({ upsert: SEED })
    return s
  })
  const [px, setPx] = useState(110.5)
  useEffect(() => {
    const t = setInterval(() => {
      setPx((v) => Number((v + (Math.random() - 0.5) * 0.06).toFixed(2)))
      store.applyDeltas({
        patch: store.getIds().flatMap((id) => {
          const row = store.getRow(id)
          if (!row || Math.random() > 0.5) return []
          const last = Number(((row.last ?? 0) * (1 + (Math.random() - 0.5) * 0.0004)).toFixed(2))
          const change = Number(((row.change ?? 0) + last - (row.last ?? last)).toFixed(2))
          return [{ id, fields: { last, change } }]
        }),
      })
    }, 600)
    return () => clearInterval(t)
  }, [store])
  return (
    <Panel kind="preview" active className="h-72">
      <PanelHeader>
        <PanelTitle>Watchlist</PanelTitle>
        <SymbolTag value={link.symbol} onCommit={link.setSymbol} />
        <LinkGroupDot group={link.group} onGroupChange={link.setGroup} />
        <PanelActions>
          <FlashCell value={px} className="px-1 text-xs">
            {px.toFixed(2)}
          </FlashCell>
        </PanelActions>
      </PanelHeader>
      <PanelContent className="p-2">
        <Watchlist store={store} onAdd={(symbol) => store.applyDeltas({ upsert: [{ symbol, last: 100, change: 0, changePct: 0 }] })} onRemove={(symbols) => store.applyDeltas({ remove: symbols })} onRowActivate={(row) => link.setSymbol(row.symbol)} />
      </PanelContent>
    </Panel>
  )
}

export function ThemePreview({ name }: { name: string }) {
  const theme = themes.find((t) => t.name === name)
  if (!theme) return <main className="p-6 font-mono text-xs">No theme named {name} in registry.json.</main>
  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6 font-mono text-xs">
      <h1 className="text-sm font-semibold">{theme.name}</h1>
      <p className="text-muted-foreground">{theme.description}</p>
      <p className="text-muted-foreground">Installing it rewrites your stylesheet. Here its variables are set on one box, so the rest of the playground keeps its own look. Every component inside is the same one the other pages show.</p>
      <div style={scoped(theme)} className="space-y-3 border border-border bg-background p-4 text-sm text-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="secondary">
            Secondary
          </Button>
          <Button size="sm" variant="outline">
            Outline
          </Button>
          <Button size="sm" variant="destructive">
            Destructive
          </Button>
          <Badge>badge</Badge>
          <Badge variant="outline">outline</Badge>
          <span className="text-up">+0.25 up</span>
          <span className="text-down">−0.31 down</span>
          <span className="text-flat">0.00 flat</span>
          <span className="text-stale">stale</span>
        </div>
        <LinkGroupProvider transport={null}>
          <Book />
        </LinkGroupProvider>
      </div>
    </main>
  )
}
