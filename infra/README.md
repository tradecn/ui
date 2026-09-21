# tradecn.dev

One private S3 bucket behind CloudFront, defined in `lib/tradecn-site-stack.ts` with the AWS CDK. The landing page lives at the root and the shadcn registry under `/r`.

## What the URLs promise

- `https://tradecn.dev/r/{name}.json` and `/r/registry.json` are the latest release. They carry a five-minute cache and are invalidated when a release lands.
- `https://tradecn.dev/r/vX.Y.Z/{name}.json` is that release, unchanged, for as long as the domain exists. It carries a one-year immutable cache. Pin a namespace to it: `"@tradecn": "https://tradecn.dev/r/v0.1.2/{name}.json"`.
- `www.tradecn.dev` redirects to the apex. A missing item is a 404, never a page with status 200.

## What deploys when

- `.github/workflows/infra.yml` typechecks and synthesizes the stack on every pull request that touches `infra/`, and runs `cdk deploy` when such a change reaches `main`.
- The `deploy` job in `.github/workflows/release-please.yml` publishes content. GitHub starts no workflow from a tag its own token pushed, so the job rides in the run that made the release. It checks the tag out beside `main`, builds the registry with the tag's pinned CLI, writes `/r/<tag>/`, moves the latest pointer and the landing page only when the tag is the highest in the repo, invalidates, and installs every item through the namespace into a fresh project as the proof. `workflow_dispatch` with a `tag` input runs the same job for any existing tag.
- The landing page is `scripts/build-site.ts` over `site/index.html` and `site/404.html`, filled from the tag's `registry.json` and `version.txt`. Its palette is the `tradecn-terminal` theme's `cssVars`.

Site and infrastructure changes are `chore(site)` or `ci` commits, and release-please ignores these paths, so they never bump the version consumers pin.

## One-time setup

The deploy role is `github-oidc-role.yml`, a CloudFormation template. Its trust policy admits this repository's workflows on `main` and in the `production` environment, in both the name form and the immutable ID form of the subject claim. Its permissions are the CDK bootstrap roles for us-east-1, `DescribeStacks` on the site stack, the site bucket, and CloudFront invalidations. Nothing else in the account.

`just setup-oidc` runs `scripts/infra/setup-oidc.sh`, which needs local AWS credentials for the account and `gh` with admin on the repository. It reads the account id, the OIDC provider ARN, and the org and repository ids at run time, deploys the template, creates the `production` environment limited to `main`, and stores the role ARN as the `AWS_DEPLOY_ROLE_ARN` secret. The account and region must already be CDK-bootstrapped.

After a repository transfer the owner id in the ID-form subject claim changes: run `just setup-oidc` again.

## Locally

`just infra-synth` and `just infra-diff` need no credentials for the synth and the account's credentials for the diff. `just infra-deploy` is the break-glass path; the workflow is the normal one. `just site` renders the landing page into `site/dist/` from the working tree's `registry.json` and `version.txt`.
