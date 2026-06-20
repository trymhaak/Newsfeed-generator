import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import type {
  EnrichedArticle,
  RawArticle,
  Topic,
} from '../src/lib/types.ts';
import { TOPICS } from '../src/lib/types.ts';

const RAW_IN = 'data/_raw.json';
const PENDING_OUT = 'data/_pending.json';
const BATCH_SIZE = Number(process.env.ENRICH_BATCH_SIZE) || 6;
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS) || 240_000; // env-tunable per-call cap (slow inference under load)
const MAX_RETRIES = Number(process.env.ENRICH_MAX_RETRIES) || 2; // env-tunable; N+1 attempts for transient failures
const RETRY_BASE_MS = 2_000;

interface ClaudeEnrichment {
  id: string;
  headline_no: string;
  summary_no: string;
  topic: Topic;
  score: number;
  tags: string[];
}

function buildPrompt(batch: RawArticle[]): string {
  const items = batch.map((a) => ({
    id: a.id,
    title: a.title,
    source: a.source_name,
    default_topic: a.default_topic,
    content: a.content,
  }));

  return [
    'Du beriker artikler for en norsk VG-style nyhetsside om Microsofts økosystem',
    '(Intune, Entra, Defender, Purview, Copilot, Windows mfl.).',
    '',
    'For HVER artikkel i listen under, returner ett objekt med:',
    '- id: samme som input',
    '- headline_no: fengende norsk overskrift, max 80 tegn, aktiv stemme, konkret.',
    '  Ikke begynn med "Microsoft kunngjør..." — led med selve nyheten.',
    '- summary_no: 2-3 norske setninger om hva som skjedde og hvorfor IT-admins',
    '  bør bry seg. Ingen fyll, ingen "i denne artikkelen vil du lære...".',
    '- topic: nøyaktig én av: identitet | sikkerhet | endpoint | ai',
    '- score: 0-100 heltall.',
    '    80+ for: zero-days, breaking changes, GA av store features, utfall',
    '    60-79 for: rollouts, deprecations, betydelige previews',
    '    40-59 for: mindre features, blogposter, community-verktøy',
    '    <40  for: docs-oppdateringer, marketing, konferansereferater',
    '    0    hvis spam/duplikat/utenfor scope',
    '- tags: 2-5 små nøkkelord (f.eks. "intune", "byod", "cve-2026-xxxx")',
    '',
    'Svar med EN gyldig JSON-array. Ingen markdown, ingen forklaring,',
    'kun JSON. Eksempel-skall:',
    '[{"id":"...","headline_no":"...","summary_no":"...","topic":"sikkerhet","score":72,"tags":["..."]}]',
    '',
    'ARTIKLER:',
    JSON.stringify(items, null, 2),
  ].join('\n');
}

function extractJsonArray(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;

  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0 && start !== -1) return s.slice(start, i + 1);
    }
  }
  throw new Error('no balanced JSON array found in Claude output');
}

/**
 * Thrown when claude reports a quota / rate-limit condition. It bubbles all the
 * way up so the run aborts WITHOUT writing _pending — the pipeline then never
 * reaches its unlink step and data/_raw.json survives for the next run, so the
 * unenriched articles are not lost (PRODUCTION-READINESS Ledd 1, P1).
 */
class QuotaError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isQuotaOrRateLimit(text: string): boolean {
  return /quota|rate.?limit|\b429\b|overloaded|too many requests|usage limit|insufficient.*credit/i.test(
    text,
  );
}

function callClaudeOnce(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      [
        '--print',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
        '--permission-mode',
        'bypassPermissions',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`claude timed out after ${CLAUDE_TIMEOUT_MS}ms`));
      } else if (code !== 0) {
        const detail = `claude exited ${code}: ${stderr}`;
        reject(
          isQuotaOrRateLimit(stderr) || isQuotaOrRateLimit(stdout)
            ? new QuotaError(detail)
            : new Error(detail),
        );
      } else {
        resolve(stdout);
      }
    });
    // The child can die before stdin is fully written (SIGKILL on timeout, or a
    // fast crash), which makes Node emit 'error' (EPIPE) on the stdin stream. An
    // unhandled stream error would throw past the retry/quota guards and crash
    // the process — swallow it; the 'close' handler still reports the real status.
    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Call claude with a per-call timeout and bounded exponential-backoff retry.
 * Quota/rate-limit errors are NOT retried — they abort the run immediately so
 * _raw.json is preserved.
 */
