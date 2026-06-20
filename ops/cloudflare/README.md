# ops/cloudflare

Cloudflare-side artifacts for the production architecture
(`PRODUCTION-READINESS.md` §4). **Nothing here is deployed by the repo** — these
are committed as code/config; a human deploys them per
[`../../CUTOVER-RUNBOOK.md`](../../CUTOVER-RUNBOOK.md).

| Dir | What | Status |
|-----|------|--------|
| [`monitor/`](monitor/) | `scheduled()` Worker (cron, every 3 h) that reads the published `articles.json`, checks `generated_at`, and webhooks on staleness > 12 h. Out-of-band watchdog for the Mac/launchd job (P0.3 / §4.3). | Code only — deploy in CUTOVER-RUNBOOK §B |
| [`pages/`](pages/) | Cloudflare Pages hosting config (Astro `base: '/'`, custom domain, deploy commands). Replaces the `/Newsfeed-generator/` base path (§4.2). | Config only — deploy in CUTOVER-RUNBOOK §C |

Both are independent of the on-Mac enrichment in [`../launchd/`](../launchd/).
