#!/usr/bin/env bash
# Install the flattened registry (public/r) into a clean consumer of one shadcn style,
# then typecheck, build, and run the smoke scenes in a browser.
#   scripts/ci/consumer-matrix.sh <style> [--latest]
# --latest regenerates the consumer from scratch with shadcn@latest instead of the committed fixture.
set -euo pipefail
style="${1:?style (radix-nova|base-mira|base-vega)}"
latest="${2:-}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
shadcn="shadcn@$(bun -e 'console.log(require("'"$root"'/package.json").devDependencies.shadcn)')"
[ "$latest" = "--latest" ] && shadcn="shadcn@latest"

# The CLI fetches from ui.shadcn.com; one timeout should not fail a run.
retry() {
  local n
  for n in 1 2 3; do
    "$@" && return 0
    echo "attempt $n failed: $*" >&2
  done
  return 1
}

if [ "$latest" = "--latest" ]; then
  work="$(mktemp -d)"
  base="${style%%-*}"; preset="${style##*-}"
  init_consumer() {
    rm -rf "$work/consumer"
    bunx "$shadcn" init -t vite -b "$base" -p "$preset" -n consumer -c "$work" -y --no-monorepo
  }
  retry init_consumer
  fixture="$work/consumer"
  # Base UI styles default to hugeicons, whose package imports two files under the wrong letter case
  # and cannot be bundled on a case-sensitive filesystem. The icon library is not what this tests.
  bun -e 'const f=process.argv[1]+"/components.json";const j=JSON.parse(require("fs").readFileSync(f,"utf8"));j.iconLibrary="lucide";require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")' "$fixture"
  bun add --cwd "$fixture" lucide-react
else
  fixture="$root/fixtures/consumers/$style"
  bun install --frozen-lockfile --cwd "$fixture"
fi

items=()
for f in "$root"/public/r/*.json; do
  case "$(basename "$f")" in registry.json) ;; *) items+=("$f") ;; esac
done
if [ "${#items[@]}" -eq 0 ]; then echo "no built items in public/r; nothing to install"; exit 0; fi

retry bunx "$shadcn" add -y -o -c "$fixture" "${items[@]}"

mkdir -p "$fixture/src/smoke"
cp "$root"/fixtures/smoke/scenes/*.tsx "$fixture/src/smoke/" 2>/dev/null || true
cp "$root/fixtures/smoke/main.tsx" "$fixture/src/main.tsx"
cp "$root/fixtures/smoke/playwright.config.ts" "$fixture/playwright.config.ts"
cp "$root/fixtures/smoke/smoke.spec.ts" "$fixture/smoke.spec.ts"
[ "$latest" = "--latest" ] && bun add -d --cwd "$fixture" @playwright/test

cd "$fixture"
# Typecheck the consumer. Errors in files tradecn installed (or in the smoke scenes) fail the job;
# errors in the consumer's own shadcn files are upstream's and are reported, not blamed on tradecn.
bun "$root/scripts/ci/typecheck-consumer.ts" "$fixture"
bunx vite build
if [ -n "${CI:-}" ]; then bunx playwright install --with-deps chromium; else bunx playwright install chromium; fi
bunx playwright test
