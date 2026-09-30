# tradecn.dev

The site uses one private S3 content bucket behind CloudFront, defined with AWS CDK in `lib/tradecn-site-stack.ts`.

## What the URLs promise

| Path on tradecn.dev | Content | Cache |
|---|---|---|
| `/r/{name}.json`, `/r/registry.json` | Latest release's registry. | Five minutes; invalidated when the latest pointer moves. |
| `/r/vX.Y.Z/{name}.json` | That release's registry, unchanged while the domain exists. | One year, immutable. |
| `/`, `/docs/` | Latest release's pages. | `no-store`. |
| `/vX.Y.Z/` | That release's pages, including `/vX.Y.Z/docs/<name>/` and `/vX.Y.Z/preview/<name>/`. | `no-store`. |
| `/preview/assets/`, `/vX.Y.Z/preview/assets/` | Content-hashed preview bundles. | One year, immutable. |
| `/fonts/`, `/vX.Y.Z/fonts/` | Self-hosted font files. | One day. |
| `/versions.json` | `{ "latest": "vX.Y.Z", "versions": [...] }`, newest first. | Five minutes. |

Pin a namespace with `"@tradecn": "https://tradecn.dev/r/vX.Y.Z/{name}.json"`, replacing `vX.Y.Z` with the release you want. The header's version menu reads `/versions.json`. Versioned page trees exist for releases published since that feature was added; dispatching an older tag can add its tree.

`www.tradecn.dev` redirects to the apex. Missing items return 404, never an HTML page with status 200. `/robots.txt` leaves paths open and names `/sitemap.xml`, which lists the opening page and root docs at their canonical URLs. Previews and the 404 page use `noindex`; versioned pages canonicalize to the root, so neither appears in the sitemap.

The apex has one TXT record containing every value in `APEX_TXT_VALUES`. It currently holds the Google Search Console verification value.

## What deploys when

### Infrastructure

`.github/workflows/ci.yml` typechecks and synthesizes the stack on every PR, regardless of changed paths. `.github/workflows/infra.yml` deploys after changes to `infra/`, `site/headers.json` or the infra workflow reach `main`. Manual dispatch runs the same synth-then-deploy sequence.

### Content

The `deploy` job in `.github/workflows/release-please.yml` publishes content in the run that creates a release. It knows the tag; no separate workflow listens for a tag event. A manual dispatch with a `tag` input publishes any existing tag through the same job.

The job checks out the tag beside `main`, builds its registry with the pinned CLI and publishes `/r/<tag>/`. It builds root and versioned page trees, publishes `/<tag>/`, then rewrites `/versions.json` from the trees in the bucket. Only the highest repository tag updates the latest registry pointer and root pages. After invalidation, the job installs the items through the namespace into a fresh project as a distribution check.

### Build inputs

`scripts/site/build.ts` renders Markdown with `marked` into the templates in `site/`. The inputs have different owners:

| Input | Revision |
|---|---|
| Builder, HTML templates, `site/site.css`, `site/site.js` and `site/docs/*.md` | `main` |
| Registry entries, `version.txt`, `docs/*.md`, `CHANGELOG.md` and demo source | Published tag |
| Site palette from `tradecn-amber`, font CSS and self-hosted fonts | `main` |

The opening page shows the hero and live items. The site guides provide Introduction, Installation, Components, Theming and Changelog, with placeholders filled from the tag. Each item doc gets `/docs/<name>/`. The site uses the main branch's palette because tags predating the theme have none; Inter and JetBrains Mono are self-hosted under `/fonts/` through `site/fonts.css`.

### Security headers

`site/headers.json` supplies the pages' Content-Security-Policy and frame policy to both CDK and the local smoke server. CDK defines the other page headers and a separate policy for `/r/*`, including registry CORS. Changing `site/headers.json` triggers the infra workflow so CloudFront receives the updated policy.

Scripts and frames are restricted to `'self'`. Styles allow inline values for palette blocks and component style attributes; `connect-src` allows the same-origin search index. The page script is served as `/site.js`. A page blocked by this shared CSP also fails the local browser smoke check.

### Previews

Each item doc embeds `/preview/<name>/`, which loads the Vite bundle built from the tag's `playground/src/demos/<name>.tsx`. `bun run --cwd playground build:embed` writes `playground/dist/embed`. Its relative base (`--base ./`) lets one bundle serve root and versioned trees; the surrounding pages use `no-store`.

A theme's preview uses that theme; other previews follow the site's selection. Workspace popouts open `/popout.html` at the root. Tags predating the embed build publish without previews. `scripts/site/smoke.ts` opens every preview locally against `site/dist` and after deployment against the live site.

Site and infrastructure paths are excluded from release-please. Changes confined to them, commonly titled `chore(site)` or `ci(infra)`, do not bump the version consumers pin.

## One-time setup

The deploy role is defined in `github-oidc-role.yml`. Its trust policy accepts this repository's workflows on `main` and in the `production` environment, using both name-form and immutable-ID subject claims. Its permissions cover the CDK bootstrap roles in us-east-1, `DescribeStacks` on the site stack, the site bucket and CloudFront invalidations.

Run `just setup-oidc` with local AWS credentials for the account and `gh` admin access to the repository. The account and region must already be CDK-bootstrapped, and the account must have the GitHub Actions OIDC provider (`token.actions.githubusercontent.com`). The script reads the account, provider, org and repository IDs, deploys the role template, creates the `production` environment restricted to `main` and stores `AWS_DEPLOY_ROLE_ARN` as a repository secret.

Run it again after a repository transfer because the owner ID in the subject claim changes.

## Locally

| Command | Purpose | Credentials |
|---|---|---|
| `just infra-synth` | Synthesize the stack. | None. |
| `just infra-diff` | Compare the stack with the deployed one. | Account credentials. |
| `just infra-deploy` | Deploy directly as a break-glass action. | Account credentials. |
| `just site` | Build the site into `site/dist/` from the working tree. | None. |

Use the infrastructure workflow for stack changes. After a site-template or builder correction reaches `main`, dispatch `release-please.yml` from `main` for each published tag whose pages need the correction. Each run rebuilds and publishes that tag's registry, pages and previews; only the highest tag also refreshes the root and latest registry pointer. Other versioned page trees are left unchanged. A merge alone does not republish content.
