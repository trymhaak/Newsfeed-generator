import type { APIRoute } from 'astro';
import { buildPublicFeed } from '../lib/feed.ts';
import { loadStore } from '../lib/store.ts';

export const prerender = true;

export const GET: APIRoute = async () => {
  const feed = buildPublicFeed(await loadStore());
  return new Response(JSON.stringify(feed, null, 2) + '\n', {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  });
};
