/**
 * Newsfeed freshness monitor — out-of-band staleness alarm
 * (PRODUCTION-READINESS P0.3 / §4.3).
 *
 * Runs on Cloudflare on a cron, INDEPENDENT of the Mac mini, so it fires
 * precisely when the Mac / launchd job dies and the feed stops refreshing — the
 * failure mode an on-Mac-only heartbeat cannot catch. It fetches the published
 * pipeline heartbeat, reads top-level `checked_at`, and alerts when that
 * heartbeat is older than STALE_HOURS. This intentionally avoids false alarms
 * when the pipeline runs successfully but no feeds have published new articles.
 *
 * NOTHING here is deployed by the repo. Deploy + secret steps: CUTOVER-RUNBOOK §B.
 */

export interface Env {
  /**
   * Successful pipeline heartbeat written by ops/launchd/run-pipeline.sh.
   * Preferred over ARTICLES_URL because no-new-article runs should still prove
   * the control plane is alive.
   */
  STATUS_URL?: string;
  /**
   * Fallback: where to read the published articles.json. Default (see
   * wrangler.toml) is the canonical file on `main` via raw GitHub.
   */
  ARTICLES_URL: string;
  /** Staleness threshold in hours (string var). Default "12". */
  STALE_HOURS?: string;
  /** Minimum hours between repeated stale reminders. Default "24". */
  REMINDER_HOURS?: string;
  /** Scheduler window in hours; keeps one cron tick per reminder bucket. Default "3.25". */
  ALERT_WINDOW_HOURS?: string;
  /** Incoming webhook URL — set as a SECRET when WEBHOOK_KIND is discord/slack/telegram. */
  WEBHOOK_URL?: string;
  /** "log" (default), "discord", "slack", or "telegram" — selects alert sink/body shape. */
  WEBHOOK_KIND?: string;
  /** Telegram chat id (secret) when WEBHOOK_KIND=telegram. */
  TELEGRAM_CHAT_ID?: string;
}

interface Health {
  ok: boolean;
  stale: boolean;
  ageHours: number | null;
  checkedAt: string | null;
  generatedAt: string | null;
  source: string;
  reason: string;
}

type FreshnessPayload = {
  checked_at?: string;
  generated_at?: string;
  generated?: string;
  content?: string;
  encoding?: string;
};

function decodeFreshnessPayload(data: FreshnessPayload): FreshnessPayload {
  // GitHub's contents API is a safer freshness source than raw branch URLs
  // (raw.githubusercontent.com can serve stale branch-cache artifacts after a
  // delayed push). With the raw Accept header it returns the file body, but keep
  // a metadata fallback so future header/proxy changes do not false-alert.
  if (typeof data.checked_at === 'string' || typeof data.generated_at === 'string' || typeof data.generated === 'string') {
    return data;
  }
  if (data.encoding === 'base64' && typeof data.content === 'string') {
    try {
      return JSON.parse(atob(data.content.replace(/\s/g, ''))) as FreshnessPayload;
    } catch (_err) {
      return data;
    }
  }
  return data;
}

async function checkFreshness(env: Env): Promise<Health> {
  const staleHours = Number(env.STALE_HOURS ?? '12');
  const source = env.STATUS_URL || env.ARTICLES_URL;
  const fail = (reason: string, checkedAt: string | null = null, generatedAt: string | null = null): Health => ({
    ok: false,
    stale: true,
    ageHours: null,
    checkedAt,
    generatedAt,
    source,
    reason,
  });

  let res: Response;
  try {
    res = await fetch(source, {
      headers: {
        accept: source.includes('api.github.com/') ? 'application/vnd.github.raw+json' : 'application/json',
        'user-agent': 'newsfeed-monitor/1.0',
      },
      cf: { cacheTtl: 0 },
    });
  } catch (err) {
    return fail(`failed to fetch ${source}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    return fail(`fetch ${source} returned HTTP ${res.status}`);
  }

  let data: FreshnessPayload;
  try {
    data = decodeFreshnessPayload((await res.json()) as FreshnessPayload);
  } catch (err) {
    return fail(`status/articles JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Preferred: pipeline heartbeat `checked_at`. Fallback: legacy article-store
  // freshness `generated_at` / `generated` so old deployments still work.
  const generatedAt = data.generated_at ?? data.generated ?? null;
  const ts = data.checked_at ?? generatedAt;
  if (!ts) return fail('status/articles JSON has no checked_at or generated_at field');

  const parsed = Date.parse(ts);
  if (Number.isNaN(parsed)) return fail(`freshness timestamp is not a valid date: ${ts}`, ts, generatedAt);

  const ageHours = (Date.now() - parsed) / 3_600_000;
  const stale = ageHours > staleHours;
  const label = data.checked_at ? 'pipeline heartbeat' : 'articles.json';
  return {
    ok: !stale,
    stale,
    ageHours,
    checkedAt: data.checked_at ?? null,
    generatedAt,
    source,
    reason: stale
      ? `${label} is ${ageHours.toFixed(1)}h old (> ${staleHours}h threshold)`
      : `fresh: ${label} is ${ageHours.toFixed(1)}h old (<= ${staleHours}h threshold)`,
  };
}

function shouldAlert(env: Env, h: Health): boolean {
  if (!h.stale) return false;

  // Fetch/parse errors do not have an age; alert every cron tick because the
  // monitor cannot tell whether this is transient or a hard outage.
  if (h.ageHours === null) return true;

  const staleHours = Number(env.STALE_HOURS ?? '12');
  const reminderHours = Number(env.REMINDER_HOURS ?? '24');
  const alertWindowHours = Number(env.ALERT_WINDOW_HOURS ?? '3.25');
  const staleAge = h.ageHours - staleHours;
  if (staleAge < 0) return false;

  // First alert: the first scheduled run after crossing STALE_HOURS.
  if (staleAge <= alertWindowHours) return true;

  // Reminder alerts: one scheduled run per REMINDER_HOURS bucket. This is
  // stateless, so it works on the free Worker cron without KV/Durable Objects
  // and prevents the "same stale fingerprint every 3 hours" Telegram storm.
  if (reminderHours <= 0) return false;
  return staleAge % reminderHours <= alertWindowHours;
}

async function alert(env: Env, text: string): Promise<void> {
  const kind = (env.WEBHOOK_KIND ?? 'log').toLowerCase();
  if (kind === 'log' || kind === 'none' || kind === 'disabled') {
    console.log(JSON.stringify({ delivery: 'log', alert: text }));
    return;
  }
  if (!env.WEBHOOK_URL) {
    console.error('WEBHOOK_URL not configured — cannot send alert:', text);
    return;
  }
  // Discord expects { content }, Slack expects { text }.
  const body = kind === 'telegram' ? { chat_id: env.TELEGRAM_CHAT_ID, text } : kind === 'slack' ? { text } : { content: text };
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
        if (shouldAlert(env, h)) {
          await alert(env, `🚨 Newsfeed stale — ${h.reason}. Source: ${h.source}`);
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
