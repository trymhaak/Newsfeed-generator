import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ArticleStore, EnrichedArticle } from './types.ts';
import { validateArticleList, validateArticleStore } from './schema.ts';

const STORE_PATH = 'data/articles.json';
const MAX_ARTICLES = 500;

export async function loadStore(path = STORE_PATH): Promise<ArticleStore> {
  if (!existsSync(path)) {
    return { generated_at: new Date(0).toISOString(), articles: [] };
  }
  const raw = await readFile(path, 'utf8');
  return validateArticleStore(JSON.parse(raw), path);
}

/** Write the exact canonical schema via a same-directory atomic rename. */
export async function saveStore(store: ArticleStore, path = STORE_PATH): Promise<void> {
  const validated = validateArticleStore(store, path);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(validated, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
}

export function mergeArticles(
  store: ArticleStore,
  incoming: EnrichedArticle[],
): { added: number; store: ArticleStore } {
  const current = validateArticleStore(store);
  const candidates = validateArticleList(incoming, 'incoming');
  const known = new Set(current.articles.map((article) => article.id));
  const fresh = candidates.filter((article) => !known.has(article.id) && article.score > 0);

  if (fresh.length === 0) {
    return { added: 0, store: current };
  }

  const combined = [...fresh, ...current.articles]
    .sort((a, b) => +new Date(b.published) - +new Date(a.published))
    .slice(0, MAX_ARTICLES);

  return {
    added: fresh.length,
    store: {
      generated_at: new Date().toISOString(),
      articles: combined,
    },
  };
}
