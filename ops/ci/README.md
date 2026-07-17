# CI architecture

The Mac mini launchd job owns feed collection and enrichment. GitHub Actions never runs model enrichment.

`.github/workflows/ci.yml` is the pull-request quality gate:

- install with `npm ci`;
- run schema, migration, provider-boundary and retirement tests;
- run Astro and TypeScript checks;
- build the machine-feed and redirect artifact.

`.github/workflows/build.yml` publishes the committed artifact on `main`. The scheduled producer pushes refreshed `data/articles.json`, which triggers a normal build. The out-of-band Cloudflare monitor detects staleness independently of GitHub Actions.

`ops/ci/build.yml` is retained only as the prior staged copy of the build workflow. The active workflow under `.github/workflows/` is authoritative.
