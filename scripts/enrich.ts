import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import type { EnrichedArticle, RawArticle, Topic } from '../src/lib/types.ts';
import { TOPICS } from '../src/lib/types.ts';

const RAW_IN = 'data/_raw.json';
const PENDING_OUT = 'data/_pending.json';
const BATCH_SIZE = Number(process.env.ENRICH_BATCH_SIZE) || 6;
const DEFAULT_TIMEOUT_MS = Number(process.env.HERMES_TIMEOUT_MS) || 240_000;
const DEFAULT_MAX_RETRIES = Number(process.env.ENRICH_MAX_RETRIES) || 2;
const DEFAULT_RETRY_BASE_MS = 2_000;
const MAX_CAPTURE_CHARS = 2_000_000;

export const DEFAULT_HERMES_BIN = '/Users/openclaw/.hermes/hermes-agent/venv/bin/hermes';
export const HERMES_BASE_ARGS = [
  '--provider',
  'openai-codex',
  '-m',
  'gpt-5.6-sol',
  '-t',
  'safe',
  '--safe-mode',
  '-z',
] as const;

export interface HermesCallOptions {
  bin?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface EnrichOptions extends HermesCallOptions {
  maxRetries?: number;
  retryBaseMs?: number;
  onRetry?: (message: string) => void;
}

export interface HermesEnrichment {
  id: string;
  headline: string;
  summary: string;
  topic: Topic;
  score: number;
  tags: string[];
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaOrRateLimit(text: string): boolean {
  return /quota|rate.?limit|\b429\b|overloaded|too many requests|usage limit|insufficient.*credit/i.test(text);
}

/** Bound and redact diagnostics before they reach logs. */
export function sanitizeDiagnostic(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value);
  return raw
    .replace(/\b(?:sk|sess|key|token)-[A-Za-z0-9._-]{8,}\b/gi, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(api[_-]?key|access[_-]?token|oauth[_-]?token|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

function hermesEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  // The retired providers are not part of this child process's trust boundary.
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

export function buildHermesCommand(prompt: string, bin = process.env.HERMES_BIN || DEFAULT_HERMES_BIN): {
  bin: string;
  args: string[];
} {
  return { bin, args: [...HERMES_BASE_ARGS, prompt] };
}

/** Execute exactly one pinned Hermes/OpenAI-Codex inference. */
export function callHermesOnce(prompt: string, options: HermesCallOptions = {}): Promise<string> {
  const command = buildHermesCommand(prompt, options.bin ?? process.env.HERMES_BIN ?? DEFAULT_HERMES_BIN);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(command.bin, command.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: hermesEnvironment(options.env ?? process.env),
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let overflowed = false;
    let settled = false;

    const finish = (error?: Error, output?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(output ?? '');
    };

    const capture = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8');
      if (next.length > MAX_CAPTURE_CHARS) {
        overflowed = true;
        child.kill('SIGKILL');
        return next.slice(0, MAX_CAPTURE_CHARS);
      }
      return next;
    };

    child.stdout.on('data', (chunk: Buffer) => { stdout = capture(stdout, chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = capture(stderr, chunk); });
    child.on('error', (error) => finish(new Error(`Hermes failed to start: ${sanitizeDiagnostic(error)}`)));
    child.on('close', (code, signal) => {
      if (timedOut) {
        finish(new Error(`Hermes timed out after ${timeoutMs}ms`));
        return;
      }
      if (overflowed) {
        finish(new Error('Hermes output exceeded the capture limit'));
        return;
      }
      if (code !== 0) {
        const detail = sanitizeDiagnostic(stderr || stdout || `signal ${signal ?? 'unknown'}`);
        const message = `Hermes exited ${code ?? 'without a code'}: ${detail}`;
        finish(isQuotaOrRateLimit(`${stdout}\n${stderr}`) ? new QuotaError(message) : new Error(message));
        return;
      }
      finish(undefined, stdout);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
  });
}

export function buildPrompt(batch: RawArticle[]): string {
  const items = batch.map((article) => ({
    id: article.id,
    title: article.title,
    source: article.source_name,
    default_topic: article.default_topic,
    content: article.content,
  }));

  return [
    'Enrich articles for the Trym Cloud Security Briefing about the Microsoft ecosystem',
    '(Intune, Entra, Defender, Purview, Copilot, Windows, and related security tooling).',
    '',
    'Return exactly one object for EVERY input article with these exact fields:',
    '- id: unchanged from the input.',
    '- headline: a concrete English headline in active voice, maximum 100 characters.',
    '- summary: 2-3 concise English sentences explaining what changed and why IT administrators should care.',
    '- topic: exactly one of identity | security | endpoint | ai.',
    '- score: an integer from 0 to 100.',
    '  80+: zero-days, breaking changes, major general availability, or outages.',
    '  60-79: rollouts, deprecations, or significant previews.',
    '  40-59: smaller features, useful analysis, or community tools.',
    '  Below 40: documentation, marketing, or conference recaps.',
    '  0: spam, duplicate, or out of scope.',
    '- tags: 2-5 short English technical keywords.',
    '',
    'Use English only. Return one valid JSON array and nothing else: no Markdown and no explanation.',
    '[{"id":"...","headline":"...","summary":"...","topic":"security","score":72,"tags":["..."]}]',
    '',
    'ARTICLES:',
    JSON.stringify(items, null, 2),
  ].join('\n');
}

export function extractJsonArray(output: string): string {
  const trimmed = output.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed;

  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let index = 0; index < output.length; index++) {
    const character = output[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (character === '\\') escape = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '[') {
      if (depth === 0) start = index;
      depth++;
    } else if (character === ']') {
      depth--;
      if (depth === 0 && start !== -1) return output.slice(start, index + 1);
    }
  }
  throw new Error('Hermes output contained no balanced JSON array');
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parseEnrichmentResponse(output: string, batch: RawArticle[]): HermesEnrichment[] {
  const parsed = JSON.parse(extractJsonArray(output)) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Hermes response must be an array');
  if (parsed.length !== batch.length) {
    throw new Error(`Hermes returned ${parsed.length}/${batch.length} articles`);
  }

  const knownIds = new Set(batch.map((article) => article.id));
  const seenIds = new Set<string>();
  const results: HermesEnrichment[] = [];
  const fields = ['id', 'headline', 'summary', 'topic', 'score', 'tags'] as const;

  for (const [index, value] of parsed.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Hermes article ${index} must be an object`);
    }
    const item = value as Record<string, unknown>;
    if (!exactKeys(item, fields)) throw new Error(`Hermes article ${index} has invalid fields`);
    if (typeof item.id !== 'string' || !knownIds.has(item.id) || seenIds.has(item.id)) {
      throw new Error(`Hermes article ${index} has an unknown or duplicate id`);
    }
    if (typeof item.headline !== 'string' || item.headline.trim().length === 0 || item.headline.length > 100) {
      throw new Error(`Hermes article ${index} has an invalid headline`);
    }
    if (typeof item.summary !== 'string' || item.summary.trim().length === 0) {
      throw new Error(`Hermes article ${index} has an invalid summary`);
    }
    if (typeof item.topic !== 'string' || !TOPICS.includes(item.topic as Topic)) {
      throw new Error(`Hermes article ${index} has an invalid topic`);
    }
    if (!Number.isInteger(item.score) || (item.score as number) < 0 || (item.score as number) > 100) {
      throw new Error(`Hermes article ${index} has an invalid score`);
    }
    if (!Array.isArray(item.tags) || item.tags.length < 2 || item.tags.length > 5 ||
        item.tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0)) {
      throw new Error(`Hermes article ${index} has invalid tags`);
    }

    seenIds.add(item.id);
    results.push({
      id: item.id,
      headline: item.headline.trim(),
      summary: item.summary.trim(),
      topic: item.topic as Topic,
      score: item.score as number,
      tags: (item.tags as string[]).map((tag) => tag.trim()),
    });
  }
  if (seenIds.size !== knownIds.size) throw new Error('Hermes response omitted an input article');
  return results;
}

export async function enrichBatch(batch: RawArticle[], options: EnrichOptions = {}): Promise<HermesEnrichment[]> {
  const prompt = buildPrompt(batch);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const output = await callHermesOnce(prompt, options);
      return parseEnrichmentResponse(output, batch);
    } catch (error) {
      if (error instanceof QuotaError) throw error;
      lastError = error;
      if (attempt < maxRetries) {
        const delay = retryBaseMs * 2 ** attempt;
        options.onRetry?.(
          `Hermes attempt ${attempt + 1}/${maxRetries + 1} failed (${sanitizeDiagnostic(error)}); retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

function applyWeight(score: number, weight: number): number {
  return Math.max(0, Math.min(100, Math.round(score * weight)));
}

async function main(): Promise<void> {
  if (!existsSync(RAW_IN)) {
    console.log(`no ${RAW_IN} — nothing to enrich`);
    await writeFile(PENDING_OUT, '[]\n', 'utf8');
    return;
  }

  const raw = JSON.parse(await readFile(RAW_IN, 'utf8')) as RawArticle[];
  if (raw.length === 0) {
    console.log('no new articles to enrich');
    await writeFile(PENDING_OUT, '[]\n', 'utf8');
    return;
  }

  // A stale pending file must never survive a failed attempt and be merged later.
  await rm(PENDING_OUT, { force: true });
  console.log(`enriching ${raw.length} articles in batches of ${BATCH_SIZE}...`);
  const enriched: EnrichedArticle[] = [];
  const rawById = new Map(raw.map((article) => [article.id, article]));

  try {
    for (let index = 0; index < raw.length; index += BATCH_SIZE) {
      const batch = raw.slice(index, index + BATCH_SIZE);
      console.log(`  batch ${index / BATCH_SIZE + 1}: ${batch.length} articles`);
      const results = await enrichBatch(batch, {
        onRetry: (message) => console.warn(`  ${message}`),
      });
      const ingested = new Date().toISOString();
      for (const result of results) {
        const source = rawById.get(result.id);
        if (!source) throw new Error('internal enrichment id mismatch');
        enriched.push({
          id: result.id,
          source_id: source.source_id,
          source_name: source.source_name,
          url: source.url,
          published: source.published,
          ingested,
          ...(source.hero_image ? { hero_image: source.hero_image } : {}),
          title_original: source.title,
          headline: result.headline,
          summary: result.summary,
          topic: result.topic,
          score: applyWeight(result.score, source.source_weight),
          tags: result.tags,
        });
      }
    }
  } catch (error) {
    const message = sanitizeDiagnostic(error);
    console.error(`enrichment aborted without writing pending data: ${message}`);
    process.exitCode = error instanceof QuotaError ? 2 : 1;
    return;
  }

  if (enriched.length !== raw.length) {
    console.error(`enrichment produced ${enriched.length}/${raw.length} articles — refusing a partial write`);
    process.exitCode = 1;
    return;
  }

  await writeFile(PENDING_OUT, JSON.stringify(enriched, null, 2) + '\n', 'utf8');
  console.log(`\nenriched ${enriched.length}/${raw.length} articles`);
  console.log(`wrote ${PENDING_OUT}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(sanitizeDiagnostic(error));
    process.exit(1);
  });
}
