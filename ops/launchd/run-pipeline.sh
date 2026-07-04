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
export GIT_TERMINAL_PROMPT=0

# Long-lived Claude OAuth token (subscription auth) so enrichment authenticates
# under launchd, which cannot reach the GUI login Keychain.
set -a; . "$HOME/.config/claude/oauth-token.env" 2>/dev/null || true; set +a

# If you change this, also update ARTICLES_URL in
# ops/cloudflare/monitor/wrangler.toml — the monitor reads the published file
# from a specific branch and would otherwise watch the wrong one.
BRANCH="${NEWSFEED_BRANCH:-main}"
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

push_if_ahead() {
  local ahead
  ahead="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
  if [[ "$ahead" != "0" ]]; then
    git push origin "$BRANCH"
    echo "[$(stamp)] pushed $ahead local commit(s) to origin/$BRANCH"
  fi
}

echo "[$(stamp)] newsfeed pipeline starting in $REPO_DIR (branch $BRANCH)"

# Stay current so the commit applies cleanly and we never push a stale base.
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# If a previous launchd run committed fresh data but failed to authenticate for
# push, retry that backlog even when this run has no new articles. Otherwise the
# local store can be fresh while the raw GitHub file stays stale and the
# out-of-band monitor keeps paging Telegram.
push_if_ahead

# Run the full pipeline. `set -e` aborts the script here on any non-zero exit,
# so a failed run never reaches the commit/push below.
npm run pipeline

# Commit + push ONLY the data file, and only when it actually changed. A no-op
# run is byte-identical (generated_at only moves when articles were added), so
# `git status --porcelain` is empty and we skip the commit entirely.
DATA_CHANGED=0
if [[ -n "$(git status --porcelain -- data/articles.json)" ]]; then
  git add data/articles.json
  git -c user.name="newsfeed-bot" \
      -c user.email="newsfeed-bot@users.noreply.github.com" \
      commit -m "data: refresh articles ($(date -u +%Y-%m-%dT%H:%MZ))"
  push_if_ahead
  DATA_CHANGED=1
else
  echo "[$(stamp)] no change to data/articles.json — nothing to commit (idempotent no-op)"
fi

# Publish the rebuilt site to Cloudflare Pages. IMPORTANT: the data push above
# does NOT auto-deploy — this Pages project has no Git integration, so without
# this the live site at newsfeed.trym.cloud freezes at the last manual deploy
# while git keeps moving. Rebuild + deploy here so the 5-min cadence keeps the
# published site fresh. Only runs when data actually changed.
#
# NON-FATAL BY DESIGN: every failure path is caught (if-conditions suppress
# set -e) and degrades to a WARN — a broken build or a Cloudflare/Infisical
# hiccup must never abort the run or undo the data already pushed. The CF token
# comes from Infisical via load-secrets.sh (verified reachable under launchd).
if [[ "$DATA_CHANGED" == "1" ]]; then
  if SITE_BASE=/ SITE_URL=https://newsfeed.trym.cloud npm run build >/dev/null 2>&1; then
    eval "$(bash "$HOME/Claude/politipuls/scripts/load-secrets.sh" 2>/dev/null)" 2>/dev/null || true
    if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] && npx --yes wrangler@3 pages deploy dist --project-name=newsfeed --branch="$BRANCH" --commit-dirty=true >/dev/null 2>&1; then
      echo "[$(stamp)] deployed rebuilt site to Cloudflare Pages (newsfeed.trym.cloud)"
    else
      echo "[$(stamp)] WARN: site deploy failed or CF token missing — data pushed; site publishes on next successful deploy"
    fi
  else
    echo "[$(stamp)] WARN: astro build failed — skipped deploy (data pushed OK)"
  fi
fi

echo "[$(stamp)] newsfeed pipeline done"
