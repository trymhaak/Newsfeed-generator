export type Topic = 'identity' | 'security' | 'endpoint' | 'ai';

export const TOPICS: readonly Topic[] = ['identity', 'security', 'endpoint', 'ai'];

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  topic: Topic;
  weight: number;
  enabled?: boolean;
}

export interface RawArticle {
  id: string;
  source_id: string;
  source_name: string;
  title: string;
  url: string;
  content: string;
  published: string;
  hero_image?: string;
  default_topic: Topic;
  source_weight: number;
}

/** Canonical producer record. `summary` is absent on safely migrated legacy rows. */
export interface EnrichedArticle {
  id: string;
  source_id: string;
  source_name: string;
  url: string;
  published: string;
  ingested: string;
  hero_image?: string;
  title_original: string;
  headline: string;
  summary?: string;
  topic: Topic;
  score: number;
  /** Internal producer metadata. Legacy values are preserved but are not public. */
  tags: string[];
}

export interface ArticleStore {
  /** UTC ISO-8601 stamp, advanced only when at least one article is added. */
  generated_at: string;
  articles: EnrichedArticle[];
}

export interface PublicFeedArticle {
  id: string;
  url: string;
  published: string;
  headline: string;
  summary?: string;
  topic: Topic;
  score: number;
  source: {
    id: string;
    name: string;
  };
}

export interface PublicFeed {
  generated_at: string;
  articles: PublicFeedArticle[];
}
