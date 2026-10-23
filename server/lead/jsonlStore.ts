// Local dev + tests only: appends each lead as one JSON line. Refuses to run on Vercel.
import { appendFile, mkdir } from 'node:fs/promises';
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
}
