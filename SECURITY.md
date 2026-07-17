# Security policy

## Reporting a vulnerability

Do not report a suspected vulnerability in a public issue.

Use one of these private channels:

- [GitHub private vulnerability reporting](https://github.com/trymhaak/Newsfeed-generator/security/advisories), preferred.
- The public contact address on [Trym Håkansson's GitHub profile](https://github.com/trymhaak) if GitHub private reporting is unavailable.

Include the affected component, reproduction steps, potential impact and a proposed fix when possible. You can expect an acknowledgement within seven days and a status update within 30 days.

## In scope

- RSS/Atom input handling and prompt-injection boundaries.
- Command execution in `scripts/` and `ops/launchd/`.
- Strict model-output and canonical-store validation.
- Public feed data exposure, CORS and cache behavior.
- Redirect integrity for the retired standalone surface.
- Credential handling and diagnostic redaction.
- GitHub Actions and Cloudflare deployment configuration.

## Out of scope

- Vulnerabilities in third-party RSS sources. Contact the source owner.
- Vulnerabilities in Cloudflare or GitHub infrastructure. Contact the platform.
- Vulnerabilities in Microsoft products referenced by the feed. Contact MSRC.

## Inference boundary

The enrichment process invokes Hermes in one-shot safe mode, pinned to the `openai-codex` provider and `gpt-5.6-sol` model. The child process strips retired-provider credential variables before launch. Authentication remains in the host Hermes credential store and must never be committed or printed.

The pipeline must fail closed when inference returns malformed, partial, duplicated or out-of-scope IDs. Failed enrichment must not replace the canonical store or merge stale pending output.
