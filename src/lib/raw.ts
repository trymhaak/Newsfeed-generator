import type { RawArticle } from './types.ts';

/** Keep the first feed item for each stable article id. */
export function deduplicateRawArticlesById(articles: RawArticle[]): RawArticle[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    if (seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  });
}
