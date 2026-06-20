# newsfeed-monitor — out-of-band staleness alarm (P0.3)

A Cloudflare Worker that runs on a cron (every 3 h), fetches the published
`articles.json`, reads the top-level `generated_at`, and POSTs to a Discord/Slack
webhook when the data is older than `STALE_HOURS` (default 12 h).

It runs on Cloudflare, **independent of the Mac mini**, so it alerts precisely
when the Mac / launchd job dies — the failure mode an on-Mac heartbeat misses
(`PRODUCTION-READINESS.md` §4.3).

> **Not deployed by this repo.** The authoritative, ordered deploy steps are in
> [`../../../CUTOVER-RUNBOOK.md`](../../../CUTOVER-RUNBOOK.md) §B.

## Config (`wrangler.toml`)

| Key | Kind | Default | Notes |
|-----|------|---------|-------|
| `ARTICLES_URL` | var | raw GitHub `main` URL | Where to read the published JSON. Hosting-independent; switch to the Pages URL later. |
| `STALE_HOURS` | var | `12` | Alarm threshold. |
| `WEBHOOK_KIND` | var | `discord` | `discord` → `{content}`, `slack` → `{text}`. |
| `WEBHOOK_URL` | **secret** | — | `wrangler secret put WEBHOOK_URL`. **Never commit.** |
| `crons` | trigger | `0 */3 * * *` | Every 3 h. |

## Local check

```bash
cd ops/cloudflare/monitor
npm install
npm run dev          # then GET the local URL to see the JSON health probe
npm run deploy       # ONLY as part of CUTOVER-RUNBOOK §B
```

A `GET` to the deployed worker returns the current health as JSON (`200` fresh /
`503` stale) — handy for a quick manual check or an uptime pinger.
