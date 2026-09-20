#!/usr/bin/env bash
# Prove `npx shadcn add tradecn/ui/<item>#<sha>` works against one commit in a fresh project.
#   scripts/ci/github-form.sh <sha>
set -euo pipefail
sha="${1:?commit sha}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
shadcn="shadcn@$(bun -e 'console.log(require("'"$root"'/package.json").devDependencies.shadcn)')"
work="$(mktemp -d)"

# The CLI fetches from ui.shadcn.com and from GitHub; one timeout should not fail a run.
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
mapfile -t names < <(bun -e 'for (const i of require("'"$root"'/registry.json").items) console.log(i.name)')
if [ "${#names[@]}" -eq 0 ]; then echo "no items yet"; exit 0; fi
addresses=()
for n in "${names[@]}"; do addresses+=("tradecn/ui/$n#$sha"); done
retry bunx "$shadcn" add -y -o -c "$work/probe" "${addresses[@]}"
cd "$work/probe" && bunx tsc -p tsconfig.app.json --noEmit
echo "github form OK for ${#names[@]} items at $sha"
