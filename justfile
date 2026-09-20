set shell := ["bash", "-euo", "pipefail", "-c"]

default: check

# Everything CI runs, in CI's order.
check: lint typecheck test validate tokens-check registry-validate build-registry

lint:
    bun run lint

typecheck:
    bun run typecheck

test:
    bun run test

# The item contract, checked mechanically.
validate:
    bun scripts/validate-registry.ts

# Regenerate every item's cssVars and the playground token stylesheet from registry/tradecn/tokens.json.
tokens:
    bun scripts/sync-tokens.ts

tokens-check:
    bun scripts/sync-tokens.ts --check

# Refresh registry/tradecn/builtins.lock.json from ui.shadcn.com for the locked styles.
lock-builtins:
    bun scripts/builtins-lock.ts

lock-builtins-check:
    bun scripts/builtins-lock.ts --check

registry-validate:
    bun run registry:validate

# Flatten registry.json to public/r for the hosted path.
build-registry:
    bun run registry:build

dev:
    cd playground && bun run dev

# Switch the playground to another shadcn style, e.g. `just style radix nova`.
style base preset:
    bun scripts/switch-style.ts {{base}} {{preset}}

# Run the browser bench. Writes bench/results only with --machine "<name>".
bench *args:
    bun scripts/bench.ts {{args}}
