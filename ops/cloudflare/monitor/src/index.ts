/**
 * Newsfeed freshness monitor — out-of-band staleness alarm
 * (PRODUCTION-READINESS P0.3 / §4.3).
 *
 * Runs on Cloudflare on a cron, INDEPENDENT of the Mac mini, so it fires
 * precisely when the Mac / launchd job dies and the feed stops refreshing — the
 * failure mode an on-Mac heartbeat cannot catch. It fetches the published
 * articles.json, reads the top-level `generated_at`, and POSTs to a Discord or
 * Slack webhook when the data is older than STALE_HOURS.
 *
 * NOTHING here is deployed by the repo. Deploy + secret steps: CUTOVER-RUNBOOK §B.
 */

export interface Env {
  /**
   * Where to read the published articles.json. Default (see wrangler.toml) is
   * the canonical file on `main` via raw GitHub — works today and is
   * hosting-independent. Switch to the Cloudflare Pages URL once articles.json
   * is published there.
   */
  ARTICLES_URL: string;
  /** Staleness threshold in hours (string var). Default "12". */
  STALE_HOURS?: string;
  /** Incoming webhook URL — set as a SECRET, never committed. */
  WEBHOOK_URL?: string;
  /** "discord" (default) or "slack" — selects the JSON body shape. */
  WEBHOOK_KIND?: string;
}

interface Health {
  ok: boolean;
  stale: boolean;
  ageHours: number | null;
  generatedAt: string | null;
  source: string;
  reason: string;
}

async function checkFreshness(env: Env): Promise<Health> {
  const staleHours = Number(env.STALE_HOURS ?? '12');
  const source = env.ARTICLES_URL;
  const fail = (reason: string, generatedAt: string | null = null): Health => ({
    ok: false,
    stale: true,
    ageHours: null,
    generatedAt,
    source,
    reason,
  });

  let res: Response;
  try {
    res = await fetch(source, {
      headers: { 'user-agent': 'newsfeed-monitor/1.0' },
      cf: { cacheTtl: 0 },
    });
  } catch (err) {
    return fail(`failed to fetch ${source}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    return fail(`fetch ${source} returned HTTP ${res.status}`);
  }

  let data: { generated_at?: string; generated?: string };
  try {
    data = (await res.json()) as { generated_at?: string; generated?: string };
  } catch (err) {
    return fail(`articles.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Accept the legacy `generated` key too, so the monitor works against older
  // published data as well as the canonical `generated_at`.
  const ts = data.generated_at ?? data.generated ?? null;
  if (!ts) return fail('articles.json has no generated_at field');

  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) return fail(`generated_at is not a valid date: ${ts}`, ts);

  const ageHours = (Date.now() - parsed) / 3_600_000;
  const stale = ageHours > staleHours;
  return {
    ok: !stale,
    stale,
    ageHours,
    generatedAt: ts,
    source,
    reason: stale
      ? `articles.json is ${ageHours.toFixed(1)}h old (> ${staleHours}h threshold)`
      : `fresh: ${ageHours.toFixed(1)}h old (<= ${staleHours}h threshold)`,
  };
}

async function alert(env: Env, text: string): Promise<void> {
  if (!env.WEBHOOK_URL) {
    console.error('WEBHOOK_URL not configured — cannot send alert:', text);
    return;
  }
  const kind = (env.WEBHOOK_KIND ?? 'discord').toLowerCase();
  // Discord expects { content }, Slack expects { text }.
  const body = kind === 'slack' ? { text } : { content: text };
  const res = await fetch(env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`webhook POST failed: HTTP ${res.status}`);
}

export default {
  // Cron entrypoint — wired to crons in wrangler.toml.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const h = await checkFreshness(env);
        if (h.stale) {
          await alert(env, `🚨 Newsfeed stale — ${h.reason}. Kilde: ${h.source}`);
        }
        console.log(JSON.stringify(h));
      })(),
    );
  },

  // Manual health probe: GET the worker URL to see current status as JSON
  // (200 when fresh, 503 when stale).
  async fetch(_req: Request, env: Env): Promise<Response> {
    const h = await checkFreshness(env);
    return new Response(JSON.stringify(h, null, 2), {
      status: h.stale ? 503 : 200,
      headers: { 'content-type': 'application/json' },
    });
  },
};
