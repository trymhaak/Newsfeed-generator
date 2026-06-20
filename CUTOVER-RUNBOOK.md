# Cutover runbook — Newsfeed-generator → production

This branch (`feat/production-readiness`) is **all reversible code/config**: live
feeds, fail-loud pipeline, never-empty front page, atomic store, on-Mac launchd
artifacts, and Cloudflare monitor/Pages config. None of it is deployed, installed,
or pushed.

This runbook is the **irreversible, human-only** half: loading launchd, deploying
Cloudflare, setting secrets, and moving DNS. Each step is tagged:

- 🟢 **Mechanical** — copy/paste, no decision.
- 🔑 **Credential** — needs a secret/login you must supply.
- 🧠 **Decision** — needs a human call (domain, go/no-go).

Do the sections in order. §A is the one that unfreezes the feed; §B and §C harden
and rehome it.

---

## Human atoms to resolve first (gather these before starting)

| # | Atom | Tag | Notes |
|---|------|-----|-------|
| 1 | Go/no-go to start on-Mac enrichment | 🧠 | This is the actual production switch-on. |
| 2 | Git push credential on the Mac for `origin main` | 🔑 | SSH key or `gh auth login`. The runner does `git push`. |
| 3 | Cloudflare account + `wrangler login` | 🔑 | For monitor + Pages. |
| 4 | Alert webhook URL (Discord or Slack incoming webhook) | 🔑 | Stored as a Worker **secret**, never committed. |
| 5 | Custom domain — do we want one? which? | 🧠 | `cname` is null today. Needed for §C; skippable if staying on `*.pages.dev`. |
| 6 | Accept Mac mini as single point of failure for enrichment | 🧠 | Mitigated by the §B out-of-band monitor. |

> Background: headless Claude Max auth (`claude -p` reading the login Keychain)
> is **already proven** to work on this machine (via the MCP → `claude -p` path),
> so §A's smoke test is a **confirmation**, not an unknown.

---

## §A — On-Mac enrichment via launchd (P0.2)

Artifacts: [`ops/launchd/`](ops/launchd/). This unfreezes the feed.

### A1. Pre-checks 🟢🔑

```bash
cd /path/to/Newsfeed-generator           # the repo checkout on the Mac
git checkout main && git pull --ff-only  # be on the branch the runner pushes to

# Auth confirmation — should print OK with no prompt (proves Max headless auth):
claude -p "Svar kun med ordet OK"

# Push credential confirmation (atom #2) — should succeed without prompting:
git ls-remote origin -h refs/heads/main >/dev/null && echo "git remote OK"
```

If `claude -p` prompts or errors, fall back to a local token (atom #1 stays
on the Mac, never in the cloud):

```bash
claude setup-token            # prints a CLAUDE_CODE_OAUTH_TOKEN
# add it to the plist EnvironmentVariables dict (see A3), e.g.:
#   <key>CLAUDE_CODE_OAUTH_TOKEN</key><string>...</string>
```

### A2. Smoke-test the runner by hand 🟢

Before involving launchd, run the exact job body manually:

```bash
bash ops/launchd/run-pipeline.sh
```

Expect: `fetched N new articles from X/11 feeds` → `enriched N/M articles` →
either a commit+push of `data/articles.json` or `no change … nothing to commit`.
A non-zero exit means it correctly refused to publish (mass feed death / quota /
enrichment failure) — investigate before continuing.

### A3. Render + install the LaunchAgent 🟢🔑

```bash
REPO_DIR="$(pwd)"
DEST=~/Library/LaunchAgents/com.hakanssonlabs.newsfeed.pipeline.plist
sed -e "s#__REPO_DIR__#${REPO_DIR}#g" \
    -e "s#__NODE_BIN_DIR__#$(dirname "$(which node)")#g" \
    -e "s#__HOME__#${HOME}#g" \
    ops/launchd/com.hakanssonlabs.newsfeed.pipeline.plist > "$DEST"

launchctl bootstrap gui/$(id -u) "$DEST"
```

### A4. Confirm enrichment runs FROM the launchd context 🟢

This is the key confirmation — that the job reaches the Keychain when started by
launchd, not just from your interactive shell:

