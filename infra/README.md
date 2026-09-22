# tradecn.dev

One private S3 bucket behind CloudFront, defined in `lib/tradecn-site-stack.ts` with the AWS CDK. The landing page lives at the root and the shadcn registry under `/r`.

## What the URLs promise

- `https://tradecn.dev/r/{name}.json` and `/r/registry.json` are the latest release. They carry a five-minute cache and are invalidated when a release lands.
- `https://tradecn.dev/r/vX.Y.Z/{name}.json` is that release, unchanged, for as long as the domain exists. It carries a one-year immutable cache. Pin a namespace to it: `"@tradecn": "https://tradecn.dev/r/v0.1.2/{name}.json"`.
- `www.tradecn.dev` redirects to the apex. A missing item is a 404, never a page with status 200.

## What deploys when

- `.github/workflows/infra.yml` typechecks and synthesizes the stack on every pull request that touches `infra/`, and runs `cdk deploy` when such a change reaches `main`.
- The `deploy` job in `.github/workflows/release-please.yml` publishes content. GitHub starts no workflow from a tag its own token pushed, so the job rides in the run that made the release. It checks the tag out beside `main`, builds the registry with the tag's pinned CLI, writes `/r/<tag>/`, moves the latest pointer and the landing page only when the tag is the highest in the repo, invalidates, and installs every item through the namespace into a fresh project as the proof. `workflow_dispatch` with a `tag` input runs the same job for any existing tag.
- The pages are `scripts/site/build.ts` over `site/index.html`, `site/404.html`, `site/docs.html`, and `site/preview.html`, with one stylesheet in `site/site.css` and one script in `site/site.js`, filled from the tag's `registry.json`, `version.txt`, `docs/*.md`, and `CHANGELOG.md`: the opening page (a hero and every item running live), the site's own pages from `site/docs/*.md` on `main` (`/docs/` is the Introduction, then `/docs/installation/`, `/docs/components/`, `/docs/theming/`, `/docs/changelog/`, each with `{{placeholders}}` the builder fills from the tag), and one page per doc at `/docs/<name>/`, rendered with `marked`. The palette and the type are the `tradecn-amber` theme's `cssVars`, both sides, read from `main`'s `registry.json`, since a tag from before the theme existed has none; the two faces the typography tokens name are self-hosted under `/fonts/` from `site/fonts.css`. The docs are the tag's, so `/docs/` describes what `/r/` serves.
- The security headers on every response come from `site/headers.json`, read by the stack into the CloudFront response headers policy and served by `scripts/site/smoke.ts` locally, so a Content-Security-Policy that would block a page blocks it in the local smoke first. Scripts and frames are `'self'` only; styles allow inline for the pages' palette blocks and the components' style attributes; `connect-src` is `'self'` for the search index the pages fetch. The pages' script is `/site.js`, a file, for that reason. The infra workflow runs on a change to that file too, because the policy lives in this stack and a header edit that only republished the pages would leave the edge sending the old one.
- Each item's docs page embeds a live preview: an iframe of `/preview/<name>/`, a page around one Vite bundle built from the tag's `playground/src/demos/<name>.tsx` (`bun run --cwd playground build:embed`, output `playground/dist/embed`). The bundle is content-hashed and published under `/preview/assets/` with a one-year immutable cache; the pages carry `no-store` like the rest. A theme's preview page wears that theme; every other one wears the site's. The workspace's popout opens `/popout.html` at the root. A tag from before the previews has no embed build and its pages go out without them. `scripts/site/smoke.ts` opens every preview in a browser, locally against `site/dist` and after a deploy against the live site.

Site and infrastructure changes are `chore(site)` or `ci` commits, and release-please ignores these paths, so they never bump the version consumers pin.

## One-time setup

The deploy role is `github-oidc-role.yml`, a CloudFormation template. Its trust policy admits this repository's workflows on `main` and in the `production` environment, in both the name form and the immutable ID form of the subject claim. Its permissions are the CDK bootstrap roles for us-east-1, `DescribeStacks` on the site stack, the site bucket, and CloudFront invalidations. Nothing else in the account.

`just setup-oidc` runs `scripts/infra/setup-oidc.sh`, which needs local AWS credentials for the account and `gh` with admin on the repository. It reads the account id, the OIDC provider ARN, and the org and repository ids at run time, deploys the template, creates the `production` environment limited to `main`, and stores the role ARN as the `AWS_DEPLOY_ROLE_ARN` secret. The account and region must already be CDK-bootstrapped.

After a repository transfer the owner id in the ID-form subject claim changes: run `just setup-oidc` again.

## Locally

`just infra-synth` and `just infra-diff` need no credentials for the synth and the account's credentials for the diff. `just infra-deploy` is the break-glass path; the workflow is the normal one. `just site` renders the whole site into `site/dist/` from the working tree's `registry.json`, `version.txt`, `docs/`, and `CHANGELOG.md`; a site-only change reaches tradecn.dev through a `workflow_dispatch` of `release-please.yml` with the current tag.
