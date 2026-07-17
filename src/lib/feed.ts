import type { ArticleStore, PublicFeed, PublicFeedArticle } from './types.ts';
import { validatePublicFeed } from './schema.ts';

export function buildPublicFeed(store: ArticleStore): PublicFeed {
  const articles: PublicFeedArticle[] = store.articles.map((article) => {
    const item: PublicFeedArticle = {
      id: article.id,
      url: article.url,
      published: article.published,
      headline: article.headline,
      topic: article.topic,
      score: article.score,
      source: {
        id: article.source_id,
        name: article.source_name,
      },
    };
    if (article.summary) item.summary = article.summary;
    if (article.hero_image) item.image = article.hero_image;
    return item;
  });

  return validatePublicFeed({ generated_at: store.generated_at, articles });
}
