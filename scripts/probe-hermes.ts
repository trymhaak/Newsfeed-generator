import { enrichBatch } from './enrich.ts';
import type { RawArticle } from '../src/lib/types.ts';

const fixture: RawArticle = {
  id: 'hermes-probe-article',
  source_id: 'probe',
  source_name: 'Hermes probe',
  title: 'Microsoft Entra adds a security control for workload identities',
  url: 'https://example.invalid/hermes-probe',
  content: 'A synthetic, non-production article used only to validate the enrichment contract.',
  published: '2026-01-01T00:00:00.000Z',
  default_topic: 'identity',
  source_weight: 1,
};

try {
  const [result] = await enrichBatch([fixture], { maxRetries: 0 });
  if (!result) throw new Error('probe returned no result');
  console.log(JSON.stringify({
    ok: true,
    provider: 'openai-codex',
    model: 'gpt-5.6-sol',
    id: result.id,
    topic: result.topic,
    score: result.score,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Hermes probe failed');
  process.exit(1);
}