```bash
launchctl kickstart -k gui/$(id -u)/com.hakanssonlabs.newsfeed.pipeline
launchctl print     gui/$(id -u)/com.hakanssonlabs.newsfeed.pipeline | grep -E 'state|last exit'
tail -n 40 ops/launchd/logs/pipeline.out.log
tail -n 40 ops/launchd/logs/pipeline.err.log
```

Pass = the log shows `enriched N/M articles` and a clean exit. If it fails with
an auth error only under launchd, use the `claude setup-token` fallback (A1) and
re-render the plist.

### A5. Rollback 🟢

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.hakanssonlabs.newsfeed.pipeline.plist
rm ~/Library/LaunchAgents/com.hakanssonlabs.newsfeed.pipeline.plist
```

---

## §B — Cloudflare freshness monitor (P0.3)

Artifacts: [`ops/cloudflare/monitor/`](ops/cloudflare/monitor/). Out-of-band
staleness alarm; deploy after §A so it has fresh data to watch.

### B1. Deploy 🟢🔑

```bash
cd ops/cloudflare/monitor
npm install
wrangler login            # 🔑 atom #3
wrangler deploy
```

### B2. Set the webhook secret 🔑

```bash
wrangler secret put WEBHOOK_URL      # paste the Discord/Slack webhook (atom #4)
# If using Slack, also set WEBHOOK_KIND=slack in wrangler.toml [vars] and redeploy.
```

### B3. Verify 🟢

```bash
# Manual health probe — 200 + "fresh" when §A is healthy:
curl -s https://newsfeed-monitor.<your-subdomain>.workers.dev | head

# Force an alert end-to-end by temporarily lowering the threshold, then restore:
#   set STALE_HOURS = "0" in wrangler.toml → wrangler deploy → expect a webhook
#   message → set it back to "12" → wrangler deploy.
```

### B4. Switch the watched URL (optional) 🧠

Default `ARTICLES_URL` is the raw GitHub `main` file (works now). After §C, you
may point it at the Pages-hosted `articles.json` (see pages/README).

### B5. Rollback 🟢

```bash
wrangler delete            # from ops/cloudflare/monitor
```

---

## §C — Cloudflare Pages hosting + custom domain (§4.2)

Artifacts: [`ops/cloudflare/pages/`](ops/cloudflare/pages/). Optional; replaces
the `/Newsfeed-generator/` base path. **Leave GitHub Pages running until this is
verified.**

### C1. Decide the domain 🧠

Pick the custom domain (atom #5) — or skip and accept the `*.pages.dev` URL. The
chosen value becomes `SITE_URL`.

### C2. Build with the Cloudflare base + deploy 🟢🔑

```bash
# From the repo root:
SITE_BASE=/ SITE_URL=https://<your-domain> npm run build
wrangler pages deploy ./dist --project-name=newsfeed     # creates the project on first run
```

(`astro.config.mjs` already reads `SITE_BASE`/`SITE_URL`; defaults keep GitHub
Pages working, so this build does not affect the current deploy.)

### C3. Attach the custom domain 🔑🧠

In the Cloudflare dashboard → Pages → `newsfeed` → Custom domains → add
`<your-domain>` (DNS auto-config if the zone is on Cloudflare). **Creating DNS /
the domain is a human credentialed step — do not script it blindly.**

### C4. Cut over 🧠

1. Verify `https://<your-domain>` renders (hero present, "Sist oppdatert" recent).
2. Point the monitor at the new URL (B4) if desired.
3. Optionally append `wrangler pages deploy ./dist` to
   `ops/launchd/run-pipeline.sh` so every refresh redeploys.
4. Only then retire GitHub Pages (or keep it as a fallback).

### C5. Rollback 🟢

GitHub Pages is untouched and still live at
`https://trymhaak.github.io/Newsfeed-generator/`. To undo Pages: remove the
custom domain and `wrangler pages project delete newsfeed`.

---

## Post-cutover sanity

- [ ] §A: `data/articles.json` `generated_at` advances every ~6 h; newest
      `published` is recent.
- [ ] §A: front page shows a real (non-seed) hero + "Sist oppdatert" within hours.
- [ ] §B: monitor returns `200`/"fresh"; a forced-stale test reaches the webhook.
- [ ] §C (if done): custom domain renders with `base: '/'` (no `/Newsfeed-generator/`).
- [ ] Decide whether to retire the now-redundant scheduled GitHub Actions deploy
      (this branch already removed the dead enrichment job from `build.yml`).
