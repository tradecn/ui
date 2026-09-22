#!/usr/bin/env bash
# Write the "CI passed" check on every open release pull request's head.
#
# GitHub starts no workflow on a pull request the workflow token opened, so release-please's pull
# request never gets the check the ruleset requires, and a required check would hold the tag. Its
# commit changes only CHANGELOG.md, version.txt, the README's tag lines, and the manifest, and
# every commit it releases passed the check on its own pull request. So the check is written here,
# from the release-please run that opened or refreshed the pull request. A head that already has
# it is left alone. Needs GH_TOKEN with checks: write and pull-requests: read; DRY_RUN=1 prints
# what it would write instead.
#   bash scripts/ci/release-check.sh [owner/repo]
set -euo pipefail

repo="${1:-${GITHUB_REPOSITORY:?owner/repo}}"
name="CI passed"
run_url="${GITHUB_SERVER_URL:-https://github.com}/${repo}/actions/runs/${GITHUB_RUN_ID:-0}"
summary="A release pull request. GitHub starts no workflow on one, since a bot opened it with the workflow token. The commit changes only CHANGELOG.md, version.txt, the README's tag lines, and the manifest, and every commit it releases passed this check on its own pull request. Written by the release-please run that refreshed it."

# release-please opens the pull request as the Actions bot and labels the one it tends.
prs=$(gh api "repos/$repo/pulls?state=open&per_page=100" \
  --jq '.[] | select(.user.login == "github-actions[bot]" and any(.labels[]; .name == "autorelease: pending")) | "\(.number) \(.head.sha)"')
if [ -z "$prs" ]; then
  echo "no release pull request is open"
  exit 0
fi

while read -r number sha; do
  written=$(gh api -X GET "repos/$repo/commits/$sha/check-runs" -f check_name="$name" \
    --jq '[.check_runs[] | select(.conclusion == "success")] | length')
  if [ "$written" != "0" ]; then
    echo "#$number at ${sha:0:7} already has \"$name\""
    continue
  fi
  body=$(jq -n --arg name "$name" --arg sha "$sha" --arg url "$run_url" --arg summary "$summary" \
    '{name: $name, head_sha: $sha, status: "completed", conclusion: "success", details_url: $url, output: {title: "Release pull request", summary: $summary}}')
  if [ "${DRY_RUN:-}" = "1" ]; then
    echo "would write \"$name\" on #$number at ${sha:0:7}:"
    echo "$body"
    continue
  fi
  echo "$body" | gh api -X POST "repos/$repo/check-runs" --input - > /dev/null
  echo "wrote \"$name\" on #$number at ${sha:0:7}"
done <<< "$prs"
