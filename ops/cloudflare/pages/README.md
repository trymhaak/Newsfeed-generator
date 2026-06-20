# Cloudflare Pages — hosting (planned, §4.2)

Config + commands to host the Astro site on Cloudflare Pages with `base: '/'`
(dropping the clumsy `/Newsfeed-generator/` GitHub Pages base path) and a custom
domain.

> **Not deployed by this repo.** The current GitHub Pages / `gh-pages` setup is
> left untouched. Authoritative cutover steps: [`../../../CUTOVER-RUNBOOK.md`](../../../CUTOVER-RUNBOOK.md) §C.

## The base-path switch (already wired)

`astro.config.mjs` reads two env vars, defaulting to the current GitHub Pages
values so **nothing changes until you opt in**:

| Env | Default (GitHub Pages) | Cloudflare Pages |
|-----|------------------------|------------------|
| `SITE_BASE` | `/Newsfeed-generator` | `/` |
| `SITE_URL` | `https://trymhaak.github.io` | `https://<your-domain>` |

So the Cloudflare build is just:

```bash
SITE_BASE=/ SITE_URL=https://<your-domain> npm run build
```

## Deploy options

**A. Direct upload (recommended — reuses the launchd build, no CF build minutes):**

```bash
SITE_BASE=/ SITE_URL=https://<your-domain> npm run build
wrangler pages deploy ./dist --project-name=newsfeed
```

This can be appended to `ops/launchd/run-pipeline.sh` later instead of (or in
addition to) the git push, so every refresh redeploys.

**B. Git integration:** copy `wrangler.toml` here to the repo root, connect the
repo in the Cloudflare dashboard, and set build command
`SITE_BASE=/ SITE_URL=https://<your-domain> npm run build`, output dir `dist`.

## Optional: serve `articles.json` from the site

The monitor defaults to reading `articles.json` from raw GitHub, which already
works. If you'd rather have it read the Pages-hosted copy, publish the JSON with
the site (e.g. copy `data/articles.json` into `public/` before build) and point
the monitor's `ARTICLES_URL` at `https://<your-domain>/articles.json`.

## Watch-outs

- Pages has a **20 000-file limit** — if `public/images/{id}.jpg` ever
  accumulates unbounded, prune old images or move them to R2 (§4.2).
- Keep `force_orphan` GitHub Pages deploy as-is until the Pages domain is live
  and verified, then cut DNS over (§C).
