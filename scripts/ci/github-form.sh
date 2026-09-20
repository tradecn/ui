#!/usr/bin/env bash
# Prove `npx shadcn add tradecn/ui/<item>#<sha>` works against one commit in a fresh project.
#   scripts/ci/github-form.sh <sha>
set -euo pipefail
sha="${1:?commit sha}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
shadcn="shadcn@$(bun -e 'console.log(require("'"$root"'/package.json").devDependencies.shadcn)')"
work="$(mktemp -d)"
bunx "$shadcn" init -t vite -b radix -p nova -n probe -c "$work" -y --no-monorepo
mapfile -t names < <(bun -e 'for (const i of require("'"$root"'/registry.json").items) console.log(i.name)')
if [ "${#names[@]}" -eq 0 ]; then echo "no items yet"; exit 0; fi
addresses=()
for n in "${names[@]}"; do addresses+=("tradecn/ui/$n#$sha"); done
bunx "$shadcn" add -y -c "$work/probe" "${addresses[@]}"
cd "$work/probe" && bunx tsc -p tsconfig.app.json --noEmit
echo "github form OK for ${#names[@]} items at $sha"
