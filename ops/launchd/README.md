# launchd — on-Mac enrichment (P0.2)

This directory holds the **artifacts** for running the enrichment pipeline on the
Mac mini via a user LaunchAgent, as chosen in `PRODUCTION-READINESS.md` §4.1.
Running the pipeline where `claude` is already logged in keeps the Claude Max
OAuth token **out of the cloud** (it is read from the login Keychain).

> These files are committed as templates. **Nothing here is installed by the
> repo** — a human performs the install on the Mac. The exact, ordered steps
> (including the `claude -p` smoke test) live in
> [`../../CUTOVER-RUNBOOK.md`](../../CUTOVER-RUNBOOK.md) §A.

## Files

| File | Purpose |
|------|---------|
| `com.hakanssonlabs.newsfeed.pipeline.plist` | User LaunchAgent template. `SessionCreate=true` (Keychain access), `RunAtLoad=true` + `StartInterval=21600` (every 6 h). Contains `__PLACEHOLDERS__`. |
| `run-pipeline.sh` | The job body: `npm run pipeline`, then commit + push `data/articles.json` only on success and only if it changed. Resolves the repo root from its own location — no hard-coded path. |
| `logs/` | Where launchd writes `pipeline.out.log` / `pipeline.err.log` (gitignored). |

## Placeholders to substitute

`run-pipeline.sh` needs **no** substitution (it self-locates). Only the plist
template does:

| Placeholder | Meaning | How to find it |
|-------------|---------|----------------|
| `__REPO_DIR__` | Absolute path to the repo checkout on the Mac | `pwd` in the repo |
| `__NODE_BIN_DIR__` | Dir holding `node`/`npm`/`npx` (and ideally `claude`) | `dirname "$(which node)"` |
| `__HOME__` | The user's home dir | `echo "$HOME"` |

## Install (summary — see CUTOVER-RUNBOOK §A for the authoritative steps)

```bash
# From the repo root on the Mac:
REPO_DIR="$(pwd)"
DEST=~/Library/LaunchAgents/com.hakanssonlabs.newsfeed.pipeline.plist
sed -e "s#__REPO_DIR__#${REPO_DIR}#g" \
    -e "s#__NODE_BIN_DIR__#$(dirname "$(which node)")#g" \
    -e "s#__HOME__#${HOME}#g" \
    ops/launchd/com.hakanssonlabs.newsfeed.pipeline.plist > "$DEST"

# Smoke-test the runner by hand FIRST (proves Keychain auth works headless):
bash ops/launchd/run-pipeline.sh

# Then load it (do NOT run this until the smoke test passes):
launchctl bootstrap gui/$(id -u) "$DEST"
launchctl kickstart -k gui/$(id -u)/com.hakanssonlabs.newsfeed.pipeline   # run now
launchctl print gui/$(id -u)/com.hakanssonlabs.newsfeed.pipeline          # inspect
```

To remove: `launchctl bootout gui/$(id -u) "$DEST" && rm "$DEST"`.
