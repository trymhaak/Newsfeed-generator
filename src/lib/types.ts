export type Topic = 'identitet' | 'sikkerhet' | 'endpoint' | 'ai';

export const TOPICS: Topic[] = ['identitet', 'sikkerhet', 'endpoint', 'ai'];

export const TOPIC_LABELS: Record<Topic, string> = {
  identitet: 'Identitet',
  sikkerhet: 'Sikkerhet',
  endpoint: 'Endpoint',
  ai: 'AI & Copilot',
};

export const TOPIC_COLORS: Record<Topic, string> = {
  identitet: '#1e6091',
  sikkerhet: '#b3261e',
  endpoint: '#2d6a4f',
  ai: '#6a3d9a',
};

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

export interface EnrichedArticle {
  id: string;
  source_id: string;
  source_name: string;
  url: string;
  published: string;
  ingested: string;
  hero_image?: string;
  title_original: string;
  headline_no: string;
  summary_no: string;
  topic: Topic;
  score: number;
  tags: string[];
}

export interface ArticleStore {
  generated: string;
  articles: EnrichedArticle[];
}
