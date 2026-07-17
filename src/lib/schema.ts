import type { ArticleStore, EnrichedArticle, PublicFeed, PublicFeedArticle, Topic } from './types.ts';
import { TOPICS } from './types.ts';

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

const ARTICLE_REQUIRED_KEYS = [
  'id',
  'source_id',
  'source_name',
  'url',
  'published',
  'ingested',
  'title_original',
  'headline',
  'topic',
  'score',
  'tags',
] as const;
const ARTICLE_OPTIONAL_KEYS = ['hero_image', 'summary'] as const;

const PUBLIC_ARTICLE_REQUIRED_KEYS = [
  'id',
  'url',
  'published',
  'headline',
  'topic',
  'score',
  'source',
] as const;
const PUBLIC_ARTICLE_OPTIONAL_KEYS = ['summary', 'image'] as const;

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SchemaValidationError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = required.filter((key) => !hasOwn(value, key));
  if (unexpected.length > 0 || missing.length > 0) {
    const details = [
      unexpected.length > 0 ? `unexpected: ${unexpected.join(', ')}` : '',
      missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    throw new SchemaValidationError(`${path} has invalid keys (${details})`);
  }
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SchemaValidationError(`${path} must be a non-empty string`);
  }
  return value;
}

function timestamp(value: unknown, path: string): string {
  const text = nonEmptyString(value, path);
  if (!Number.isFinite(Date.parse(text))) {
    throw new SchemaValidationError(`${path} must be an ISO-8601 timestamp`);
  }
  return text;
}

function httpUrl(value: unknown, path: string): string {
  const text = nonEmptyString(value, path);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new SchemaValidationError(`${path} must be an absolute URL`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SchemaValidationError(`${path} must use http or https`);
  }
  return text;
}

function topic(value: unknown, path: string): Topic {
  if (typeof value !== 'string' || !TOPICS.includes(value as Topic)) {
    throw new SchemaValidationError(`${path} must be one of ${TOPICS.join(', ')}`);
  }
  return value as Topic;
}

function score(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
    throw new SchemaValidationError(`${path} must be an integer from 0 to 100`);
  }
  return value as number;
}

export function validateArticle(value: unknown, path = 'article'): EnrichedArticle {
  const article = asRecord(value, path);
  assertExactKeys(article, ARTICLE_REQUIRED_KEYS, ARTICLE_OPTIONAL_KEYS, path);

  const tags = article.tags;
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
    throw new SchemaValidationError(`${path}.tags must be an array of strings`);
  }

  const validated: EnrichedArticle = {
    id: nonEmptyString(article.id, `${path}.id`),
    source_id: nonEmptyString(article.source_id, `${path}.source_id`),
    source_name: nonEmptyString(article.source_name, `${path}.source_name`),
    url: httpUrl(article.url, `${path}.url`),
    published: timestamp(article.published, `${path}.published`),
    ingested: timestamp(article.ingested, `${path}.ingested`),
    title_original: nonEmptyString(article.title_original, `${path}.title_original`),
    headline: nonEmptyString(article.headline, `${path}.headline`),
    topic: topic(article.topic, `${path}.topic`),
    score: score(article.score, `${path}.score`),
    tags: [...tags] as string[],
  };
  if (hasOwn(article, 'hero_image')) {
    validated.hero_image = httpUrl(article.hero_image, `${path}.hero_image`);
  }
  if (hasOwn(article, 'summary')) {
    validated.summary = nonEmptyString(article.summary, `${path}.summary`);
  }
  return validated;
}

export function validateArticleList(value: unknown, path = 'articles'): EnrichedArticle[] {
  if (!Array.isArray(value)) {
    throw new SchemaValidationError(`${path} must be an array`);
  }
  const articles = value.map((article, index) => validateArticle(article, `${path}[${index}]`));
  const ids = new Set<string>();
  for (const article of articles) {
    if (ids.has(article.id)) {
      throw new SchemaValidationError(`${path} contains duplicate id ${article.id}`);
    }
    ids.add(article.id);
  }
  return articles;
}

export function validateArticleStore(value: unknown, path = 'store'): ArticleStore {
  const store = asRecord(value, path);
  assertExactKeys(store, ['generated_at', 'articles'], [], path);
  return {
    generated_at: timestamp(store.generated_at, `${path}.generated_at`),
    articles: validateArticleList(store.articles, `${path}.articles`),
  };
}

function validatePublicArticle(value: unknown, path: string): PublicFeedArticle {
  const article = asRecord(value, path);
  assertExactKeys(article, PUBLIC_ARTICLE_REQUIRED_KEYS, PUBLIC_ARTICLE_OPTIONAL_KEYS, path);
  const source = asRecord(article.source, `${path}.source`);
  assertExactKeys(source, ['id', 'name'], [], `${path}.source`);

  const validated: PublicFeedArticle = {
    id: nonEmptyString(article.id, `${path}.id`),
    url: httpUrl(article.url, `${path}.url`),
    published: timestamp(article.published, `${path}.published`),
    headline: nonEmptyString(article.headline, `${path}.headline`),
    topic: topic(article.topic, `${path}.topic`),
    score: score(article.score, `${path}.score`),
    source: {
      id: nonEmptyString(source.id, `${path}.source.id`),
      name: nonEmptyString(source.name, `${path}.source.name`),
    },
  };
  if (hasOwn(article, 'summary')) {
    validated.summary = nonEmptyString(article.summary, `${path}.summary`);
  }
  if (hasOwn(article, 'image')) {
    validated.image = httpUrl(article.image, `${path}.image`);
  }
  return validated;
}

export function validatePublicFeed(value: unknown, path = 'feed'): PublicFeed {
  const feed = asRecord(value, path);
  assertExactKeys(feed, ['generated_at', 'articles'], [], path);
  if (!Array.isArray(feed.articles)) {
    throw new SchemaValidationError(`${path}.articles must be an array`);
  }
  return {
    generated_at: timestamp(feed.generated_at, `${path}.generated_at`),
    articles: feed.articles.map((article, index) =>
      validatePublicArticle(article, `${path}.articles[${index}]`),
    ),
  };
}
