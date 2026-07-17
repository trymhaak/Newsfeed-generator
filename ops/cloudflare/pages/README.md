# Cloudflare Pages producer host

The Cloudflare Pages project named `newsfeed` serves `https://newsfeed.trym.cloud`.

After the Trym Cloud migration, this host has two responsibilities:

- publish the English machine feed at `/feed.json` with CORS and five-minute cache headers;
- permanently redirect the old human routes to `https://trym.cloud/security/briefing/`.

The launchd wrapper builds and deploys the site only when canonical article data changes:

```bash
SITE_BASE=/ SITE_URL=https://newsfeed.trym.cloud npm run build
npx --yes wrangler@3 pages deploy dist --project-name=newsfeed --branch=main --commit-dirty=true
```

`public/_redirects` owns the route migration. `public/_headers` owns the feed response contract. Keep `/feed.json` out of the redirect rules.

## Verification

```bash
curl -sSI https://newsfeed.trym.cloud/
curl -sSI https://newsfeed.trym.cloud/tema/security
curl -sSI https://newsfeed.trym.cloud/feed.json
```

Expected:

- human routes: permanent redirect to the Trym Cloud Security Briefing;
- machine feed: `200`, JSON content type, `Access-Control-Allow-Origin: *`, five-minute cache policy;
- no legacy Norwegian public fields.

See [CUTOVER-RUNBOOK.md](../../../CUTOVER-RUNBOOK.md) for the full release and rollback sequence.
