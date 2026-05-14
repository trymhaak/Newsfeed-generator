import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type {
  EnrichedArticle,
  RawArticle,
  Topic,
} from '../src/lib/types.ts';
import { TOPICS } from '../src/lib/types.ts';

const RAW_IN = 'data/_raw.json';
const PENDING_OUT = 'data/_pending.json';
const BATCH_SIZE = 8;

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
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('no JSON array found in Claude output');
  }
  return s.slice(start, end + 1);
}

async function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['--print', '--permission-mode', 'bypassPermissions'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function validateEnrichment(e: unknown, knownIds: Set<string>): ClaudeEnrichment | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  if (typeof o.id !== 'string' || !knownIds.has(o.id)) return null;
  if (typeof o.headline_no !== 'string' || typeof o.summary_no !== 'string') return null;
  if (typeof o.topic !== 'string' || !TOPICS.includes(o.topic as Topic)) return null;
  if (typeof o.score !== 'number' || o.score < 0 || o.score > 100) return null;
  if (!Array.isArray(o.tags)) return null;
  return {
    id: o.id,
    headline_no: o.headline_no.slice(0, 200),
    summary_no: o.summary_no,
    topic: o.topic as Topic,
    score: Math.round(o.score),
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
      console.warn(`  batch failed: ${err}`);
    }
  }

  await writeFile(PENDING_OUT, JSON.stringify(enriched, null, 2) + '\n', 'utf8');
  console.log(`\nenriched ${enriched.length}/${raw.length} articles`);
  console.log(`wrote ${PENDING_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
