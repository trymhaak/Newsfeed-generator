# Newsfeed Generator repository context

## Mission

Maintain the automated source pipeline behind the Trym Cloud Security Briefing.

- Canonical human surface: `https://trym.cloud/security/briefing/`
- Producer endpoint: `https://newsfeed.trym.cloud/feed.json`
- Repository: `trymhaak/Newsfeed-generator`
- Runtime: Mac mini launchd every six hours
- Model route: Hermes one-shot with `openai-codex` and `gpt-5.6-sol`

The old standalone VG-style website is retired. Do not restore a separate visual identity or Norwegian public copy.

## Required invariants

1. Public fields and visible fallback copy are English.
2. Every item links to its original source.
3. The public feed contains only validated fields. Never expose raw RSS content, producer tags or legacy fields.
4. `data/articles.json` is written atomically and keeps at most 500 records.
5. A no-new-article run is idempotent for the article store.
6. Partial or malformed model output fails closed and does not write pending data.
7. The enrichment child is pinned to Hermes/OpenAI Codex. Do not add Claude, Anthropic or an implicit fallback.
8. Never print credentials. Diagnostics are bounded and redacted.
9. Human routes on the old domain redirect to the Trym Cloud Security Briefing. `/feed.json` remains reachable.

## Commands

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run probe:hermes
npm run pipeline
```

Run all four verification commands before committing. A real pipeline run may fetch external sources and write canonical data, so use the synthetic Hermes probe for bounded model verification unless a live refresh is explicitly in scope.

## Key files

- `config/feeds.yaml`: source registry
- `scripts/fetch-feeds.ts`: normalization and dedupe
- `scripts/enrich.ts`: pinned model boundary and strict output parser
- `scripts/pipeline.ts`: orchestration and atomic merge
- `scripts/migrate-english.ts`: legacy migration
- `src/lib/schema.ts`: runtime schema validation
- `src/pages/feed.json.ts`: public producer endpoint
- `ops/launchd/run-pipeline.sh`: production runner
- `ops/cloudflare/monitor/`: stale-feed monitor

## Git and safety

- Work on a feature branch and use a PR.
- Do not edit secrets, DNS or launchd state from a code worker.
- Preserve unrelated live-checkout changes before cutover.
- Verify GitHub, Cloudflare and exact public URLs after merge.
