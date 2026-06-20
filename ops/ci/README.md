# ops/ci — staged CI change (DoD #8)

[`build.yml`](build.yml) here is the **repurposed** GitHub Actions workflow that
should replace `.github/workflows/build.yml`.

## Why it's staged here instead of applied directly

The repo's `.claude/settings.json` gates edits to `.github/workflows/**` behind an
`ask` permission rule (the same class as `git push`, which the conductor performs
on handoff). The build agent could not write into `.github/workflows/` without
that interactive grant, so the file is committed here as a ready-to-apply
artifact. Applying it is a one-line human step:

```bash
cp ops/ci/build.yml .github/workflows/build.yml
git add .github/workflows/build.yml && git commit -m "ci: build/deploy-only workflow"
```

(Or grant the workflow-write permission and re-run the edit directly.)

## What changes vs the current `.github/workflows/build.yml`

- **Removes the dead `pipeline` job.** It was gated behind a "Detect AI auth"
  step with no repo secrets, so `Install Claude CLI` / `Run pipeline` were
  `[skipped]` every run — CI only *looked* like it enriched (audit B1 / Ledd 5).
- **Removes the 6-hourly `schedule`.** A cron that rebuilt + redeployed identical
  static data was always green and masked 5 weeks of staleness (audit B3).
- **Keeps build + deploy to `gh-pages`** (with the existing commit-message
  sanitization) on `push: [main]` + `workflow_dispatch`.

In the new architecture the Mac/launchd job pushes refreshed
`data/articles.json` to `main`, which triggers this push-driven deploy;
staleness is caught out-of-band by the Cloudflare monitor rather than hidden by
an always-green cron.

`.github/workflows/ci.yml` (typecheck + build on push/PR) is unchanged and
remains the real quality gate.
