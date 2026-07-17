import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  HERMES_BASE_ARGS,
  buildHermesCommand,
  buildPrompt,
  callHermesOnce,
  parseEnrichmentResponse,
  sanitizeDiagnostic,
} from '../scripts/enrich.ts';
import type { RawArticle } from '../src/lib/types.ts';

const fixture: RawArticle = {
  id: 'fixture-1',
  source_id: 'msrc',
  source_name: 'MSRC',
  title: 'Microsoft fixes a Defender vulnerability',
  url: 'https://example.com/source',
  content: 'Microsoft published a security update for administrators.',
  published: '2026-07-17T08:00:00.000Z',
  default_topic: 'security',
  source_weight: 1,
};

test('Hermes command is pinned to OpenAI Codex in isolated safe mode', () => {
  const command = buildHermesCommand('prompt', '/tmp/hermes');
  assert.equal(command.bin, '/tmp/hermes');
  assert.deepEqual(command.args, [...HERMES_BASE_ARGS, 'prompt']);
  assert.deepEqual(HERMES_BASE_ARGS, [
    '--provider', 'openai-codex', '-m', 'gpt-5.6-sol', '-t', 'safe', '--safe-mode', '-z',
  ]);
  assert.equal(command.args.some((arg) => /claude|anthropic/i.test(arg)), false);
});

test('enrichment prompt and parser enforce complete English output', () => {
  const prompt = buildPrompt([fixture]);
  assert.match(prompt, /Use English only/);
  assert.match(prompt, /identity \| security \| endpoint \| ai/);
  const result = parseEnrichmentResponse(JSON.stringify([{
    id: fixture.id,
    headline: 'Microsoft fixes a Defender vulnerability',
    summary: 'Microsoft published a security update. Administrators should apply it.',
    topic: 'security',
    score: 82,
    tags: ['defender', 'vulnerability'],
  }]), [fixture]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, fixture.id);
});

test('parser rejects partial batches, unknown fields, and invalid topics', () => {
  assert.throws(() => parseEnrichmentResponse('[]', [fixture]), /0\/1/);
  const invalid = [{
    id: fixture.id,
    headline: 'Headline',
    summary: 'Summary.',
    topic: 'sikkerhet',
    score: 50,
    tags: ['one', 'two'],
  }];
  assert.throws(() => parseEnrichmentResponse(JSON.stringify(invalid), [fixture]), /invalid topic/);
  assert.throws(() => parseEnrichmentResponse(JSON.stringify([{ ...invalid[0], topic: 'security', extra: true }]), [fixture]), /invalid fields/);
});

test('child inference environment removes retired-provider credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'newsfeed-hermes-test-'));
  const fake = join(dir, 'fake-hermes.sh');
  await writeFile(fake, '#!/bin/sh\nprintf "%s|%s|%s" "${CLAUDE_CODE_OAUTH_TOKEN-unset}" "${ANTHROPIC_API_KEY-unset}" "${ANTHROPIC_AUTH_TOKEN-unset}"\n', 'utf8');
  await chmod(fake, 0o700);
  const output = await callHermesOnce('ignored', {
    bin: fake,
    timeoutMs: 2_000,
    env: {
      ...process.env,
      CLAUDE_CODE_OAUTH_TOKEN: 'private-one',
      ANTHROPIC_API_KEY: 'private-two',
      ANTHROPIC_AUTH_TOKEN: 'private-three',
    },
  });
  assert.equal(output, 'unset|unset|unset');
  assert.equal(sanitizeDiagnostic('Authorization: secret-value'), 'Authorization=[REDACTED]');
});
