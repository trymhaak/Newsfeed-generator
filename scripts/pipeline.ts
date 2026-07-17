import { readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadStore, mergeArticles, saveStore } from '../src/lib/store.ts';
import { validateArticleList } from '../src/lib/schema.ts';

const PENDING = 'data/_pending.json';
const RAW = 'data/_raw.json';

function run(command: string, args: string[]): void {
  console.log(`\n→ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
  }
}

async function main(): Promise<void> {
  console.log('=== fetch ===');
  run('npx', ['tsx', 'scripts/fetch-feeds.ts']);

  console.log('\n=== enrich ===');
  run('npx', ['tsx', 'scripts/enrich.ts']);

  console.log('\n=== merge ===');
  if (!existsSync(PENDING)) {
    throw new Error('enrichment completed without a pending file');
  }
  const pending = validateArticleList(JSON.parse(await readFile(PENDING, 'utf8')), PENDING);
  const store = await loadStore();
  const { added, store: next } = mergeArticles(store, pending);
  await saveStore(next);
  console.log(`merged ${added} new articles (store now has ${next.articles.length})`);

  // Clean up only after a successful, schema-validated atomic merge.
  if (existsSync(RAW)) await unlink(RAW);
  if (existsSync(PENDING)) await unlink(PENDING);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'pipeline failed');
  process.exit(1);
});
