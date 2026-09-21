#!/usr/bin/env bash
# Prove `npx shadcn add @tradecn/<item>` works against the hosted registry in a fresh project.
#   scripts/ci/namespace-form.sh <base-url> <tag>
# The item list comes from <base-url>/r/<tag>/registry.json, so the catalog is proved on the way.
set -euo pipefail
base="${1:?base url, e.g. https://tradecn.dev}"
tag="${2:?release tag, e.g. v0.1.2}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
shadcn="shadcn@$(bun -e 'console.log(require("'"$root"'/package.json").devDependencies.shadcn)')"
work="$(mktemp -d)"
namespace="$base/r/$tag/{name}.json"

# The CLI fetches from ui.shadcn.com and from the host; one timeout should not fail a run.
retry() {
  local n
  for n in 1 2 3; do
    "$@" && return 0
    echo "attempt $n failed: $*" >&2
  done
  return 1
}
init_probe() {
  rm -rf "$work/probe"
  bunx "$shadcn" init -t vite -b radix -p nova -n probe -c "$work" -y --no-monorepo
}
retry init_probe

# Point the namespace at this tag's tree. The pinned form is the one a consumer should record.
NAMESPACE="$namespace" bun -e '
const path = process.argv[1]
const config = JSON.parse(await Bun.file(path).text())
config.registries = { ...(config.registries ?? {}), "@tradecn": process.env.NAMESPACE }
await Bun.write(path, JSON.stringify(config, null, 2) + "\n")
' "$work/probe/components.json"

catalog="$(curl -fsS "$base/r/$tag/registry.json")"
# No mapfile: macOS still ships bash 3.2.
addresses=()
while IFS= read -r n; do
  [ -n "$n" ] && addresses+=("@tradecn/$n")
done < <(CATALOG="$catalog" bun -e 'for (const i of JSON.parse(process.env.CATALOG).items) console.log(i.name)')
if [ "${#addresses[@]}" -eq 0 ]; then echo "the catalog at $base/r/$tag/registry.json lists no items" >&2; exit 1; fi
retry bunx "$shadcn" add -y -o -c "$work/probe" "${addresses[@]}"
cd "$work/probe" && bunx tsc -p tsconfig.app.json --noEmit
echo "namespace form OK for ${#addresses[@]} items at $namespace"
