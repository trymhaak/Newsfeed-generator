import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { saveStore } from '../src/lib/store.ts';
import { assertExactKeys, SchemaValidationError, validateArticleStore } from '../src/lib/schema.ts';
import type { ArticleStore, EnrichedArticle, Topic } from '../src/lib/types.ts';

const STORE_PATH = 'data/articles.json';

const LEGACY_REQUIRED_KEYS = [
  'id',
  'source_id',
  'source_name',
  'url',
  'published',
  'ingested',
  'title_original',
  'headline_no',
  'summary_no',
  'topic',
  'score',
  'tags',
] as const;
const LEGACY_OPTIONAL_KEYS = ['hero_image'] as const;

const TOPIC_MAP: Readonly<Record<string, Topic>> = {
  identitet: 'identity',
  sikkerhet: 'security',
  endpoint: 'endpoint',
  ai: 'ai',
};

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SchemaValidationError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SchemaValidationError(`${path} must be a non-empty string`);
  }
  return value;
}

function migrateLegacyArticle(value: unknown, index: number): EnrichedArticle {
  const path = `legacy.articles[${index}]`;
  const article = asRecord(value, path);
  assertExactKeys(article, LEGACY_REQUIRED_KEYS, LEGACY_OPTIONAL_KEYS, path);
  const mappedTopic = typeof article.topic === 'string' ? TOPIC_MAP[article.topic] : undefined;
  if (!mappedTopic) {
    throw new SchemaValidationError(`${path}.topic cannot be migrated safely`);
  }
  if (!Array.isArray(article.tags) || article.tags.some((tag) => typeof tag !== 'string')) {
    throw new SchemaValidationError(`${path}.tags must be an array of strings`);
  }
  if (!Number.isInteger(article.score)) {
    throw new SchemaValidationError(`${path}.score must be an integer`);
  }

  const migrated: EnrichedArticle = {
    id: requiredString(article.id, `${path}.id`),
    source_id: requiredString(article.source_id, `${path}.source_id`),
    source_name: requiredString(article.source_name, `${path}.source_name`),
    url: requiredString(article.url, `${path}.url`),
    published: requiredString(article.published, `${path}.published`),
    ingested: requiredString(article.ingested, `${path}.ingested`),
    title_original: requiredString(article.title_original, `${path}.title_original`),
    // The source title is known English. Reusing it is safer than pretending the
    // legacy Norwegian summary was translated.
    headline: requiredString(article.title_original, `${path}.title_original`),
    topic: mappedTopic,
    score: article.score as number,
    tags: [...article.tags] as string[],
  };
  if (Object.prototype.hasOwnProperty.call(article, 'hero_image')) {
    migrated.hero_image = requiredString(article.hero_image, `${path}.hero_image`);
  }
  return migrated;
}

/**
 * Convert the complete legacy store in one pass. Mixed old/new stores are
 * rejected so a partial migration can never silently drop or reinterpret rows.
 */
export function migrateLegacyStore(value: unknown): ArticleStore {
  const store = asRecord(value, 'legacy');
  const articles = store.articles;
  if (!Array.isArray(articles)) {
    throw new SchemaValidationError('legacy.articles must be an array');
  }

  const legacyCount = articles.filter((article) => {
    const record = asRecord(article, 'legacy article');
    return Object.prototype.hasOwnProperty.call(record, 'headline_no') ||
      Object.prototype.hasOwnProperty.call(record, 'summary_no');
  }).length;

  if (legacyCount === 0) {
    return validateArticleStore(value);
  }
  if (legacyCount !== articles.length) {
    throw new SchemaValidationError('mixed legacy/current article stores are not safe to migrate');
  }

  assertExactKeys(store, [], ['generated_at', 'generated', 'articles'], 'legacy');
  if (Object.prototype.hasOwnProperty.call(store, 'generated_at') ===
      Object.prototype.hasOwnProperty.call(store, 'generated')) {
    throw new SchemaValidationError('legacy store must have exactly one freshness field');
  }
  const generatedAt = store.generated_at ?? store.generated;
  const migrated = {
    generated_at: requiredString(generatedAt, 'legacy.generated_at'),
    articles: articles.map(migrateLegacyArticle),
  };
  return validateArticleStore(migrated);
}

async function main(): Promise<void> {
  const original = await readFile(STORE_PATH, 'utf8');
  const migrated = migrateLegacyStore(JSON.parse(original));
  const next = JSON.stringify(migrated, null, 2) + '\n';
  if (next === original) {
    console.log(`${STORE_PATH} already uses the English schema; no changes`);
    return;
  }
  await saveStore(migrated, STORE_PATH);
  console.log(`migrated ${migrated.articles.length} articles to the English schema`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'migration failed');
    process.exit(1);
  });
}
