// Local server: serves a static build folder and routes /api/lead to the real handler.
// Used by `npm run dev:api` (proxied from `astro dev`) and by scripts/e2e-lead.ts.
// Never used in production (Vercel runs api/lead.ts directly).
import http from 'node:http';
import handler from 'serve-handler';
import { createLeadHandler, type LeadDeps } from '../server/lead/handler';
import { JsonlFileStore } from '../server/lead/jsonlStore';
import { NoopNotifier } from '../server/lead/notify';
import { createRateLimiter } from '../server/lead/rateLimit';
import type { LeadStore } from '../server/lead/store';

export interface LocalServer {
  url: string;
  /** 'ok' stores to JSONL, 'fail' makes the store throw (to test the error path). */
  setStoreMode(mode: 'ok' | 'fail'): void;
  close(): Promise<void>;
}

export async function startLocalServer(opts: { dir?: string | undefined; port?: number; jsonl: string; rateLimit?: number }): Promise<LocalServer> {
  let mode: 'ok' | 'fail' = 'ok';
  const jsonl = new JsonlFileStore(opts.jsonl);
  const store: LeadStore = {
    kind: 'local',
    insert: (r) => (mode === 'ok' ? jsonl.insert(r) : Promise.reject(new Error('simulated store outage'))),
    countRecent: (ipHash, sinceIso) => jsonl.countRecent(ipHash, sinceIso),
  };
  const deps: LeadDeps = {
    store,
    notifier: new NoopNotifier(),
    rateLimiter: createRateLimiter({ limit: opts.rateLimit ?? 5 }),
    secret: 'local-dev-secret',
  };
  const lead = createLeadHandler(deps);

  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/api/lead')) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      headers.set('x-real-ip', req.socket.remoteAddress ?? 'local');
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method ?? 'GET',
        headers,
        ...(req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
      });
      const response = await lead(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    if (!opts.dir) {
      res.writeHead(404).end();
      return;
    }
    await handler(req, res, { public: opts.dir, trailingSlash: true });
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', () => r()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    setStoreMode: (m) => {
      mode = m;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}

// CLI: tsx scripts/local-server.ts [dir] [port]   (no dir = API only, for `astro dev` proxy)
if (process.argv[1]?.endsWith('local-server.ts')) {
  const [dir, port] = process.argv.slice(2);
  const s = await startLocalServer({ dir: dir && dir !== '-' ? dir : undefined, port: Number(port ?? 8787), jsonl: process.env.LEAD_DEV_JSONL ?? '.leads/leads.jsonl', rateLimit: 50 });
  console.log(`lead API${dir && dir !== '-' ? ` + ${dir}` : ''} on ${s.url}  (leads → ${process.env.LEAD_DEV_JSONL ?? '.leads/leads.jsonl'})`);
}
