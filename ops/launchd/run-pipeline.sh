#!/usr/bin/env bash
# Newsfeed pipeline runner — invoked by the launchd LaunchAgent
# (com.hakanssonlabs.newsfeed.pipeline) every 6 hours, and safe to run by hand:
#
#     bash ops/launchd/run-pipeline.sh
#
# It runs the full pipeline (fetch -> enrich via Claude Max -> merge) and, ONLY
# on success and ONLY if data/articles.json actually changed, commits and pushes
# it. A non-zero pipeline exit (majority of feeds down, enrichment failure, or a
# quota/rate-limit abort) means nothing is committed: launchd records the failure
# and the out-of-band Cloudflare monitor flags the resulting staleness.
set -euo pipefail

# Resolve the repo root from this script's own location, so there is no
# hard-coded path inside the script (the plist points launchd at this file).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_DIR"

# Defensive PATH so node/npm/npx, `claude`, and git resolve under launchd (which
# starts with a minimal environment). The plist also sets PATH; this is a backup.
export PATH="$HOME/.claude/local:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# If you change this, also update ARTICLES_URL in
# ops/cloudflare/monitor/wrangler.toml — the monitor reads the published file
# from a specific branch and would otherwise watch the wrong one.
BRANCH="${NEWSFEED_BRANCH:-main}"
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }
echo "[$(stamp)] newsfeed pipeline starting in $REPO_DIR (branch $BRANCH)"

# Stay current so the commit applies cleanly and we never push a stale base.
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# Run the full pipeline. `set -e` aborts the script here on any non-zero exit,
# so a failed run never reaches the commit/push below.
npm run pipeline

# Commit + push ONLY the data file, and only when it actually changed. A no-op
# run is byte-identical (generated_at only moves when articles were added), so
# `git status --porcelain` is empty and we skip the commit entirely.
if [[ -n "$(git status --porcelain -- data/articles.json)" ]]; then
  git add data/articles.json
  git -c user.name="newsfeed-bot" \
      -c user.email="newsfeed-bot@users.noreply.github.com" \
      commit -m "data: refresh articles ($(date -u +%Y-%m-%dT%H:%MZ))"
  git push origin "$BRANCH"
  echo "[$(stamp)] pushed refreshed data/articles.json"
else
  echo "[$(stamp)] no change to data/articles.json — nothing to commit (idempotent no-op)"
fi

echo "[$(stamp)] newsfeed pipeline done"
