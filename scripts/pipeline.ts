import { readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadStore, mergeArticles, saveStore } from '../src/lib/store.ts';
import type { EnrichedArticle } from '../src/lib/types.ts';

const PENDING = 'data/_pending.json';
const RAW = 'data/_raw.json';

function run(cmd: string, args: string[]): void {
  console.log(`\n→ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
  }
}

async function main() {
  console.log('=== fetch ===');
  run('npx', ['tsx', 'scripts/fetch-feeds.ts']);

  console.log('\n=== enrich ===');
  run('npx', ['tsx', 'scripts/enrich.ts']);

  console.log('\n=== merge ===');
  if (!existsSync(PENDING)) {
    console.log('no pending file — done');
    return;
  }
  const pending: EnrichedArticle[] = JSON.parse(await readFile(PENDING, 'utf8'));
  const store = await loadStore();
  const { added, store: next } = mergeArticles(store, pending);
  await saveStore(next);
  console.log(`merged ${added} new articles (store now has ${next.articles.length})`);

  if (existsSync(RAW)) await unlink(RAW);
  if (existsSync(PENDING)) await unlink(PENDING);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
