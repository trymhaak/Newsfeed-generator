# Newsfeed Generator

Newsfeed Generator is the data producer for the [Microsoft Security Newsfeed on Trym Cloud](https://trym.cloud/security/newsfeed/).

Every six hours, the Mac mini pipeline:

1. fetches configured RSS and Atom sources, including source-provided article images;
2. deduplicates articles by stable ID;
3. uses Hermes with OpenAI Codex (`gpt-5.6-sol`) to write an English headline, summary, topic and relevance score;
4. validates and atomically merges the result into `data/articles.json`;
5. publishes the English machine feed, including optional summaries and images, at `https://newsfeed.trym.cloud/feed.json`.

The former standalone news website has been retired. Human routes on `newsfeed.trym.cloud` redirect to the native Trym Cloud page. The old domain remains only as the producer endpoint and a migration fallback.

## Public contract

`/feed.json` contains:

- `generated_at` in UTC;
- up to 500 source-linked articles;
- English `headline` and optional automated `summary`;
- optional source-provided article `image` using an absolute HTTP(S) URL;
- `identity`, `security`, `endpoint` or `ai` topic;
- relevance score and source identity.

Producer-only fields, legacy Norwegian copy and internal tags are not exposed by the public feed.

## Local commands

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run pipeline:fetch
npm run pipeline:enrich
npm run pipeline
npm run probe:hermes
```

`npm run pipeline:migrate` is an idempotent one-time migration for the legacy Norwegian schema. It preserves article IDs, source URLs, dates, scores and tags. It uses each known English source title as the legacy headline and omits the unverified translated summary.

## Runtime

The production runner is `ops/launchd/run-pipeline.sh`, installed as `com.hakanssonlabs.newsfeed.pipeline`. It pins the enrichment child to:

```text
provider: openai-codex
model: gpt-5.6-sol
mode: Hermes one-shot, safe mode
```

`HERMES_BIN` may override the executable path for tests or a future installation move. No Anthropic or Claude authentication is required or accepted by the enrichment child.

## Repository map

```text
config/feeds.yaml             Source registry and default topic
scripts/fetch-feeds.ts        RSS/Atom fetch, normalization and dedupe
scripts/enrich.ts             Hermes/OpenAI-Codex English enrichment
scripts/pipeline.ts           Fetch -> enrich -> validated atomic merge
scripts/migrate-english.ts    Fail-closed legacy schema migration
data/articles.json            Canonical producer store
src/pages/feed.json.ts        Public English machine feed
src/pages/index.astro         English migration fallback
public/_redirects             Old human route retirement
ops/launchd/                  Scheduled Mac mini runner
ops/cloudflare/               Feed deployment and staleness monitor
schema/                       Canonical JSON schemas
```

See [AGENTS.md](./AGENTS.md) for the binding engineering contract and [CUTOVER-RUNBOOK.md](./CUTOVER-RUNBOOK.md) for deployment steps.
