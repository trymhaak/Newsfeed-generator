import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildPublicFeed } from '../src/lib/feed.ts';
import { loadStore, mergeArticles } from '../src/lib/store.ts';
import { validatePublicFeed } from '../src/lib/schema.ts';

test('canonical store and public feed contain 500 English-schema records', async () => {
  const store = await loadStore();
  assert.equal(store.articles.length, 500);
  const feed = buildPublicFeed(store);
  assert.equal(validatePublicFeed(feed).articles.length, 500);
  for (const article of feed.articles) {
    assert.deepEqual(Object.keys(article).sort(), [
      'headline', 'id', 'published', 'score', 'source', 'topic', 'url',
      ...(article.summary ? ['summary'] : []),
      ...(article.image ? ['image'] : []),
    ].sort());
    assert.equal(article.headline.trim().length > 0, true);
    if (article.image) assert.match(article.image, /^https?:\/\//);
    assert.equal(/headline_no|summary_no|identitet|sikkerhet/.test(JSON.stringify(article)), false);
  }
});

test('public feed exposes source images and English article text', async () => {
  const feed = buildPublicFeed(await loadStore());
  const withImages = feed.articles.filter((article) => article.image);
  const richArticles = feed.articles.filter((article) => article.image && article.summary);
  assert.ok(withImages.length >= 60, `expected at least 60 source images, got ${withImages.length}`);
  assert.ok(richArticles.length >= 60, `expected at least 60 image-and-text articles, got ${richArticles.length}`);
  for (const article of richArticles) {
    assert.match(article.image!, /^https?:\/\//);
    assert.ok(article.summary!.trim().length >= 40);
  }
});

test('public feed omits producer-only and legacy fields', async () => {
  const feedJson = JSON.stringify(buildPublicFeed(await loadStore()));
  for (const forbidden of ['title_original', 'source_id', 'source_name', 'tags', 'hero_image', 'headline_no', 'summary_no']) {
    assert.equal(feedJson.includes(`"${forbidden}"`), false, `${forbidden} must not be public`);
  }
});

test('no-new-article merge is byte-semantic idempotent', async () => {
  const store = await loadStore();
  const duplicate = structuredClone(store.articles[0]);
  duplicate.ingested = '2099-01-01T00:00:00.000Z';
  const merged = mergeArticles(store, [duplicate]);
  assert.equal(merged.added, 0);
  assert.deepEqual(merged.store, store);
});

test('old human routes retire to Trym Cloud while feed stays public', async () => {
  const redirects = await readFile('public/_redirects', 'utf8');
  assert.match(redirects, /^\/ https:\/\/trym\.cloud\/security\/newsfeed\/ 301$/m);
  assert.match(redirects, /^\/tema\/\* https:\/\/trym\.cloud\/security\/newsfeed\/ 301$/m);
  assert.match(redirects, /^\/artikkel\/\* https:\/\/trym\.cloud\/security\/newsfeed\/ 301$/m);
  assert.doesNotMatch(redirects, /^\/feed\.json\b/m);
  const headers = await readFile('public/_headers', 'utf8');
  assert.match(headers, /^\/feed\.json$/m);
  assert.match(headers, /Access-Control-Allow-Origin: \*/);
});