async function callClaude(prompt: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callClaudeOnce(prompt);
    } catch (err) {
      if (err instanceof QuotaError) throw err;
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const wait = RETRY_BASE_MS * 2 ** attempt;
        console.warn(
          `  claude attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${err}); retrying in ${wait}ms`,
        );
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

function validateEnrichment(e: unknown, knownIds: Set<string>): ClaudeEnrichment | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  if (typeof o.id !== 'string' || !knownIds.has(o.id)) return null;
  if (typeof o.headline_no !== 'string' || typeof o.summary_no !== 'string') return null;
  if (typeof o.topic !== 'string' || !TOPICS.includes(o.topic as Topic)) return null;
  const score = Number(o.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  if (!Array.isArray(o.tags)) return null;
  return {
    id: o.id,
    headline_no: o.headline_no.trim().slice(0, 100),
    summary_no: o.summary_no.trim(),
    topic: o.topic as Topic,
    score: Math.round(score),
    tags: o.tags.filter((t): t is string => typeof t === 'string').slice(0, 5),
  };
}

async function enrichBatch(batch: RawArticle[]): Promise<ClaudeEnrichment[]> {
  const prompt = buildPrompt(batch);
  const output = await callClaude(prompt);
  const json = extractJsonArray(output);
  const parsed = JSON.parse(json) as unknown[];
  const knownIds = new Set(batch.map((a) => a.id));
  return parsed
    .map((e) => validateEnrichment(e, knownIds))
    .filter((e): e is ClaudeEnrichment => e !== null);
}

function applyWeight(score: number, weight: number): number {
  return Math.round(score * weight);
}

async function main() {
  if (!existsSync(RAW_IN)) {
    console.log(`no ${RAW_IN} — nothing to enrich`);
    await writeFile(PENDING_OUT, '[]\n', 'utf8');
    return;
  }

  const raw: RawArticle[] = JSON.parse(await readFile(RAW_IN, 'utf8'));
  if (raw.length === 0) {
    console.log('no new articles to enrich');
    await writeFile(PENDING_OUT, '[]\n', 'utf8');
    return;
  }

  // We have articles to enrich. Missing auth is a hard failure: in the Mac
  // mini / launchd architecture the Claude Max session is always present, so
  // no-auth means misconfiguration, not "a quiet news day". Exit non-zero
  // WITHOUT writing _pending so the pipeline keeps _raw for the next run.
  // Auth check. CI uses an env token; the Mac mini / launchd path authenticates
  // `claude` via the login Keychain (Claude Max) with NO env token, so an env
  // var is NOT required — we probe the actual CLI instead. Only "no env token
  // AND `claude` not logged in" is a hard, fail-fast error.
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    const probe = spawnSync(
      'claude',
      ['-p', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', 'Reply with the single word OK'],
      {
      encoding: 'utf8',
      timeout: 30_000,
      input: '',
    });
    if (probe.status !== 0 || !/\S/.test(probe.stdout ?? '')) {
      console.error(
        `cannot enrich ${raw.length} articles: no env token and \`claude\` is not authenticated`,
      );
      process.exitCode = 1;
      return;
    }
  }

  console.log(`enriching ${raw.length} articles in batches of ${BATCH_SIZE}...`);
  const enriched: EnrichedArticle[] = [];
  const rawById = new Map(raw.map((a) => [a.id, a]));

  for (let i = 0; i < raw.length; i += BATCH_SIZE) {
    const batch = raw.slice(i, i + BATCH_SIZE);
    console.log(`  batch ${i / BATCH_SIZE + 1}: ${batch.length} articles`);
    try {
      const results = await enrichBatch(batch);
      for (const r of results) {
        const src = rawById.get(r.id);
        if (!src) continue;
        enriched.push({
          id: r.id,
          source_id: src.source_id,
          source_name: src.source_name,
          url: src.url,
          published: src.published,
          ingested: new Date().toISOString(),
          hero_image: src.hero_image,
          title_original: src.title,
          headline_no: r.headline_no,
          summary_no: r.summary_no,
          topic: r.topic,
          score: applyWeight(r.score, src.source_weight),
          tags: r.tags,
        });
      }
    } catch (err) {
      if (err instanceof QuotaError) {
        // Abort the whole run on quota/rate-limit. Returning WITHOUT writing
        // _pending means the pipeline never reaches merge/unlink, so _raw.json
        // survives and the unenriched articles are retried next run.
        console.error(
          `  quota/rate-limit hit — aborting without losing _raw: ${err.message}`,
        );
        process.exitCode = 2;
        return;
      }
      console.warn(`  batch failed: ${err}`);
    }
  }

  // Fail loudly: raw articles in, zero enriched out means enrichment is broken
  // (auth, model, parsing) — not a quiet news day. Exit non-zero and DON'T
  // write _pending, so the pipeline aborts before deleting _raw.
  if (enriched.length === 0) {
    console.error(
      `enrichment produced 0/${raw.length} articles — failing loudly`,
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(PENDING_OUT, JSON.stringify(enriched, null, 2) + '\n', 'utf8');
  console.log(`\nenriched ${enriched.length}/${raw.length} articles`);
  console.log(`wrote ${PENDING_OUT}`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
