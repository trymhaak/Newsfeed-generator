import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ArticleStore, EnrichedArticle, Topic } from './types.ts';
import { TOPICS } from './types.ts';

const STORE_PATH = 'data/articles.json';
const MAX_ARTICLES = 500;

export async function loadStore(path = STORE_PATH): Promise<ArticleStore> {
  if (!existsSync(path)) {
    return { generated: new Date().toISOString(), articles: [] };
  }
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as ArticleStore;
}

export async function saveStore(
  store: ArticleStore,
  path = STORE_PATH,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

export function mergeArticles(
  store: ArticleStore,
  incoming: EnrichedArticle[],
): { added: number; store: ArticleStore } {
  const known = new Set(store.articles.map((a) => a.id));
  const fresh = incoming.filter((a) => !known.has(a.id) && a.score > 0);

  const combined = [...fresh, ...store.articles]
    .sort((a, b) => +new Date(b.published) - +new Date(a.published))
    .slice(0, MAX_ARTICLES);

  return {
    added: fresh.length,
    store: { generated: new Date().toISOString(), articles: combined },
  };
}

export function articlesByTopic(
  articles: EnrichedArticle[],
  topic: Topic,
): EnrichedArticle[] {
  return articles.filter((a) => a.topic === topic);
}

export function selectFrontPage(articles: EnrichedArticle[]): {
  hero: EnrichedArticle | undefined;
  mid: EnrichedArticle[];
  latest: EnrichedArticle[];
  byTopic: Record<Topic, EnrichedArticle[]>;
} {
  const recent = articles
    .filter((a) => withinHours(a.published, 14 * 24))
    .sort((a, b) => b.score - a.score || +new Date(b.published) - +new Date(a.published));

  const hero = recent.find((a) => a.score >= 75);
  const heroId = hero?.id;

  const mid = recent
    .filter((a) => a.id !== heroId && a.score >= 55)
    .slice(0, 4);
  const midIds = new Set(mid.map((a) => a.id));

  const latest = articles
    .filter((a) => a.id !== heroId && !midIds.has(a.id))
    .slice(0, 12);

  const byTopic = Object.fromEntries(
    TOPICS.map((t) => [t, articlesByTopic(articles, t).slice(0, 3)]),
  ) as Record<Topic, EnrichedArticle[]>;

  return { hero, mid, latest, byTopic };
}

function withinHours(iso: string, hours: number): boolean {
  const age = Date.now() - +new Date(iso);
  return age <= hours * 3600_000;
}
