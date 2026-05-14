import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import Parser from 'rss-parser';
import { loadStore } from '../src/lib/store.ts';
import type { FeedSource, RawArticle, Topic } from '../src/lib/types.ts';

const FEEDS_PATH = 'config/feeds.yaml';
const RAW_OUT = 'data/_raw.json';
const MAX_ITEMS_PER_FEED = 15;
const MAX_AGE_DAYS = 14;

interface FeedsFile {
  feeds: FeedSource[];
}

async function loadFeeds(): Promise<FeedSource[]> {
  const raw = await readFile(FEEDS_PATH, 'utf8');
  const parsed = parseYaml(raw) as FeedsFile;
  return parsed.feeds.filter((f) => f.enabled !== false);
}

function articleId(sourceId: string, link: string): string {
  const hash = createHash('sha256').update(link).digest('hex').slice(0, 10);
  return `${sourceId}-${hash}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}

function safeImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    // Only allow https (and http) — reject javascript:, data:, file:, etc.
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function extractHeroImage(item: Parser.Item & Record<string, unknown>): string | undefined {
  const enclosure = item.enclosure as { url?: string } | undefined;
  const fromEnclosure = safeImageUrl(enclosure?.url);
  if (fromEnclosure) return fromEnclosure;

  const media = item['media:content'] as { $?: { url?: string } } | undefined;
  const fromMedia = safeImageUrl(media?.$?.url);
  if (fromMedia) return fromMedia;

  const html = (item['content:encoded'] as string | undefined) ?? item.content ?? '';
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return safeImageUrl(match?.[1]);
}

async function fetchFeed(
  parser: Parser,
  source: FeedSource,
  knownIds: Set<string>,
): Promise<RawArticle[]> {
  const feed = await parser.parseURL(source.url);
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;
  const out: RawArticle[] = [];

  for (const item of feed.items.slice(0, MAX_ITEMS_PER_FEED)) {
    if (!item.link || !item.title) continue;
    const id = articleId(source.id, item.link);
    if (knownIds.has(id)) continue;

    const parsedDate = new Date(item.isoDate ?? item.pubDate ?? Date.now());
    if (isNaN(parsedDate.getTime()) || parsedDate.getTime() < cutoff) continue;
    const published = parsedDate.toISOString();

    const rawContent =
      (item['content:encoded'] as string | undefined) ??
      item.content ??
      item.contentSnippet ??
      item.summary ??
      '';

    out.push({
      id,
      source_id: source.id,
      source_name: source.name,
      title: item.title.trim(),
      url: item.link,
      content: truncate(stripHtml(rawContent), 1500),
      published,
      hero_image: extractHeroImage(item),
      default_topic: source.topic as Topic,
      source_weight: source.weight,
    });
  }
  return out;
}

async function main() {
  const sources = await loadFeeds();
  const store = await loadStore();
  const knownIds = new Set(store.articles.map((a) => a.id));

  const parser = new Parser({
    timeout: 20_000,
    headers: { 'user-agent': 'newsfeed-generator/0.1 (+github.com/trymhaak/newsfeed-generator)' },
    customFields: {
      item: [
        ['content:encoded', 'content:encoded'],
        ['media:content', 'media:content'],
      ],
    },
  });

  const results = await Promise.allSettled(
    sources.map((s) => fetchFeed(parser, s, knownIds)),
  );

  const raw: RawArticle[] = [];
  let okCount = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const src = sources[i]!;
    if (r.status === 'fulfilled') {
      raw.push(...r.value);
      okCount++;
      console.log(`  ${src.id}: ${r.value.length} new`);
    } else {
      console.warn(`  ${src.id}: FAILED — ${r.reason}`);
    }
  }

  await mkdir('data', { recursive: true });
  await writeFile(RAW_OUT, JSON.stringify(raw, null, 2) + '\n', 'utf8');

  console.log(`\nfetched ${raw.length} new articles from ${okCount}/${sources.length} feeds`);
  console.log(`wrote ${RAW_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
