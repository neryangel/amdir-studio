// Picks adapters from environment variables (server-only, never PUBLIC_*).
//   SUPABASE_URL + SUPABASE_SERVICE_KEY [+ LEAD_TABLE]  → SupabaseRestStore
//   LEAD_DEV_JSONL=path (local dev/tests only)           → JsonlFileStore
//   otherwise                                            → UnconfiguredStore (503, never fake success)
//   RESEND_API_KEY + LEAD_NOTIFY_FROM + LEAD_NOTIFY_TO   → ResendNotifier, else NoopNotifier
//   LEAD_SECRET                                          → HMAC secret (required in production)
import { randomBytes } from 'node:crypto';
import { createRateLimiter } from './rateLimit';
import { NoopNotifier, ResendNotifier, type Notifier } from './notify';
import { SupabaseRestStore, UnconfiguredStore, type LeadStore } from './store';
import type { LeadDeps } from './handler';

type Env = Record<string, string | undefined>;

export async function depsFromEnv(env: Env): Promise<LeadDeps> {
  let store: LeadStore;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    store = new SupabaseRestStore({
      url: env.SUPABASE_URL,
      serviceKey: env.SUPABASE_SERVICE_KEY,
      table: env.LEAD_TABLE || 'studio_leads',
    });
  } else if (env.LEAD_DEV_JSONL && !env.VERCEL) {
    const { JsonlFileStore } = await import('./jsonlStore');
    store = new JsonlFileStore(env.LEAD_DEV_JSONL);
  } else {
    store = new UnconfiguredStore();
  }

  const notifier: Notifier =
    env.RESEND_API_KEY && env.LEAD_NOTIFY_FROM && env.LEAD_NOTIFY_TO
      ? new ResendNotifier({ apiKey: env.RESEND_API_KEY, from: env.LEAD_NOTIFY_FROM, to: env.LEAD_NOTIFY_TO })
      : new NoopNotifier();

  // Without LEAD_SECRET a random per-instance secret is used: tokens then only verify on the
  // same warm instance, so production MUST set LEAD_SECRET (see DEPLOY.he.md).
  const secret = env.LEAD_SECRET || randomBytes(32).toString('hex');
  if (!env.LEAD_SECRET && env.VERCEL) store = new UnconfiguredStore();

  return { store, notifier, secret, rateLimiter: createRateLimiter() };
}
