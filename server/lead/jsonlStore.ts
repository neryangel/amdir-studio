// Local dev + tests only: appends each lead as one JSON line. Refuses to run on Vercel.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { LeadRecord, LeadStore } from './store';

export class JsonlFileStore implements LeadStore {
  readonly kind = 'jsonl';
  constructor(private readonly file: string) {
    if (process.env.VERCEL) throw new Error('JsonlFileStore is for local dev and tests only');
  }

  async insert(record: LeadRecord): Promise<{ id: string }> {
    const id = randomUUID();
    await mkdir(path.dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify({ id, created_at: new Date().toISOString(), ...record })}\n`, 'utf8');
    return { id };
  }

  /**
   * Scans the whole file (fine for dev volumes). A missing file means no leads yet. Unparseable
   * lines are skipped (JSON.parse errors quote the line, which must never reach the logs).
   */
  async countRecent(ipHash: string, sinceIso: string): Promise<number> {
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw e;
    }
    const since = Date.parse(sinceIso);
    let n = 0;
    for (const line of text.split('\n')) {
      if (!line) continue;
      let r: { ip_hash?: unknown; created_at?: unknown };
      try {
        r = JSON.parse(line) as typeof r;
      } catch {
        continue;
      }
      if (r.ip_hash === ipHash && typeof r.created_at === 'string' && Date.parse(r.created_at) >= since) n++;
    }
    return n;
  }
}
