# launchd runtime

This directory contains the installed-runtime templates for the Mac mini producer job.

`com.hakanssonlabs.newsfeed.pipeline` runs every six hours. The wrapper:

1. fast-forwards the live checkout from `origin/main`;
2. retries any previously committed but unpushed producer data;
3. runs fetch, Hermes/OpenAI-Codex enrichment and an atomic merge;
4. writes a success heartbeat;
5. commits and pushes changed producer data;
6. rebuilds and deploys the old domain as the machine-feed and redirect host.

The canonical human surface is `https://trym.cloud/security/briefing/`. The producer endpoint is `https://newsfeed.trym.cloud/feed.json`.

## Files

| File | Purpose |
|---|---|
| `com.hakanssonlabs.newsfeed.pipeline.plist` | User LaunchAgent template. `RunAtLoad=true` and `StartInterval=21600`. |
| `run-pipeline.sh` | Fail-closed job body, Git push recovery and Cloudflare deploy. |
| `logs/` | launchd stdout and stderr files. Gitignored. |

## Required paths

The installed plist substitutes:

| Placeholder | Value |
|---|---|
| `__REPO_DIR__` | Absolute path to the live checkout. |
| `__NODE_BIN_DIR__` | Directory containing Node, npm and npx. |
| `__HOME__` | User home directory. |

The wrapper uses `HERMES_BIN` when set. Otherwise `scripts/enrich.ts` uses `/Users/openclaw/.hermes/hermes-agent/venv/bin/hermes`. The child is pinned to the `openai-codex` provider and `gpt-5.6-sol` model in Hermes safe mode.

## Install or refresh

Follow [CUTOVER-RUNBOOK.md](../../CUTOVER-RUNBOOK.md). The safe order is:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run probe:hermes
bash ops/launchd/run-pipeline.sh
launchctl print gui/$(id -u)/com.hakanssonlabs.newsfeed.pipeline
```

Do not reload or restart the LaunchAgent solely for source-code changes. It reads the current checkout on every run. Reload only when the installed plist changes.
