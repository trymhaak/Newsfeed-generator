import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateLegacyStore } from '../scripts/migrate-english.ts';
import { validateArticleStore } from '../src/lib/schema.ts';

const legacyArticle = {
  id: 'source-abc123',
  source_id: 'source',
  source_name: 'Primary source',
  url: 'https://example.com/article',
  published: '2026-07-17T08:00:00.000Z',
  ingested: '2026-07-17T08:05:00.000Z',
  hero_image: 'https://example.com/image.jpg',
  title_original: 'Microsoft ships a new identity control',
  headline_no: 'Legacy Norwegian headline',
  summary_no: 'Legacy Norwegian summary.',
  topic: 'identitet',
  score: 73,
  tags: ['entra', 'identity'],
};

function legacyStore() {
  return {
    generated_at: '2026-07-17T08:06:00.000Z',
    articles: [structuredClone(legacyArticle)],
  };
}

test('legacy migration preserves article identity and evidence fields exactly', () => {
  const migrated = migrateLegacyStore(legacyStore());
  assert.equal(migrated.generated_at, '2026-07-17T08:06:00.000Z');
  assert.equal(migrated.articles.length, 1);
  const article = migrated.articles[0];
  for (const key of ['id', 'source_id', 'source_name', 'url', 'published', 'ingested', 'title_original', 'hero_image'] as const) {
    assert.equal(article[key], legacyArticle[key]);
  }
  assert.equal(article.score, legacyArticle.score);
  assert.deepEqual(article.tags, legacyArticle.tags);
});

test('legacy migration publishes the known English source title and omits unverified translation', () => {
  const [article] = migrateLegacyStore(legacyStore()).articles;
  assert.equal(article.headline, legacyArticle.title_original);
  assert.equal(article.topic, 'identity');
  assert.equal('summary' in article, false);
  const json = JSON.stringify(article);
  assert.equal(json.includes('headline_no'), false);
  assert.equal(json.includes('summary_no'), false);
  assert.equal(json.includes('Legacy Norwegian'), false);
});

test('legacy migration fails closed on mixed old and current records', () => {
  const current = migrateLegacyStore(legacyStore()).articles[0];
  assert.throws(
    () => migrateLegacyStore({ generated_at: legacyStore().generated_at, articles: [legacyArticle, current] }),
    /mixed legacy\/current/,
  );
});

test('running migration on the current English schema is idempotent', () => {
  const first = migrateLegacyStore(legacyStore());
  const second = migrateLegacyStore(structuredClone(first));
  assert.deepEqual(second, first);
  assert.deepEqual(validateArticleStore(second), first);
});
