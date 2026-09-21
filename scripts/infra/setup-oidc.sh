#!/usr/bin/env bash
# One-time: the GitHub Actions deploy role for tradecn.dev, the `production` environment limited to
# main, and the role ARN as the AWS_DEPLOY_ROLE_ARN secret. Run it again after a repository transfer.
# Needs local AWS credentials for the account and `gh` with admin on the repository.
#   bash scripts/infra/setup-oidc.sh
set -euo pipefail
repo="tradecn/ui"
region="us-east-1"
stack="tradecn-github-oidc"
root="$(cd "$(dirname "$0")/../.." && pwd)"

# Nothing about the account is written down in the repo; read it where it lives.
account="$(aws sts get-caller-identity --query Account --output text)"
provider="$(aws iam list-open-id-connect-providers \
  --query "OpenIDConnectProviderList[?ends_with(Arn, ':oidc-provider/token.actions.githubusercontent.com')].Arn | [0]" \
  --output text)"
if [ -z "$provider" ] || [ "$provider" = "None" ]; then
  echo "the account has no GitHub Actions OIDC provider; create token.actions.githubusercontent.com first" >&2
  exit 1
fi
org_id="$(gh api "orgs/${repo%/*}" -q .id)"
repo_id="$(gh api "repos/$repo" -q .id)"
echo "account ending ${account: -4}, org id $org_id, repository id $repo_id"

aws cloudformation deploy \
  --region "$region" \
  --template-file "$root/infra/github-oidc-role.yml" \
  --stack-name "$stack" \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    ExistingOidcProviderArn="$provider" \
    GitHubOrgId="$org_id" \
    GitHubRepositoryId="$repo_id"
role_arn="$(aws cloudformation describe-stacks \
  --region "$region" \
  --stack-name "$stack" \
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" \
  --output text)"

# The deploy jobs run under this environment and the trust policy names it. Only main may deploy.
printf '%s' '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' |
  gh api -X PUT "repos/$repo/environments/production" --input - >/dev/null
if ! gh api "repos/$repo/environments/production/deployment-branch-policies" -q '.branch_policies[].name' | grep -qx main; then
  gh api -X POST "repos/$repo/environments/production/deployment-branch-policies" -f name=main -f type=branch >/dev/null
fi
gh secret set AWS_DEPLOY_ROLE_ARN --repo "$repo" --body "$role_arn"

echo "role: $role_arn"
echo "environment production: main only. secret AWS_DEPLOY_ROLE_ARN: set."
