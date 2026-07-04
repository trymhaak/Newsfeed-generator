#!/usr/bin/env bash
# Newsfeed pipeline runner — invoked by the launchd LaunchAgent
# (com.hakanssonlabs.newsfeed.pipeline) every 6 hours, and safe to run by hand:
#
#     bash ops/launchd/run-pipeline.sh
#
# It runs the full pipeline (fetch -> enrich via Claude Max -> merge) and, on
# success, commits a small heartbeat file (`data/pipeline-status.json`) every run.
# If data/articles.json changed, that is committed in the same transaction. A
# non-zero pipeline exit (majority of feeds down, enrichment failure, or a
# quota/rate-limit abort) means no heartbeat is committed: launchd records the
# failure and the out-of-band Cloudflare monitor flags the resulting staleness.
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

# Headless ops secrets. In particular, GITHUB_PAT lets launchd push without the
# GUI Keychain / osxkeychain prompt that otherwise fails with exit 128.
eval "$(bash "$HOME/Claude/politipuls/scripts/load-secrets.sh" 2>/dev/null)" 2>/dev/null || true
if [[ -z "${GITHUB_PAT:-}" ]] && command -v gh >/dev/null 2>&1; then
  GITHUB_PAT="$(gh auth token 2>/dev/null || true)"
  export GITHUB_PAT
fi

# If you change this, also update ARTICLES_URL in
# ops/cloudflare/monitor/wrangler.toml — the monitor reads the published file
# from a specific branch and would otherwise watch the wrong one.
BRANCH="${NEWSFEED_BRANCH:-main}"
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

write_pipeline_status() {
  python3 - <<'PY'
import datetime as dt
import json
from pathlib import Path

articles_path = Path("data/articles.json")
status_path = Path("data/pipeline-status.json")
checked_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

generated_at = None
article_count = None
if articles_path.exists():
    data = json.loads(articles_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        generated_at = data.get("generated_at") or data.get("generated")
        articles = data.get("articles")
        if isinstance(articles, list):
            article_count = len(articles)

payload = {
    "schema": "newsfeed_pipeline_status.v1",
    "checked_at": checked_at,
    "generated_at": generated_at,
    "article_count": article_count,
    "source": "ops/launchd/run-pipeline.sh",
}
status_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"[{checked_at}] wrote {status_path}")
PY
}

push_if_ahead() {
  local ahead
  ahead="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
  if [[ "$ahead" != "0" ]]; then
    local askpass=""
    local rc=0
    if [[ -n "${GITHUB_PAT:-}" ]]; then
      askpass="$(mktemp -t newsfeed-git-askpass.XXXXXX)"
      cat >"$askpass" <<'EOF'
#!/bin/sh
case "$1" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *Password*) printf '%s\n' "$GITHUB_PAT" ;;
  *) printf '\n' ;;
esac
EOF
      chmod 700 "$askpass"
      GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="$askpass" git -c credential.helper= push origin "$BRANCH" || rc=$?
      rm -f "$askpass"
      if [[ "$rc" != "0" ]]; then
        return "$rc"
      fi
    elif command -v gh >/dev/null 2>&1; then
      askpass="$(mktemp -t newsfeed-git-askpass.XXXXXX)"
      cat >"$askpass" <<'EOF'
#!/bin/sh
case "$1" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *Password*) /opt/homebrew/bin/gh auth token ;;
  *) printf '\n' ;;
esac
EOF
      chmod 700 "$askpass"
      GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="$askpass" git -c credential.helper= push origin "$BRANCH" || rc=$?
      rm -f "$askpass"
      if [[ "$rc" != "0" ]]; then
        return "$rc"
      fi
    else
      git push origin "$BRANCH"
    fi
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

# Successful pipeline run heartbeat. This is intentionally separate from the
# content freshness stamp: a no-new-articles run should still prove that the Mac,
# launchd, GitHub push auth, and feed fetcher are alive.
write_pipeline_status

# Commit + push data changes and/or the heartbeat. A no-new-articles run keeps
# data/articles.json byte-identical, but advances data/pipeline-status.json so
# the Cloudflare monitor can distinguish "pipeline healthy but no new articles"
# from "pipeline stopped".
DATA_CHANGED=0
STATUS_CHANGED=0
if [[ -n "$(git status --porcelain -- data/articles.json)" ]]; then
  DATA_CHANGED=1
fi
if [[ -n "$(git status --porcelain -- data/pipeline-status.json)" ]]; then
  STATUS_CHANGED=1
fi
if [[ "$DATA_CHANGED" == "1" || "$STATUS_CHANGED" == "1" ]]; then
  git add data/articles.json data/pipeline-status.json
  if [[ "$DATA_CHANGED" == "1" ]]; then
    COMMIT_MESSAGE="data: refresh articles ($(date -u +%Y-%m-%dT%H:%MZ))"
  else
    COMMIT_MESSAGE="ops: record newsfeed pipeline heartbeat ($(date -u +%Y-%m-%dT%H:%MZ))"
  fi
  git -c user.name="newsfeed-bot" \
      -c user.email="newsfeed-bot@users.noreply.github.com" \
      commit -m "$COMMIT_MESSAGE"
  push_if_ahead
else
  echo "[$(stamp)] no data or heartbeat changes — nothing to commit"
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
