// Applies the "headers" rules from vercel.json to a local Node response, so local QA and
// Lighthouse run with the same security/cache headers as production.
// Sources like "/(.*)" and "/_astro/(.*)" are treated as anchored regular expressions.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const config = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '..', 'vercel.json'), 'utf8'));
const rules = (config.headers ?? []).map((r) => ({ re: new RegExp(`^${r.source}$`), headers: r.headers }));

/** @param {string} pathname @param {import('node:http').ServerResponse} res */
export function applyVercelHeaders(pathname, res) {
  for (const r of rules) if (r.re.test(pathname)) for (const h of r.headers) res.setHeader(h.key, h.value);
}
