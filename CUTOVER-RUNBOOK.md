# Trym Cloud migration and cutover runbook

This runbook moves the user-facing Newsfeed Generator into `https://trym.cloud/security/briefing/` while keeping this repository as the automated producer.

## 1. Preflight

- Confirm the producer branch is based on current `origin/main`.
- Preserve any dirty live-checkout changes on a backup branch and patch file.
- Confirm the Trym Cloud integration PR is green and the destination route exists.
- Run the synthetic model probe:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run probe:hermes
```

- Compare the legacy migration manifest before and after. IDs, sources, URLs, dates, scores and tags must match exactly.

## 2. Producer release

1. Merge the producer PR.
2. Align the live checkout to the merge commit without discarding preserved local work.
3. Run `npm run pipeline:migrate` once. A second run must report no changes.
4. Run `npm test`, `npm run typecheck` and `npm run build` in the live checkout.
5. Run the installed launchd wrapper manually once:

```bash
bash ops/launchd/run-pipeline.sh
```

6. Verify launchd with:

```bash
launchctl print gui/$(id -u)/com.hakanssonlabs.newsfeed.pipeline
```

A host restart is not part of this cutover.

## 3. Exact public checks

Verify without following redirects first:

```bash
curl -sSI https://newsfeed.trym.cloud/
curl -sSI https://newsfeed.trym.cloud/tema/security
curl -sSI https://newsfeed.trym.cloud/artikkel/example
curl -sS https://newsfeed.trym.cloud/feed.json
curl -sSI https://trym.cloud/security/briefing/
```

Expected:

- old human routes return a permanent redirect to the Trym Cloud Security Briefing;
- `/feed.json` returns `200`, JSON content type, CORS `*` and a five-minute cache policy;
- the feed contains only English public fields and valid source URLs;
- the Trym Cloud route returns `200` and renders the current feed;
- browser console and page errors are empty at desktop, 390px and 320px widths.

## 4. Rollback

- Revert the producer merge commit to restore the prior pipeline and old surface.
- Revert the Trym Cloud merge commit to remove the integrated page.
- Redeploy both known-good commits through their documented Cloudflare Pages paths.
- Do not rewrite or delete the canonical article history during rollback.

## 5. Completion receipt

Record:

- producer and Trym Cloud merge SHAs;
- exact test, typecheck, build and model-probe results;
- 500-row preservation hash before and after migration;
- public feed article count and `generated_at`;
- redirect and exact destination URL results;
- desktop, 390px and 320px browser evidence;
- GBrain timeline writeback after live verification.
