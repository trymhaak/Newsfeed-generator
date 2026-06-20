import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ArticleStore, EnrichedArticle, Topic } from './types.ts';
import { TOPICS } from './types.ts';

const STORE_PATH = 'data/articles.json';
const MAX_ARTICLES = 500;

/** A store that is treated as "very stale" so monitors/UI flag it loudly. */
function emptyStaleStore(): ArticleStore {
  return { generated_at: new Date(0).toISOString(), articles: [] };
}

/**
 * Load the article store. Hardened against a corrupt/half-written file: any
 * parse error, missing `articles` array, or unreadable file degrades to an
 * empty (stale) store instead of crashing `astro build`. Also normalises the
 * legacy top-level `generated` key to `generated_at`.
 */
export async function loadStore(path = STORE_PATH): Promise<ArticleStore> {
  if (!existsSync(path)) {
    return { generated_at: new Date().toISOString(), articles: [] };
  }
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ArticleStore> & { generated?: string };
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.articles)) {
      console.warn(`[store] ${path} has no articles array — treating as empty`);
      return emptyStaleStore();
    }
    const generated_at =
      parsed.generated_at ?? parsed.generated ?? new Date(0).toISOString();
    return { generated_at, articles: parsed.articles };
  } catch (err) {
    console.warn(`[store] failed to load ${path} (${err}) — treating as empty`);
    return emptyStaleStore();
  }
}

/**
 * Write the store atomically: serialise to a temp file in the same directory,
 * then rename over the target. A crash mid-write leaves the previous good file
 * intact (rename is atomic on a single filesystem) instead of corrupting it.
 */
export async function saveStore(
  store: ArticleStore,
  path = STORE_PATH,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
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
    store: {
      // Idempotent: only bump the freshness stamp when we actually added
      // something, so a no-op run is byte-identical (no git diff), honouring
      // CLAUDE.md's "re-kjøring uten nye saker = no-op". (The first run against a
      // legacy store rewrites it once to migrate `generated` -> `generated_at`.)
      generated_at:
        fresh.length > 0 ? new Date().toISOString() : store.generated_at,
      articles: combined,
    },
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
  const byScoreThenDate = (a: EnrichedArticle, b: EnrichedArticle) =>
    b.score - a.score || +new Date(b.published) - +new Date(a.published);

  const recent = articles
    .filter((a) => withinHours(a.published, 14 * 24))
    .sort(byScoreThenDate);

  // Full set ranked, used as the fallback when the 14-day window is empty
  // (e.g. the pipeline has stalled). Guarantees the front page never loses its
  // hero/mid sections while there is *any* data — see PRODUCTION-READINESS B4.
  const ranked = [...articles].sort(byScoreThenDate);

  const hero =
    recent.find((a) => a.score >= 75) ?? // strong & recent — the ideal hero
    recent[0] ?? // best recent, even if below the 75 bar
    ranked[0]; // nothing recent at all → best article overall (stale fallback)
  const heroId = hero?.id;

  let mid = recent
    .filter((a) => a.id !== heroId && a.score >= 55)
    .slice(0, 4);
  if (mid.length === 0) {
    // Window empty → fall back to the next-best articles overall so the page
    // isn't just a lone hero on stale data.
    mid = ranked.filter((a) => a.id !== heroId).slice(0, 4);
  }
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
